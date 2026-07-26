import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { GetTranscriptionJobCommand, StartTranscriptionJobCommand, TranscribeClient } from '@aws-sdk/client-transcribe';
import { requireAuth } from './auth.js';
import { config } from './config.js';
import { AppError } from './errors.js';
import { mediaStorage } from './media.js';
import { sttHistoryStore } from './models.js';
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        callback(null, ['.mp3', '.wav', '.m4a', '.flac'].includes(extension));
    }
});
const transcribe = new TranscribeClient({ region: config.aws.region });
async function refreshAwsResult(document) {
    if (!config.aws.enabled || !document.transcriptionJobName || document.status === 'COMPLETED')
        return document;
    const response = await transcribe.send(new GetTranscriptionJobCommand({
        TranscriptionJobName: document.transcriptionJobName
    }));
    const job = response.TranscriptionJob;
    if (job?.TranscriptionJobStatus === 'FAILED') {
        return sttHistoryStore.update(document, { status: 'FAILED' });
    }
    if (job?.TranscriptionJobStatus === 'COMPLETED' && document.resultStorageKey) {
        const raw = await mediaStorage.get(document.resultStorageKey);
        const json = JSON.parse(raw.toString('utf8'));
        return sttHistoryStore.update(document, {
            resultText: json.results?.transcripts?.[0]?.transcript ?? '',
            status: 'COMPLETED'
        });
    }
    return document;
}
async function sttResponse(input) {
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
sttRouter.post('/stt', requireAuth, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            throw new AppError(400, 'AUDIO_REQUIRED', 'Vui lòng chọn file MP3, WAV, M4A hoặc FLAC.');
        const user = req.user;
        const id = randomUUID();
        const extension = path.extname(req.file.originalname).toLowerCase().slice(1);
        const sourceKey = `stt/source/${user.id}/${id}.${extension}`;
        await mediaStorage.save(sourceKey, req.file.buffer, req.file.mimetype || 'application/octet-stream');
        let resultText = `[Kết quả mô phỏng cho ${req.file.originalname}]\n\nNode.js backend đã nhận file thành công.`;
        let resultStorageKey = `stt/result/${user.id}/${id}.txt`;
        let status = 'COMPLETED';
        let transcriptionJobName;
        if (config.aws.enabled) {
            resultText = '';
            resultStorageKey = `stt/result/${user.id}/${id}.json`;
            status = 'PROCESSING';
            transcriptionJobName = `polly-voice-${id}`;
            await transcribe.send(new StartTranscriptionJobCommand({
                TranscriptionJobName: transcriptionJobName,
                LanguageCode: config.aws.transcribeLanguageCode,
                Media: { MediaFileUri: `s3://${config.aws.bucket}/${sourceKey}` },
                MediaFormat: extension,
                OutputBucketName: config.aws.bucket,
                OutputKey: resultStorageKey
            }));
        }
        else {
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
            status: status,
            createdAt,
            updatedAt: createdAt
        });
        res.status(202).json({ data: await sttResponse(document) });
    }
    catch (error) {
        next(error);
    }
});
sttRouter.get('/stt/history', requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const page = Math.max(Number(req.query.page) || 0, 0);
        const docs = await sttHistoryStore.list(user.id, page, limit);
        res.json({ data: await Promise.all(docs.map(sttResponse)) });
    }
    catch (error) {
        next(error);
    }
});
sttRouter.get('/stt/:id', requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const doc = await sttHistoryStore.get(user.id, String(req.params.id));
        if (!doc)
            throw new AppError(404, 'STT_NOT_FOUND', 'Không tìm thấy lịch sử STT.');
        res.json({ data: await sttResponse(doc) });
    }
    catch (error) {
        next(error);
    }
});
sttRouter.get('/stt/:id/download', requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const doc = await sttHistoryStore.get(user.id, String(req.params.id));
        if (!doc?.resultStorageKey)
            throw new AppError(404, 'STT_RESULT_NOT_FOUND', 'Kết quả STT chưa sẵn sàng.');
        res.json({ data: { downloadUrl: await mediaStorage.downloadUrl(doc.resultStorageKey), expiresIn: 900 } });
    }
    catch (error) {
        next(error);
    }
});
sttRouter.delete('/stt/:id', requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const deleted = await sttHistoryStore.softDelete(user.id, String(req.params.id));
        if (!deleted)
            throw new AppError(404, 'STT_NOT_FOUND', 'Không tìm thấy lịch sử STT.');
        res.status(204).end();
    }
    catch (error) {
        next(error);
    }
});
//# sourceMappingURL=stt.js.map