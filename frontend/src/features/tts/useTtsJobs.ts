import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/types'
import { useAuth } from '../../auth/useAuth'
import { createTtsJob, getTtsJob, listTtsJobs } from './ttsJobApi'
import { mergeTtsJobList, upsertTtsJob } from './ttsJobMerge'
import {
  isTerminalTtsJob,
  type CreateTtsJobRequest,
  type PollIssue,
  type TtsJob,
  type TtsJobCreateState,
  type TtsJobListState,
} from './ttsJobTypes'

const POLL_INTERVAL_MS = 5_000
const MAX_POLL_DURATION_MS = 5 * 60_000
const MAX_CONSECUTIVE_POLL_FAILURES = 3
const MAX_ASYNC_TEXT_LENGTH = 3_000

interface PollMetadata {
  startedAt: number
  failures: number
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function validateCreateRequest(
  input: CreateTtsJobRequest,
): CreateTtsJobRequest | string {
  const text = input.text.trim()
  if (!text) {
    return 'Vui lòng nhập văn bản cần chuyển đổi.'
  }
  if (text.length > MAX_ASYNC_TEXT_LENGTH) {
    return 'Văn bản Async TTS không được vượt quá 3.000 ký tự.'
  }
  const voice = input.voice.trim()
  if (!voice) {
    return 'Vui lòng chọn giọng đọc.'
  }
  return { ...input, text, voice }
}

function safeCreateError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    return error.message
  }
  return 'Không thể tạo Async TTS job. Vui lòng thử lại.'
}

export function useTtsJobs(enabled: boolean) {
  const { authenticatedRequest } = useAuth()
  const enabledRef = useRef(enabled)
  const jobsRef = useRef<TtsJob[]>([])
  const listControllerRef = useRef<AbortController | null>(null)
  const createControllerRef = useRef<AbortController | null>(null)
  const pollControllersRef = useRef(new Map<string, AbortController>())
  const refreshControllersRef = useRef(new Map<string, AbortController>())
  const pollMetadataRef = useRef(new Map<string, PollMetadata>())
  const inFlightPollsRef = useRef(new Set<string>())
  const stoppedPollingRef = useRef(new Set<string>())
  const creatingRef = useRef(false)

  const [jobs, setJobs] = useState<TtsJob[]>([])
  const [listState, setListState] = useState<TtsJobListState>('idle')
  const [createState, setCreateState] =
    useState<TtsJobCreateState>('idle')
  const [createError, setCreateError] = useState('')
  const [createdJob, setCreatedJob] = useState<TtsJob | null>(null)
  const [pollIssues, setPollIssues] = useState<Record<string, PollIssue>>({})

  const updateJobs = useCallback(
    (updater: (current: TtsJob[]) => TtsJob[]) => {
      const next = updater(jobsRef.current)
      jobsRef.current = next
      setJobs(next)
    },
    [],
  )

  const setPollIssue = useCallback(
    (jobId: string, issue?: PollIssue) => {
      setPollIssues((current) => {
        if (!issue && !(jobId in current)) {
          return current
        }
        const next = { ...current }
        if (issue) {
          next[jobId] = issue
        } else {
          delete next[jobId]
        }
        return next
      })
    },
    [],
  )

  const loadJobs = useCallback(() => {
    if (!enabledRef.current) {
      return
    }
    listControllerRef.current?.abort()
    const controller = new AbortController()
    listControllerRef.current = controller
    setListState('loading')

    void listTtsJobs(authenticatedRequest, controller.signal)
      .then((response) => {
        if (controller.signal.aborted || !enabledRef.current) {
          return
        }
        const ttsJobs = response.jobs.filter((job) => job.type === 'TTS')
        updateJobs((current) => mergeTtsJobList(current, ttsJobs))
        setListState('loaded')
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          !enabledRef.current ||
          isAbortError(error)
        ) {
          return
        }
        setListState('error')
      })
  }, [authenticatedRequest, updateJobs])

  const pollJob = useCallback(
    async (jobId: string): Promise<void> => {
      if (
        !enabledRef.current ||
        stoppedPollingRef.current.has(jobId) ||
        inFlightPollsRef.current.has(jobId)
      ) {
        return
      }

      const currentJob = jobsRef.current.find((job) => job.job_id === jobId)
      if (!currentJob || isTerminalTtsJob(currentJob)) {
        pollMetadataRef.current.delete(jobId)
        setPollIssue(jobId)
        return
      }

      const metadata = pollMetadataRef.current.get(jobId) ?? {
        startedAt: Date.now(),
        failures: 0,
      }
      pollMetadataRef.current.set(jobId, metadata)
      if (Date.now() - metadata.startedAt >= MAX_POLL_DURATION_MS) {
        stoppedPollingRef.current.add(jobId)
        setPollIssue(jobId, 'stopped')
        return
      }

      const controller = new AbortController()
      pollControllersRef.current.set(jobId, controller)
      inFlightPollsRef.current.add(jobId)
      try {
        const response = await getTtsJob(
          authenticatedRequest,
          jobId,
          controller.signal,
        )
        if (controller.signal.aborted || !enabledRef.current) {
          return
        }
        metadata.failures = 0
        updateJobs((current) =>
          upsertTtsJob(current, response.job, 'detail'),
        )
        setPollIssue(jobId)
        if (isTerminalTtsJob(response.job)) {
          stoppedPollingRef.current.add(jobId)
          pollMetadataRef.current.delete(jobId)
        }
      } catch (error: unknown) {
        if (
          controller.signal.aborted ||
          !enabledRef.current ||
          isAbortError(error)
        ) {
          return
        }
        if (
          error instanceof ApiError &&
          error.status === 404 &&
          error.code === 'JOB_NOT_FOUND'
        ) {
          stoppedPollingRef.current.add(jobId)
          pollMetadataRef.current.delete(jobId)
          setPollIssue(jobId, 'unavailable')
          return
        }

        metadata.failures += 1
        if (metadata.failures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          stoppedPollingRef.current.add(jobId)
          setPollIssue(jobId, 'stopped')
        } else {
          setPollIssue(jobId, 'retrying')
        }
      } finally {
        inFlightPollsRef.current.delete(jobId)
        pollControllersRef.current.delete(jobId)
      }
    },
    [authenticatedRequest, setPollIssue, updateJobs],
  )

  const pollAllActiveJobs = useCallback(() => {
    jobsRef.current.forEach((job) => {
      if (!isTerminalTtsJob(job)) {
        void pollJob(job.job_id)
      }
    })
  }, [pollJob])

  useEffect(() => {
    enabledRef.current = enabled
    if (!enabled) {
      listControllerRef.current?.abort()
      createControllerRef.current?.abort()
      pollControllersRef.current.forEach((controller) => controller.abort())
      refreshControllersRef.current.forEach((controller) =>
        controller.abort(),
      )
      pollControllersRef.current.clear()
      refreshControllersRef.current.clear()
      inFlightPollsRef.current.clear()
      pollMetadataRef.current.clear()
      stoppedPollingRef.current.clear()
      jobsRef.current = []
      setJobs([])
      setListState('idle')
      setCreateState('idle')
      setCreateError('')
      setCreatedJob(null)
      setPollIssues({})
      return
    }

    loadJobs()
    const pollControllers = pollControllersRef.current
    const refreshControllers = refreshControllersRef.current
    const inFlightPolls = inFlightPollsRef.current
    const interval = window.setInterval(
      pollAllActiveJobs,
      POLL_INTERVAL_MS,
    )
    return () => {
      window.clearInterval(interval)
      listControllerRef.current?.abort()
      createControllerRef.current?.abort()
      pollControllers.forEach((controller) => controller.abort())
      refreshControllers.forEach((controller) => controller.abort())
      pollControllers.clear()
      refreshControllers.clear()
      inFlightPolls.clear()
    }
  }, [enabled, loadJobs, pollAllActiveJobs])

  const create = useCallback(
    async (input: CreateTtsJobRequest): Promise<TtsJob | null> => {
      if (!enabledRef.current || creatingRef.current) {
        return null
      }
      const request = validateCreateRequest(input)
      if (typeof request === 'string') {
        setCreateState('validation-error')
        setCreateError(request)
        return null
      }

      creatingRef.current = true
      createControllerRef.current?.abort()
      const controller = new AbortController()
      createControllerRef.current = controller
      setCreateState('creating')
      setCreateError('')

      try {
        const response = await createTtsJob(
          authenticatedRequest,
          request,
          controller.signal,
        )
        if (controller.signal.aborted || !enabledRef.current) {
          return null
        }
        stoppedPollingRef.current.delete(response.job.job_id)
        pollMetadataRef.current.set(response.job.job_id, {
          startedAt: Date.now(),
          failures: 0,
        })
        updateJobs((current) =>
          upsertTtsJob(current, response.job, 'create'),
        )
        setCreatedJob(response.job)
        setCreateState('created')
        void pollJob(response.job.job_id)
        return response.job
      } catch (error: unknown) {
        if (
          controller.signal.aborted ||
          !enabledRef.current ||
          isAbortError(error)
        ) {
          return null
        }
        setCreateState(
          error instanceof ApiError && error.status === 400
            ? 'validation-error'
            : 'error',
        )
        setCreateError(safeCreateError(error))
        return null
      } finally {
        creatingRef.current = false
      }
    },
    [authenticatedRequest, pollJob, updateJobs],
  )

  const retryPolling = useCallback(
    (jobId: string) => {
      stoppedPollingRef.current.delete(jobId)
      pollMetadataRef.current.set(jobId, {
        startedAt: Date.now(),
        failures: 0,
      })
      setPollIssue(jobId)
      void pollJob(jobId)
    },
    [pollJob, setPollIssue],
  )

  const refreshJob = useCallback(
    (jobId: string) => {
      if (!enabledRef.current) {
        return
      }
      refreshControllersRef.current.get(jobId)?.abort()
      const controller = new AbortController()
      refreshControllersRef.current.set(jobId, controller)
      void getTtsJob(authenticatedRequest, jobId, controller.signal)
        .then((response) => {
          if (controller.signal.aborted || !enabledRef.current) {
            return
          }
          updateJobs((current) =>
            upsertTtsJob(current, response.job, 'detail'),
          )
          setPollIssue(jobId)
        })
        .catch((error: unknown) => {
          if (
            controller.signal.aborted ||
            !enabledRef.current ||
            isAbortError(error)
          ) {
            return
          }
          if (
            error instanceof ApiError &&
            error.status === 404 &&
            error.code === 'JOB_NOT_FOUND'
          ) {
            setPollIssue(jobId, 'unavailable')
          }
        })
        .finally(() => {
          if (refreshControllersRef.current.get(jobId) === controller) {
            refreshControllersRef.current.delete(jobId)
          }
        })
    },
    [authenticatedRequest, setPollIssue, updateJobs],
  )

  const clearCreateFeedback = useCallback(() => {
    setCreateState((current) =>
      current === 'creating' ? current : 'idle',
    )
    setCreateError('')
  }, [])

  return {
    jobs,
    listState,
    createState,
    createError,
    createdJob,
    pollIssues,
    loadJobs,
    create,
    retryPolling,
    refreshJob,
    clearCreateFeedback,
  }
}
