import type { ChangeEvent } from 'react'
import type { SttViewState } from '../../types/app'

interface SttPanelProps {
  state: SttViewState
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onTranscribe: () => void
}

export function SttPanel({
  state,
  onFileUpload,
  onTranscribe,
}: SttPanelProps) {
  const { file, isTranscribing, progress, resultText } = state

  return (
    <div className="stt-container glass-panel">
      <h2>Chuyển Đổi Giọng Nói Thành Văn Bản (Speech-to-Text)</h2>
      <p className="subtitle">
        Hỗ trợ các định dạng âm thanh .mp3, .wav, .m4a, .flac (Max 10MB)
      </p>
      <div className="stt-upload-box">
        <label className="dropzone">
          <span className="drop-icon">🎧</span>
          <span>
            {file
              ? `Đã chọn: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
              : 'Kéo thả file audio vào đây hoặc click để chọn'}
          </span>
          <input
            type="file"
            accept=".mp3,.wav,.m4a,.flac"
            onChange={onFileUpload}
            hidden
          />
        </label>
        <button
          className="btn btn-primary btn-lg"
          disabled={!file || isTranscribing}
          onClick={onTranscribe}
        >
          {isTranscribing
            ? `⏳ Đang bóc băng (${progress}%)...`
            : '🎙️ Bắt Đầu Nhận Dạng Văn Bản'}
        </button>
      </div>
      {isTranscribing && (
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {resultText && (
        <div className="stt-result-card glass-subpanel">
          <div className="result-header">
            <h3>Kết Quả Bóc Băng</h3>
            <div className="result-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigator.clipboard.writeText(resultText)}
              >
                📋 Copy Text
              </button>
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(resultText)}`}
                download="transcribe_result.txt"
                className="btn btn-secondary btn-sm"
              >
                💾 Tải File .txt
              </a>
            </div>
          </div>
          <textarea
            className="result-textarea"
            readOnly
            value={resultText}
          />
        </div>
      )}
    </div>
  )
}
