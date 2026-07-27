import type {
  PreviewEngine,
  PreviewOutputFormat,
} from './ttsPreviewTypes'

export const TTS_JOB_STATUSES = [
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
] as const

export type TtsJobStatus = (typeof TTS_JOB_STATUSES)[number]

export interface CreateTtsJobRequest {
  text: string
  voice: string
  engine: PreviewEngine
  output_format: PreviewOutputFormat
}

export interface TtsJob {
  job_id: string
  type: 'TTS'
  status: TtsJobStatus
  voice?: string
  engine?: PreviewEngine
  output_format?: PreviewOutputFormat
  created_at?: number
  updated_at?: number
  completed_at?: number
  error_code?: string
  error_message?: string
  output_key?: string
}

export interface TtsJobResponse {
  job: TtsJob
}

export interface TtsJobListResponse {
  jobs: TtsJob[]
}

export type TtsJobListState = 'idle' | 'loading' | 'loaded' | 'error'
export type TtsJobCreateState =
  | 'idle'
  | 'creating'
  | 'created'
  | 'validation-error'
  | 'error'

export type PollIssue = 'retrying' | 'stopped' | 'unavailable'

export function isTerminalTtsJob(job: TtsJob): boolean {
  return job.status === 'COMPLETED' || job.status === 'FAILED'
}
