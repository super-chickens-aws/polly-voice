import { Schema, model } from 'mongoose';

const settingsSchema = new Schema({
  speed: { type: Number, default: 100 },
  volume: { type: Number, default: 0 },
  breakTimeMs: { type: Number, default: 0 },
  pitch: { type: Number, default: 0 },
  emphasis: { type: String, default: 'none' },
  domainStyle: { type: String, default: 'none' }
}, { _id: false });

const ttsHistorySchema = new Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  textContent: { type: String, required: true },
  language: { type: String, required: true },
  voice: { type: String, required: true },
  engine: { type: String, enum: ['neural', 'standard', 'long-form'], required: true },
  preset: String,
  settings: { type: settingsSchema, required: true },
  audioStorageKey: { type: String, required: true },
  contentType: { type: String, required: true },
  audioFileSize: { type: Number, required: true },
  characterCount: { type: Number, required: true },
  status: { type: String, enum: ['COMPLETED', 'FAILED'], default: 'COMPLETED' },
  deletedAt: { type: Date, default: null }
}, { timestamps: true, collection: 'text_histories' });
ttsHistorySchema.index({ userId: 1, createdAt: -1 });

const sttHistorySchema = new Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  fileName: { type: String, required: true },
  sourceStorageKey: { type: String, required: true },
  resultStorageKey: String,
  resultText: { type: String, default: '' },
  audioFileSize: { type: Number, required: true },
  transcriptionJobName: String,
  status: {
    type: String,
    enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'],
    default: 'QUEUED'
  },
  deletedAt: { type: Date, default: null }
}, { timestamps: true, collection: 'speech_histories' });
sttHistorySchema.index({ userId: 1, createdAt: -1 });

export const TtsHistory = model('TtsHistory', ttsHistorySchema);
export const SttHistory = model('SttHistory', sttHistorySchema);
