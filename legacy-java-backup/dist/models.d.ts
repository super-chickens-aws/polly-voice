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
export declare const ttsHistoryStore: {
    create(input: Omit<TtsHistoryItem, "PK" | "SK" | "entityId" | "entityType">): Promise<TtsHistoryItem>;
    get: (userId: string, id: string) => Promise<TtsHistoryItem | null>;
    list: (userId: string, page: number, limit: number) => Promise<TtsHistoryItem[]>;
    softDelete: (userId: string, id: string) => Promise<boolean>;
};
export declare const sttHistoryStore: {
    create(input: Omit<SttHistoryItem, "PK" | "SK" | "entityId" | "entityType">): Promise<SttHistoryItem>;
    get: (userId: string, id: string) => Promise<SttHistoryItem | null>;
    list: (userId: string, page: number, limit: number) => Promise<SttHistoryItem[]>;
    update: (item: SttHistoryItem, changes: Partial<SttHistoryItem>) => Promise<SttHistoryItem>;
    softDelete: (userId: string, id: string) => Promise<boolean>;
};
export {};
