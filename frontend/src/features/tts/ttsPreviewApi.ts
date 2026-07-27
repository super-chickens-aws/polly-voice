import { createApiClient } from '../../api/apiClient'
import type { TtsPreviewRequest, TtsPreviewResponse } from './ttsPreviewTypes'

const publicApiRequest = createApiClient()

export function requestTtsPreview(
  request: TtsPreviewRequest,
  signal: AbortSignal,
): Promise<TtsPreviewResponse> {
  return publicApiRequest<TtsPreviewResponse, TtsPreviewRequest>(
    {
      path: '/tts/preview',
      method: 'POST',
      authenticated: false,
      body: request,
    },
    { signal },
  )
}
