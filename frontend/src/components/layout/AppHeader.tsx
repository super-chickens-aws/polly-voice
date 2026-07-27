import type { TabType, UserRole } from '../../types/app'
import { AppNavigation } from './AppNavigation'

interface AppHeaderProps {
  activeTab: TabType
  userRole: UserRole
  userEmail: string
  onTabChange: (tab: TabType) => void
  onLogin: () => void
  onLogout: () => void
}

export function AppHeader({
  activeTab,
  userRole,
  userEmail,
  onTabChange,
  onLogin,
  onLogout,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="logo-group">
        <div className="logo-icon">🎙️</div>
        <div>
          <h1 className="logo-title">Polly Voice</h1>
          <span className="logo-subtitle">
            AWS Serverless Text-to-Speech & Speech-to-Text
          </span>
        </div>
      </div>

      <AppNavigation
        activeTab={activeTab}
        onTabChange={onTabChange}
      />

      <div className="auth-header-action">
        {userRole === 'guest' ? (
          <div className="guest-badge-group">
            <span className="badge badge-guest">⚡ Guest Mode</span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onTabChange('profile')}
            >
              ⚙️ Profile
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onLogin}>
              🔑 Đăng Nhập
            </button>
          </div>
        ) : (
          <div className="user-profile-badge">
            <span className="badge badge-user">
              👤 {userEmail.split('@')[0]}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onTabChange('profile')}
            >
              ⚙️ Profile
            </button>
            <button className="btn btn-danger-link btn-sm" onClick={onLogout}>
              Đăng Xuất
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
