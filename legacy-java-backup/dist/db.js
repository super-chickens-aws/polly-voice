// DynamoDB is managed by AWS and the SDK connects lazily on each request.
// These functions preserve the server/lambda startup contract used by the app.
export async function connectDatabase() { }
export async function disconnectDatabase() { }
//# sourceMappingURL=db.js.map