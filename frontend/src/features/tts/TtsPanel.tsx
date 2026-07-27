import type { ChangeEvent, RefObject } from 'react'
import { AudioPlayer } from '../../components/audio/AudioPlayer'
import type { UserRole } from '../../types/app'
import { AsyncTtsSection } from './AsyncTtsSection'
import type { PreviewEngine, TtsPreviewState } from './ttsPreviewTypes'

interface TtsPreviewForm {
  engine: PreviewEngine
  text: string
  voice: string
}

interface TtsPanelProps {
  form: TtsPreviewForm
  voices: string[]
  userRole: UserRole
  charLimit: number
  previewState: TtsPreviewState
  previewError: string
  isGenerating: boolean
  currentAudioUrl: string | null
  isPlaying: boolean
  audioDuration: number
  audioCurrentTime: number
  audioRef: RefObject<HTMLAudioElement | null>
  onTextChange: (value: string) => void
  onEngineChange: (value: PreviewEngine) => void
  onVoiceChange: (value: string) => void
  onTextFileUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onGenerate: () => void
  onToggleAudio: () => void
  formatTime: (seconds: number) => string
}

const ERROR_STATES: TtsPreviewState[] = [
  'validation-error',
  'service-error',
  'network-error',
  'audio-error',
]

export function TtsPanel({
  form,
  voices,
  userRole,
  charLimit,
  previewState,
  previewError,
  isGenerating,
  currentAudioUrl,
  isPlaying,
  audioDuration,
  audioCurrentTime,
  audioRef,
  onTextChange,
  onEngineChange,
  onVoiceChange,
  onTextFileUpload,
  onGenerate,
  onToggleAudio,
  formatTime,
}: TtsPanelProps) {
  const hasError = ERROR_STATES.includes(previewState)

  return (
    <div className="tts-grid">
      <div className="glass-panel input-panel">
        <div className="panel-header">
          <h2>Văn Bản Đầu Vào</h2>
          <label className="file-upload-btn">
            📁 Upload File .txt
            <input
              type="file"
              accept=".txt"
              disabled={isGenerating}
              onChange={onTextFileUpload}
              hidden
            />
          </label>
        </div>
        <div className="form-group">
          <label htmlFor="tts-preview-text">Nội dung Preview</label>
          <textarea
            id="tts-preview-text"
            placeholder="Nhập nội dung cần đọc tại đây..."
            value={form.text}
            disabled={isGenerating}
            onChange={(event) => onTextChange(event.target.value)}
            maxLength={charLimit}
          />
          <div className="char-count-bar">
            <div className="progress-bg">
              <div
                className={`progress-fill ${form.text.length > charLimit * 0.9 ? 'warning' : ''}`}
                style={{
                  width: `${Math.min(100, (form.text.length / charLimit) * 100)}%`,
                }}
              />
            </div>
            <span>
              {form.text.length} / {charLimit} ký tự
            </span>
          </div>
        </div>
        <div className="notice-banner">
          Preview công khai hỗ trợ tối đa 500 ký tự. Tạo audio bất đồng bộ và
          lưu lịch sử chưa được kết nối trong bước này.
          {userRole === 'guest' && ' Không cần đăng nhập để nghe Preview.'}
        </div>
        <div className="action-button-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={isGenerating || !form.text.trim()}
            onClick={onGenerate}
          >
            {isGenerating ? '⏳ Đang tạo Preview...' : '▶ Nghe Thử Preview'}
          </button>
        </div>

        {hasError && (
          <div className="auth-error" role="alert">
            <p>{previewError}</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={isGenerating || !form.text.trim()}
              onClick={onGenerate}
            >
              Thử lại
            </button>
          </div>
        )}
        {previewState === 'success' && (
          <p aria-live="polite">Preview đã sẵn sàng để nghe.</p>
        )}
        {previewState === 'generating' && currentAudioUrl && (
          <p aria-live="polite">
            Đang tạo Preview mới; bản Preview gần nhất vẫn khả dụng bên dưới.
          </p>
        )}
        {currentAudioUrl && (
          <AudioPlayer
            audioRef={audioRef}
            audioUrl={currentAudioUrl}
            isPlaying={isPlaying}
            currentTime={audioCurrentTime}
            duration={audioDuration}
            onTogglePlay={onToggleAudio}
            formatTime={formatTime}
          />
        )}
        <AsyncTtsSection
          text={form.text}
          voice={form.voice}
          engine={form.engine}
        />
      </div>

      <div className="glass-panel settings-panel">
        <h2>Cấu Hình Preview</h2>
        <div className="form-group">
          <label>Voice Engine (Polly)</label>
          <div className="engine-selector">
            {(['neural', 'standard'] as const).map((engine) => (
              <button
                type="button"
                key={engine}
                className={`engine-tab ${form.engine === engine ? 'active' : ''}`}
                disabled={isGenerating}
                onClick={() => onEngineChange(engine)}
              >
                {engine === 'neural' ? 'Neural ⚡' : 'Standard'}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="tts-preview-voice">Giọng đọc (Voice)</label>
          <select
            id="tts-preview-voice"
            value={form.voice}
            disabled={isGenerating}
            onChange={(event) => onVoiceChange(event.target.value)}
          >
            {voices.map((voice) => (
              <option key={voice} value={voice}>
                {voice}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group disabled-option">
          <label>Định dạng đầu ra</label>
          <select value="mp3" disabled>
            <option value="mp3">MP3</option>
          </select>
          <span className="helper-text">
            MVP Preview hiện sử dụng định dạng MP3.
          </span>
        </div>
        <div className="notice-banner">
          Preset, ngôn ngữ, tốc độ, âm lượng, ngắt nghỉ, cao độ, nhấn mạnh và
          phong cách đọc không được backend Preview hỗ trợ nên đã được tắt khỏi
          tương tác.
        </div>
      </div>
    </div>
  )
}
