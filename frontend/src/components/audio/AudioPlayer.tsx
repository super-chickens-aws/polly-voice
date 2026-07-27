import type { RefObject } from 'react'

interface AudioPlayerProps {
  audioRef: RefObject<HTMLAudioElement | null>
  audioUrl: string
  isPlaying: boolean
  currentTime: number
  duration: number
  onTogglePlay: () => void
  formatTime: (seconds: number) => string
}

export function AudioPlayer({
  audioRef,
  audioUrl,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  formatTime,
}: AudioPlayerProps) {
  return (
    <div className="player-card glass-subpanel">
      <div className="player-controls">
        <button className="play-circle-btn" onClick={onTogglePlay}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div className="player-info">
          <div className="sound-wave-anim">
            {[0, 1, 2, 3].map((bar) => (
              <span
                key={bar}
                className={`bar ${isPlaying ? 'playing' : ''}`}
              />
            ))}
          </div>
          <div className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
        <a
          href={audioUrl}
          download="polly_voice.mp3"
          target="_blank"
          rel="noreferrer"
          className="btn btn-secondary btn-sm"
        >
          💾 Download MP3
        </a>
      </div>
      <input
        type="range"
        className="audio-seeker"
        min="0"
        max={duration || 100}
        value={currentTime}
        onChange={(event) => {
          if (audioRef.current) {
            audioRef.current.currentTime = Number(event.target.value)
          }
        }}
      />
    </div>
  )
}
