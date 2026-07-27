import type { PollIssue, TtsJob } from './ttsJobTypes'
import { useTtsDownload } from './useTtsDownload'

interface TtsJobCardProps {
  job: TtsJob
  pollIssue?: PollIssue
  onRetryPolling: (jobId: string) => void
  onRefreshJob: (jobId: string) => void
}

function formatTimestamp(timestamp?: number): string {
  if (timestamp === undefined) {
    return '—'
  }
  return new Date(timestamp * 1000).toLocaleString('vi-VN')
}

function statusLabel(status: TtsJob['status']): string {
  switch (status) {
    case 'QUEUED':
      return 'Đang chờ'
    case 'PROCESSING':
      return 'Đang xử lý'
    case 'COMPLETED':
      return 'Hoàn thành'
    case 'FAILED':
      return 'Thất bại'
  }
}

export function TtsJobCard({
  job,
  pollIssue,
  onRetryPolling,
  onRefreshJob,
}: TtsJobCardProps) {
  const {
    state: downloadState,
    errorMessage: downloadError,
    audioUrl,
    fileName,
    loadAudio,
    downloadAudio,
    onPlay,
    onPause,
    onEnded,
    reportAudioError,
  } = useTtsDownload(
    job.job_id,
    job.status === 'COMPLETED',
    onRefreshJob,
  )
  const isLoading = downloadState === 'loading_url'

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
          Voice: <strong>{job.voice ?? '—'}</strong>
        </span>
        <span>
          Engine: <strong>{job.engine ?? '—'}</strong>
        </span>
        <span>
          Format: <strong>{job.output_format ?? '—'}</strong>
        </span>
      </div>

      {job.status === 'QUEUED' && <p>Job đang chờ worker xử lý.</p>}
      {job.status === 'PROCESSING' && <p>Amazon Polly đang xử lý job.</p>}
      {job.status === 'COMPLETED' && (
        <div>
          <p>
            Hoàn thành lúc {formatTimestamp(job.completed_at ?? job.updated_at)}.
          </p>
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
              onClick={loadAudio}
            >
              {isLoading
                ? 'Đang lấy audio...'
                : audioUrl
                  ? 'Tải lại audio'
                  : 'Tải audio để phát'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={isLoading}
              onClick={downloadAudio}
            >
              Tải audio xuống
            </button>
          </div>
          {audioUrl && (
            <div className="job-audio-player">
              <audio
                src={audioUrl}
                controls
                preload="metadata"
                aria-label={`Audio của TTS job ${job.job_id}`}
                onPlay={onPlay}
                onPause={onPause}
                onEnded={onEnded}
                onError={reportAudioError}
              />
              {fileName && <span className="helper-text">{fileName}</span>}
            </div>
          )}
          <div aria-live="polite">
            {downloadState === 'audio_ready' && <p>Audio đã sẵn sàng.</p>}
            {downloadState === 'playing' && <p>Audio đang phát.</p>}
            {downloadState === 'paused' && <p>Audio đang tạm dừng.</p>}
            {downloadState === 'error' && (
              <p className="auth-error" role="alert">
                {downloadError}
              </p>
            )}
          </div>
        </div>
      )}
      {job.status === 'FAILED' && (
        <div className="auth-error">
          <p>Job không thể hoàn thành.</p>
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
            Đã dừng cập nhật tự động sau nhiều lần thất bại hoặc quá thời gian.
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
