import { useAuth } from '../../auth/useAuth'
import type { PreviewEngine } from './ttsPreviewTypes'
import { TtsJobList } from './TtsJobList'
import { useTtsJobs } from './useTtsJobs'

interface AsyncTtsSectionProps {
  text: string
  voice: string
  engine: PreviewEngine
}

export function AsyncTtsSection({
  text,
  voice,
  engine,
}: AsyncTtsSectionProps) {
  const { status, login } = useAuth()
  const isAuthenticated = status === 'authenticated'
  const {
    jobs,
    listState,
    createState,
    createError,
    createdJob,
    pollIssues,
    loadJobs,
    create,
    retryPolling,
  } = useTtsJobs(isAuthenticated)
  const trimmedTextLength = text.trim().length
  const canCreate =
    trimmedTextLength >= 1 &&
    trimmedTextLength <= 3_000 &&
    createState !== 'creating'

  if (status === 'loading') {
    return (
      <section className="glass-subpanel" aria-live="polite">
        <h3>Async TTS</h3>
        <p>Đang khôi phục phiên đăng nhập...</p>
      </section>
    )
  }

  if (status === 'anonymous') {
    return (
      <section className="glass-subpanel">
        <h3>Async TTS</h3>
        <p>Bạn cần đăng nhập để tạo và theo dõi Async TTS jobs.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void login()}
        >
          Đăng nhập với Cognito
        </button>
      </section>
    )
  }

  return (
    <section className="glass-subpanel">
      <div className="history-header">
        <div>
          <h3>Async TTS</h3>
          <p>
            Sử dụng cùng text, voice và engine ở trên; tối đa 3.000 ký tự,
            định dạng MP3.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canCreate}
          onClick={() =>
            void create({
              text,
              voice,
              engine,
              output_format: 'mp3',
            })
          }
        >
          {createState === 'creating'
            ? 'Đang tạo job...'
            : 'Tạo Async TTS job'}
        </button>
      </div>

      {trimmedTextLength > 3_000 && (
        <p className="auth-error" role="alert">
          Văn bản Async TTS không được vượt quá 3.000 ký tự.
        </p>
      )}
      {(createState === 'validation-error' || createState === 'error') && (
        <p className="auth-error" role="alert">
          {createError}
        </p>
      )}
      {createState === 'created' && createdJob && (
        <p aria-live="polite">
          Đã tạo job <code>{createdJob.job_id}</code> với trạng thái{' '}
          <strong>{createdJob.status}</strong>.
        </p>
      )}

      <TtsJobList
        jobs={jobs}
        listState={listState}
        pollIssues={pollIssues}
        onRefresh={loadJobs}
        onRetryPolling={retryPolling}
      />
    </section>
  )
}
