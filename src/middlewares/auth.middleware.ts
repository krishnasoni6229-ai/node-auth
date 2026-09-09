import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt.js';
import { prisma } from '../config/prisma.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: Role;
    isEmailVerified: boolean;
  };
}

// Authenticate user via JWT (supports Bearer Header & HTTP-only Cookies)
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      // 2. Check HTTP-only cookie
      token = req.cookies.accessToken;
    }

    if (!token) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication required. Please provide a Bearer token or login.',
      });
      return;
    }

    // Verify Access Token
    const decoded = verifyAccessToken(token);

    // Fetch user from DB to ensure they still exist and are active
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isEmailVerified: true,
        lockUntil: true,
      },
    });

    if (!user) {
      res.status(401).json({
        status: 'error',
        message: 'The user belonging to this token no longer exists.',
      });
      return;
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > new Date()) {
      res.status(403).json({
        status: 'error',
        message: 'Account is temporarily locked. Please try again later.',
      });
      return;
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        status: 'error',
        code: 'TOKEN_EXPIRED',
        message: 'Access token expired. Please refresh your token at /api/auth/refresh.',
      });
      return;
    }
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        status: 'error',
        message: 'Invalid access token.',
      });
      return;
    }
    next(error);
  }
};

// Role-based Access Control Guard (RBAC)
export const requireRole = (...allowedRoles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Unauthorized',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        status: 'error',
        message: `Forbidden: Requires one of [${allowedRoles.join(', ')}] role`,
      });
      return;
    }

    next();
  };
};
