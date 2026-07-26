import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { mediaStorage } from './media.js';
import { sttRouter } from './stt.js';
import { ttsRouter } from './tts.js';

export const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} không được phép.`));
  },
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json({ limit: '1mb' }));
if (config.nodeEnv !== 'test') app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'polly-voice-backend', region: config.aws.region });
});

app.get('/api/v1/media/*', async (req, res, next) => {
  try {
    if (config.aws.enabled) return res.status(404).end();
    const key = (req.params as unknown as Record<number, string>)[0];
    if (!key) return res.status(404).end();
    const body = await mediaStorage.get(key);
    const extension = path.extname(key).toLowerCase();
    const contentType = extension === '.wav' ? 'audio/wav'
      : extension === '.mp3' ? 'audio/mpeg'
      : extension === '.txt' ? 'text/plain; charset=utf-8'
      : 'application/octet-stream';
    res.type(contentType).send(body);
  } catch (error) { next(error); }
});

app.use('/api/v1', ttsRouter);
app.use('/api/v1', sttRouter);
app.use(notFoundHandler);
app.use(errorHandler);
