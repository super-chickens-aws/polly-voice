import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';
const client = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: config.aws.region
}), {
    marshallOptions: { removeUndefinedValues: true }
});
const localItems = new Map();
const userKey = (userId) => `USER#${userId}`;
const entityKey = (userId, type, id) => `${userKey(userId)}#${type}#${id}`;
function createKeys(userId, type, id, createdAt) {
    return {
        PK: userKey(userId),
        SK: `${type}#${createdAt}#${id}`,
        entityId: entityKey(userId, type, id)
    };
}
async function put(item) {
    if (!config.aws.enabled) {
        localItems.set(item.entityId, structuredClone(item));
        return;
    }
    await client.send(new PutCommand({
        TableName: config.aws.dynamoTableName,
        Item: item
    }));
}
async function get(userId, type, id) {
    const key = entityKey(userId, type, id);
    if (!config.aws.enabled) {
        const item = localItems.get(key);
        return item && !item.deletedAt ? structuredClone(item) : null;
    }
    const result = await client.send(new QueryCommand({
        TableName: config.aws.dynamoTableName,
        IndexName: 'EntityIndex',
        KeyConditionExpression: 'entityId = :entityId',
        ExpressionAttributeValues: { ':entityId': key },
        Limit: 1
    }));
    const item = result.Items?.[0];
    return item && !item.deletedAt ? item : null;
}
async function list(userId, type, page, limit) {
    if (!config.aws.enabled) {
        return [...localItems.values()]
            .filter((item) => item.userId === userId && item.entityType === type && !item.deletedAt)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(page * limit, (page + 1) * limit)
            .map((item) => structuredClone(item));
    }
    const result = await client.send(new QueryCommand({
        TableName: config.aws.dynamoTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        FilterExpression: 'attribute_not_exists(deletedAt)',
        ExpressionAttributeValues: {
            ':pk': userKey(userId),
            ':prefix': `${type}#`
        },
        ScanIndexForward: false,
        Limit: Math.min((page + 1) * limit, 500)
    }));
    return result.Items?.slice(page * limit, (page + 1) * limit) ?? [];
}
async function update(item, changes) {
    const updated = { ...item, ...changes, updatedAt: new Date().toISOString() };
    await put(updated);
    return updated;
}
async function softDelete(userId, type, id) {
    const item = await get(userId, type, id);
    if (!item)
        return false;
    const deletedAt = new Date().toISOString();
    if (!config.aws.enabled) {
        localItems.set(item.entityId, { ...item, deletedAt, updatedAt: deletedAt });
        return true;
    }
    await client.send(new UpdateCommand({
        TableName: config.aws.dynamoTableName,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: 'SET deletedAt = :deletedAt, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
            ':deletedAt': deletedAt,
            ':updatedAt': deletedAt
        }
    }));
    return true;
}
export const ttsHistoryStore = {
    async create(input) {
        const item = {
            ...createKeys(input.userId, 'TTS', input._id, input.createdAt),
            ...input,
            entityType: 'TTS'
        };
        await put(item);
        return item;
    },
    get: (userId, id) => get(userId, 'TTS', id),
    list: (userId, page, limit) => list(userId, 'TTS', page, limit),
    softDelete: (userId, id) => softDelete(userId, 'TTS', id)
};
export const sttHistoryStore = {
    async create(input) {
        const item = {
            ...createKeys(input.userId, 'STT', input._id, input.createdAt),
            ...input,
            entityType: 'STT'
        };
        await put(item);
        return item;
    },
    get: (userId, id) => get(userId, 'STT', id),
    list: (userId, page, limit) => list(userId, 'STT', page, limit),
    update: (item, changes) => update(item, changes),
    softDelete: (userId, id) => softDelete(userId, 'STT', id)
};
//# sourceMappingURL=models.js.map