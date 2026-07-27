import type { SttJob } from './sttJobTypes'
import { isTerminalSttJob } from './sttJobTypes'

const STATUS_RANK = {
  AWAITING_UPLOAD: 0,
  PROCESSING: 1,
  COMPLETED: 2,
  FAILED: 2,
} as const

export function mergeSttJob(
  current: SttJob | undefined,
  incoming: SttJob,
  source: 'create' | 'list' | 'detail',
): SttJob {
  if (!current || source === 'detail') {
    return { ...current, ...incoming }
  }
  if (source === 'list' && isTerminalSttJob(current)) {
    return current
  }
  if (
    source === 'list' &&
    STATUS_RANK[incoming.status] < STATUS_RANK[current.status]
  ) {
    return current
  }
  if (
    source === 'list' &&
    (current.updated_at ?? 0) > (incoming.updated_at ?? 0)
  ) {
    return current
  }
  return { ...current, ...incoming }
}

export function mergeSttJobList(
  currentJobs: SttJob[],
  listedJobs: SttJob[],
): SttJob[] {
  const currentById = new Map(
    currentJobs.map((job) => [job.job_id, job] as const),
  )
  const listedIds = new Set(listedJobs.map((job) => job.job_id))
  const localOnly = currentJobs.filter((job) => !listedIds.has(job.job_id))
  return [
    ...listedJobs.map((job) =>
      mergeSttJob(currentById.get(job.job_id), job, 'list'),
    ),
    ...localOnly,
  ]
}

export function upsertSttJob(
  currentJobs: SttJob[],
  incoming: SttJob,
  source: 'create' | 'detail',
): SttJob[] {
  const index = currentJobs.findIndex(
    (job) => job.job_id === incoming.job_id,
  )
  if (index === -1) {
    return [incoming, ...currentJobs]
  }
  return currentJobs.map((job, jobIndex) =>
    jobIndex === index ? mergeSttJob(job, incoming, source) : job,
  )
}
