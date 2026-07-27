import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/types'
import { useAuth } from '../../auth/useAuth'
import {
  isDownloadUsable,
  toExpiringDownload,
  type ExpiringDownload,
} from '../download/downloadTypes'
import {
  fetchPresignedJson,
  isAbortError,
  PresignedRequestError,
  startBrowserDownload,
} from '../download/downloadUtils'
import { getSttTranscriptDownload } from './sttDownloadApi'

export type SttTranscriptState =
  | 'idle'
  | 'loading_url'
  | 'loading_transcript'
  | 'loaded'
  | 'error'

function transcriptFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const results = Reflect.get(payload, 'results')
  if (!results || typeof results !== 'object') {
    return null
  }
  const transcripts = Reflect.get(results, 'transcripts')
  if (!Array.isArray(transcripts) || transcripts.length === 0) {
    return null
  }
  const first = transcripts[0]
  if (!first || typeof first !== 'object') {
    return null
  }
  const transcript = Reflect.get(first, 'transcript')
  return typeof transcript === 'string' ? transcript : null
}

function safeTranscriptError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.code === 'JOB_NOT_READY') {
      return 'Job chưa sẵn sàng để xem transcript.'
    }
    if (error.status === 404 && error.code === 'JOB_NOT_FOUND') {
      return 'Transcript của job này không khả dụng.'
    }
    if (error.status === 502) {
      return 'Dịch vụ lưu trữ tạm thời chưa khả dụng. Vui lòng thử lại.'
    }
  }
  if (error instanceof PresignedRequestError) {
    return error.status === 403
      ? 'URL transcript đã hết hạn hoặc bị từ chối. Vui lòng thử lại.'
      : 'Không thể tải transcript từ bộ nhớ. Vui lòng thử lại.'
  }
  if (error instanceof Error && error.message === 'MALFORMED_TRANSCRIPT') {
    return 'Nội dung transcript không đúng định dạng mong đợi.'
  }
  return 'Không thể tải transcript. Vui lòng thử lại.'
}

export function useSttTranscript(
  jobId: string,
  enabled: boolean,
  onJobNotReady: (jobId: string) => void,
) {
  const { status, authenticatedRequest } = useAuth()
  const [state, setState] = useState<SttTranscriptState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [transcript, setTranscript] = useState<string | null>(null)
  const downloadRef = useRef<ExpiringDownload | null>(null)
  const requestRef = useRef<Promise<ExpiringDownload | null> | null>(null)
  const apiControllerRef = useRef<AbortController | null>(null)
  const transcriptControllerRef = useRef<AbortController | null>(null)
  const expirationTimerRef = useRef<number | null>(null)
  const transcriptRequestRef = useRef(false)

  const clearExpirationTimer = useCallback(() => {
    if (expirationTimerRef.current !== null) {
      window.clearTimeout(expirationTimerRef.current)
      expirationTimerRef.current = null
    }
  }, [])

  const clearDownload = useCallback(() => {
    clearExpirationTimer()
    downloadRef.current = null
  }, [clearExpirationTimer])

  const rememberDownload = useCallback(
    (next: ExpiringDownload) => {
      clearExpirationTimer()
      downloadRef.current = next
      expirationTimerRef.current = window.setTimeout(() => {
        downloadRef.current = null
      }, Math.max(0, next.expiresAt - Date.now()))
    },
    [clearExpirationTimer],
  )

  const requestDownload = useCallback(
    (forceRefresh = false): Promise<ExpiringDownload | null> => {
      if (!enabled || status !== 'authenticated') {
        return Promise.resolve(null)
      }
      if (!forceRefresh && isDownloadUsable(downloadRef.current)) {
        return Promise.resolve(downloadRef.current)
      }
      if (requestRef.current) {
        return requestRef.current
      }

      if (forceRefresh) {
        clearDownload()
      }
      setState('loading_url')
      setErrorMessage('')
      const controller = new AbortController()
      apiControllerRef.current = controller
      const request = getSttTranscriptDownload(
        authenticatedRequest,
        jobId,
        controller.signal,
      )
        .then((response) => {
          if (controller.signal.aborted) {
            return null
          }
          const next = toExpiringDownload(response, 'STT', jobId)
          if (
            !next ||
            next.instructions.content_type !== 'application/json'
          ) {
            throw new Error('INVALID_DOWNLOAD_RESPONSE')
          }
          rememberDownload(next)
          return next
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortError(error)) {
            return null
          }
          if (
            error instanceof ApiError &&
            error.status === 409 &&
            error.code === 'JOB_NOT_READY'
          ) {
            onJobNotReady(jobId)
          }
          setState('error')
          setErrorMessage(safeTranscriptError(error))
          return null
        })
        .finally(() => {
          requestRef.current = null
          if (apiControllerRef.current === controller) {
            apiControllerRef.current = null
          }
        })

      requestRef.current = request
      return request
    },
    [
      authenticatedRequest,
      clearDownload,
      enabled,
      jobId,
      onJobNotReady,
      rememberDownload,
      status,
    ],
  )

  const loadTranscript = useCallback(() => {
    if (
      transcriptRequestRef.current ||
      !enabled ||
      status !== 'authenticated'
    ) {
      return
    }
    transcriptRequestRef.current = true
    const controller = new AbortController()
    transcriptControllerRef.current?.abort()
    transcriptControllerRef.current = controller

    void (async () => {
      try {
        let available = await requestDownload()
        if (!available || controller.signal.aborted) {
          return
        }
        setState('loading_transcript')
        let payload: unknown
        try {
          payload = await fetchPresignedJson(
            available.instructions.url,
            available.instructions.method,
            controller.signal,
          )
        } catch (error: unknown) {
          if (
            !(error instanceof PresignedRequestError) ||
            error.status !== 403
          ) {
            throw error
          }
          available = await requestDownload(true)
          if (!available || controller.signal.aborted) {
            return
          }
          setState('loading_transcript')
          payload = await fetchPresignedJson(
            available.instructions.url,
            available.instructions.method,
            controller.signal,
          )
        }
        const text = transcriptFromPayload(payload)
        if (text === null) {
          throw new Error('MALFORMED_TRANSCRIPT')
        }
        setTranscript(text)
        setState('loaded')
        setErrorMessage('')
      } catch (error: unknown) {
        if (controller.signal.aborted || isAbortError(error)) {
          return
        }
        setState('error')
        setErrorMessage(safeTranscriptError(error))
      } finally {
        transcriptRequestRef.current = false
        if (transcriptControllerRef.current === controller) {
          transcriptControllerRef.current = null
        }
      }
    })()
  }, [enabled, requestDownload, status])

  const downloadTranscript = useCallback(() => {
    if (transcriptRequestRef.current) {
      return
    }
    void requestDownload().then((available) => {
      if (available) {
        startBrowserDownload(
          available.instructions.url,
          available.instructions.file_name,
        )
        setState(transcript === null ? 'idle' : 'loaded')
      }
    })
  }, [requestDownload, transcript])

  useEffect(() => {
    if (!enabled || status !== 'authenticated') {
      apiControllerRef.current?.abort()
      transcriptControllerRef.current?.abort()
      requestRef.current = null
      transcriptRequestRef.current = false
      clearDownload()
      setTranscript(null)
      setState('idle')
      setErrorMessage('')
    }
  }, [clearDownload, enabled, status])

  useEffect(
    () => () => {
      apiControllerRef.current?.abort()
      transcriptControllerRef.current?.abort()
      clearExpirationTimer()
      downloadRef.current = null
    },
    [clearExpirationTimer],
  )

  return {
    state,
    errorMessage,
    transcript,
    isLoading: state === 'loading_url' || state === 'loading_transcript',
    loadTranscript,
    downloadTranscript,
  }
}
