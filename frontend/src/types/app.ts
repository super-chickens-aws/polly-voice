export type EngineType = 'neural' | 'standard' | 'long-form'
export type TabType = 'tts' | 'stt' | 'history' | 'profile'
export type UserRole = 'guest' | 'user'
export type AuthMode = 'login' | 'register'
export type HistoryTab = 'tts' | 'stt'

export interface TTSHistoryItem {
  id: string
  text_content: string
  voice: string
  engine: EngineType
  audio_s3_key: string
  audio_url: string
  audio_file_size: number
  created_at: number
}

export interface STTHistoryItem {
  id: string
  file_name: string
  audio_s3_key: string
  audio_file_size: number
  result_text: string
  created_at: number
}

export interface PresetItem {
  id: string
  name: string
  desc: string
  voice?: string
  engine?: EngineType
  domain?: string
}

export interface TtsFormState {
  engine: EngineType
  text: string
  preset: string
  language: string
  voice: string
  speed: number
  volume: number
  breakTime: number
  pitch: number
  emphasis: string
  domainStyle: string
}
