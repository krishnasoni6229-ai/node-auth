import mongoose from 'mongoose';

let isConnected = false;

export const connectDB = async (): Promise<void> => {
  if (isConnected) {
    return;
  }

  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/my_database';
    const db = await mongoose.connect(mongoUri, {
      bufferCommands: false,
    });
    isConnected = db.connections[0].readyState === 1;
    console.log(` MongoDB Connected: ${mongoose.connection.host}`);
  } catch (error) {
    console.error(' MongoDB connection error:', error);
    throw error;
  }
};
