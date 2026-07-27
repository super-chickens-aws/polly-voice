import { config } from '../config/env'
import {
  ApiError,
  type ApiRequest,
  type ApiRequestOptions,
  type BackendErrorBody,
} from './types'

type AccessTokenProvider = (forceRefresh?: boolean) => Promise<string>

function buildUrl(path: string): string {
  return `${config.apiBaseUrl}/${path.replace(/^\/+/, '')}`
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return undefined
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function toApiError(response: Response, body: unknown): ApiError {
  const backend = body as BackendErrorBody | undefined
  return new ApiError(
    response.status,
    backend?.error?.code ?? 'API_REQUEST_FAILED',
    backend?.error?.message ?? 'The API request could not be completed.',
    backend?.error?.request_id,
  )
}

export function createApiClient(getAccessToken?: AccessTokenProvider) {
  return async function request<TResponse, TBody = unknown>(
    apiRequest: ApiRequest<TBody>,
    options: ApiRequestOptions = {},
  ): Promise<TResponse> {
    const execute = async (forceRefresh = false): Promise<Response> => {
      const headers = new Headers({ Accept: 'application/json' })
      if (apiRequest.body !== undefined) {
        headers.set('Content-Type', 'application/json')
      }
      if (apiRequest.authenticated !== false) {
        if (!getAccessToken) {
          throw new ApiError(
            0,
            'AUTH_CLIENT_NOT_CONFIGURED',
            'An authenticated API client is required.',
          )
        }
        headers.set('Authorization', await getAccessToken(forceRefresh))
      }

      return fetch(buildUrl(apiRequest.path), {
        method: apiRequest.method ?? 'GET',
        headers,
        body:
          apiRequest.body === undefined
            ? undefined
            : JSON.stringify(apiRequest.body),
        signal: options.signal,
      })
    }

    let response = await execute()
    if (response.status === 401 && apiRequest.authenticated !== false) {
      response = await execute(true)
    }

    const body = await readResponseBody(response)
    if (!response.ok) {
      throw toApiError(response, body)
    }
    return body as TResponse
  }
}
