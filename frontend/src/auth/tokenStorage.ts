const OAUTH_TRANSACTION_KEY = 'polly_voice.oauth_transaction'
const AUTH_SESSION_KEY = 'polly_voice.auth_session'

export interface OAuthTransaction {
  verifier: string
  state: string
}

export interface AuthSession {
  accessToken: string
  idToken: string
  refreshToken?: string
  tokenType: string
  expiresAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function saveOAuthTransaction(transaction: OAuthTransaction): void {
  sessionStorage.setItem(OAUTH_TRANSACTION_KEY, JSON.stringify(transaction))
}

export function loadOAuthTransaction(): OAuthTransaction | null {
  const raw = sessionStorage.getItem(OAUTH_TRANSACTION_KEY)
  if (!raw) {
    return null
  }
  try {
    const value: unknown = JSON.parse(raw)
    if (
      isRecord(value) &&
      typeof value.verifier === 'string' &&
      typeof value.state === 'string'
    ) {
      return { verifier: value.verifier, state: value.state }
    }
  } catch {
    // Invalid temporary state is discarded below.
  }
  clearOAuthTransaction()
  return null
}

export function clearOAuthTransaction(): void {
  sessionStorage.removeItem(OAUTH_TRANSACTION_KEY)
}

export function saveAuthSession(session: AuthSession): void {
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
}

export function loadAuthSession(): AuthSession | null {
  const raw = sessionStorage.getItem(AUTH_SESSION_KEY)
  if (!raw) {
    return null
  }
  try {
    const value: unknown = JSON.parse(raw)
    if (
      isRecord(value) &&
      typeof value.accessToken === 'string' &&
      typeof value.idToken === 'string' &&
      typeof value.tokenType === 'string' &&
      typeof value.expiresAt === 'number' &&
      Number.isFinite(value.expiresAt) &&
      (value.refreshToken === undefined ||
        typeof value.refreshToken === 'string')
    ) {
      return {
        accessToken: value.accessToken,
        idToken: value.idToken,
        refreshToken: value.refreshToken,
        tokenType: value.tokenType,
        expiresAt: value.expiresAt,
      }
    }
  } catch {
    // Invalid session data is discarded below.
  }
  clearAuthSession()
  return null
}

export function clearAuthSession(): void {
  sessionStorage.removeItem(AUTH_SESSION_KEY)
}
