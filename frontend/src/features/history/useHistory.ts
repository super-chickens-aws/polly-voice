import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { isAbortError } from '../download/downloadUtils'
import { listSttJobs } from '../stt/sttJobApi'
import {
  STT_JOB_STATUSES,
  type SttJob,
} from '../stt/sttJobTypes'
import { listTtsJobs } from '../tts/ttsJobApi'
import {
  TTS_JOB_STATUSES,
  type TtsJob,
} from '../tts/ttsJobTypes'
import { combineHistoryJobs } from './historyMerge'
import type {
  HistoryFailures,
  HistoryJob,
  HistoryLoadState,
} from './historyTypes'

const NO_FAILURES: HistoryFailures = { tts: false, stt: false }

function isTtsHistoryJob(job: TtsJob): boolean {
  return (
    job !== null &&
    typeof job === 'object' &&
    job.type === 'TTS' &&
    typeof job.job_id === 'string' &&
    job.job_id.length > 0 &&
    TTS_JOB_STATUSES.includes(job.status)
  )
}

function isSttHistoryJob(job: SttJob): boolean {
  return (
    job !== null &&
    typeof job === 'object' &&
    job.type === 'STT' &&
    typeof job.job_id === 'string' &&
    job.job_id.length > 0 &&
    STT_JOB_STATUSES.includes(job.status)
  )
}

export function useHistory(enabled: boolean) {
  const { authenticatedRequest } = useAuth()
  const controllerRef = useRef<AbortController | null>(null)
  const [jobs, setJobs] = useState<HistoryJob[]>([])
  const [loadState, setLoadState] =
    useState<HistoryLoadState>('idle')
  const [failures, setFailures] =
    useState<HistoryFailures>(NO_FAILURES)

  const loadHistory = useCallback(
    (refreshing = false) => {
      if (!enabled) {
        return
      }

      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      setLoadState(refreshing ? 'refreshing' : 'loading')
      setFailures(NO_FAILURES)

      const ttsRequest = listTtsJobs(
        authenticatedRequest,
        controller.signal,
      ).then((response): TtsJob[] => {
        if (!Array.isArray(response.jobs)) {
          throw new Error('INVALID_TTS_HISTORY_RESPONSE')
        }
        return response.jobs.filter(isTtsHistoryJob)
      })
      const sttRequest = listSttJobs(
        authenticatedRequest,
        controller.signal,
      ).then((response): SttJob[] => {
        if (!Array.isArray(response.jobs)) {
          throw new Error('INVALID_STT_HISTORY_RESPONSE')
        }
        return response.jobs.filter(isSttHistoryJob)
      })

      void Promise.allSettled([ttsRequest, sttRequest]).then(
        ([ttsResult, sttResult]) => {
          if (
            controller.signal.aborted ||
            controllerRef.current !== controller
          ) {
            return
          }
          if (
            (ttsResult.status === 'rejected' &&
              isAbortError(ttsResult.reason)) ||
            (sttResult.status === 'rejected' &&
              isAbortError(sttResult.reason))
          ) {
            return
          }

          const ttsFailed = ttsResult.status === 'rejected'
          const sttFailed = sttResult.status === 'rejected'
          const ttsJobs =
            ttsResult.status === 'fulfilled' ? ttsResult.value : []
          const sttJobs =
            sttResult.status === 'fulfilled' ? sttResult.value : []

          setFailures({ tts: ttsFailed, stt: sttFailed })
          setJobs(combineHistoryJobs(ttsJobs, sttJobs))
          if (ttsFailed && sttFailed) {
            setLoadState('error')
          } else if (ttsFailed || sttFailed) {
            setLoadState('partial')
          } else {
            setLoadState('loaded')
          }
        },
      )
    },
    [authenticatedRequest, enabled],
  )

  useEffect(() => {
    if (!enabled) {
      controllerRef.current?.abort()
      controllerRef.current = null
      setJobs([])
      setLoadState('idle')
      setFailures(NO_FAILURES)
      return
    }

    loadHistory()
    return () => {
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [enabled, loadHistory])

  const refresh = useCallback(() => {
    loadHistory(true)
  }, [loadHistory])

  return { jobs, loadState, failures, refresh }
}
