import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/types'
import { requestTtsPreview } from './ttsPreviewApi'
import {
  PREVIEW_ENGINES,
  PREVIEW_OUTPUT_FORMATS,
  type PreviewEngine,
  type PreviewOutputFormat,
  type TtsPreviewRequest,
  type TtsPreviewResponse,
  type TtsPreviewState,
} from './ttsPreviewTypes'

const MAX_PREVIEW_TEXT_LENGTH = 500

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function buildPreviewRequest(
  request: TtsPreviewRequest,
): TtsPreviewRequest | string {
  const text = request.text.trim()
  if (!text) {
    return 'Vui lòng nhập văn bản cần chuyển đổi.'
  }
  if (text.length > MAX_PREVIEW_TEXT_LENGTH) {
    return 'Văn bản Preview không được vượt quá 500 ký tự.'
  }

  const voice = request.voice.trim()
  if (!voice) {
    return 'Vui lòng chọn giọng đọc.'
  }
  if (!PREVIEW_ENGINES.includes(request.engine)) {
    return 'Preview chỉ hỗ trợ Neural hoặc Standard engine.'
  }
  if (!PREVIEW_OUTPUT_FORMATS.includes(request.output_format)) {
    return 'Định dạng âm thanh Preview không được hỗ trợ.'
  }

  return { ...request, text, voice }
}

function classifyApiError(error: ApiError): {
  state: TtsPreviewState
  message: string
} {
  if (error.status === 400) {
    return {
      state: 'validation-error',
      message: error.message,
    }
  }
  return {
    state: 'service-error',
    message:
      'Dịch vụ tạo Preview hiện không khả dụng. Vui lòng thử lại sau.',
  }
}

export function useTtsPreview() {
  const controllerRef = useRef<AbortController | null>(null)
  const requestSequenceRef = useRef(0)
  const [state, setState] = useState<TtsPreviewState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    return () => controllerRef.current?.abort()
  }, [])

  const generate = useCallback(
    async (
      input: TtsPreviewRequest,
    ): Promise<TtsPreviewResponse | null> => {
      setState('validating')
      setErrorMessage('')
      const request = buildPreviewRequest(input)
      if (typeof request === 'string') {
        setState('validation-error')
        setErrorMessage(request)
        return null
      }

      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      const sequence = ++requestSequenceRef.current
      setState('generating')

      try {
        const response = await requestTtsPreview(request, controller.signal)
        if (
          controller.signal.aborted ||
          sequence !== requestSequenceRef.current
        ) {
          return null
        }
        setState('success')
        return response
      } catch (error: unknown) {
        if (
          controller.signal.aborted ||
          sequence !== requestSequenceRef.current ||
          isAbortError(error)
        ) {
          return null
        }
        if (error instanceof ApiError) {
          const result = classifyApiError(error)
          setState(result.state)
          setErrorMessage(result.message)
          return null
        }
        setState('network-error')
        setErrorMessage(
          'Không thể kết nối tới dịch vụ Preview. Vui lòng thử lại.',
        )
        return null
      }
    },
    [],
  )

  const reportAudioError = useCallback(() => {
    setState('audio-error')
    setErrorMessage(
      'Không thể tải audio Preview. Liên kết có thể đã hết hạn; hãy tạo lại.',
    )
  }, [])

  const clearError = useCallback(() => {
    setState((current) =>
      current === 'generating' ? current : 'idle',
    )
    setErrorMessage('')
  }, [])

  return {
    state,
    errorMessage,
    isGenerating: state === 'generating',
    generate,
    reportAudioError,
    clearError,
  }
}

export type { PreviewEngine, PreviewOutputFormat }
