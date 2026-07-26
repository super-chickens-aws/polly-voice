import 'dotenv/config';
import { z } from 'zod';

const env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/polly_voice'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:8080'),
  MEDIA_DIRECTORY: z.string().default('./data/media'),
  AWS_ENABLED: z.string().default('false').transform((value) => value === 'true'),
  AWS_REGION: z.string().default('eu-north-1'),
  AWS_S3_MEDIA_BUCKET: z.string().default(''),
  AWS_S3_PRESIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AWS_COGNITO_USER_POOL_ID: z.string().default(''),
  AWS_COGNITO_CLIENT_ID: z.string().default(''),
  AWS_COGNITO_ISSUER_URI: z.string().default(''),
  AWS_TRANSCRIBE_LANGUAGE_CODE: z.string().default('en-US')
}).parse(process.env);

if (env.AWS_ENABLED) {
  const required = {
    AWS_S3_MEDIA_BUCKET: env.AWS_S3_MEDIA_BUCKET,
    AWS_COGNITO_CLIENT_ID: env.AWS_COGNITO_CLIENT_ID,
    AWS_COGNITO_ISSUER_URI: env.AWS_COGNITO_ISSUER_URI
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing AWS configuration: ${missing.join(', ')}`);
}

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  mongoUri: env.MONGODB_URI,
  allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()),
  publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/+$/, ''),
  mediaDirectory: env.MEDIA_DIRECTORY,
  aws: {
    enabled: env.AWS_ENABLED,
    region: env.AWS_REGION,
    bucket: env.AWS_S3_MEDIA_BUCKET,
    presignedUrlTtlSeconds: env.AWS_S3_PRESIGNED_URL_TTL_SECONDS,
    cognitoUserPoolId: env.AWS_COGNITO_USER_POOL_ID,
    cognitoClientId: env.AWS_COGNITO_CLIENT_ID,
    cognitoIssuerUri: env.AWS_COGNITO_ISSUER_URI,
    transcribeLanguageCode: env.AWS_TRANSCRIBE_LANGUAGE_CODE
  }
} as const;
