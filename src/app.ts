import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.route.js';

const app: Application = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root Route
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'Node.js + TypeScript + Express + Prisma Authentication API 🚀',
    endpoints: {
      signup: 'POST /api/auth/signup',
      signin: 'POST /api/auth/signin',
      me: 'GET /api/auth/me (Requires Authorization: Bearer <token>)',
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
