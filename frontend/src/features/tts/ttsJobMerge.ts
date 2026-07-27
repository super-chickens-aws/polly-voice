import type { TtsJob } from './ttsJobTypes'
import { isTerminalTtsJob } from './ttsJobTypes'

export function mergeTtsJob(
  current: TtsJob | undefined,
  incoming: TtsJob,
  source: 'create' | 'list' | 'detail',
): TtsJob {
  if (!current || source === 'detail') {
    return { ...current, ...incoming }
  }

  if (source === 'list' && isTerminalTtsJob(current)) {
    return current
  }

  const currentUpdatedAt = current.updated_at ?? 0
  const incomingUpdatedAt = incoming.updated_at ?? 0
  const statusRank = {
    QUEUED: 0,
    PROCESSING: 1,
    COMPLETED: 2,
    FAILED: 2,
  } as const
  if (
    source === 'list' &&
    statusRank[incoming.status] < statusRank[current.status]
  ) {
    return current
  }
  if (source === 'list' && currentUpdatedAt > incomingUpdatedAt) {
    return current
  }

  return { ...current, ...incoming }
}

export function mergeTtsJobList(
  currentJobs: TtsJob[],
  listedJobs: TtsJob[],
): TtsJob[] {
  const currentById = new Map(
    currentJobs.map((job) => [job.job_id, job] as const),
  )
  const listedIds = new Set(listedJobs.map((job) => job.job_id))
  const localOnlyJobs = currentJobs.filter((job) => !listedIds.has(job.job_id))

  return [
    ...listedJobs.map((job) =>
      mergeTtsJob(currentById.get(job.job_id), job, 'list'),
    ),
    ...localOnlyJobs,
  ]
}

export function upsertTtsJob(
  currentJobs: TtsJob[],
  incoming: TtsJob,
  source: 'create' | 'detail',
): TtsJob[] {
  const index = currentJobs.findIndex(
    (job) => job.job_id === incoming.job_id,
  )
  if (index === -1) {
    return [incoming, ...currentJobs]
  }
  return currentJobs.map((job, jobIndex) =>
    jobIndex === index ? mergeTtsJob(job, incoming, source) : job,
  )
}
