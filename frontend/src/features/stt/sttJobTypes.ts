export const STT_MEDIA_FORMATS = [
  'mp3',
  'mp4',
  'wav',
  'flac',
  'ogg',
  'amr',
  'webm',
  'm4a',
] as const

export const STT_LANGUAGE_CODES = ['vi-VN', 'en-US'] as const
export const STT_JOB_STATUSES = [
  'AWAITING_UPLOAD',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
] as const

export type SttMediaFormat = (typeof STT_MEDIA_FORMATS)[number]
export type SttLanguageCode = (typeof STT_LANGUAGE_CODES)[number]
export type SttJobStatus = (typeof STT_JOB_STATUSES)[number]

export interface CreateSttJobRequest {
  media_format: SttMediaFormat
  language_code: SttLanguageCode
}

export interface SttJob {
  job_id: string
  type: 'STT'
  status: SttJobStatus
  media_format?: SttMediaFormat
  language_code?: SttLanguageCode
  input_key?: string
  output_key?: string
  transcript_key?: string
  created_at?: number
  updated_at?: number
  completed_at?: number
  error_code?: string
  error_message?: string
}

export interface SttUploadInstructions {
  method: string
  url: string
  headers: Record<string, string>
  expires_in: number
}

export interface CreateSttJobResponse {
  job: SttJob
  upload: SttUploadInstructions
}

export interface SttJobResponse {
  job: SttJob
}

export interface SttJobListResponse {
  jobs: SttJob[]
}

export type SttListState = 'idle' | 'loading' | 'loaded' | 'error'
export type SttUploadState =
  | 'idle'
  | 'validating'
  | 'creating_job'
  | 'uploading'
  | 'uploaded'
  | 'upload_failed'
  | 'processing'
  | 'completed'
  | 'failed'

export type SttPollIssue = 'retrying' | 'stopped' | 'unavailable'

export function isTerminalSttJob(job: SttJob): boolean {
  return job.status === 'COMPLETED' || job.status === 'FAILED'
}

export function mediaFormatFromFileName(
  fileName: string,
): SttMediaFormat | null {
  const separator = fileName.lastIndexOf('.')
  if (separator < 0 || separator === fileName.length - 1) {
    return null
  }
  const extension = fileName.slice(separator + 1).toLowerCase()
  return STT_MEDIA_FORMATS.find((format) => format === extension) ?? null
}
