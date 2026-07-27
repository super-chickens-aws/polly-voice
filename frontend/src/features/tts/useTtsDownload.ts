import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/types'
import { useAuth } from '../../auth/useAuth'
import {
  isDownloadUsable,
  toExpiringDownload,
  type ExpiringDownload,
} from '../download/downloadTypes'
import {
  isAbortError,
  startBrowserDownload,
} from '../download/downloadUtils'
import { getTtsDownload } from './ttsDownloadApi'

export type TtsDownloadState =
  | 'idle'
  | 'loading_url'
  | 'audio_ready'
  | 'playing'
  | 'paused'
  | 'error'

function safeDownloadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.code === 'JOB_NOT_READY') {
      return 'Job chưa sẵn sàng để phát hoặc tải audio.'
    }
    if (error.status === 404 && error.code === 'JOB_NOT_FOUND') {
      return 'Audio của job này không khả dụng.'
    }
    if (error.status === 502) {
      return 'Dịch vụ lưu trữ tạm thời chưa khả dụng. Vui lòng thử lại.'
    }
  }
  return 'Không thể chuẩn bị audio. Vui lòng thử lại.'
}

export function useTtsDownload(
  jobId: string,
  enabled: boolean,
  onJobNotReady: (jobId: string) => void,
) {
  const { status, authenticatedRequest } = useAuth()
  const [state, setState] = useState<TtsDownloadState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [download, setDownload] = useState<ExpiringDownload | null>(null)
  const downloadRef = useRef<ExpiringDownload | null>(null)
  const requestRef = useRef<Promise<ExpiringDownload | null> | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const expirationTimerRef = useRef<number | null>(null)
  const audioRetryRef = useRef(false)

  const clearExpirationTimer = useCallback(() => {
    if (expirationTimerRef.current !== null) {
      window.clearTimeout(expirationTimerRef.current)
      expirationTimerRef.current = null
    }
  }, [])

  const clearDownload = useCallback(() => {
    clearExpirationTimer()
    downloadRef.current = null
    setDownload(null)
  }, [clearExpirationTimer])

  const rememberDownload = useCallback(
    (next: ExpiringDownload) => {
      clearExpirationTimer()
      downloadRef.current = next
      setDownload(next)
      expirationTimerRef.current = window.setTimeout(() => {
        downloadRef.current = null
        setDownload(null)
        setState('idle')
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

      clearDownload()
      setState('loading_url')
      setErrorMessage('')
      const controller = new AbortController()
      controllerRef.current = controller
      const request = getTtsDownload(
        authenticatedRequest,
        jobId,
        controller.signal,
      )
        .then((response) => {
          if (controller.signal.aborted) {
            return null
          }
          const next = toExpiringDownload(response, 'TTS', jobId)
          if (
            !next ||
            !next.instructions.content_type.startsWith('audio/')
          ) {
            throw new Error('INVALID_DOWNLOAD_RESPONSE')
          }
          rememberDownload(next)
          setState('audio_ready')
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
          setErrorMessage(safeDownloadError(error))
          return null
        })
        .finally(() => {
          requestRef.current = null
          if (controllerRef.current === controller) {
            controllerRef.current = null
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

  useEffect(() => {
    if (!enabled || status !== 'authenticated') {
      controllerRef.current?.abort()
      requestRef.current = null
      audioRetryRef.current = false
      clearDownload()
      setState('idle')
      setErrorMessage('')
    }
  }, [clearDownload, enabled, status])

  useEffect(
    () => () => {
      controllerRef.current?.abort()
      clearExpirationTimer()
      downloadRef.current = null
    },
    [clearExpirationTimer],
  )

  const loadAudio = useCallback(() => {
    audioRetryRef.current = false
    void requestDownload()
  }, [requestDownload])

  const downloadAudio = useCallback(() => {
    void requestDownload().then((available) => {
      if (available) {
        startBrowserDownload(
          available.instructions.url,
          available.instructions.file_name,
        )
      }
    })
  }, [requestDownload])

  const reportAudioError = useCallback(() => {
    if (!audioRetryRef.current && enabled && status === 'authenticated') {
      audioRetryRef.current = true
      void requestDownload(true)
      return
    }
    clearDownload()
    setState('error')
    setErrorMessage(
      'Không thể tải audio từ URL tạm thời. Vui lòng yêu cầu lại.',
    )
  }, [clearDownload, enabled, requestDownload, status])

  return {
    state,
    errorMessage,
    audioUrl: download?.instructions.url ?? null,
    fileName: download?.instructions.file_name ?? null,
    loadAudio,
    downloadAudio,
    onPlay: () => setState('playing'),
    onPause: () => setState('paused'),
    onEnded: () => setState('audio_ready'),
    reportAudioError,
  }
}
