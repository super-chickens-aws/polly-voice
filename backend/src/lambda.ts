import serverless from 'serverless-http';
import { app } from './app.js';
import { connectDatabase } from './db.js';

const proxy = serverless(app);

export const handler = async (event: unknown, context: unknown) => {
  await connectDatabase();
  return proxy(event as any, context as any);
};
