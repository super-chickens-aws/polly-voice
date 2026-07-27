export const PREFERRED_LANGUAGES = ['vi-VN', 'en-US'] as const

export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[number]

export interface Profile {
  cognito_sub: string | null
  display_name: string | null
  preferred_language: PreferredLanguage | null
  created_at: string | null
  updated_at: string | null
}

export interface ProfileResponse {
  profile: Profile
}

export interface UpdateProfileRequest {
  display_name: string
  preferred_language: PreferredLanguage
}
