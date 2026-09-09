import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { User } from './models/user.model.js';

const app: Application = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root / Welcome Route
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to Node.js TypeScript Express MongoDB API 🚀',
    endpoints: {
      health: '/api/health',
      users: '/api/users',
    },
  });
});

// Health Check Route
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is healthy and running',
    timestamp: new Date().toISOString(),
  });
});

// Basic User Routes (Demo)
app.get('/api/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.status(200).json({ status: 'success', data: users });
  } catch (error) {
    next(error);
  }
});

app.post('/api/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email } = req.body;
    const newUser = await User.create({ name, email });
    res.status(201).json({ status: 'success', data: newUser });
  } catch (error) {
    next(error);
  }
});

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
