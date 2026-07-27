import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { createApiClient } from '../api/apiClient'
import type { ApiRequest, ApiRequestOptions } from '../api/types'
import {
  beginAuthorization,
  buildLogoutUrl,
  exchangeAuthorizationCode,
  getDisplayUser,
  refreshAuthSession,
} from './cognito'
import { AuthContext } from './authContext'
import {
  clearAuthSession,
  clearOAuthTransaction,
  loadAuthSession,
  saveAuthSession,
  type AuthSession,
} from './tokenStorage'
import {
  AuthError,
  type AuthContextValue,
  type AuthStatus,
  type AuthUser,
} from './types'

const REFRESH_WINDOW_MS = 60_000

function restoreSession(): AuthSession | null {
  const session = loadAuthSession()
  if (!session) {
    return null
  }
  if (session.expiresAt <= Date.now() && !session.refreshToken) {
    clearAuthSession()
    return null
  }
  return session
}

export function AuthProvider({ children }: PropsWithChildren) {
  const initialSession = useRef<AuthSession | null>(restoreSession())
  const sessionRef = useRef<AuthSession | null>(initialSession.current)
  const refreshPromiseRef = useRef<Promise<string> | null>(null)
  const callbackPromiseRef = useRef<Promise<void> | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

  const clearSession = useCallback(() => {
    sessionRef.current = null
    clearAuthSession()
    setUser(null)
    setStatus('anonymous')
  }, [])

  const refresh = useCallback(async (): Promise<string> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current
    }
    const refreshToken = sessionRef.current?.refreshToken
    if (!refreshToken) {
      clearSession()
      throw new AuthError(
        'AUTH_SESSION_EXPIRED',
        'Your session has expired. Please sign in again.',
      )
    }

    const promise = refreshAuthSession(refreshToken)
      .then((session) => {
        sessionRef.current = session
        saveAuthSession(session)
        setUser(getDisplayUser(session.idToken))
        setStatus('authenticated')
        return session.accessToken
      })
      .catch(() => {
        clearSession()
        throw new AuthError(
          'AUTH_REFRESH_FAILED',
          'Your session could not be refreshed. Please sign in again.',
        )
      })
      .finally(() => {
        refreshPromiseRef.current = null
      })
    refreshPromiseRef.current = promise
    return promise
  }, [clearSession])

  useEffect(() => {
    const session = initialSession.current
    if (!session) {
      setStatus('anonymous')
      return
    }
    if (session.expiresAt - Date.now() <= REFRESH_WINDOW_MS) {
      void refresh().catch(() => undefined)
      return
    }
    setUser(getDisplayUser(session.idToken))
    setStatus('authenticated')
  }, [refresh])

  const getValidAccessToken = useCallback(
    async (forceRefresh = false): Promise<string> => {
      const session = sessionRef.current
      if (!session) {
        throw new AuthError(
          'AUTH_REQUIRED',
          'You must sign in before making this request.',
        )
      }
      if (
        forceRefresh ||
        session.expiresAt - Date.now() <= REFRESH_WINDOW_MS
      ) {
        return refresh()
      }
      return session.accessToken
    },
    [refresh],
  )

  const completeCallback = useCallback(
    async (code: string, state: string): Promise<void> => {
      if (callbackPromiseRef.current) {
        return callbackPromiseRef.current
      }
      const promise = exchangeAuthorizationCode(code, state)
        .then((session) => {
          sessionRef.current = session
          saveAuthSession(session)
          setUser(getDisplayUser(session.idToken))
          setStatus('authenticated')
          clearOAuthTransaction()
        })
        .catch((error: unknown) => {
          clearOAuthTransaction()
          clearSession()
          if (error instanceof AuthError) {
            throw error
          }
          throw new AuthError(
            'AUTH_CALLBACK_FAILED',
            'Authentication could not be completed.',
          )
        })
        .finally(() => {
          callbackPromiseRef.current = null
        })
      callbackPromiseRef.current = promise
      return promise
    },
    [clearSession],
  )

  const authenticatedRequest = useCallback(
    async <TResponse, TBody = unknown>(
      request: ApiRequest<TBody>,
      options?: ApiRequestOptions,
    ): Promise<TResponse> => {
      const client = createApiClient(getValidAccessToken)
      return client<TResponse, TBody>(
        { ...request, authenticated: true },
        options,
      )
    },
    [getValidAccessToken],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login: () => beginAuthorization('login'),
      register: () => beginAuthorization('signup'),
      logout: () => {
        clearOAuthTransaction()
        clearSession()
        window.location.assign(buildLogoutUrl())
      },
      completeCallback,
      clearPendingAuthorization: clearOAuthTransaction,
      getValidAccessToken,
      authenticatedRequest,
    }),
    [
      authenticatedRequest,
      clearSession,
      completeCallback,
      getValidAccessToken,
      status,
      user,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
