import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.route.js';

const app: Application = express();

// Middlewares
app.use(
  cors({
    origin: true, // Reflect request origin
    credentials: true, // Allow cookies
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root Route
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'Enterprise Node.js + TypeScript + Express + Prisma Authentication API 🚀',
    endpoints: {
      signup: 'POST /api/auth/signup',
      signin: 'POST /api/auth/signin',
      refresh: 'POST /api/auth/refresh',
      logout: 'POST /api/auth/logout',
      logoutAll: 'POST /api/auth/logout-all (Requires Token)',
      me: 'GET /api/auth/me (Requires Token)',
      sessions: 'GET /api/auth/sessions (Requires Token)',
      changePassword: 'POST /api/auth/change-password (Requires Token)',
    },
  });
});

// Authentication Routes
app.use('/api/auth', authRoutes);

// 404 Route Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`,
  });
});

// Global Error Handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  });
});

export default app;
