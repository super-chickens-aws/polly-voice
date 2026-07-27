import type { SttJob } from '../stt/sttJobTypes'
import type { TtsJob } from '../tts/ttsJobTypes'

export type HistoryJob = TtsJob | SttJob
export type HistoryTypeFilter = 'ALL' | 'TTS' | 'STT'
export type HistoryStatusFilter =
  | 'ALL'
  | 'WAITING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'

export type HistoryLoadState =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'partial'
  | 'error'
  | 'refreshing'

export interface HistoryFailures {
  tts: boolean
  stt: boolean
}
