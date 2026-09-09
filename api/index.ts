import dotenv from 'dotenv';
dotenv.config();

import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';

// Handler for Vercel Serverless Functions
export default async function handler(req: any, res: any) {
  await connectDB();
  return app(req, res);
}
