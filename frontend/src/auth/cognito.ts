import { config } from '../config/env'
import { AuthError, type AuthUser } from './types'
import { createPkceAuthorization } from './pkce'
import {
  loadOAuthTransaction,
  saveOAuthTransaction,
  type AuthSession,
} from './tokenStorage'

interface TokenResponse {
  access_token: string
  id_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseTokenResponse(value: unknown): TokenResponse {
  if (
    !isRecord(value) ||
    typeof value.access_token !== 'string' ||
    typeof value.id_token !== 'string' ||
    typeof value.token_type !== 'string' ||
    typeof value.expires_in !== 'number' ||
    !Number.isFinite(value.expires_in) ||
    value.expires_in <= 0 ||
    (value.refresh_token !== undefined &&
      typeof value.refresh_token !== 'string')
  ) {
    throw new AuthError(
      'INVALID_TOKEN_RESPONSE',
      'Cognito returned an invalid token response.',
    )
  }
  return {
    access_token: value.access_token,
    id_token: value.id_token,
    refresh_token: value.refresh_token,
    token_type: value.token_type,
    expires_in: value.expires_in,
  }
}

async function postTokenRequest(parameters: URLSearchParams): Promise<TokenResponse> {
  let response: Response
  try {
    response = await fetch(`${config.cognitoDomain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: parameters,
    })
  } catch {
    throw new AuthError(
      'TOKEN_REQUEST_FAILED',
      'Unable to contact the authentication service.',
    )
  }

  if (!response.ok) {
    throw new AuthError(
      'TOKEN_REQUEST_FAILED',
      'Cognito rejected the token request.',
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new AuthError(
      'INVALID_TOKEN_RESPONSE',
      'Cognito returned an invalid token response.',
    )
  }
  return parseTokenResponse(body)
}

function toSession(tokens: TokenResponse, refreshToken?: string): AuthSession {
  return {
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token ?? refreshToken,
    tokenType: tokens.token_type,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  }
}

export async function beginAuthorization(mode: 'login' | 'signup'): Promise<void> {
  const pkce = await createPkceAuthorization()
  saveOAuthTransaction({ verifier: pkce.verifier, state: pkce.state })

  const params = new URLSearchParams({
    client_id: config.cognitoClientId,
    response_type: 'code',
    scope: config.cognitoScopes.join(' '),
    redirect_uri: config.cognitoRedirectUri,
    state: pkce.state,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
  })
  const endpoint = mode === 'signup' ? 'signup' : 'oauth2/authorize'
  window.location.assign(`${config.cognitoDomain}/${endpoint}?${params}`)
}

export async function exchangeAuthorizationCode(
  code: string,
  returnedState: string,
): Promise<AuthSession> {
  const transaction = loadOAuthTransaction()
  if (
    !transaction ||
    !returnedState ||
    transaction.state !== returnedState ||
    !transaction.verifier
  ) {
    throw new AuthError(
      'INVALID_AUTHORIZATION_STATE',
      'The authentication response could not be verified.',
    )
  }

  const tokens = await postTokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.cognitoClientId,
      code,
      redirect_uri: config.cognitoRedirectUri,
      code_verifier: transaction.verifier,
    }),
  )
  return toSession(tokens)
}

export async function refreshAuthSession(
  refreshToken: string,
): Promise<AuthSession> {
  const tokens = await postTokenRequest(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.cognitoClientId,
      refresh_token: refreshToken,
    }),
  )
  return toSession(tokens, refreshToken)
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  return decodeURIComponent(
    Array.from(atob(normalized + padding))
      .map((character) => {
        return `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`
      })
      .join(''),
  )
}

export function getDisplayUser(idToken: string): AuthUser | null {
  try {
    const parts = idToken.split('.')
    if (parts.length !== 3) {
      return null
    }
    const claims: unknown = JSON.parse(decodeBase64Url(parts[1]))
    if (!isRecord(claims)) {
      return null
    }
    return {
      email: typeof claims.email === 'string' ? claims.email : undefined,
      name: typeof claims.name === 'string' ? claims.name : undefined,
      preferredUsername:
        typeof claims.preferred_username === 'string'
          ? claims.preferred_username
          : undefined,
      subject: typeof claims.sub === 'string' ? claims.sub : undefined,
    }
  } catch {
    return null
  }
}

export function buildLogoutUrl(): string {
  const params = new URLSearchParams({
    client_id: config.cognitoClientId,
    logout_uri: config.cognitoLogoutUri,
  })
  return `${config.cognitoDomain}/logout?${params}`
}
