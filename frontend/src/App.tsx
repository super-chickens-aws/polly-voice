import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useAuth } from './auth/useAuth'
import { AuthModal } from './components/auth/AuthModal'
import { AppHeader } from './components/layout/AppHeader'
import { HistoryPanel } from './features/history/HistoryPanel'
import { ProfilePanel } from './features/profile/ProfilePanel'
import { SttPanel } from './features/stt/SttPanel'
import { TtsPanel } from './features/tts/TtsPanel'
import { useTtsPreview } from './features/tts/useTtsPreview'
import type { PreviewEngine } from './features/tts/ttsPreviewTypes'
import type {
  HistoryTab,
  STTHistoryItem,
  TTSHistoryItem,
  TabType,
} from './types/app'

const VOICES = [
  'Joanna',
  'Matthew',
  'Kevin',
  'Danielle',
  'Stephen',
  'Amy',
  'Emma',
  'Brian',
]

function App() {
  const { status, user, login, register, logout } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('tts')
  const [showAuthModal, setShowAuthModal] = useState(false)

  const [engine, setEngine] = useState<PreviewEngine>('neural')
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('Joanna')

  const {
    state: previewState,
    errorMessage: previewError,
    isGenerating,
    generate: generatePreview,
    reportAudioError,
    clearError: clearPreviewError,
  } = useTtsPreview()
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [ttsHistory, setTtsHistory] = useState<TTSHistoryItem[]>([])
  const [sttHistory, setSttHistory] = useState<STTHistoryItem[]>([])
  const [historyTab, setHistoryTab] = useState<HistoryTab>('tts')
  const [searchQuery, setSearchQuery] = useState('')

  const userRole = status === 'authenticated' ? 'user' : 'guest'
  const userEmail =
    user?.email ?? user?.preferredUsername ?? user?.name ?? 'Authenticated User'
  const charLimit = 3_000

  const handleAudioFailure = useCallback(() => {
    setIsPlaying(false)
    setCurrentAudioUrl(null)
    setAudioCurrentTime(0)
    setAudioDuration(0)
    reportAudioError()
  }, [reportAudioError])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }
    const onTimeUpdate = () => setAudioCurrentTime(audio.currentTime)
    const onLoadedMetadata = () => setAudioDuration(audio.duration)
    const onEnded = () => setIsPlaying(false)
    const onError = () => handleAudioFailure()
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [currentAudioUrl, handleAudioFailure])

  useEffect(() => {
    if (status === 'anonymous' && activeTab === 'history') {
      setActiveTab('tts')
    }
  }, [activeTab, status])

  const handleLogout = () => {
    if (activeTab === 'profile') {
      setActiveTab('tts')
    }
    logout()
  }

  const handleTextFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    if (!file.name.endsWith('.txt')) {
      alert('Chỉ hỗ trợ file .txt')
      return
    }
    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      const result = loadEvent.target?.result
      if (typeof result === 'string') {
        setText(result)
        clearPreviewError()
      }
    }
    reader.readAsText(file)
  }

  const handleGenerateTTS = async () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setIsPlaying(false)
    setAudioCurrentTime(0)
    setAudioDuration(0)

    const response = await generatePreview({
      text,
      voice,
      engine,
      output_format: 'mp3',
    })
    if (!response) {
      return
    }
    setCurrentAudioUrl(response.audio_url)
    setAudioCurrentTime(0)
    setAudioDuration(0)
  }

  const togglePlayAudio = (url?: string) => {
    if (url && url !== currentAudioUrl) {
      setCurrentAudioUrl(url)
      setTimeout(() => {
        if (audioRef.current) {
          void audioRef.current
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => handleAudioFailure())
        }
      }, 100)
      return
    }
    if (!audioRef.current) {
      return
    }
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      void audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => handleAudioFailure())
    }
  }

  const formatTime = (seconds: number) => {
    if (Number.isNaN(seconds)) {
      return '00:00'
    }
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  const formatDate = (epoch: number) =>
    new Date(epoch).toLocaleString('vi-VN')

  if (status === 'loading') {
    return (
      <div className="app-container">
        <main className="main-content-layout" aria-live="polite">
          <section className="glass-panel profile-container">
            <h2>Đang khôi phục phiên đăng nhập</h2>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="app-container">
      {currentAudioUrl && (
        <audio ref={audioRef} src={currentAudioUrl} preload="metadata" />
      )}
      <AppHeader
        activeTab={activeTab}
        userRole={userRole}
        userEmail={userEmail}
        historyCount={ttsHistory.length + sttHistory.length}
        onTabChange={setActiveTab}
        onLogin={() => setShowAuthModal(true)}
        onLogout={handleLogout}
      />
      <main className="main-content-layout">
        {activeTab === 'tts' && (
          <TtsPanel
            form={{
              engine,
              text,
              voice,
            }}
            voices={VOICES}
            userRole={userRole}
            charLimit={charLimit}
            previewState={previewState}
            previewError={previewError}
            isGenerating={isGenerating}
            currentAudioUrl={currentAudioUrl}
            isPlaying={isPlaying}
            audioDuration={audioDuration}
            audioCurrentTime={audioCurrentTime}
            audioRef={audioRef}
            onTextChange={(value) => {
              setText(value)
              clearPreviewError()
            }}
            onEngineChange={(value) => {
              setEngine(value)
              clearPreviewError()
            }}
            onVoiceChange={(value) => {
              setVoice(value)
              clearPreviewError()
            }}
            onTextFileUpload={handleTextFileUpload}
            onGenerate={handleGenerateTTS}
            onToggleAudio={() => togglePlayAudio()}
            formatTime={formatTime}
          />
        )}
        {activeTab === 'stt' && <SttPanel />}
        {activeTab === 'history' && userRole === 'user' && (
          <HistoryPanel
            historyTab={historyTab}
            searchQuery={searchQuery}
            ttsHistory={ttsHistory}
            sttHistory={sttHistory}
            onHistoryTabChange={setHistoryTab}
            onSearchChange={setSearchQuery}
            onPlayTts={togglePlayAudio}
            onDeleteTts={(id) =>
              setTtsHistory((items) => items.filter((item) => item.id !== id))
            }
            onDeleteStt={(id) =>
              setSttHistory((items) => items.filter((item) => item.id !== id))
            }
            formatDate={formatDate}
          />
        )}
        {activeTab === 'profile' && <ProfilePanel />}
      </main>
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onLogin={() => void login()}
          onRegister={() => void register()}
        />
      )}
    </div>
  )
}

export default App
