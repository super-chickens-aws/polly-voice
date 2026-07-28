import { app } from './app.js';
import { config } from './core/config/environment.js';
import { connectDatabase } from './infrastructure/database/dynamodb.connection.js';

await connectDatabase();
app.listen(config.port, () => {
  console.log(`Polly Voice API listening on http://localhost:${config.port}`);
});
