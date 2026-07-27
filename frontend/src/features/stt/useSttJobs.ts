import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/types'
import { useAuth } from '../../auth/useAuth'
import {
  createSttJob,
  getSttJob,
  listSttJobs,
  SttUploadError,
  uploadSttMedia,
} from './sttJobApi'
import { mergeSttJobList, upsertSttJob } from './sttJobMerge'
import {
  isTerminalSttJob,
  mediaFormatFromFileName,
  type SttJob,
  type SttLanguageCode,
  type SttListState,
  type SttPollIssue,
  type SttUploadState,
} from './sttJobTypes'

const POLL_INTERVAL_MS = 5_000
const MAX_POLL_DURATION_MS = 5 * 60_000
const MAX_POLL_FAILURES = 3

interface PollMetadata {
  startedAt: number
  failures: number
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function safeCreateError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    return error.message
  }
  return 'Không thể tạo STT job. Vui lòng thử lại.'
}

export function useSttJobs(enabled: boolean) {
  const { authenticatedRequest } = useAuth()
  const enabledRef = useRef(enabled)
  const jobsRef = useRef<SttJob[]>([])
  const lastCreatedJobIdRef = useRef<string | null>(null)
  const listControllerRef = useRef<AbortController | null>(null)
  const uploadControllerRef = useRef<AbortController | null>(null)
  const pollControllersRef = useRef(new Map<string, AbortController>())
  const refreshControllersRef = useRef(new Map<string, AbortController>())
  const pollMetadataRef = useRef(new Map<string, PollMetadata>())
  const inFlightPollsRef = useRef(new Set<string>())
  const stoppedPollingRef = useRef(new Set<string>())
  const submittingRef = useRef(false)

  const [jobs, setJobs] = useState<SttJob[]>([])
  const [listState, setListState] = useState<SttListState>('idle')
  const [uploadState, setUploadState] = useState<SttUploadState>('idle')
  const [workflowError, setWorkflowError] = useState('')
  const [pollIssues, setPollIssues] = useState<
    Record<string, SttPollIssue>
  >({})

  const updateJobs = useCallback(
    (updater: (current: SttJob[]) => SttJob[]) => {
      const next = updater(jobsRef.current)
      jobsRef.current = next
      setJobs(next)
    },
    [],
  )

  const setPollIssue = useCallback(
    (jobId: string, issue?: SttPollIssue) => {
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
    void listSttJobs(authenticatedRequest, controller.signal)
      .then((response) => {
        if (controller.signal.aborted || !enabledRef.current) {
          return
        }
        updateJobs((current) =>
          mergeSttJobList(
            current,
            response.jobs.filter((job) => job.type === 'STT'),
          ),
        )
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
      if (!currentJob || isTerminalSttJob(currentJob)) {
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
        const response = await getSttJob(
          authenticatedRequest,
          jobId,
          controller.signal,
        )
        if (controller.signal.aborted || !enabledRef.current) {
          return
        }
        metadata.failures = 0
        updateJobs((current) =>
          upsertSttJob(current, response.job, 'detail'),
        )
        setPollIssue(jobId)
        if (jobId === lastCreatedJobIdRef.current) {
          if (response.job.status === 'PROCESSING') {
            setUploadState('processing')
          } else if (response.job.status === 'COMPLETED') {
            setUploadState('completed')
          } else if (response.job.status === 'FAILED') {
            setUploadState('failed')
          }
        }
        if (isTerminalSttJob(response.job)) {
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
        if (metadata.failures >= MAX_POLL_FAILURES) {
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
      if (!isTerminalSttJob(job)) {
        void pollJob(job.job_id)
      }
    })
  }, [pollJob])

  useEffect(() => {
    enabledRef.current = enabled
    if (!enabled) {
      listControllerRef.current?.abort()
      uploadControllerRef.current?.abort()
      pollControllersRef.current.forEach((controller) => controller.abort())
      refreshControllersRef.current.forEach((controller) =>
        controller.abort(),
      )
      pollControllersRef.current.clear()
      refreshControllersRef.current.clear()
      pollMetadataRef.current.clear()
      inFlightPollsRef.current.clear()
      stoppedPollingRef.current.clear()
      jobsRef.current = []
      lastCreatedJobIdRef.current = null
      setJobs([])
      setListState('idle')
      setUploadState('idle')
      setWorkflowError('')
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
      uploadControllerRef.current?.abort()
      pollControllers.forEach((controller) => controller.abort())
      refreshControllers.forEach((controller) => controller.abort())
      pollControllers.clear()
      refreshControllers.clear()
      inFlightPolls.clear()
    }
  }, [enabled, loadJobs, pollAllActiveJobs])

  const createAndUpload = useCallback(
    async (
      file: File,
      languageCode: SttLanguageCode,
    ): Promise<SttJob | null> => {
      if (!enabledRef.current || submittingRef.current) {
        return null
      }
      setUploadState('validating')
      setWorkflowError('')
      const mediaFormat = mediaFormatFromFileName(file.name)
      if (!mediaFormat) {
        setUploadState('upload_failed')
        setWorkflowError(
          'File không có phần mở rộng hợp lệ hoặc định dạng chưa được hỗ trợ.',
        )
        return null
      }

      submittingRef.current = true
      uploadControllerRef.current?.abort()
      const controller = new AbortController()
      uploadControllerRef.current = controller
      setUploadState('creating_job')
      let uploadStarted = false

      try {
        const response = await createSttJob(
          authenticatedRequest,
          {
            media_format: mediaFormat,
            language_code: languageCode,
          },
          controller.signal,
        )
        if (controller.signal.aborted || !enabledRef.current) {
          return null
        }

        const jobId = response.job.job_id
        lastCreatedJobIdRef.current = jobId
        stoppedPollingRef.current.add(jobId)
        updateJobs((current) =>
          upsertSttJob(current, response.job, 'create'),
        )
        setUploadState('uploading')
        uploadStarted = true
        await uploadSttMedia(response.upload, file, controller.signal)
        if (controller.signal.aborted || !enabledRef.current) {
          return null
        }

        setUploadState('uploaded')
        stoppedPollingRef.current.delete(jobId)
        pollMetadataRef.current.set(jobId, {
          startedAt: Date.now(),
          failures: 0,
        })
        void pollJob(jobId)
        return response.job
      } catch (error: unknown) {
        if (
          controller.signal.aborted ||
          !enabledRef.current ||
          isAbortError(error)
        ) {
          return null
        }
        setUploadState('upload_failed')
        if (error instanceof SttUploadError) {
          setWorkflowError(
            error.status === 403
              ? 'Upload URL đã hết hạn hoặc bị từ chối. Hãy tạo một STT job mới để tải lại.'
              : 'Tải file lên S3 thất bại. Hãy tạo một STT job mới để thử lại.',
          )
        } else if (uploadStarted) {
          setWorkflowError(
            'Không thể tải file trực tiếp lên S3. Hãy tạo một STT job mới để thử lại.',
          )
        } else {
          setWorkflowError(safeCreateError(error))
        }
        return null
      } finally {
        submittingRef.current = false
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
      void getSttJob(authenticatedRequest, jobId, controller.signal)
        .then((response) => {
          if (controller.signal.aborted || !enabledRef.current) {
            return
          }
          updateJobs((current) =>
            upsertSttJob(current, response.job, 'detail'),
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

  const resetUploadFeedback = useCallback(() => {
    if (!submittingRef.current) {
      setUploadState('idle')
      setWorkflowError('')
      lastCreatedJobIdRef.current = null
    }
  }, [])

  return {
    jobs,
    listState,
    uploadState,
    workflowError,
    pollIssues,
    loadJobs,
    createAndUpload,
    retryPolling,
    refreshJob,
    resetUploadFeedback,
  }
}
