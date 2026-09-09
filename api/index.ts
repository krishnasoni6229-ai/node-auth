import dotenv from 'dotenv';
dotenv.config();

import app from '../src/app.js';

// Handler for Vercel Serverless Functions
export default async function handler(req: any, res: any) {
  return app(req, res);
}
