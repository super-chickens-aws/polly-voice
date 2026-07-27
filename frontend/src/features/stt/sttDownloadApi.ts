import type { AuthContextValue } from '../../auth/types'
import type { JobDownloadResponse } from '../download/downloadTypes'

type AuthenticatedRequest = AuthContextValue['authenticatedRequest']

export function getSttTranscriptDownload(
  authenticatedRequest: AuthenticatedRequest,
  jobId: string,
  signal: AbortSignal,
): Promise<JobDownloadResponse<'STT'>> {
  return authenticatedRequest<JobDownloadResponse<'STT'>>(
    {
      path: `/stt/jobs/${encodeURIComponent(jobId)}/download`,
      method: 'GET',
    },
    { signal },
  )
}
