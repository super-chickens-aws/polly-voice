import type { AuthContextValue } from '../../auth/types'
import type { JobDownloadResponse } from '../download/downloadTypes'

type AuthenticatedRequest = AuthContextValue['authenticatedRequest']

export function getTtsDownload(
  authenticatedRequest: AuthenticatedRequest,
  jobId: string,
  signal: AbortSignal,
): Promise<JobDownloadResponse<'TTS'>> {
  return authenticatedRequest<JobDownloadResponse<'TTS'>>(
    {
      path: `/tts/jobs/${encodeURIComponent(jobId)}/download`,
      method: 'GET',
    },
    { signal },
  )
}
