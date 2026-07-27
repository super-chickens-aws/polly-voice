import type { ApiRequest, ApiRequestOptions } from '../api/types'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthUser {
  email?: string
  name?: string
  preferredUsername?: string
  subject?: string
}

export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  login: () => Promise<void>
  register: () => Promise<void>
  logout: () => void
  completeCallback: (code: string, state: string) => Promise<void>
  clearPendingAuthorization: () => void
  getValidAccessToken: (forceRefresh?: boolean) => Promise<string>
  authenticatedRequest: <TResponse, TBody = unknown>(
    request: ApiRequest<TBody>,
    options?: ApiRequestOptions,
  ) => Promise<TResponse>
}

export class AuthError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}
