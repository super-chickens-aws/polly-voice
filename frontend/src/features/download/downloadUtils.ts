export class PresignedRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super('The presigned request failed.')
    this.name = 'PresignedRequestError'
    this.status = status
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export async function fetchPresignedJson(
  url: string,
  method: 'GET',
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, { method, signal })
  if (!response.ok) {
    throw new PresignedRequestError(response.status)
  }
  try {
    return (await response.json()) as unknown
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error
    }
    throw new Error('INVALID_TRANSCRIPT_JSON')
  }
}

export function startBrowserDownload(url: string, fileName: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}
