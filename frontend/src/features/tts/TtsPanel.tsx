import type { ChangeEvent, RefObject } from 'react'
import { AudioPlayer } from '../../components/audio/AudioPlayer'
import type {
  EngineType,
  PresetItem,
  TtsFormState,
  UserRole,
} from '../../types/app'

interface TtsPanelProps {
  form: TtsFormState
  presets: PresetItem[]
  voices: string[]
  userRole: UserRole
  charLimit: number
  isGenerating: boolean
  currentAudioUrl: string | null
  isPlaying: boolean
  audioDuration: number
  audioCurrentTime: number
  audioRef: RefObject<HTMLAudioElement | null>
  onTextChange: (value: string) => void
  onPresetChange: (value: string) => void
  onEngineChange: (value: EngineType) => void
  onLanguageChange: (value: string) => void
  onVoiceChange: (value: string) => void
  onSpeedChange: (value: number) => void
  onVolumeChange: (value: number) => void
  onBreakTimeChange: (value: number) => void
  onPitchChange: (value: number) => void
  onEmphasisChange: (value: string) => void
  onDomainStyleChange: (value: string) => void
  onTextFileUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onGenerate: (isPreview: boolean) => void
  onToggleAudio: () => void
  onOpenAuth: () => void
  formatTime: (seconds: number) => string
}

export function TtsPanel({
  form,
  presets,
  voices,
  userRole,
  charLimit,
  isGenerating,
  currentAudioUrl,
  isPlaying,
  audioDuration,
  audioCurrentTime,
  audioRef,
  onTextChange,
  onPresetChange,
  onEngineChange,
  onLanguageChange,
  onVoiceChange,
  onSpeedChange,
  onVolumeChange,
  onBreakTimeChange,
  onPitchChange,
  onEmphasisChange,
  onDomainStyleChange,
  onTextFileUpload,
  onGenerate,
  onToggleAudio,
  onOpenAuth,
  formatTime,
}: TtsPanelProps) {
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
              onChange={onTextFileUpload}
              hidden
            />
          </label>
        </div>
        <div className="form-group">
          <textarea
            placeholder="Nhập nội dung tiếng Anh cần đọc tại đây..."
            value={form.text}
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
              {form.text.length} / {charLimit} ký tự ({userRole.toUpperCase()})
            </span>
          </div>
        </div>
        {userRole === 'guest' && (
          <div className="notice-banner">
            💡 Bạn đang ở chế độ <strong>Guest</strong> (giới hạn 500 ký tự &
            không lưu lịch sử).{' '}
            <span className="link-span" onClick={onOpenAuth}>
              Đăng nhập Cognito
            </span>{' '}
            để mở khóa 3,000 ký tự.
          </div>
        )}
        <div className="action-button-row">
          <button
            className="btn btn-secondary"
            disabled={isGenerating || !form.text.trim()}
            onClick={() => onGenerate(true)}
          >
            ▶ Nghe Thử Preview
          </button>
          <button
            className="btn btn-primary"
            disabled={isGenerating || !form.text.trim()}
            onClick={() => onGenerate(false)}
          >
            {isGenerating ? '⏳ Đang tổng hợp giọng đọc...' : '✨ Tạo Audio MP3'}
          </button>
        </div>
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
      </div>

      <div className="glass-panel settings-panel">
        <h2>Cấu Hình Giọng Đọc</h2>
        <div className="form-group">
          <label>Voice Engine (Polly)</label>
          <div className="engine-selector">
            {(['neural', 'standard', 'long-form'] as const).map((engine) => (
              <button
                key={engine}
                className={`engine-tab ${form.engine === engine ? 'active' : ''}`}
                onClick={() => onEngineChange(engine)}
              >
                {engine === 'neural'
                  ? 'Neural ⚡'
                  : engine === 'standard'
                    ? 'Standard'
                    : 'Long-form'}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label>Cấu hình có sẵn (Preset)</label>
          <select
            value={form.preset}
            onChange={(event) => onPresetChange(event.target.value)}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} — {preset.desc}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row form-group">
          <div>
            <label>Ngôn ngữ</label>
            <select
              value={form.language}
              onChange={(event) => onLanguageChange(event.target.value)}
            >
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
            </select>
          </div>
          <div>
            <label>Giọng đọc (Voice)</label>
            <select
              value={form.voice}
              onChange={(event) => onVoiceChange(event.target.value)}
            >
              {voices.map((voice) => (
                <option key={voice} value={voice}>
                  {voice}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Slider
          label="Tốc độ đọc (Speed Rate)"
          value={form.speed}
          display={`${form.speed}%`}
          min={20}
          max={200}
          step={5}
          onChange={onSpeedChange}
        />
        <Slider
          label="Âm lượng (Volume)"
          value={form.volume}
          display={`${form.volume > 0 ? `+${form.volume}` : form.volume} dB`}
          min={-10}
          max={10}
          step={1}
          onChange={onVolumeChange}
        />
        <Slider
          label="Tạm dừng (Break Time)"
          value={form.breakTime}
          display={`${form.breakTime} ms`}
          min={0}
          max={2000}
          step={100}
          onChange={onBreakTimeChange}
        />
        <hr className="divider" />
        <h3>Thông Số SSML Nâng Cao</h3>
        <Slider
          label="Cao độ giọng (Pitch)"
          value={form.pitch}
          display={`${form.pitch > 0 ? `+${form.pitch}` : form.pitch}%`}
          min={-20}
          max={20}
          step={1}
          disabled={form.engine !== 'standard'}
          helper="⚠️ Chỉ hỗ trợ cho Standard Engine"
          onChange={onPitchChange}
        />
        <div
          className={`form-group ${form.engine !== 'standard' ? 'disabled-option' : ''}`}
        >
          <label>Nhấn mạnh (Emphasis)</label>
          <select
            value={form.emphasis}
            onChange={(event) => onEmphasisChange(event.target.value)}
            disabled={form.engine !== 'standard'}
          >
            <option value="none">Không nhấn mạnh</option>
            <option value="reduced">Giảm nhẹ (Reduced)</option>
            <option value="moderate">Vừa phải (Moderate)</option>
            <option value="strong">Mạnh mẽ (Strong)</option>
          </select>
        </div>
        <div
          className={`form-group ${form.engine !== 'neural' ? 'disabled-option' : ''}`}
        >
          <label>Phong cách đọc (Domain Style)</label>
          <select
            value={form.domainStyle}
            onChange={(event) => onDomainStyleChange(event.target.value)}
            disabled={form.engine !== 'neural'}
          >
            <option value="none">Mặc định (Default)</option>
            <option value="news">Đọc tin tức (News)</option>
            <option value="conversational">Trò chuyện (Conversational)</option>
          </select>
          {form.engine !== 'neural' && (
            <span className="helper-text">
              ⚠️ Chỉ hỗ trợ cho Neural Engine
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  disabled?: boolean
  helper?: string
  onChange: (value: number) => void
}

function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  disabled = false,
  helper,
  onChange,
}: SliderProps) {
  return (
    <div
      className={`form-group slider-container ${disabled ? 'disabled-option' : ''}`}
    >
      <div className="slider-header">
        <label>{label}</label>
        <span className="slider-value">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
      />
      {disabled && helper && <span className="helper-text">{helper}</span>}
    </div>
  )
}
