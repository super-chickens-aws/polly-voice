import React, { useState, useEffect, useRef } from 'react';
import './index.css';
import {
  createStt,
  createTts,
  deleteSttHistory,
  deleteTtsHistory,
  fetchSttHistory,
  fetchTtsHistory,
  type SttResult,
  type TtsResult
} from './api';
import { currentUser, signIn, signOut, signUp } from './auth';

// Types
type EngineType = 'neural' | 'standard' | 'long-form';
type TabType = 'tts' | 'stt' | 'history' | 'profile';
type UserRole = 'guest' | 'user';

interface TTSHistoryItem {
  id: string;
  text_content: string;
  voice: string;
  engine: EngineType;
  audio_s3_key: string;
  audio_url: string; // Blob or Pre-Signed URL for playback
  audio_file_size: number;
  created_at: number; // Epoch timestamp
}

interface STTHistoryItem {
  id: string;
  file_name: string;
  audio_s3_key: string;
  audio_file_size: number;
  result_text: string;
  created_at: number; // Epoch timestamp
}

function App() {
  // Navigation & User State
  const [activeTab, setActiveTab] = useState<TabType>('tts');
  const [userRole, setUserRole] = useState<UserRole>('guest');
  const [userEmail, setUserEmail] = useState<string>('');
  const [cognitoSub, setCognitoSub] = useState<string>('');
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  // Auth Form State
  const [authEmailInput, setAuthEmailInput] = useState('');
  const [authPasswordInput, setAuthPasswordInput] = useState('');
  const [authNameInput, setAuthNameInput] = useState('');
  const [authError, setAuthError] = useState('');

  // TTS State
  const [engine, setEngine] = useState<EngineType>('neural');
  const [text, setText] = useState('');
  const [preset, setPreset] = useState('none');
  const [language, setLanguage] = useState('en-US');
  const [voice, setVoice] = useState('Joanna');
  const [speed, setSpeed] = useState(100); // 20% - 200%
  const [volume, setVolume] = useState(0); // -10dB to +10dB
  const [breakTime, setBreakTime] = useState(0); // 0 - 2000ms
  const [pitch, setPitch] = useState(0); // -20% to +20% (Standard only)
  const [emphasis, setEmphasis] = useState('none'); // (Standard only)
  const [domainStyle, setDomainStyle] = useState('none'); // (Neural only)

  // TTS Processing & Player
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // STT State
  const [sttFile, setSttFile] = useState<File | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [sttResultText, setSttResultText] = useState('');

  // History State
  const [ttsHistory, setTtsHistory] = useState<TTSHistoryItem[]>([]);
  const [sttHistory, setSttHistory] = useState<STTHistoryItem[]>([]);
  const [historyTab, setHistoryTab] = useState<'tts' | 'stt'>('tts');
  const [searchQuery, setSearchQuery] = useState('');

  // Character limit based on role
  const charLimit = userRole === 'user' ? 3000 : 500;

  interface PresetItem {
    id: string;
    name: string;
    desc: string;
    voice?: string;
    engine?: EngineType;
    domain?: string;
  }

  // Presets definition
  const presets: PresetItem[] = [
    { id: 'none', name: 'Custom (No Preset)', desc: 'Tự điều chỉnh các thông số' },
    { id: 'deep_male', name: 'Deep Male', voice: 'Matthew', engine: 'neural', desc: 'Giọng nam trầm, uy quyền' },
    { id: 'young_male', name: 'Young Male', voice: 'Kevin', engine: 'neural', desc: 'Giọng nam trẻ, năng động' },
    { id: 'soft_female', name: 'Soft Female', voice: 'Joanna', engine: 'neural', desc: 'Giọng nữ nhẹ nhàng' },
    { id: 'expressive_female', name: 'Expressive Female', voice: 'Danielle', engine: 'long-form', desc: 'Giọng nữ biểu cảm, đọc truyện' },
    { id: 'mc', name: 'MC', voice: 'Stephen', engine: 'neural', desc: 'Giọng MC rõ ràng, dẫn chương trình' },
    { id: 'podcast', name: 'Podcast', voice: 'Matthew', engine: 'neural', domain: 'conversational', desc: 'Giọng Podcast tự nhiên' },
    { id: 'audiobook', name: 'Audiobook', voice: 'Joanna', engine: 'long-form', desc: 'Giọng đọc sách nhịp chậm' }
  ];

  const voices = ['Joanna', 'Matthew', 'Kevin', 'Danielle', 'Stephen', 'Amy', 'Emma', 'Brian'];

  // Apply Preset
  useEffect(() => {
    if (preset !== 'none') {
      const p = presets.find(item => item.id === preset);
      if (p) {
        if (p.voice) setVoice(p.voice);
        if (p.engine) setEngine(p.engine);
        if (p.domain) {
          setDomainStyle(p.domain);
        } else {
          setDomainStyle('none');
        }
      }
    }
  }, [preset]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setAudioCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setAudioDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [currentAudioUrl]);

  const mapTtsHistory = (item: TtsResult): TTSHistoryItem => ({
    id: item.id,
    text_content: item.text,
    voice: item.voice,
    engine: item.engine,
    audio_s3_key: item.id,
    audio_url: item.media.downloadUrl,
    audio_file_size: item.media.fileSize,
    created_at: new Date(item.createdAt).getTime()
  });

  const mapSttHistory = (item: SttResult): STTHistoryItem => ({
    id: item.id,
    file_name: item.fileName,
    audio_s3_key: item.id,
    audio_file_size: item.audioFileSize,
    result_text: item.resultText,
    created_at: new Date(item.createdAt).getTime()
  });

  const loadHistory = async () => {
    try {
      const [ttsItems, sttItems] = await Promise.all([fetchTtsHistory(), fetchSttHistory()]);
      setTtsHistory(ttsItems.map(mapTtsHistory));
      setSttHistory(sttItems.map(mapSttHistory));
    } catch (error) {
      console.error('Không thể tải lịch sử', error);
    }
  };

  useEffect(() => {
    const session = currentUser();
    if (session) {
      setUserRole('user');
      setUserEmail(session.email);
      setCognitoSub(session.id);
      void loadHistory();
    }
  }, []);

  // Handle Login / Register with Cognito (or local mode)
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmailInput || !authPasswordInput) {
      setAuthError('Vui lòng nhập đầy đủ Email và Mật khẩu');
      return;
    }
    if (authPasswordInput.length < 8) {
      setAuthError('Mật khẩu tối thiểu 8 ký tự');
      return;
    }

    try {
      if (authMode === 'register') {
        await signUp(authNameInput, authEmailInput, authPasswordInput);
      }
      const session = await signIn(authEmailInput, authPasswordInput);
      setUserRole('user');
      setUserEmail(session.email);
      setCognitoSub(session.id);
      setShowAuthModal(false);
      setAuthError('');
      await loadHistory();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Không thể đăng nhập.');
    }
  };

  const handleLogout = () => {
    signOut();
    setUserRole('guest');
    setUserEmail('');
    setCognitoSub('');
    if (activeTab === 'profile') setActiveTab('tts');
  };

  // Text File Upload handler
  const handleTextFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.txt')) {
        alert('Chỉ hỗ trợ file .txt');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setText(content.slice(0, charLimit));
      };
      reader.readAsText(file);
    }
  };

  // Generate TTS
  const handleGenerateTTS = async (isPreview: boolean = false) => {
    if (!text.trim()) {
      alert('Vui lòng nhập văn bản cần chuyển đổi!');
      return;
    }
    if (text.length > charLimit) {
      alert(`Đã vượt quá giới hạn ${charLimit} ký tự của tài khoản ${userRole.toUpperCase()}`);
      return;
    }

    setIsGenerating(true);
    setIsPlaying(false);

    try {
      const result = await createTts({
        text,
        language,
        voice,
        engine,
        outputFormat: 'mp3',
        preset,
        settings: { speed, volume, breakTimeMs: breakTime, pitch, emphasis, domainStyle }
      }, isPreview);
      setCurrentAudioUrl(result.media.downloadUrl);
      setIsGenerating(false);
      if (userRole === 'user' && !isPreview) {
        setTtsHistory((previous) => [mapTtsHistory(result), ...previous]);
      }
    } catch (error) {
      setIsGenerating(false);
      alert(error instanceof Error ? error.message : 'Không thể tạo audio.');
    }
  };

  // Toggle Audio Playback
  const togglePlayAudio = (url?: string) => {
    if (url && url !== currentAudioUrl) {
      setCurrentAudioUrl(url);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play();
          setIsPlaying(true);
        }
      }, 100);
      return;
    }

    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Speech-to-Text Upload & Processing
  const handleSttFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File vượt quá dung lượng tối đa 10MB');
        return;
      }
      setSttFile(file);
      setSttResultText('');
    }
  };

  const handleTranscribe = async () => {
    if (!sttFile) {
      alert('Vui lòng chọn file âm thanh!');
      return;
    }

    setIsTranscribing(true);
    setTranscribeProgress(30);
    try {
      const result = await createStt(sttFile);
      setTranscribeProgress(100);
      setIsTranscribing(false);
      setSttResultText(result.resultText || 'Job đang xử lý. Xem trạng thái trong lịch sử.');
      if (userRole === 'user') {
        setSttHistory((previous) => [mapSttHistory(result), ...previous]);
      }
    } catch (error) {
      setIsTranscribing(false);
      alert(error instanceof Error ? error.message : 'Không thể xử lý audio.');
    }
  };

  // Delete History Item
  const handleDeleteTtsHistory = async (id: string) => {
    await deleteTtsHistory(id);
    setTtsHistory((previous) => previous.filter((item) => item.id !== id));
  };
  const handleDeleteSttHistory = async (id: string) => {
    await deleteSttHistory(id);
    setSttHistory((previous) => previous.filter((item) => item.id !== id));
  };

  // Format Helper
  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatDate = (epoch: number) => {
    return new Date(epoch).toLocaleString('vi-VN');
  };

  return (
    <div className="app-container">
      {/* Hidden Audio Element */}
      {currentAudioUrl && (
        <audio ref={audioRef} src={currentAudioUrl} preload="metadata" />
      )}

      {/* HEADER & NAVIGATION */}
      <header className="app-header">
        <div className="logo-group">
          <div className="logo-icon">🎙️</div>
          <div>
            <h1 className="logo-title">Polly Voice</h1>
            <span className="logo-subtitle">AWS Serverless Text-to-Speech & Speech-to-Text</span>
          </div>
        </div>

        <nav className="nav-tabs">
          <button 
            className={`nav-btn ${activeTab === 'tts' ? 'active' : ''}`}
            onClick={() => setActiveTab('tts')}
          >
            🗣️ Text-to-Speech
          </button>
          <button 
            className={`nav-btn ${activeTab === 'stt' ? 'active' : ''}`}
            onClick={() => setActiveTab('stt')}
          >
            🎙️ Speech-to-Text
          </button>
          {userRole === 'user' && (
            <button 
              className={`nav-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              📜 Lịch Sử ({ttsHistory.length + sttHistory.length})
            </button>
          )}
        </nav>

        <div className="auth-header-action">
          {userRole === 'guest' ? (
            <div className="guest-badge-group">
              <span className="badge badge-guest">⚡ Guest Mode</span>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowAuthModal(true); setAuthMode('login'); }}>
                🔑 Đăng Nhập
              </button>
            </div>
          ) : (
            <div className="user-profile-badge">
              <span className="badge badge-user">👤 {userEmail.split('@')[0]}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('profile')}>
                ⚙️ Profile
              </button>
              <button className="btn btn-danger-link btn-sm" onClick={handleLogout}>
                Đăng Xuất
              </button>
            </div>
          )}
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="main-content-layout">
        
        {/* ================= TAB 1: TEXT-TO-SPEECH (TTS) ================= */}
        {activeTab === 'tts' && (
          <div className="tts-grid">
            {/* Left Box: Text Input & Audio Player */}
            <div className="glass-panel input-panel">
              <div className="panel-header">
                <h2>Văn Bản Đầu Vào</h2>
                <label className="file-upload-btn">
                  📁 Upload File .txt
                  <input type="file" accept=".txt" onChange={handleTextFileUpload} hidden />
                </label>
              </div>

              <div className="form-group">
                <textarea
                  placeholder="Nhập nội dung tiếng Anh cần đọc tại đây..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={charLimit}
                />
                <div className="char-count-bar">
                  <div className="progress-bg">
                    <div 
                      className={`progress-fill ${text.length > charLimit * 0.9 ? 'warning' : ''}`}
                      style={{ width: `${Math.min(100, (text.length / charLimit) * 100)}%` }}
                    />
                  </div>
                  <span>{text.length} / {charLimit} ký tự ({userRole.toUpperCase()})</span>
                </div>
              </div>

              {userRole === 'guest' && (
                <div className="notice-banner">
                  💡 Bạn đang ở chế độ <strong>Guest</strong> (giới hạn 500 ký tự & không lưu lịch sử). <span className="link-span" onClick={() => setShowAuthModal(true)}>Đăng nhập Cognito</span> để mở khóa 3,000 ký tự.
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div className="action-button-row">
                <button 
                  className="btn btn-secondary"
                  disabled={isGenerating || !text.trim()}
                  onClick={() => handleGenerateTTS(true)}
                >
                  ▶ Nghe Thử Preview
                </button>
                <button 
                  className="btn btn-primary"
                  disabled={isGenerating || !text.trim()}
                  onClick={() => handleGenerateTTS(false)}
                >
                  {isGenerating ? '⏳ Đang tổng hợp giọng đọc...' : '✨ Tạo Audio MP3'}
                </button>
              </div>

              {/* AUDIO PLAYER WAVEFORM PANEL */}
              {currentAudioUrl && (
                <div className="player-card glass-subpanel">
                  <div className="player-controls">
                    <button className="play-circle-btn" onClick={() => togglePlayAudio()}>
                      {isPlaying ? '⏸' : '▶'}
                    </button>
                    <div className="player-info">
                      <div className="sound-wave-anim">
                        <span className={`bar ${isPlaying ? 'playing' : ''}`}></span>
                        <span className={`bar ${isPlaying ? 'playing' : ''}`}></span>
                        <span className={`bar ${isPlaying ? 'playing' : ''}`}></span>
                        <span className={`bar ${isPlaying ? 'playing' : ''}`}></span>
                      </div>
                      <div className="time-display">
                        {formatTime(audioCurrentTime)} / {formatTime(audioDuration)}
                      </div>
                    </div>
                    <a 
                      href={currentAudioUrl} 
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
                    max={audioDuration || 100} 
                    value={audioCurrentTime} 
                    onChange={(e) => {
                      if (audioRef.current) {
                        audioRef.current.currentTime = Number(e.target.value);
                      }
                    }}
                  />
                </div>
              )}
            </div>

            {/* Right Box: Settings */}
            <div className="glass-panel settings-panel">
              <h2>Cấu Hình Giọng Đọc</h2>

              {/* Engine Tabs */}
              <div className="form-group">
                <label>Voice Engine (Polly)</label>
                <div className="engine-selector">
                  <button 
                    className={`engine-tab ${engine === 'neural' ? 'active' : ''}`}
                    onClick={() => setEngine('neural')}
                  >
                    Neural ⚡
                  </button>
                  <button 
                    className={`engine-tab ${engine === 'standard' ? 'active' : ''}`}
                    onClick={() => setEngine('standard')}
                  >
                    Standard
                  </button>
                  <button 
                    className={`engine-tab ${engine === 'long-form' ? 'active' : ''}`}
                    onClick={() => setEngine('long-form')}
                  >
                    Long-form
                  </button>
                </div>
              </div>

              {/* Preset Selector */}
              <div className="form-group">
                <label>Cấu hình có sẵn (Preset)</label>
                <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                  {presets.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — {p.desc}</option>
                  ))}
                </select>
              </div>

              {/* Language & Voice */}
              <div className="form-row form-group">
                <div>
                  <label>Ngôn ngữ</label>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="en-US">English (US)</option>
                    <option value="en-GB">English (UK)</option>
                  </select>
                </div>
                <div>
                  <label>Giọng đọc (Voice)</label>
                  <select value={voice} onChange={(e) => setVoice(e.target.value)}>
                    {voices.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Speed & Volume */}
              <div className="form-group slider-container">
                <div className="slider-header">
                  <label>Tốc độ đọc (Speed Rate)</label>
                  <span className="slider-value">{speed}%</span>
                </div>
                <input 
                  type="range" min="20" max="200" step="5" 
                  value={speed} onChange={(e) => setSpeed(Number(e.target.value))} 
                />
              </div>

              <div className="form-group slider-container">
                <div className="slider-header">
                  <label>Âm lượng (Volume)</label>
                  <span className="slider-value">{volume > 0 ? `+${volume}` : volume} dB</span>
                </div>
                <input 
                  type="range" min="-10" max="10" step="1" 
                  value={volume} onChange={(e) => setVolume(Number(e.target.value))} 
                />
              </div>

              <div className="form-group slider-container">
                <div className="slider-header">
                  <label>Tạm dừng (Break Time)</label>
                  <span className="slider-value">{breakTime} ms</span>
                </div>
                <input 
                  type="range" min="0" max="2000" step="100" 
                  value={breakTime} onChange={(e) => setBreakTime(Number(e.target.value))} 
                />
              </div>

              <hr className="divider" />
              <h3>Thông Số SSML Nâng Cao</h3>

              {/* Standard Engine Options */}
              <div className={`form-group slider-container ${engine !== 'standard' ? 'disabled-option' : ''}`}>
                <div className="slider-header">
                  <label>Cao độ giọng (Pitch)</label>
                  <span className="slider-value">{pitch > 0 ? `+${pitch}` : pitch}%</span>
                </div>
                <input 
                  type="range" min="-20" max="20" step="1" 
                  value={pitch} onChange={(e) => setPitch(Number(e.target.value))} 
                  disabled={engine !== 'standard'}
                />
                {engine !== 'standard' && <span className="helper-text">⚠️ Chỉ hỗ trợ cho Standard Engine</span>}
              </div>

              <div className={`form-group ${engine !== 'standard' ? 'disabled-option' : ''}`}>
                <label>Nhấn mạnh (Emphasis)</label>
                <select 
                  value={emphasis} onChange={(e) => setEmphasis(e.target.value)}
                  disabled={engine !== 'standard'}
                >
                  <option value="none">Không nhấn mạnh</option>
                  <option value="reduced">Giảm nhẹ (Reduced)</option>
                  <option value="moderate">Vừa phải (Moderate)</option>
                  <option value="strong">Mạnh mẽ (Strong)</option>
                </select>
              </div>

              {/* Neural Engine Option */}
              <div className={`form-group ${engine !== 'neural' ? 'disabled-option' : ''}`}>
                <label>Phong cách đọc (Domain Style)</label>
                <select 
                  value={domainStyle} onChange={(e) => setDomainStyle(e.target.value)}
                  disabled={engine !== 'neural'}
                >
                  <option value="none">Mặc định (Default)</option>
                  <option value="news">Đọc tin tức (News)</option>
                  <option value="conversational">Trò chuyện (Conversational)</option>
                </select>
                {engine !== 'neural' && <span className="helper-text">⚠️ Chỉ hỗ trợ cho Neural Engine</span>}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: SPEECH-TO-TEXT (STT) ================= */}
        {activeTab === 'stt' && (
          <div className="stt-container glass-panel">
            <h2>Chuyển Đổi Giọng Nói Thành Văn Bản (Speech-to-Text)</h2>
            <p className="subtitle">Hỗ trợ các định dạng âm thanh .mp3, .wav, .m4a, .flac (Max 10MB)</p>

            <div className="stt-upload-box">
              <label className="dropzone">
                <span className="drop-icon">🎧</span>
                <span>{sttFile ? `Đã chọn: ${sttFile.name} (${(sttFile.size / 1024 / 1024).toFixed(2)} MB)` : 'Kéo thả file audio vào đây hoặc click để chọn'}</span>
                <input type="file" accept=".mp3,.wav,.m4a,.flac" onChange={handleSttFileUpload} hidden />
              </label>

              <button 
                className="btn btn-primary btn-lg"
                disabled={!sttFile || isTranscribing}
                onClick={handleTranscribe}
              >
                {isTranscribing ? `⏳ Đang bóc băng (${transcribeProgress}%)...` : '🎙️ Bắt Đầu Nhận Dạng Văn Bản'}
              </button>
            </div>

            {isTranscribing && (
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${transcribeProgress}%` }} />
              </div>
            )}

            {sttResultText && (
              <div className="stt-result-card glass-subpanel">
                <div className="result-header">
                  <h3>Kết Quả Bóc Băng</h3>
                  <div className="result-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(sttResultText)}>
                      📋 Copy Text
                    </button>
                    <a 
                      href={`data:text/plain;charset=utf-8,${encodeURIComponent(sttResultText)}`} 
                      download="transcribe_result.txt"
                      className="btn btn-secondary btn-sm"
                    >
                      💾 Tải File .txt
                    </a>
                  </div>
                </div>
                <textarea className="result-textarea" readOnly value={sttResultText} />
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: HISTORY (USER ONLY) ================= */}
        {activeTab === 'history' && userRole === 'user' && (
          <div className="history-container glass-panel">
            <div className="history-header">
              <h2>Lịch Sử Chuyển Đổi (MongoDB)</h2>
              <div className="history-tab-buttons">
                <button 
                  className={`subtab-btn ${historyTab === 'tts' ? 'active' : ''}`}
                  onClick={() => setHistoryTab('tts')}
                >
                  🗣️ Lịch Sử TTS ({ttsHistory.length})
                </button>
                <button 
                  className={`subtab-btn ${historyTab === 'stt' ? 'active' : ''}`}
                  onClick={() => setHistoryTab('stt')}
                >
                  🎙️ Lịch Sử STT ({sttHistory.length})
                </button>
              </div>
            </div>

            <div className="search-bar-row">
              <input 
                type="text" 
                placeholder="🔍 Tìm kiếm nội dung..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {historyTab === 'tts' && (
              <div className="history-list">
                {ttsHistory.length === 0 ? (
                  <p className="empty-text">Chưa có lịch sử TTS nào được lưu.</p>
                ) : (
                  ttsHistory
                    .filter(item => item.text_content.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(item => (
                      <div key={item.id} className="history-card glass-subpanel">
                        <div className="card-top">
                          <span className="badge badge-tag">{item.voice} ({item.engine})</span>
                          <span className="timestamp">🕒 {formatDate(item.created_at)}</span>
                        </div>
                        <p className="card-text">{item.text_content}</p>
                        <div className="card-bottom">
                          <span className="s3-key">📦 S3 Key: <code>{item.audio_s3_key}</code></span>
                          <div className="card-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => togglePlayAudio(item.audio_url)}>
                              ▶ Play Audio
                            </button>
                            <button className="btn btn-danger-link btn-sm" onClick={() => handleDeleteTtsHistory(item.id)}>
                              🗑️ Soft Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}

            {historyTab === 'stt' && (
              <div className="history-list">
                {sttHistory.length === 0 ? (
                  <p className="empty-text">Chưa có lịch sử STT nào được lưu.</p>
                ) : (
                  sttHistory
                    .filter(item => item.result_text.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(item => (
                      <div key={item.id} className="history-card glass-subpanel">
                        <div className="card-top">
                          <span className="badge badge-tag">📁 {item.file_name}</span>
                          <span className="timestamp">🕒 {formatDate(item.created_at)}</span>
                        </div>
                        <p className="card-text">{item.result_text}</p>
                        <div className="card-bottom">
                          <span className="s3-key">📦 S3 Key: <code>{item.audio_s3_key}</code></span>
                          <div className="card-actions">
                            <button className="btn btn-danger-link btn-sm" onClick={() => handleDeleteSttHistory(item.id)}>
                              🗑️ Soft Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: PROFILE ================= */}
        {activeTab === 'profile' && userRole === 'user' && (
          <div className="profile-container glass-panel">
            <h2>Thông Tin Tài Khoản Cognito</h2>
            <div className="profile-card">
              <div className="profile-row">
                <span className="label">Cognito Sub ID (PK):</span>
                <code>{cognitoSub}</code>
              </div>
              <div className="profile-row">
                <span className="label">Email:</span>
                <span>{userEmail}</span>
              </div>
              <div className="profile-row">
                <span className="label">Vai trò (Role):</span>
                <span className="badge badge-user">Authenticated User</span>
              </div>
              <div className="profile-row">
                <span className="label">Giới hạn ký tự TTS:</span>
                <span>3,000 ký tự / lượt</span>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ================= COGNITO AUTH MODAL ================= */}
      {showAuthModal && (
        <div className="modal-backdrop">
          <div className="modal-content glass-panel">
            <button className="modal-close" onClick={() => setShowAuthModal(false)}>✕</button>
            <h2>{authMode === 'login' ? '🔑 Đăng Nhập Amazon Cognito' : '📝 Đăng Ký Tài Khoản'}</h2>
            
            {authError && <div className="auth-error">{authError}</div>}

            <form onSubmit={handleAuthSubmit}>
              {authMode === 'register' && (
                <div className="form-group">
                  <label>Họ và tên</label>
                  <input 
                    type="text" 
                    placeholder="Nhập họ và tên" 
                    value={authNameInput} 
                    onChange={e => setAuthNameInput(e.target.value)} 
                  />
                </div>
              )}
              <div className="form-group">
                <label>Email</label>
                <input 
                  type="email" 
                  placeholder="name@example.com" 
                  value={authEmailInput} 
                  onChange={e => setAuthEmailInput(e.target.value)} 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Mật khẩu (Tối thiểu 8 ký tự)</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={authPasswordInput} 
                  onChange={e => setAuthPasswordInput(e.target.value)} 
                  required 
                />
              </div>

              <button type="submit" className="btn btn-primary">
                {authMode === 'login' ? 'Đăng Nhập' : 'Tạo Tài Khoản'}
              </button>
            </form>

            <div className="modal-footer">
              {authMode === 'login' ? (
                <span>Chưa có tài khoản? <span className="link-span" onClick={() => setAuthMode('register')}>Đăng ký ngay</span></span>
              ) : (
                <span>Đã có tài khoản? <span className="link-span" onClick={() => setAuthMode('login')}>Đăng nhập</span></span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
