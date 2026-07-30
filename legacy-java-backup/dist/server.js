import { app } from './app.js';
import { config } from './config.js';
import { connectDatabase } from './db.js';
await connectDatabase();
app.listen(config.port, () => {
    console.log(`Polly Voice API listening on http://localhost:${config.port}`);
});
//# sourceMappingURL=server.js.map