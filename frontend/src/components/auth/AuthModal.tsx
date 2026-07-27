import type { FormEvent } from 'react'
import type { AuthMode } from '../../types/app'

interface AuthModalProps {
  mode: AuthMode
  email: string
  password: string
  name: string
  error: string
  onClose: () => void
  onModeChange: (mode: AuthMode) => void
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onNameChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}

export function AuthModal({
  mode,
  email,
  password,
  name,
  error,
  onClose,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onNameChange,
  onSubmit,
}: AuthModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="modal-content glass-panel">
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>
        <h2>
          {mode === 'login'
            ? '🔑 Đăng Nhập Amazon Cognito'
            : '📝 Đăng Ký Tài Khoản'}
        </h2>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={onSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label>Họ và tên</label>
              <input
                type="text"
                placeholder="Nhập họ và tên"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
              />
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Mật khẩu (tối thiểu 8 ký tự)</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary">
            {mode === 'login' ? 'Đăng Nhập' : 'Tạo Tài Khoản'}
          </button>
        </form>
        <div className="modal-footer">
          {mode === 'login' ? (
            <span>
              Chưa có tài khoản?{' '}
              <span
                className="link-span"
                onClick={() => onModeChange('register')}
              >
                Đăng ký ngay
              </span>
            </span>
          ) : (
            <span>
              Đã có tài khoản?{' '}
              <span
                className="link-span"
                onClick={() => onModeChange('login')}
              >
                Đăng nhập
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
