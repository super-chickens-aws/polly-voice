import {
  SttHistoryCard,
  TtsHistoryCard,
} from '../../components/history/HistoryCard'
import type {
  HistoryTab,
  STTHistoryItem,
  TTSHistoryItem,
} from '../../types/app'

interface HistoryPanelProps {
  historyTab: HistoryTab
  searchQuery: string
  ttsHistory: TTSHistoryItem[]
  sttHistory: STTHistoryItem[]
  onHistoryTabChange: (tab: HistoryTab) => void
  onSearchChange: (value: string) => void
  onPlayTts: (url: string) => void
  onDeleteTts: (id: string) => void
  onDeleteStt: (id: string) => void
  formatDate: (epoch: number) => string
}

export function HistoryPanel({
  historyTab,
  searchQuery,
  ttsHistory,
  sttHistory,
  onHistoryTabChange,
  onSearchChange,
  onPlayTts,
  onDeleteTts,
  onDeleteStt,
  formatDate,
}: HistoryPanelProps) {
  return (
    <div className="history-container glass-panel">
      <div className="history-header">
        <h2>Lịch Sử Chuyển Đổi (Amazon DynamoDB)</h2>
        <div className="history-tab-buttons">
          <button
            className={`subtab-btn ${historyTab === 'tts' ? 'active' : ''}`}
            onClick={() => onHistoryTabChange('tts')}
          >
            🗣️ Lịch Sử TTS ({ttsHistory.length})
          </button>
          <button
            className={`subtab-btn ${historyTab === 'stt' ? 'active' : ''}`}
            onClick={() => onHistoryTabChange('stt')}
          >
            🎙️ Lịch Sử STT ({sttHistory.length})
          </button>
        </div>
      </div>
      <div className="search-bar-row">
        <input
          type="text"
          placeholder="🔍 Tìm kiếm nội dung..."
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      {historyTab === 'tts' && (
        <div className="history-list">
          {ttsHistory.length === 0 ? (
            <p className="empty-text">Chưa có lịch sử TTS nào được lưu.</p>
          ) : (
            ttsHistory
              .filter((item) =>
                item.text_content
                  .toLowerCase()
                  .includes(searchQuery.toLowerCase()),
              )
              .map((item) => (
                <TtsHistoryCard
                  key={item.id}
                  item={item}
                  formatDate={formatDate}
                  onPlay={onPlayTts}
                  onDelete={onDeleteTts}
                />
              ))
          )}
        </div>
      )}
      {historyTab === 'stt' && (
        <div className="history-list">
          {sttHistory.length === 0 ? (
            <p className="empty-text">Chưa có lịch sử STT nào được lưu.</p>
          ) : (
            sttHistory
              .filter((item) =>
                item.result_text
                  .toLowerCase()
                  .includes(searchQuery.toLowerCase()),
              )
              .map((item) => (
                <SttHistoryCard
                  key={item.id}
                  item={item}
                  formatDate={formatDate}
                  onDelete={onDeleteStt}
                />
              ))
          )}
        </div>
      )}
    </div>
  )
}
