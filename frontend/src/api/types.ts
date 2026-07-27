export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiRequest<TBody = unknown> {
  path: string
  method?: HttpMethod
  body?: TBody
  authenticated?: boolean
}

export interface ApiRequestOptions {
  signal?: AbortSignal
}

export interface BackendErrorBody {
  error?: {
    code?: string
    message?: string
    request_id?: string
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}
