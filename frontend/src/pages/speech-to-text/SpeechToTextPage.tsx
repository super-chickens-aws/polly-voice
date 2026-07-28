import type { ChangeEvent } from 'react';

interface SpeechToTextPageProps {
  file: File | null;
  isTranscribing: boolean;
  progress: number;
  resultText: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTranscribe: () => void;
}

export function SpeechToTextPage({
  file,
  isTranscribing,
  progress,
  resultText,
  onFileChange,
  onTranscribe
}: SpeechToTextPageProps) {
  return (
    <div className="stt-container glass-panel">
      <h2>Speech to Text</h2>
      <p className="subtitle">Supported audio formats: .mp3, .wav, .m4a, and .flac (10 MB maximum)</p>

      <div className="stt-upload-box">
        <label className="dropzone">
          <span className="drop-icon">🎧</span>
          <span>{file ? `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)` : 'Drag and drop an audio file here, or click to browse'}</span>
          <input type="file" accept=".mp3,.wav,.m4a,.flac" onChange={onFileChange} hidden />
        </label>

        <button className="btn btn-primary btn-lg" disabled={!file || isTranscribing} onClick={onTranscribe}>
          {isTranscribing ? `⏳ Transcribing (${progress}%)...` : '🎙️ Start Transcription'}
        </button>
      </div>

      {isTranscribing && (
        <div className="progress-bar-container">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {resultText && (
        <div className="stt-result-card glass-subpanel">
          <div className="result-header">
            <h3>Transcription Result</h3>
            <div className="result-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(resultText)}>
                📋 Copy Text
              </button>
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(resultText)}`}
                download="transcribe_result.txt"
                className="btn btn-secondary btn-sm"
              >
                💾 Download .txt
              </a>
            </div>
          </div>
          <textarea className="result-textarea" readOnly value={resultText} />
        </div>
      )}
    </div>
  );
}
