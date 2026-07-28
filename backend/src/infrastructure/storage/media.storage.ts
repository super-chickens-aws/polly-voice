import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../core/config/environment.js';
import { AppError } from '../../core/http/errors.js';

export type StoredMedia = {
  key: string;
  contentType: string;
  size: number;
  downloadUrl: string;
};

export interface MediaStorage {
  save(key: string, body: Buffer, contentType: string): Promise<StoredMedia>;
  get(key: string): Promise<Buffer>;
  downloadUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}

class LocalMediaStorage implements MediaStorage {
  private readonly root = path.resolve(config.mediaDirectory);

  async save(key: string, body: Buffer, contentType: string): Promise<StoredMedia> {
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

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolve(key));
    } catch {
      throw new AppError(404, 'MEDIA_NOT_FOUND', 'The media file was not found.');
    }
  }

  async downloadUrl(key: string): Promise<string> {
    return `${config.publicBaseUrl}/api/v1/media/${key}`;
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch(() => undefined);
  }

  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(`${this.root}${path.sep}`)) {
      throw new AppError(400, 'INVALID_MEDIA_KEY', 'The media key is invalid.');
    }
    return target;
  }
}

class S3MediaStorage implements MediaStorage {
  private readonly client = new S3Client({ region: config.aws.region });

  async save(key: string, body: Buffer, contentType: string): Promise<StoredMedia> {
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

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: config.aws.bucket,
      Key: key
    }));
    if (!response.Body) throw new AppError(404, 'MEDIA_NOT_FOUND', 'The media file was not found.');
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async downloadUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: config.aws.bucket, Key: key }),
      { expiresIn: config.aws.presignedUrlTtlSeconds }
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: config.aws.bucket, Key: key }));
  }
}

export const mediaStorage: MediaStorage = config.aws.enabled
  ? new S3MediaStorage()
  : new LocalMediaStorage();
