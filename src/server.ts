import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { prisma } from './config/prisma.js';

const PORT = process.env.PORT || 8000;

const startServer = async () => {
  try {
    // Verify database connection
    await prisma.$connect();
    console.log(' MongoDB Connected via Prisma');

    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`);
    });

    // Graceful Shutdown
    const handleShutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Gracefully shutting down...`);
      await prisma.$disconnect();
      server.close(() => {
        console.log('HTTP server and Prisma connection closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  } catch (error) {
    console.error(' Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
