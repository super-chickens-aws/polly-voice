import type { SttJob } from '../stt/sttJobTypes'
import type { TtsJob } from '../tts/ttsJobTypes'
import type {
  HistoryJob,
  HistoryStatusFilter,
  HistoryTypeFilter,
} from './historyTypes'

function sortableCreatedAt(job: HistoryJob): number {
  return typeof job.created_at === 'number' &&
    Number.isFinite(job.created_at) &&
    job.created_at >= 0
    ? job.created_at
    : Number.NEGATIVE_INFINITY
}

export function combineHistoryJobs(
  ttsJobs: readonly TtsJob[],
  sttJobs: readonly SttJob[],
): HistoryJob[] {
  const unique = new Map<string, HistoryJob>()
  for (const job of [...ttsJobs, ...sttJobs]) {
    const key = `${job.type}:${job.job_id}`
    if (!unique.has(key)) {
      unique.set(key, job)
    }
  }

  return [...unique.values()].sort((left, right) => {
    const leftTimestamp = sortableCreatedAt(left)
    const rightTimestamp = sortableCreatedAt(right)
    if (leftTimestamp !== rightTimestamp) {
      if (leftTimestamp === Number.NEGATIVE_INFINITY) {
        return 1
      }
      if (rightTimestamp === Number.NEGATIVE_INFINITY) {
        return -1
      }
      return rightTimestamp - leftTimestamp
    }
    return `${left.type}:${left.job_id}`.localeCompare(
      `${right.type}:${right.job_id}`,
    )
  })
}

function matchesStatus(
  job: HistoryJob,
  filter: HistoryStatusFilter,
): boolean {
  switch (filter) {
    case 'ALL':
      return true
    case 'WAITING':
      return (
        (job.type === 'TTS' && job.status === 'QUEUED') ||
        (job.type === 'STT' && job.status === 'AWAITING_UPLOAD')
      )
    case 'PROCESSING':
      return job.status === 'PROCESSING'
    case 'COMPLETED':
      return job.status === 'COMPLETED'
    case 'FAILED':
      return job.status === 'FAILED'
  }
}

function searchableValues(job: HistoryJob): string[] {
  const common = [job.job_id, job.type, job.status]
  if (job.type === 'TTS') {
    return [
      ...common,
      job.voice,
      job.engine,
      job.output_format,
    ].filter((value): value is string => typeof value === 'string')
  }
  return [
    ...common,
    job.media_format,
    job.language_code,
  ].filter((value): value is string => typeof value === 'string')
}

export function filterHistoryJobs(
  jobs: readonly HistoryJob[],
  typeFilter: HistoryTypeFilter,
  statusFilter: HistoryStatusFilter,
  searchQuery: string,
): HistoryJob[] {
  const query = searchQuery.trim().toLocaleLowerCase()
  return jobs.filter(
    (job) =>
      (typeFilter === 'ALL' || job.type === typeFilter) &&
      matchesStatus(job, statusFilter) &&
      (!query ||
        searchableValues(job).some((value) =>
          value.toLocaleLowerCase().includes(query),
        )),
  )
}
