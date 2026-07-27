import type { SttJob, SttPollIssue } from './sttJobTypes'
import { useSttTranscript } from './useSttTranscript'

interface SttJobCardProps {
  job: SttJob
  pollIssue?: SttPollIssue
  onRetryPolling: (jobId: string) => void
  onRefreshJob: (jobId: string) => void
}

function formatTimestamp(timestamp?: number): string {
  return timestamp === undefined
    ? '—'
    : new Date(timestamp * 1000).toLocaleString('vi-VN')
}

function statusLabel(status: SttJob['status']): string {
  switch (status) {
    case 'AWAITING_UPLOAD':
      return 'Chờ upload/xử lý'
    case 'PROCESSING':
      return 'Đang nhận dạng'
    case 'COMPLETED':
      return 'Hoàn thành'
    case 'FAILED':
      return 'Thất bại'
  }
}

export function SttJobCard({
  job,
  pollIssue,
  onRetryPolling,
  onRefreshJob,
}: SttJobCardProps) {
  const {
    state: transcriptState,
    errorMessage: transcriptError,
    transcript,
    isLoading,
    loadTranscript,
    downloadTranscript,
  } = useSttTranscript(
    job.job_id,
    job.status === 'COMPLETED',
    onRefreshJob,
  )

  return (
    <article className="history-card glass-subpanel">
      <div className="card-top">
        <span className="badge badge-tag">{statusLabel(job.status)}</span>
        <span className="timestamp">
          {formatTimestamp(job.updated_at ?? job.created_at)}
        </span>
      </div>
      <div>
        <strong>Job ID:</strong> <code>{job.job_id}</code>
      </div>
      <div className="profile-row">
        <span>
          Format: <strong>{job.media_format ?? '—'}</strong>
        </span>
        <span>
          Language: <strong>{job.language_code ?? '—'}</strong>
        </span>
      </div>

      {job.status === 'AWAITING_UPLOAD' && (
        <p>Đang chờ upload hoàn tất hoặc backend bắt đầu xử lý.</p>
      )}
      {job.status === 'PROCESSING' && (
        <p>Amazon Transcribe đang nhận dạng nội dung audio.</p>
      )}
      {job.status === 'COMPLETED' && (
        <div>
          <p>
            Hoàn thành lúc {formatTimestamp(job.completed_at ?? job.updated_at)}.
          </p>
          {job.transcript_key && (
            <p>
              Transcript metadata: <code>{job.transcript_key}</code>
            </p>
          )}
          {job.output_key && (
            <p>
              Output metadata: <code>{job.output_key}</code>
            </p>
          )}
          <div className="job-download-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={isLoading}
              onClick={loadTranscript}
            >
              {transcriptState === 'loading_url'
                ? 'Đang lấy URL...'
                : transcriptState === 'loading_transcript'
                  ? 'Đang tải transcript...'
                  : transcript === null
                    ? 'Xem transcript'
                    : 'Làm mới transcript'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={isLoading}
              onClick={downloadTranscript}
            >
              Tải transcript JSON
            </button>
          </div>
          <div aria-live="polite">
            {isLoading && <p>Đang chuẩn bị transcript...</p>}
            {transcriptState === 'error' && (
              <p className="auth-error" role="alert">
                {transcriptError}
              </p>
            )}
          </div>
          {transcript !== null && (
            <div className="stt-transcript-result">
              <strong>Nội dung transcript</strong>
              <p>{transcript}</p>
            </div>
          )}
        </div>
      )}
      {job.status === 'FAILED' && (
        <div className="auth-error">
          <p>STT job không thể hoàn thành.</p>
          {job.error_code && <p>Mã lỗi: {job.error_code}</p>}
          {job.error_message && <p>{job.error_message}</p>}
        </div>
      )}

      {pollIssue === 'retrying' && (
        <p aria-live="polite">
          Tạm thời chưa cập nhật được trạng thái; hệ thống sẽ thử lại.
        </p>
      )}
      {pollIssue === 'unavailable' && (
        <p className="auth-error" role="alert">
          Job này không còn khả dụng.
        </p>
      )}
      {pollIssue === 'stopped' && (
        <div>
          <p className="auth-error" role="alert">
            Đã dừng cập nhật tự động sau nhiều lỗi hoặc quá thời gian.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onRetryPolling(job.job_id)}
          >
            Thử cập nhật lại
          </button>
        </div>
      )}
    </article>
  )
}
