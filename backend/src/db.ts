import mongoose from 'mongoose';
import { config } from './config.js';

let connection: Promise<typeof mongoose> | undefined;

export function connectDatabase(): Promise<typeof mongoose> {
  connection ??= mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: config.nodeEnv === 'test' ? 1000 : 10_000
  });
  return connection;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  connection = undefined;
}
