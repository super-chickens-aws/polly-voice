import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
  TranscribeClient
} from '@aws-sdk/client-transcribe';
import { requireAuth } from '../../security/cognito-auth.middleware.js';
import { config } from '../../core/config/environment.js';
import { AppError } from '../../core/http/errors.js';
import { mediaStorage } from '../../infrastructure/storage/media.storage.js';
import { sttHistoryStore, type SttHistoryItem } from '../../infrastructure/database/history.repository.js';
import type { AuthenticatedRequest } from '../../shared/types/http.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, ['.mp3', '.wav', '.m4a', '.flac'].includes(extension));
  }
});
const transcribe = new TranscribeClient({ region: config.aws.region });
const MAX_STT_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const supportedExtensions = ['mp3', 'wav', 'm4a', 'flac', 'mp4', 'ogg', 'webm', 'amr'] as const;

const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(100),
  fileSize: z.number().int().positive().max(MAX_STT_FILE_SIZE)
});

const startJobSchema = z.object({
  uploadId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_STT_FILE_SIZE)
});

function extensionFor(fileName: string): typeof supportedExtensions[number] {
  const extension = path.extname(fileName).toLowerCase().slice(1);
  if (!supportedExtensions.includes(extension as typeof supportedExtensions[number])) {
    throw new AppError(
      400,
      'UNSUPPORTED_AUDIO_FORMAT',
      `Supported formats: ${supportedExtensions.join(', ')}.`
    );
  }
  return extension as typeof supportedExtensions[number];
}

async function refreshAwsResult(document: SttHistoryItem): Promise<SttHistoryItem> {
  if (!config.aws.enabled || !document.transcriptionJobName || document.status === 'COMPLETED') return document;
  const response = await transcribe.send(new GetTranscriptionJobCommand({
    TranscriptionJobName: document.transcriptionJobName
  }));
  const job = response.TranscriptionJob;
  if (job?.TranscriptionJobStatus === 'FAILED') {
    return sttHistoryStore.update(document, {
      status: 'FAILED',
      resultText: job.FailureReason ?? 'Amazon Transcribe could not process this audio file.'
    });
  }
  if (job?.TranscriptionJobStatus === 'COMPLETED' && document.resultStorageKey) {
    try {
      const raw = await mediaStorage.get(document.resultStorageKey);
      const json = JSON.parse(raw.toString('utf8'));
      return sttHistoryStore.update(document, {
        resultText: json.results?.transcripts?.[0]?.transcript ?? '',
        status: 'COMPLETED'
      });
    } catch {
      // The Transcribe job can become complete just before its output object is visible in S3.
      return document;
    }
  }
  return document;
}

async function sttResponse(input: SttHistoryItem) {
  const document = await refreshAwsResult(input);
  return {
    id: String(document._id),
    fileName: document.fileName,
    audioFileSize: document.audioFileSize,
    status: document.status,
    resultText: document.resultText,
    downloadUrl: document.resultStorageKey
      ? await mediaStorage.downloadUrl(document.resultStorageKey)
      : null,
    createdAt: document.createdAt
  };
}

export const sttRouter = Router();

sttRouter.post('/stt/uploads', requireAuth, async (req, res, next) => {
  try {
    if (!config.aws.enabled) {
      res.json({ data: { directUpload: false } });
      return;
    }
    const input = uploadRequestSchema.parse(req.body);
    const extension = extensionFor(input.fileName);
    const user = (req as AuthenticatedRequest).user;
    const uploadId = randomUUID();
    const sourceKey = `stt/source/${user.id}/${uploadId}.${extension}`;
    const uploadUrl = await mediaStorage.uploadUrl(sourceKey, input.contentType);

    res.json({
      data: {
        directUpload: true,
        uploadId,
        uploadUrl,
        expiresIn: config.aws.presignedUrlTtlSeconds,
        maxFileSize: MAX_STT_FILE_SIZE
      }
    });
  } catch (error) { next(error); }
});

sttRouter.post('/stt/jobs', requireAuth, async (req, res, next) => {
  try {
    const input = startJobSchema.parse(req.body);
    const extension = extensionFor(input.fileName);
    const user = (req as AuthenticatedRequest).user;
    const sourceKey = `stt/source/${user.id}/${input.uploadId}.${extension}`;
    const uploadedSize = await mediaStorage.size(sourceKey);
    if (uploadedSize !== input.fileSize) {
      throw new AppError(400, 'UPLOAD_SIZE_MISMATCH', 'The uploaded file size does not match the selected file.');
    }

    const resultStorageKey = `stt/result/${user.id}/${input.uploadId}.json`;
    const transcriptionJobName = `polly-voice-${input.uploadId}`;
    await transcribe.send(new StartTranscriptionJobCommand({
      TranscriptionJobName: transcriptionJobName,
      LanguageCode: config.aws.transcribeLanguageCode as any,
      Media: { MediaFileUri: `s3://${config.aws.bucket}/${sourceKey}` },
      MediaFormat: extension,
      OutputBucketName: config.aws.bucket,
      OutputKey: resultStorageKey
    }));

    const createdAt = new Date().toISOString();
    const document = await sttHistoryStore.create({
      _id: input.uploadId,
      userId: user.id,
      fileName: input.fileName,
      sourceStorageKey: sourceKey,
      resultStorageKey,
      resultText: '',
      audioFileSize: uploadedSize,
      transcriptionJobName,
      status: 'PROCESSING',
      createdAt,
      updatedAt: createdAt
    });
    res.status(202).json({ data: await sttResponse(document) });
  } catch (error) { next(error); }
});

sttRouter.post('/stt', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError(400, 'AUDIO_REQUIRED', 'Please select an MP3, WAV, M4A, or FLAC file.');
    const user = (req as AuthenticatedRequest).user;
    const id = randomUUID();
    const extension = path.extname(req.file.originalname).toLowerCase().slice(1);
    const sourceKey = `stt/source/${user.id}/${id}.${extension}`;
    await mediaStorage.save(sourceKey, req.file.buffer, req.file.mimetype || 'application/octet-stream');

    let resultText = `[Mock transcription for ${req.file.originalname}]\n\nThe Node.js backend received the file successfully.`;
    let resultStorageKey = `stt/result/${user.id}/${id}.txt`;
    let status = 'COMPLETED';
    let transcriptionJobName: string | undefined;

    if (config.aws.enabled) {
      resultText = '';
      resultStorageKey = `stt/result/${user.id}/${id}.json`;
      status = 'PROCESSING';
      transcriptionJobName = `polly-voice-${id}`;
      await transcribe.send(new StartTranscriptionJobCommand({
        TranscriptionJobName: transcriptionJobName,
        LanguageCode: config.aws.transcribeLanguageCode as any,
        Media: { MediaFileUri: `s3://${config.aws.bucket}/${sourceKey}` },
        MediaFormat: extension as any,
        OutputBucketName: config.aws.bucket,
        OutputKey: resultStorageKey
      }));
    } else {
      await mediaStorage.save(resultStorageKey, Buffer.from(resultText, 'utf8'), 'text/plain');
    }

    const createdAt = new Date().toISOString();
    const document = await sttHistoryStore.create({
      _id: id,
      userId: user.id,
      fileName: req.file.originalname,
      sourceStorageKey: sourceKey,
      resultStorageKey,
      resultText,
      audioFileSize: req.file.size,
      transcriptionJobName,
      status: status as SttHistoryItem['status'],
      createdAt,
      updatedAt: createdAt
    });
    res.status(202).json({ data: await sttResponse(document) });
  } catch (error) { next(error); }
});

sttRouter.get('/stt/history', requireAuth, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const page = Math.max(Number(req.query.page) || 0, 0);
    const docs = await sttHistoryStore.list(user.id, page, limit);
    res.json({ data: await Promise.all(docs.map(sttResponse)) });
  } catch (error) { next(error); }
});

sttRouter.get('/stt/:id', requireAuth, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const doc = await sttHistoryStore.get(user.id, String(req.params.id));
    if (!doc) throw new AppError(404, 'STT_NOT_FOUND', 'The STT history item was not found.');
    res.json({ data: await sttResponse(doc) });
  } catch (error) { next(error); }
});

sttRouter.get('/stt/:id/download', requireAuth, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const doc = await sttHistoryStore.get(user.id, String(req.params.id));
    if (!doc?.resultStorageKey) throw new AppError(404, 'STT_RESULT_NOT_FOUND', 'The STT result is not ready yet.');
    res.json({ data: { downloadUrl: await mediaStorage.downloadUrl(doc.resultStorageKey), expiresIn: 900 } });
  } catch (error) { next(error); }
});

sttRouter.delete('/stt/:id', requireAuth, async (req, res, next) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    const deleted = await sttHistoryStore.softDelete(user.id, String(req.params.id));
    if (!deleted) throw new AppError(404, 'STT_NOT_FOUND', 'The STT history item was not found.');
    res.status(204).end();
  } catch (error) { next(error); }
});
