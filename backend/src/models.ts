import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';
import type { TtsEngine, TtsSettings } from './types.js';

type EntityType = 'TTS' | 'STT';

type BaseHistoryItem = {
  PK: string;
  SK: string;
  entityId: string;
  _id: string;
  userId: string;
  entityType: EntityType;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type TtsHistoryItem = BaseHistoryItem & {
  entityType: 'TTS';
  textContent: string;
  language: string;
  voice: string;
  engine: TtsEngine;
  preset?: string;
  settings: TtsSettings;
  audioStorageKey: string;
  contentType: string;
  audioFileSize: number;
  characterCount: number;
};

export type SttHistoryItem = BaseHistoryItem & {
  entityType: 'STT';
  fileName: string;
  sourceStorageKey: string;
  resultStorageKey?: string;
  resultText: string;
  audioFileSize: number;
  transcriptionJobName?: string;
};

const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: config.aws.region
}), {
  marshallOptions: { removeUndefinedValues: true }
});

const localItems = new Map<string, TtsHistoryItem | SttHistoryItem>();
const userKey = (userId: string) => `USER#${userId}`;
const entityKey = (userId: string, type: EntityType, id: string) =>
  `${userKey(userId)}#${type}#${id}`;

function createKeys(userId: string, type: EntityType, id: string, createdAt: string) {
  return {
    PK: userKey(userId),
    SK: `${type}#${createdAt}#${id}`,
    entityId: entityKey(userId, type, id)
  };
}

async function put(item: TtsHistoryItem | SttHistoryItem): Promise<void> {
  if (!config.aws.enabled) {
    localItems.set(item.entityId, structuredClone(item));
    return;
  }
  await client.send(new PutCommand({
    TableName: config.aws.dynamoTableName,
    Item: item
  }));
}

async function get<T extends TtsHistoryItem | SttHistoryItem>(
  userId: string,
  type: EntityType,
  id: string
): Promise<T | null> {
  const key = entityKey(userId, type, id);
  if (!config.aws.enabled) {
    const item = localItems.get(key);
    return item && !item.deletedAt ? structuredClone(item) as T : null;
  }
  const result = await client.send(new QueryCommand({
    TableName: config.aws.dynamoTableName,
    IndexName: 'EntityIndex',
    KeyConditionExpression: 'entityId = :entityId',
    ExpressionAttributeValues: { ':entityId': key },
    Limit: 1
  }));
  const item = result.Items?.[0] as T | undefined;
  return item && !item.deletedAt ? item : null;
}

async function list<T extends TtsHistoryItem | SttHistoryItem>(
  userId: string,
  type: EntityType,
  page: number,
  limit: number
): Promise<T[]> {
  if (!config.aws.enabled) {
    return [...localItems.values()]
      .filter((item) => item.userId === userId && item.entityType === type && !item.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(page * limit, (page + 1) * limit)
      .map((item) => structuredClone(item) as T);
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
  return (result.Items as T[] | undefined)?.slice(page * limit, (page + 1) * limit) ?? [];
}

async function update<T extends TtsHistoryItem | SttHistoryItem>(
  item: T,
  changes: Partial<T>
): Promise<T> {
  const updated = { ...item, ...changes, updatedAt: new Date().toISOString() } as T;
  await put(updated);
  return updated;
}

async function softDelete(
  userId: string,
  type: EntityType,
  id: string
): Promise<boolean> {
  const item = await get(userId, type, id);
  if (!item) return false;
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
  async create(input: Omit<TtsHistoryItem, 'PK' | 'SK' | 'entityId' | 'entityType'>) {
    const item: TtsHistoryItem = {
      ...createKeys(input.userId, 'TTS', input._id, input.createdAt),
      ...input,
      entityType: 'TTS'
    };
    await put(item);
    return item;
  },
  get: (userId: string, id: string) => get<TtsHistoryItem>(userId, 'TTS', id),
  list: (userId: string, page: number, limit: number) =>
    list<TtsHistoryItem>(userId, 'TTS', page, limit),
  softDelete: (userId: string, id: string) => softDelete(userId, 'TTS', id)
};

export const sttHistoryStore = {
  async create(input: Omit<SttHistoryItem, 'PK' | 'SK' | 'entityId' | 'entityType'>) {
    const item: SttHistoryItem = {
      ...createKeys(input.userId, 'STT', input._id, input.createdAt),
      ...input,
      entityType: 'STT'
    };
    await put(item);
    return item;
  },
  get: (userId: string, id: string) => get<SttHistoryItem>(userId, 'STT', id),
  list: (userId: string, page: number, limit: number) =>
    list<SttHistoryItem>(userId, 'STT', page, limit),
  update: (item: SttHistoryItem, changes: Partial<SttHistoryItem>) => update(item, changes),
  softDelete: (userId: string, id: string) => softDelete(userId, 'STT', id)
};
