import { SttJobCard } from './SttJobCard'
import type {
  SttJob,
  SttListState,
  SttPollIssue,
} from './sttJobTypes'

interface SttJobListProps {
  jobs: SttJob[]
  listState: SttListState
  pollIssues: Record<string, SttPollIssue>
  onRefresh: () => void
  onRetryPolling: (jobId: string) => void
}

export function SttJobList({
  jobs,
  listState,
  pollIssues,
  onRefresh,
  onRetryPolling,
}: SttJobListProps) {
  if (
    (listState === 'idle' || listState === 'loading') &&
    jobs.length === 0
  ) {
    return <p aria-live="polite">Đang tải STT jobs...</p>
  }
  if (listState === 'error' && jobs.length === 0) {
    return (
      <div>
        <p className="auth-error" role="alert">
          Không thể tải danh sách STT jobs.
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
        <h3>STT jobs ({jobs.length})</h3>
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
        <p className="empty-text">Chưa có STT job nào.</p>
      ) : (
        <div className="history-list">
          {jobs.map((job) => (
            <SttJobCard
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
