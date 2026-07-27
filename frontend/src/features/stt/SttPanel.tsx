import { useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useAuth } from '../../auth/useAuth'
import { SttJobList } from './SttJobList'
import {
  mediaFormatFromFileName,
  type SttLanguageCode,
} from './sttJobTypes'
import { useSttJobs } from './useSttJobs'

const ACCEPTED_EXTENSIONS =
  '.mp3,.mp4,.wav,.flac,.ogg,.amr,.webm,.m4a'

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

export function SttPanel() {
  const { status, login } = useAuth()
  const isAuthenticated = status === 'authenticated'
  const {
    jobs,
    listState,
    uploadState,
    workflowError,
    pollIssues,
    loadJobs,
    createAndUpload,
    retryPolling,
    resetUploadFeedback,
  } = useSttJobs(isAuthenticated)
  const [file, setFile] = useState<File | null>(null)
  const [languageCode, setLanguageCode] =
    useState<SttLanguageCode>('vi-VN')
  const [fileError, setFileError] = useState('')
  const isBusy =
    uploadState === 'creating_job' || uploadState === 'uploading'

  const selectFile = (candidate?: File) => {
    if (!candidate) {
      return
    }
    if (!mediaFormatFromFileName(candidate.name)) {
      setFileError(
        'Định dạng file không được hỗ trợ hoặc file không có phần mở rộng.',
      )
      return
    }
    setFile(candidate)
    setFileError('')
    resetUploadFeedback()
  }

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    selectFile(event.target.files?.[0])
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    if (!isBusy) {
      selectFile(event.dataTransfer.files[0])
    }
  }

  if (status === 'loading') {
    return (
      <div className="stt-container glass-panel" aria-live="polite">
        <h2>Speech-to-Text</h2>
        <p>Đang khôi phục phiên đăng nhập...</p>
      </div>
    )
  }

  if (status === 'anonymous') {
    return (
      <div className="stt-container glass-panel">
        <h2>Speech-to-Text</h2>
        <p>Bạn cần đăng nhập để tải audio và tạo STT job.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void login()}
        >
          Đăng nhập với Cognito
        </button>
      </div>
    )
  }

  return (
    <div className="stt-container glass-panel">
      <h2>Chuyển Đổi Giọng Nói Thành Văn Bản (Speech-to-Text)</h2>
      <p className="subtitle">
        Hỗ trợ .mp3, .mp4, .wav, .flac, .ogg, .amr, .webm và .m4a.
      </p>

      <div className="stt-upload-box">
        <label
          className="dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <span className="drop-icon">🎧</span>
          <span>
            {file
              ? `Đã chọn: ${file.name} (${formatFileSize(file.size)})`
              : 'Kéo thả file audio vào đây hoặc click để chọn'}
          </span>
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            disabled={isBusy}
            onChange={handleFileInput}
            hidden
          />
        </label>

        <div className="form-group">
          <label htmlFor="stt-language">Ngôn ngữ audio</label>
          <select
            id="stt-language"
            value={languageCode}
            disabled={isBusy}
            onChange={(event) =>
              setLanguageCode(event.target.value as SttLanguageCode)
            }
          >
            <option value="vi-VN">Tiếng Việt (vi-VN)</option>
            <option value="en-US">English (en-US)</option>
          </select>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!file || isBusy}
          onClick={() => {
            if (file) {
              void createAndUpload(file, languageCode)
            }
          }}
        >
          {uploadState === 'creating_job'
            ? 'Đang tạo STT job...'
            : uploadState === 'uploading'
              ? 'Đang tải audio lên S3...'
              : uploadState === 'upload_failed'
                ? 'Tạo job mới và tải lại'
                : 'Tạo STT job và tải audio'}
        </button>
      </div>

      {fileError && (
        <p className="auth-error" role="alert">
          {fileError}
        </p>
      )}
      {workflowError && (
        <p className="auth-error" role="alert">
          {workflowError}
        </p>
      )}
      {uploadState === 'uploading' && (
        <p aria-live="polite">
          Đang upload trực tiếp tới S3. Thời gian phụ thuộc kích thước file.
        </p>
      )}
      {uploadState === 'uploaded' && (
        <p aria-live="polite">
          Upload thành công; đang chờ backend bắt đầu xử lý.
        </p>
      )}
      {uploadState === 'processing' && (
        <p aria-live="polite">Backend đang nhận dạng audio.</p>
      )}
      {uploadState === 'completed' && (
        <p aria-live="polite">STT job vừa tạo đã hoàn thành.</p>
      )}
      {uploadState === 'failed' && (
        <p className="auth-error" role="alert">
          STT job vừa tạo đã thất bại. Xem thông tin an toàn trong danh sách.
        </p>
      )}

      <SttJobList
        jobs={jobs}
        listState={listState}
        pollIssues={pollIssues}
        onRefresh={loadJobs}
        onRetryPolling={retryPolling}
      />
    </div>
  )
}
