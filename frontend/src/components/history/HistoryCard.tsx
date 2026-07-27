import type { STTHistoryItem, TTSHistoryItem } from '../../types/app'

interface TtsHistoryCardProps {
  item: TTSHistoryItem
  formatDate: (epoch: number) => string
  onPlay: (url: string) => void
  onDelete: (id: string) => void
}

export function TtsHistoryCard({
  item,
  formatDate,
  onPlay,
  onDelete,
}: TtsHistoryCardProps) {
  return (
    <div className="history-card glass-subpanel">
      <div className="card-top">
        <span className="badge badge-tag">
          {item.voice} ({item.engine})
        </span>
        <span className="timestamp">🕒 {formatDate(item.created_at)}</span>
      </div>
      <p className="card-text">{item.text_content}</p>
      <div className="card-bottom">
        <span className="s3-key">
          📦 S3 Key: <code>{item.audio_s3_key}</code>
        </span>
        <div className="card-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onPlay(item.audio_url)}
          >
            ▶ Play Audio
          </button>
          <button
            className="btn btn-danger-link btn-sm"
            onClick={() => onDelete(item.id)}
          >
            🗑️ Soft Delete
          </button>
        </div>
      </div>
    </div>
  )
}

interface SttHistoryCardProps {
  item: STTHistoryItem
  formatDate: (epoch: number) => string
  onDelete: (id: string) => void
}

export function SttHistoryCard({
  item,
  formatDate,
  onDelete,
}: SttHistoryCardProps) {
  return (
    <div className="history-card glass-subpanel">
      <div className="card-top">
        <span className="badge badge-tag">📁 {item.file_name}</span>
        <span className="timestamp">🕒 {formatDate(item.created_at)}</span>
      </div>
      <p className="card-text">{item.result_text}</p>
      <div className="card-bottom">
        <span className="s3-key">
          📦 S3 Key: <code>{item.audio_s3_key}</code>
        </span>
        <div className="card-actions">
          <button
            className="btn btn-danger-link btn-sm"
            onClick={() => onDelete(item.id)}
          >
            🗑️ Soft Delete
          </button>
        </div>
      </div>
    </div>
  )
}
