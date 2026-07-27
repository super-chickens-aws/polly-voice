import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useAuth } from './auth/useAuth'
import { AuthModal } from './components/auth/AuthModal'
import { AppHeader } from './components/layout/AppHeader'
import { HistoryPanel } from './features/history/HistoryPanel'
import { ProfilePanel } from './features/profile/ProfilePanel'
import { SttPanel } from './features/stt/SttPanel'
import { TtsPanel } from './features/tts/TtsPanel'
import type {
  EngineType,
  HistoryTab,
  PresetItem,
  STTHistoryItem,
  TTSHistoryItem,
  TabType,
} from './types/app'

const PRESETS: PresetItem[] = [
  {
    id: 'none',
    name: 'Custom (No Preset)',
    desc: 'Tự điều chỉnh các thông số',
  },
  {
    id: 'deep_male',
    name: 'Deep Male',
    voice: 'Matthew',
    engine: 'neural',
    desc: 'Giọng nam trầm, uy quyền',
  },
  {
    id: 'young_male',
    name: 'Young Male',
    voice: 'Kevin',
    engine: 'neural',
    desc: 'Giọng nam trẻ, năng động',
  },
  {
    id: 'soft_female',
    name: 'Soft Female',
    voice: 'Joanna',
    engine: 'neural',
    desc: 'Giọng nữ nhẹ nhàng',
  },
  {
    id: 'expressive_female',
    name: 'Expressive Female',
    voice: 'Danielle',
    engine: 'long-form',
    desc: 'Giọng nữ biểu cảm, đọc truyện',
  },
  {
    id: 'mc',
    name: 'MC',
    voice: 'Stephen',
    engine: 'neural',
    desc: 'Giọng MC rõ ràng, dẫn chương trình',
  },
  {
    id: 'podcast',
    name: 'Podcast',
    voice: 'Matthew',
    engine: 'neural',
    domain: 'conversational',
    desc: 'Giọng Podcast tự nhiên',
  },
  {
    id: 'audiobook',
    name: 'Audiobook',
    voice: 'Joanna',
    engine: 'long-form',
    desc: 'Giọng đọc sách nhịp chậm',
  },
]

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

  const [engine, setEngine] = useState<EngineType>('neural')
  const [text, setText] = useState('')
  const [preset, setPreset] = useState('none')
  const [language, setLanguage] = useState('en-US')
  const [voice, setVoice] = useState('Joanna')
  const [speed, setSpeed] = useState(100)
  const [volume, setVolume] = useState(0)
  const [breakTime, setBreakTime] = useState(0)
  const [pitch, setPitch] = useState(0)
  const [emphasis, setEmphasis] = useState('none')
  const [domainStyle, setDomainStyle] = useState('none')

  const [isGenerating, setIsGenerating] = useState(false)
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [sttFile, setSttFile] = useState<File | null>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcribeProgress, setTranscribeProgress] = useState(0)
  const [sttResultText, setSttResultText] = useState('')

  const [ttsHistory, setTtsHistory] = useState<TTSHistoryItem[]>([])
  const [sttHistory, setSttHistory] = useState<STTHistoryItem[]>([])
  const [historyTab, setHistoryTab] = useState<HistoryTab>('tts')
  const [searchQuery, setSearchQuery] = useState('')

  const userRole = status === 'authenticated' ? 'user' : 'guest'
  const userEmail =
    user?.email ?? user?.preferredUsername ?? user?.name ?? 'Authenticated User'
  const charLimit = userRole === 'user' ? 3000 : 500

  useEffect(() => {
    if (preset === 'none') {
      return
    }
    const selectedPreset = PRESETS.find((item) => item.id === preset)
    if (!selectedPreset) {
      return
    }
    if (selectedPreset.voice) {
      setVoice(selectedPreset.voice)
    }
    if (selectedPreset.engine) {
      setEngine(selectedPreset.engine)
    }
    setDomainStyle(selectedPreset.domain ?? 'none')
  }, [preset])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }
    const onTimeUpdate = () => setAudioCurrentTime(audio.currentTime)
    const onLoadedMetadata = () => setAudioDuration(audio.duration)
    const onEnded = () => setIsPlaying(false)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
    }
  }, [currentAudioUrl])

  useEffect(() => {
    if (status === 'authenticated' && ttsHistory.length === 0) {
      setTtsHistory([
        {
          id: 'tts-101',
          text_content:
            'Welcome to Polly Voice! This is an example generated audio history item.',
          voice: 'Joanna',
          engine: 'neural',
          audio_s3_key: 'tts/user-001/audio-101.mp3',
          audio_url:
            'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
          audio_file_size: 245000,
          created_at: Date.now() - 3600000,
        },
      ])
    }
  }, [status, ttsHistory.length])

  useEffect(() => {
    if (
      status === 'anonymous' &&
      (activeTab === 'history' || activeTab === 'profile')
    ) {
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
        setText(result.slice(0, charLimit))
      }
    }
    reader.readAsText(file)
  }

  const handleGenerateTTS = (isPreview = false) => {
    if (!text.trim()) {
      alert('Vui lòng nhập văn bản cần chuyển đổi!')
      return
    }
    if (text.length > charLimit) {
      alert(
        `Đã vượt quá giới hạn ${charLimit} ký tự của tài khoản ${userRole.toUpperCase()}`,
      )
      return
    }
    setIsGenerating(true)
    setIsPlaying(false)
    setTimeout(() => {
      const mockAudio =
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
      setCurrentAudioUrl(mockAudio)
      setIsGenerating(false)
      if (userRole === 'user' && !isPreview) {
        const now = Date.now()
        setTtsHistory((previous) => [
          {
            id: `tts-${now}`,
            text_content: text,
            voice,
            engine,
            audio_s3_key: `tts/demo-authenticated-user/${now}.mp3`,
            audio_url: mockAudio,
            audio_file_size: Math.floor(text.length * 1250),
            created_at: now,
          },
          ...previous,
        ])
      }
    }, 1200)
  }

  const togglePlayAudio = (url?: string) => {
    if (url && url !== currentAudioUrl) {
      setCurrentAudioUrl(url)
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play()
          setIsPlaying(true)
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
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const handleSttFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File vượt quá dung lượng tối đa 10MB')
      return
    }
    setSttFile(file)
    setSttResultText('')
  }

  const handleTranscribe = () => {
    if (!sttFile) {
      alert('Vui lòng chọn file âm thanh!')
      return
    }
    setIsTranscribing(true)
    setTranscribeProgress(10)
    const interval = setInterval(() => {
      setTranscribeProgress((previous) => {
        if (previous >= 90) {
          clearInterval(interval)
          return 95
        }
        return previous + 25
      })
    }, 400)
    setTimeout(() => {
      clearInterval(interval)
      setTranscribeProgress(100)
      setIsTranscribing(false)
      const result = `[Bản bóc băng tự động cho ${sttFile.name}]\n\nHello, this is Amazon Transcribe converting your spoken audio into clear text. Everything processed securely with AWS Polly Voice backend infrastructure.`
      setSttResultText(result)
      if (userRole === 'user') {
        const now = Date.now()
        setSttHistory((previous) => [
          {
            id: `stt-${now}`,
            file_name: sttFile.name,
            audio_s3_key: `stt/demo-authenticated-user/${sttFile.name}`,
            audio_file_size: sttFile.size,
            result_text: result,
            created_at: now,
          },
          ...previous,
        ])
      }
    }, 2200)
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
              preset,
              language,
              voice,
              speed,
              volume,
              breakTime,
              pitch,
              emphasis,
              domainStyle,
            }}
            presets={PRESETS}
            voices={VOICES}
            userRole={userRole}
            charLimit={charLimit}
            isGenerating={isGenerating}
            currentAudioUrl={currentAudioUrl}
            isPlaying={isPlaying}
            audioDuration={audioDuration}
            audioCurrentTime={audioCurrentTime}
            audioRef={audioRef}
            onTextChange={setText}
            onPresetChange={setPreset}
            onEngineChange={setEngine}
            onLanguageChange={setLanguage}
            onVoiceChange={setVoice}
            onSpeedChange={setSpeed}
            onVolumeChange={setVolume}
            onBreakTimeChange={setBreakTime}
            onPitchChange={setPitch}
            onEmphasisChange={setEmphasis}
            onDomainStyleChange={setDomainStyle}
            onTextFileUpload={handleTextFileUpload}
            onGenerate={handleGenerateTTS}
            onToggleAudio={() => togglePlayAudio()}
            onOpenAuth={() => setShowAuthModal(true)}
            formatTime={formatTime}
          />
        )}
        {activeTab === 'stt' && (
          <SttPanel
            state={{
              file: sttFile,
              isTranscribing,
              progress: transcribeProgress,
              resultText: sttResultText,
            }}
            onFileUpload={handleSttFileUpload}
            onTranscribe={handleTranscribe}
          />
        )}
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
        {activeTab === 'profile' && userRole === 'user' && (
          <ProfilePanel subject={user?.subject} userEmail={userEmail} />
        )}
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
