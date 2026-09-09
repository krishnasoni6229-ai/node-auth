import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import { setAuthCookies, clearAuthCookies } from '../utils/cookie.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

// Helper: Extract IP and User-Agent
const getClientMeta = (req: Request) => ({
  ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown',
  userAgent: req.headers['user-agent'] || 'unknown',
});

// @route   POST /api/auth/signup
// @desc    Register a new user, issue dual-tokens, and create session
export const signup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password } = req.body;
    const { ipAddress, userAgent } = getClientMeta(req);

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      res.status(409).json({
        status: 'error',
        message: 'An account with this email already exists',
      });
      return;
    }

    // Hash password (salt factor 12 for enterprise security)
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // Create Refresh Token Session in DB
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const session = await prisma.refreshToken.create({
      data: {
        token: `temp_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        userId: user.id,
        userAgent,
        ipAddress,
        expiresAt,
      },
    });

    // Generate JWTs
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = generateRefreshToken({
      id: user.id,
      tokenId: session.id,
    });

    // Update session with the real refresh token
    await prisma.refreshToken.update({
      where: { id: session.id },
      data: { token: refreshToken },
    });

    // Attach HTTP-only cookies
    setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({
      status: 'success',
      message: 'Account created successfully',
      data: {
        user,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: '15m',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/auth/signin
// @desc    Authenticate user, enforce brute-force protection, issue tokens
export const signin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;
    const { ipAddress, userAgent } = getClientMeta(req);

    const normalizedEmail = email.toLowerCase().trim();

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      res.status(401).json({
        status: 'error',
        message: 'Invalid email or password',
      });
      return;
    }

    // Check account lockout
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingMinutes = Math.ceil(
        (user.lockUntil.getTime() - Date.now()) / (60 * 1000)
      );
      res.status(423).json({
        status: 'error',
        message: `Account is temporarily locked due to too many failed attempts. Try again in ${remainingMinutes} minute(s).`,
      });
      return;
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      const failedAttempts = user.failedLoginAttempts + 1;
      let lockUntil: Date | null = null;

      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: failedAttempts >= MAX_FAILED_ATTEMPTS ? 0 : failedAttempts,
          lockUntil,
        },
      });

      if (lockUntil) {
        res.status(423).json({
          status: 'error',
          message: `Too many failed attempts. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`,
        });
        return;
      }

      res.status(401).json({
        status: 'error',
        message: 'Invalid email or password',
        attemptsRemaining: MAX_FAILED_ATTEMPTS - failedAttempts,
      });
      return;
    }

    // Reset failed attempts & record login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
    });

    // Create Refresh Token Session in DB
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const session = await prisma.refreshToken.create({
      data: {
        token: `temp_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        userId: user.id,
        userAgent,
        ipAddress,
        expiresAt,
      },
    });

    // Generate JWTs
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = generateRefreshToken({
      id: user.id,
      tokenId: session.id,
    });

    // Update session with token
    await prisma.refreshToken.update({
      where: { id: session.id },
      data: { token: refreshToken },
    });

    // Attach HTTP-only cookies
    setAuthCookies(res, accessToken, refreshToken);

    res.status(200).json({
      status: 'success',
      message: 'Logged in successfully',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          lastLoginAt: user.lastLoginAt,
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: '15m',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/auth/refresh
// @desc    Rotate refresh token and issue a new access token
export const refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;
    const { ipAddress, userAgent } = getClientMeta(req);

    if (!rawToken) {
      res.status(401).json({
        status: 'error',
        message: 'Refresh token is required',
      });
      return;
    }

    // Verify token signature
    let decoded;
    try {
      decoded = verifyRefreshToken(rawToken);
    } catch {
      res.status(401).json({
        status: 'error',
        message: 'Invalid or expired refresh token. Please log in again.',
      });
      return;
    }

    // Check DB session
    const session = await prisma.refreshToken.findUnique({
      where: { id: decoded.tokenId },
      include: { user: true },
    });

    // Reuse detection: if token not found or already revoked, revoke all user sessions for safety!
    if (!session || session.isRevoked || session.token !== rawToken || session.expiresAt < new Date()) {
      if (session) {
        await prisma.refreshToken.updateMany({
          where: { userId: session.userId },
          data: { isRevoked: true },
        });
      }
      clearAuthCookies(res);
      res.status(401).json({
        status: 'error',
        message: 'Invalid refresh token session. Please log in again.',
      });
      return;
    }

    // Revoke the used refresh token (Token Rotation!)
    await prisma.refreshToken.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });

    // Create a new replacement session
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const newSession = await prisma.refreshToken.create({
      data: {
        token: `temp_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        userId: session.user.id,
        userAgent,
        ipAddress,
        expiresAt: newExpiresAt,
      },
    });

    // Generate new token pair
    const newAccessToken = generateAccessToken({
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    });
    const newRefreshToken = generateRefreshToken({
      id: session.user.id,
      tokenId: newSession.id,
    });

    await prisma.refreshToken.update({
      where: { id: newSession.id },
      data: { token: newRefreshToken },
    });

    // Attach updated cookies
    setAuthCookies(res, newAccessToken, newRefreshToken);

    res.status(200).json({
      status: 'success',
      message: 'Tokens refreshed successfully',
      data: {
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresIn: '15m',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/auth/logout
// @desc    Revoke current device session & clear cookies
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (rawToken) {
      try {
        const decoded = verifyRefreshToken(rawToken);
        await prisma.refreshToken.update({
          where: { id: decoded.tokenId },
          data: { isRevoked: true },
        });
      } catch {
        // Continue to clear cookies even if token is expired
      }
    }

    clearAuthCookies(res);

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully from this device',
    });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/auth/logout-all
// @desc    Revoke ALL sessions across all devices (Enterprise Multi-Device Logout)
export const logoutAll = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ status: 'error', message: 'Unauthorized' });
      return;
    }

    await prisma.refreshToken.updateMany({
      where: { userId: req.user.id },
      data: { isRevoked: true },
    });

    clearAuthCookies(res);

    res.status(200).json({
      status: 'success',
      message: 'Successfully logged out from all active devices and sessions',
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/auth/me
// @desc    Get currently logged in user profile
export const getMe = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ status: 'error', message: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isEmailVerified: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      status: 'success',
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/auth/sessions
// @desc    List all active login sessions / devices for the user
export const getSessions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ status: 'error', message: 'Unauthorized' });
      return;
    }

    const sessions = await prisma.refreshToken.findMany({
      where: {
        userId: req.user.id,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      status: 'success',
      data: { sessions },
    });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/auth/change-password
// @desc    Change password and optionally revoke other sessions
export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ status: 'error', message: 'Unauthorized' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      res.status(404).json({ status: 'error', message: 'User not found' });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      res.status(400).json({ status: 'error', message: 'Current password is incorrect' });
      return;
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Revoke all other active sessions for security
    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { isRevoked: true },
    });

    clearAuthCookies(res);

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully. Please log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};
