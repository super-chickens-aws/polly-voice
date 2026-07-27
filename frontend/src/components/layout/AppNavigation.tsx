import type { TabType, UserRole } from '../../types/app'

interface AppNavigationProps {
  activeTab: TabType
  userRole: UserRole
  historyCount: number
  onTabChange: (tab: TabType) => void
}

export function AppNavigation({
  activeTab,
  userRole,
  historyCount,
  onTabChange,
}: AppNavigationProps) {
  return (
    <nav className="nav-tabs">
      <button
        className={`nav-btn ${activeTab === 'tts' ? 'active' : ''}`}
        onClick={() => onTabChange('tts')}
      >
        🗣️ Text-to-Speech
      </button>
      <button
        className={`nav-btn ${activeTab === 'stt' ? 'active' : ''}`}
        onClick={() => onTabChange('stt')}
      >
        🎙️ Speech-to-Text
      </button>
      {userRole === 'user' && (
        <button
          className={`nav-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => onTabChange('history')}
        >
          📜 Lịch Sử ({historyCount})
        </button>
      )}
    </nav>
  )
}
