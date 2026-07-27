export type DownloadJobType = 'TTS' | 'STT'

export interface DownloadInstructions {
  method: 'GET'
  url: string
  expires_in: number
  content_type: string
  file_name: string
}

export interface JobDownloadResponse<TType extends DownloadJobType> {
  job: {
    job_id: string
    type: TType
    status: 'COMPLETED'
  }
  download: DownloadInstructions
}

export interface ExpiringDownload {
  instructions: DownloadInstructions
  expiresAt: number
}

export function toExpiringDownload<TType extends DownloadJobType>(
  response: JobDownloadResponse<TType>,
  expectedType: TType,
  expectedJobId: string,
): ExpiringDownload | null {
  const job = response?.job
  const download = response?.download
  if (typeof download?.url !== 'string' || !download.url) {
    return null
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(download.url)
  } catch {
    return null
  }
  if (
    job?.job_id !== expectedJobId ||
    job.type !== expectedType ||
    job.status !== 'COMPLETED' ||
    download?.method !== 'GET' ||
    (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') ||
    typeof download.file_name !== 'string' ||
    !download.file_name ||
    typeof download.content_type !== 'string' ||
    !download.content_type ||
    !Number.isFinite(download.expires_in) ||
    download.expires_in <= 0
  ) {
    return null
  }

  return {
    instructions: download,
    expiresAt:
      Date.now() + Math.max(0, download.expires_in * 1_000 - 30_000),
  }
}

export function isDownloadUsable(
  download: ExpiringDownload | null,
): download is ExpiringDownload {
  return download !== null && Date.now() < download.expiresAt
}
