export type EngineType = 'neural' | 'standard' | 'long-form'
export type TabType = 'tts' | 'stt' | 'history' | 'profile'
export type UserRole = 'guest' | 'user'
export type AuthMode = 'login' | 'register'

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
