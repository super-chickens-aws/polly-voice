import type { AuthContextValue } from '../../auth/types'
import type {
  CreateSttJobRequest,
  CreateSttJobResponse,
  SttJobListResponse,
  SttJobResponse,
  SttUploadInstructions,
} from './sttJobTypes'

type AuthenticatedRequest = AuthContextValue['authenticatedRequest']

export class SttUploadError extends Error {
  readonly status: number

  constructor(status: number) {
    super('The presigned upload request failed.')
    this.name = 'SttUploadError'
    this.status = status
  }
}

export function createSttJob(
  authenticatedRequest: AuthenticatedRequest,
  request: CreateSttJobRequest,
  signal: AbortSignal,
): Promise<CreateSttJobResponse> {
  return authenticatedRequest<CreateSttJobResponse, CreateSttJobRequest>(
    {
      path: '/stt/jobs',
      method: 'POST',
      body: request,
    },
    { signal },
  )
}

export async function uploadSttMedia(
  upload: SttUploadInstructions,
  file: File,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: file,
    signal,
  })
  if (!response.ok) {
    throw new SttUploadError(response.status)
  }
}

export function listSttJobs(
  authenticatedRequest: AuthenticatedRequest,
  signal: AbortSignal,
): Promise<SttJobListResponse> {
  return authenticatedRequest<SttJobListResponse>(
    { path: '/stt/jobs', method: 'GET' },
    { signal },
  )
}

export function getSttJob(
  authenticatedRequest: AuthenticatedRequest,
  jobId: string,
  signal: AbortSignal,
): Promise<SttJobResponse> {
  return authenticatedRequest<SttJobResponse>(
    {
      path: `/stt/jobs/${encodeURIComponent(jobId)}`,
      method: 'GET',
    },
    { signal },
  )
}
