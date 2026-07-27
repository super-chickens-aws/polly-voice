import { TtsJobCard } from './TtsJobCard'
import type {
  PollIssue,
  TtsJob,
  TtsJobListState,
} from './ttsJobTypes'

interface TtsJobListProps {
  jobs: TtsJob[]
  listState: TtsJobListState
  pollIssues: Record<string, PollIssue>
  onRefresh: () => void
  onRetryPolling: (jobId: string) => void
}

export function TtsJobList({
  jobs,
  listState,
  pollIssues,
  onRefresh,
  onRetryPolling,
}: TtsJobListProps) {
  if (
    (listState === 'idle' || listState === 'loading') &&
    jobs.length === 0
  ) {
    return <p aria-live="polite">Đang tải Async TTS jobs...</p>
  }

  if (listState === 'error' && jobs.length === 0) {
    return (
      <div>
        <p className="auth-error" role="alert">
          Không thể tải danh sách Async TTS jobs.
        </p>
        <button type="button" className="btn btn-secondary" onClick={onRefresh}>
          Thử lại
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="history-header">
        <h3>Async TTS jobs ({jobs.length})</h3>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={listState === 'loading'}
          onClick={onRefresh}
        >
          {listState === 'loading' ? 'Đang làm mới...' : 'Làm mới'}
        </button>
      </div>
      {listState === 'error' && (
        <p className="auth-error" role="alert">
          Không thể làm mới danh sách; dữ liệu gần nhất vẫn được giữ lại.
        </p>
      )}
      {jobs.length === 0 ? (
        <p className="empty-text">Chưa có Async TTS job nào.</p>
      ) : (
        <div className="history-list">
          {jobs.map((job) => (
            <TtsJobCard
              key={job.job_id}
              job={job}
              pollIssue={pollIssues[job.job_id]}
              onRetryPolling={onRetryPolling}
            />
          ))}
        </div>
      )}
    </div>
  )
}
