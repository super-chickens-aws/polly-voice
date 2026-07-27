import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { filterHistoryJobs } from './historyMerge'
import { HistoryJobCard } from './HistoryJobCard'
import type {
  HistoryStatusFilter,
  HistoryTypeFilter,
} from './historyTypes'
import { useHistory } from './useHistory'

export function HistoryPanel() {
  const { status, login } = useAuth()
  const isAuthenticated = status === 'authenticated'
  const { jobs, loadState, failures, refresh } =
    useHistory(isAuthenticated)
  const [typeFilter, setTypeFilter] =
    useState<HistoryTypeFilter>('ALL')
  const [statusFilter, setStatusFilter] =
    useState<HistoryStatusFilter>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const filteredJobs = useMemo(
    () =>
      filterHistoryJobs(
        jobs,
        typeFilter,
        statusFilter,
        searchQuery,
      ),
    [jobs, searchQuery, statusFilter, typeFilter],
  )
  const isBusy = loadState === 'loading' || loadState === 'refreshing'

  if (status === 'loading') {
    return (
      <section className="history-container glass-panel" aria-live="polite">
        <h2>Lịch Sử Chuyển Đổi</h2>
        <p>Đang khôi phục phiên đăng nhập...</p>
      </section>
    )
  }

  if (status === 'anonymous') {
    return (
      <section className="history-container glass-panel">
        <h2>Lịch Sử Chuyển Đổi</h2>
        <p>
          Bạn cần đăng nhập để xem lịch sử TTS và STT được lưu cho tài khoản.
        </p>
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
    <section className="history-container glass-panel">
      <div className="history-header">
        <div>
          <h2>Lịch Sử Chuyển Đổi</h2>
          <p>{jobs.length} job TTS/STT từ Amazon DynamoDB</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={isBusy}
          onClick={refresh}
        >
          {loadState === 'refreshing' ? 'Đang làm mới...' : 'Làm mới'}
        </button>
      </div>

      <div className="history-filter-grid">
        <div className="form-group">
          <label htmlFor="history-type-filter">Loại job</label>
          <select
            id="history-type-filter"
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(event.target.value as HistoryTypeFilter)
            }
          >
            <option value="ALL">Tất cả</option>
            <option value="TTS">TTS</option>
            <option value="STT">STT</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="history-status-filter">Trạng thái</label>
          <select
            id="history-status-filter"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as HistoryStatusFilter)
            }
          >
            <option value="ALL">Tất cả</option>
            <option value="WAITING">Đang chờ</option>
            <option value="PROCESSING">Đang xử lý</option>
            <option value="COMPLETED">Hoàn thành</option>
            <option value="FAILED">Thất bại</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="history-search">Tìm kiếm metadata</label>
          <input
            id="history-search"
            type="text"
            placeholder="Job ID, type, status, voice, format..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>

      <div aria-live="polite">
        {loadState === 'loading' && (
          <p>Đang tải đồng thời lịch sử TTS và STT...</p>
        )}
        {loadState === 'refreshing' && (
          <p>Đang làm mới lịch sử; dữ liệu gần nhất vẫn được hiển thị.</p>
        )}
        {failures.tts && !failures.stt && (
          <p className="auth-error" role="alert">
            Không thể tải lịch sử TTS; lịch sử STT vẫn khả dụng.
          </p>
        )}
        {failures.stt && !failures.tts && (
          <p className="auth-error" role="alert">
            Không thể tải lịch sử STT; lịch sử TTS vẫn khả dụng.
          </p>
        )}
      </div>

      {loadState === 'error' ? (
        <div>
          <p className="auth-error" role="alert">
            Không thể tải lịch sử TTS và STT. Vui lòng thử lại.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={refresh}
          >
            Thử lại
          </button>
        </div>
      ) : loadState !== 'loading' && jobs.length === 0 ? (
        <p className="empty-text">Chưa có TTS hoặc STT job nào.</p>
      ) : jobs.length > 0 && filteredJobs.length === 0 ? (
        <p className="empty-text">
          Không có job nào phù hợp với bộ lọc và nội dung tìm kiếm.
        </p>
      ) : (
        <div className="history-list">
          {filteredJobs.map((job) => (
            <HistoryJobCard
              key={`${job.type}:${job.job_id}`}
              job={job}
              onRefreshHistory={refresh}
            />
          ))}
        </div>
      )}

      <p className="history-delete-limitation">
        Delete sẽ khả dụng sau khi backend endpoint được triển khai.
      </p>
    </section>
  )
}
