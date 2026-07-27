import type { AuthContextValue } from '../../auth/types'
import type {
  CreateTtsJobRequest,
  TtsJobListResponse,
  TtsJobResponse,
} from './ttsJobTypes'

type AuthenticatedRequest = AuthContextValue['authenticatedRequest']

export function createTtsJob(
  authenticatedRequest: AuthenticatedRequest,
  request: CreateTtsJobRequest,
  signal: AbortSignal,
): Promise<TtsJobResponse> {
  return authenticatedRequest<TtsJobResponse, CreateTtsJobRequest>(
    {
      path: '/tts/jobs',
      method: 'POST',
      body: request,
    },
    { signal },
  )
}

export function listTtsJobs(
  authenticatedRequest: AuthenticatedRequest,
  signal: AbortSignal,
): Promise<TtsJobListResponse> {
  return authenticatedRequest<TtsJobListResponse>(
    {
      path: '/tts/jobs',
      method: 'GET',
    },
    { signal },
  )
}

export function getTtsJob(
  authenticatedRequest: AuthenticatedRequest,
  jobId: string,
  signal: AbortSignal,
): Promise<TtsJobResponse> {
  return authenticatedRequest<TtsJobResponse>(
    {
      path: `/tts/jobs/${encodeURIComponent(jobId)}`,
      method: 'GET',
    },
    { signal },
  )
}
