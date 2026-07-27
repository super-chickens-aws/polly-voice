import { useState } from 'react'
import { ApiError } from '../../api/types'
import { useAuth } from '../../auth/useAuth'

interface ProfilePanelProps {
  subject?: string
  userEmail: string
}

interface ProfileResponse {
  profile?: {
    display_name?: string
    preferred_language?: string
    created_at?: string | number
    updated_at?: string | number
  }
}

type CheckState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; profile: ProfileResponse }
  | { kind: 'not-found' }
  | { kind: 'error' }

export function ProfilePanel({ subject, userEmail }: ProfilePanelProps) {
  const { authenticatedRequest } = useAuth()
  const [checkState, setCheckState] = useState<CheckState>({ kind: 'idle' })

  const checkBackendProfile = async () => {
    setCheckState({ kind: 'loading' })
    try {
      const profile = await authenticatedRequest<ProfileResponse>({
        path: '/profile',
      })
      setCheckState({ kind: 'success', profile })
    } catch (error: unknown) {
      if (
        error instanceof ApiError &&
        error.status === 404 &&
        error.code === 'PROFILE_NOT_FOUND'
      ) {
        setCheckState({ kind: 'not-found' })
        return
      }
      setCheckState({ kind: 'error' })
    }
  }

  return (
    <div className="profile-container glass-panel">
      <h2>Thông Tin Tài Khoản Cognito</h2>
      <div className="profile-card">
        <div className="profile-row">
          <span className="label">Subject (chỉ để hiển thị):</span>
          <code>{subject ?? 'Không có trong ID token'}</code>
        </div>
        <div className="profile-row">
          <span className="label">Email:</span>
          <span>{userEmail}</span>
        </div>
        <div className="profile-row">
          <span className="label">Trạng thái:</span>
          <span className="badge badge-user">Authenticated User</span>
        </div>
        <div className="profile-row">
          <span className="label">Giới hạn ký tự TTS:</span>
          <span>3,000 ký tự / lượt</span>
        </div>
      </div>

      <div className="profile-card">
        <h3>Kiểm tra kết nối backend</h3>
        <p>
          Thao tác thủ công này gọi <code>GET /profile</code> bằng access token.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={checkState.kind === 'loading'}
          onClick={() => void checkBackendProfile()}
        >
          {checkState.kind === 'loading' ? 'Đang kiểm tra...' : 'Kiểm tra profile'}
        </button>
        {checkState.kind === 'success' && (
          <div className="profile-row" aria-live="polite">
            <span className="label">Kết quả:</span>
            <span>
              Kết nối thành công
              {checkState.profile.profile?.display_name
                ? ` — ${checkState.profile.profile.display_name}`
                : ''}
            </span>
          </div>
        )}
        {checkState.kind === 'not-found' && (
          <p aria-live="polite">
            Xác thực thành công; profile chưa được tạo trên backend.
          </p>
        )}
        {checkState.kind === 'error' && (
          <p className="auth-error" aria-live="polite">
            Không thể kiểm tra profile. Vui lòng thử lại.
          </p>
        )}
      </div>
    </div>
  )
}
