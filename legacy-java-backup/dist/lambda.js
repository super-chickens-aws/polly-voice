import serverless from 'serverless-http';
import { app } from './app.js';
import { connectDatabase } from './db.js';
const proxy = serverless(app);
export const handler = async (event, context) => {
    await connectDatabase();
    return proxy(event, context);
};
//# sourceMappingURL=lambda.js.map