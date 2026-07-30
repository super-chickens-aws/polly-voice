import { formatDateTime } from '../../@core/utils/formatters';
import type { SttHistoryItem, TtsHistoryItem } from '../../shared/models/speech.models';

interface HistoryPageProps {
  activeType: 'tts' | 'stt';
  query: string;
  ttsItems: TtsHistoryItem[];
  sttItems: SttHistoryItem[];
  onTypeChange: (type: 'tts' | 'stt') => void;
  onQueryChange: (query: string) => void;
  onPlay: (url: string) => void;
  onDeleteTts: (id: string) => void;
  onDeleteStt: (id: string) => void;
}

export function HistoryPage({
  activeType,
  query,
  ttsItems,
  sttItems,
  onTypeChange,
  onQueryChange,
  onPlay,
  onDeleteTts,
  onDeleteStt
}: HistoryPageProps) {
  return (
    <div className="history-container glass-panel">
      <div className="history-header">
        <h2>Conversion History (DynamoDB)</h2>
        <div className="history-tab-buttons">
          <button className={`subtab-btn ${activeType === 'tts' ? 'active' : ''}`} onClick={() => onTypeChange('tts')}>
            🗣️ TTS History ({ttsItems.length})
          </button>
          <button className={`subtab-btn ${activeType === 'stt' ? 'active' : ''}`} onClick={() => onTypeChange('stt')}>
            🎙️ STT History ({sttItems.length})
          </button>
        </div>
      </div>

      <div className="search-bar-row">
        <input type="text" placeholder="🔍 Search history..." value={query} onChange={(event) => onQueryChange(event.target.value)} />
      </div>

      {activeType === 'tts' && (
        <div className="history-list">
          {ttsItems.length === 0 ? <p className="empty-text">No TTS history has been saved yet.</p> : ttsItems
            .filter((item) => item.text_content.toLowerCase().includes(query.toLowerCase()))
            .map((item) => (
              <div key={item.id} className="history-card glass-subpanel">
                <div className="card-top">
                  <span className="badge badge-tag">{item.voice} ({item.engine})</span>
                  <span className="timestamp">🕒 {formatDateTime(item.created_at)}</span>
                </div>
                <p className="card-text">{item.text_content}</p>
                <div className="card-bottom">
                  <span className="s3-key">📦 S3 Key: <code>{item.audio_s3_key}</code></span>
                  <div className="card-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => onPlay(item.audio_url)}>▶ Play Audio</button>
                    <button className="btn btn-danger-link btn-sm" onClick={() => onDeleteTts(item.id)}>🗑️ Soft Delete</button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {activeType === 'stt' && (
        <div className="history-list">
          {sttItems.length === 0 ? <p className="empty-text">No STT history has been saved yet.</p> : sttItems
            .filter((item) => item.result_text.toLowerCase().includes(query.toLowerCase()))
            .map((item) => (
              <div key={item.id} className="history-card glass-subpanel">
                <div className="card-top">
                  <span className="badge badge-tag">📁 {item.file_name}</span>
                  <span className="timestamp">🕒 {formatDateTime(item.created_at)}</span>
                </div>
                <p className="card-text">{item.result_text}</p>
                <div className="card-bottom">
                  <span className="s3-key">📦 S3 Key: <code>{item.audio_s3_key}</code></span>
                  <div className="card-actions">
                    <button className="btn btn-danger-link btn-sm" onClick={() => onDeleteStt(item.id)}>🗑️ Soft Delete</button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
