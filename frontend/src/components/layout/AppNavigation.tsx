import type { TabType } from '../../types/app'

interface AppNavigationProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
}

export function AppNavigation({
  activeTab,
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
      <button
        className={`nav-btn ${activeTab === 'history' ? 'active' : ''}`}
        onClick={() => onTabChange('history')}
      >
        📜 Lịch Sử
      </button>
    </nav>
  )
}
