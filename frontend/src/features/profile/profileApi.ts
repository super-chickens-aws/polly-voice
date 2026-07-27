import type { AuthContextValue } from '../../auth/types'
import type { ProfileResponse, UpdateProfileRequest } from './profileTypes'

type AuthenticatedRequest = AuthContextValue['authenticatedRequest']

export function getProfile(
  authenticatedRequest: AuthenticatedRequest,
  signal: AbortSignal,
): Promise<ProfileResponse> {
  return authenticatedRequest<ProfileResponse>(
    {
      path: '/profile',
      method: 'GET',
    },
    { signal },
  )
}

export function updateProfile(
  authenticatedRequest: AuthenticatedRequest,
  profile: UpdateProfileRequest,
  signal: AbortSignal,
): Promise<ProfileResponse> {
  return authenticatedRequest<ProfileResponse, UpdateProfileRequest>(
    {
      path: '/profile',
      method: 'PUT',
      body: profile,
    },
    { signal },
  )
}
