import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';
import { AppError } from './errors.js';
class LocalMediaStorage {
    root = path.resolve(config.mediaDirectory);
    async save(key, body, contentType) {
        const target = this.resolve(key);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, body);
        return {
            key,
            contentType,
            size: body.byteLength,
            downloadUrl: await this.downloadUrl(key)
        };
    }
    async get(key) {
        try {
            return await readFile(this.resolve(key));
        }
        catch {
            throw new AppError(404, 'MEDIA_NOT_FOUND', 'Không tìm thấy file media.');
        }
    }
    async downloadUrl(key) {
        return `${config.publicBaseUrl}/api/v1/media/${key}`;
    }
    async delete(key) {
        await unlink(this.resolve(key)).catch(() => undefined);
    }
    resolve(key) {
        const target = path.resolve(this.root, key);
        if (!target.startsWith(`${this.root}${path.sep}`)) {
            throw new AppError(400, 'INVALID_MEDIA_KEY', 'Media key không hợp lệ.');
        }
        return target;
    }
}
class S3MediaStorage {
    client = new S3Client({ region: config.aws.region });
    async save(key, body, contentType) {
        await this.client.send(new PutObjectCommand({
            Bucket: config.aws.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            ServerSideEncryption: 'AES256'
        }));
        return {
            key,
            contentType,
            size: body.byteLength,
            downloadUrl: await this.downloadUrl(key)
        };
    }
    async get(key) {
        const response = await this.client.send(new GetObjectCommand({
            Bucket: config.aws.bucket,
            Key: key
        }));
        if (!response.Body)
            throw new AppError(404, 'MEDIA_NOT_FOUND', 'Không tìm thấy media.');
        return Buffer.from(await response.Body.transformToByteArray());
    }
    async downloadUrl(key) {
        return getSignedUrl(this.client, new GetObjectCommand({ Bucket: config.aws.bucket, Key: key }), { expiresIn: config.aws.presignedUrlTtlSeconds });
    }
    async delete(key) {
        await this.client.send(new DeleteObjectCommand({ Bucket: config.aws.bucket, Key: key }));
    }
}
export const mediaStorage = config.aws.enabled
    ? new S3MediaStorage()
    : new LocalMediaStorage();
//# sourceMappingURL=media.js.map