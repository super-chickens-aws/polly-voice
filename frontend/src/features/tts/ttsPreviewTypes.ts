export const PREVIEW_ENGINES = ['neural', 'standard'] as const
export const PREVIEW_OUTPUT_FORMATS = ['mp3', 'ogg_vorbis', 'pcm'] as const

export type PreviewEngine = (typeof PREVIEW_ENGINES)[number]
export type PreviewOutputFormat = (typeof PREVIEW_OUTPUT_FORMATS)[number]

export interface TtsPreviewRequest {
  text: string
  voice: string
  engine: PreviewEngine
  output_format: PreviewOutputFormat
}

export interface TtsPreviewResponse {
  audio_url: string
  expires_in: number
  voice: string
  engine: PreviewEngine
  output_format: PreviewOutputFormat
}

export type TtsPreviewState =
  | 'idle'
  | 'validating'
  | 'generating'
  | 'success'
  | 'validation-error'
  | 'service-error'
  | 'network-error'
  | 'audio-error'
