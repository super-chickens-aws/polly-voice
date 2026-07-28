import serverless from 'serverless-http';
import { app } from './app.js';
import { connectDatabase } from './infrastructure/database/dynamodb.connection.js';

const proxy = serverless(app);

export const handler = async (event: unknown, context: unknown) => {
  console.info('Lambda request received');
  try {
    await connectDatabase();
    const response = await proxy(event as any, context as any);
    console.info('Lambda request completed');
    return response;
  } catch (error) {
    console.error('Unhandled Lambda error', error);
    throw error;
  }
};
