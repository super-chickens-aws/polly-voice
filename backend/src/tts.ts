import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuth } from './auth.js';
import { AppError } from './errors.js';
import { mediaStorage } from './media.js';
import { ttsHistoryStore, type TtsHistoryItem } from './models.js';
import { speechService } from './speech.js';
import type { AuthenticatedRequest, TtsSettings } from './types.js';

const voices = ['Amy', 'Brian', 'Danielle', 'Emma', 'Joanna', 'Kevin', 'Matthew', 'Stephen'];

const settingsSchema = z.object({
  speed: z.number().min(20).max(200).default(100),
  volume: z.number().min(-10).max(10).default(0),
  breakTimeMs: z.number().min(0).max(2000).default(0),
  pitch: z.number().min(-20).max(20).default(0),
  emphasis: z.enum(['none', 'reduced', 'moderate', 'strong']).default('none'),
  domainStyle: z.enum(['none', 'news', 'conversational']).default('none')
});

const createSchema = z.object({
  text: z.string().trim().min(1).max(3000),
  language: z.string().default('en-US'),
  voice: z.string().refine((value) => voices.includes(value), 'Giọng đọc không được hỗ trợ.'),
  engine: z.enum(['neural', 'standard', 'long-form']).default('neural'),
  outputFormat: z.literal('mp3').default('mp3'),
  preset: z.string().optional(),
  settings: settingsSchema.default({
    speed: 100,
    volume: 0,
    breakTimeMs: 0,
    pitch: 0,
    emphasis: 'none',
    domainStyle: 'none'
  })
});

async function responseFor(document: TtsHistoryItem) {
  const key = document.audioStorageKey;
  return {
    id: document._id,
    status: document.status,
    text: document.textContent,
    voice: document.voice,
    engine: document.engine,
    characterCount: document.characterCount,
    media: {
      contentType: document.contentType,
      fileSize: document.audioFileSize,
      downloadUrl: await mediaStorage.downloadUrl(key),
      expiresIn: 900
    },
    createdAt: document.createdAt
  };
}

async function createTts(req: AuthenticatedRequest, preview: boolean) {
  const input = createSchema.parse(req.body);
  const limit = preview || !req.user.authenticated ? 500 : 3000;
  if (input.text.length > limit) {
    throw new AppError(400, 'TEXT_TOO_LONG', `Văn bản vượt quá giới hạn ${limit} ký tự.`);
  }
  if (input.engine !== 'standard' && (input.settings.pitch !== 0 || input.settings.emphasis !== 'none')) {
    throw new AppError(400, 'INVALID_ENGINE_SETTING', 'Pitch và emphasis chỉ hỗ trợ Standard Engine.');
  }
  const audio = await speechService.synthesize({
    text: input.text,
    voice: input.voice,
    engine: input.engine,
    language: input.language,
    settings: input.settings as TtsSettings
  });
  const id = randomUUID();
  const key = `${preview ? 'preview' : 'tts'}/${req.user.id}/${id}.${audio.extension}`;
  const media = await mediaStorage.save(key, audio.body, audio.contentType);
  const createdAt = new Date();

  if (!preview && req.user.authenticated) {
    await ttsHistoryStore.create({
      _id: id,
      userId: req.user.id,
      textContent: input.text,
      language: input.language,
      voice: input.voice,
      engine: audio.engine,
      preset: input.preset,
      settings: input.settings,
      audioStorageKey: key,
      contentType: media.contentType,
      audioFileSize: media.size,
      characterCount: input.text.length,
      status: 'COMPLETED',
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString()
    });
  }
  return {
    id,
    status: 'COMPLETED',
    text: input.text,
    voice: input.voice,
    engine: audio.engine,
    characterCount: input.text.length,
    media: { contentType: media.contentType, fileSize: media.size, downloadUrl: media.downloadUrl, expiresIn: 900 },
    createdAt
  };
}

export const ttsRouter = Router();

ttsRouter.get('/voices', (_req, res) => res.json({ data: voices }));

ttsRouter.post('/tts/preview', optionalAuth, async (req, res, next) => {
  try {
    res.status(201).json({ data: await createTts(req as AuthenticatedRequest, true) });
  } catch (error) { next(error); }
});

ttsRouter.post('/tts', optionalAuth, async (req, res, next) => {
  try {
    res.status(201).json({ data: await createTts(req as AuthenticatedRequest, false) });
  } catch (error) { next(error); }
});

ttsRouter.get('/tts/history', requireAuth, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const page = Math.max(Number(req.query.page) || 0, 0);
    const docs = await ttsHistoryStore.list(user.id, page, limit);
    res.json({ data: await Promise.all(docs.map((doc) => responseFor(doc))) });
  } catch (error) { next(error); }
});

ttsRouter.get('/tts/:id', requireAuth, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const doc = await ttsHistoryStore.get(user.id, String(req.params.id));
    if (!doc) throw new AppError(404, 'TTS_NOT_FOUND', 'Không tìm thấy lịch sử TTS.');
    res.json({ data: await responseFor(doc) });
  } catch (error) { next(error); }
});

ttsRouter.get('/tts/:id/download', requireAuth, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const doc = await ttsHistoryStore.get(user.id, String(req.params.id));
    if (!doc) throw new AppError(404, 'TTS_NOT_FOUND', 'Không tìm thấy lịch sử TTS.');
    res.json({ data: { downloadUrl: await mediaStorage.downloadUrl(doc.audioStorageKey), expiresIn: 900 } });
  } catch (error) { next(error); }
});

ttsRouter.delete('/tts/:id', requireAuth, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const deleted = await ttsHistoryStore.softDelete(user.id, String(req.params.id));
    if (!deleted) throw new AppError(404, 'TTS_NOT_FOUND', 'Không tìm thấy lịch sử TTS.');
    res.status(204).end();
  } catch (error) { next(error); }
});
