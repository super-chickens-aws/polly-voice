import React, { useState, useEffect, useRef } from 'react';
import '../../@theme/styles/index.css';
import {
  createStt,
  createTts,
  deleteSttHistory,
  deleteTtsHistory,
  fetchSttHistory,
  fetchTtsHistory,
  type SttResult,
  type TtsResult
} from '../../shared/services/speech-api.service';
import {
  confirmSignUp,
  currentUser,
  resendConfirmationCode,
  signIn,
  signOut,
  signUp
} from '../../security/cognito-auth.service';
import { formatDuration } from '../../@core/utils/formatters';
import type {
  EngineType,
  SttHistoryItem,
  TabType,
  TtsHistoryItem,
  UserRole
} from '../../shared/models/speech.models';
import {
  POLLY_VOICES,
  STOCKHOLM_PRESET_OVERRIDES,
  VOICE_PRESETS
} from '../../shared/settings/voice.settings';
import { SpeechToTextPage } from '../speech-to-text/SpeechToTextPage';
import { ProfilePage } from '../profile/ProfilePage';
import { HistoryPage } from '../history/HistoryPage';
import { AuthenticatedOnly } from '../../guard/AuthenticatedOnly';

function WorkspacePage() {
  // Navigation & User State
  const [activeTab, setActiveTab] = useState<TabType>('tts');
  const [userRole, setUserRole] = useState<UserRole>('guest');
  const [userEmail, setUserEmail] = useState<string>('');
  const [cognitoSub, setCognitoSub] = useState<string>('');
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'confirm'>('login');
  
  // Auth Form State
  const [authEmailInput, setAuthEmailInput] = useState('');
  const [authPasswordInput, setAuthPasswordInput] = useState('');
  const [authNameInput, setAuthNameInput] = useState('');
  const [authConfirmationCode, setAuthConfirmationCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

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
  const [ttsHistory, setTtsHistory] = useState<TtsHistoryItem[]>([]);
  const [sttHistory, setSttHistory] = useState<SttHistoryItem[]>([]);
  const [historyTab, setHistoryTab] = useState<'tts' | 'stt'>('tts');
  const [searchQuery, setSearchQuery] = useState('');

  // Character limit based on role
  const charLimit = userRole === 'user' ? 3000 : 500;

  // Apply Preset
  useEffect(() => {
    if (preset !== 'none') {
      const p = VOICE_PRESETS.find(item => item.id === preset);
      if (p) {
        const effectivePreset = { ...p, ...STOCKHOLM_PRESET_OVERRIDES[p.id] };
        if (effectivePreset.voice) setVoice(effectivePreset.voice);
        if (effectivePreset.engine) setEngine(effectivePreset.engine);
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

  const mapTtsHistory = (item: TtsResult): TtsHistoryItem => ({
    id: item.id,
    text_content: item.text,
    voice: item.voice,
    engine: item.engine,
    audio_s3_key: item.id,
    audio_url: item.media.downloadUrl,
    audio_file_size: item.media.fileSize,
    created_at: new Date(item.createdAt).getTime()
  });

  const mapSttHistory = (item: SttResult): SttHistoryItem => ({
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
      console.error('Unable to load history', error);
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
    setAuthError('');
    setAuthMessage('');

    if (authMode === 'confirm') {
      if (!authEmailInput || !authConfirmationCode.trim()) {
        setAuthError('Please enter your email and confirmation code.');
        return;
      }
      setIsAuthSubmitting(true);
      try {
        await confirmSignUp(authEmailInput, authConfirmationCode);
        setAuthMode('login');
        setAuthConfirmationCode('');
        setAuthMessage('Email confirmed successfully. You can now sign in.');
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : 'Unable to confirm the account.');
      } finally {
        setIsAuthSubmitting(false);
      }
      return;
    }

    if (!authEmailInput || !authPasswordInput) {
      setAuthError('Please enter both email and password.');
      return;
    }
    if (authPasswordInput.length < 8) {
      setAuthError('Password must contain at least 8 characters.');
      return;
    }

    setIsAuthSubmitting(true);
    try {
      if (authMode === 'register') {
        const result = await signUp(authNameInput, authEmailInput, authPasswordInput);
        if (result === 'confirmation-required') {
          setAuthMode('confirm');
          setAuthMessage(`A confirmation code was sent to ${authEmailInput}.`);
          return;
        }
      }
      const session = await signIn(authEmailInput, authPasswordInput);
      setUserRole('user');
      setUserEmail(session.email);
      setCognitoSub(session.id);
      setShowAuthModal(false);
      setAuthError('');
      await loadHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      if (message.toLowerCase().includes('not confirmed')) {
        setAuthMode('confirm');
        setAuthMessage('Your account is not confirmed. Enter the code from your email or request a new code.');
      } else {
        setAuthError(message);
      }
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleResendConfirmationCode = async () => {
    if (!authEmailInput) {
      setAuthError('Please enter your email.');
      return;
    }
    setIsAuthSubmitting(true);
    setAuthError('');
    setAuthMessage('');
    try {
      await resendConfirmationCode(authEmailInput);
      setAuthMessage(`A new confirmation code was sent to ${authEmailInput}.`);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to resend the confirmation code.');
    } finally {
      setIsAuthSubmitting(false);
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
        alert('Only .txt files are supported.');
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
      alert('Please enter the text you want to convert.');
      return;
    }
    if (text.length > charLimit) {
      alert(`You exceeded the ${charLimit}-character limit for the ${userRole.toUpperCase()} account.`);
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
      alert(error instanceof Error ? error.message : 'Unable to generate audio.');
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
      if (file.size > 2 * 1024 * 1024 * 1024) {
        alert('The file exceeds the 2 GB Amazon Transcribe batch limit.');
        return;
      }
      setSttFile(file);
      setSttResultText('');
    }
  };

  const handleTranscribe = async () => {
    if (!sttFile) {
      alert('Please select an audio file.');
      return;
    }

    setIsTranscribing(true);
    setTranscribeProgress(1);
    try {
      const result = await createStt(sttFile, setTranscribeProgress);
      setTranscribeProgress(100);
      setIsTranscribing(false);
      setSttResultText(result.resultText || 'The job is processing. Check its status in History.');
      if (userRole === 'user') {
        setSttHistory((previous) => [mapSttHistory(result), ...previous]);
      }
    } catch (error) {
      setIsTranscribing(false);
      alert(error instanceof Error ? error.message : 'Unable to process the audio file.');
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
              📜 History ({ttsHistory.length + sttHistory.length})
            </button>
          )}
        </nav>

        <div className="auth-header-action">
          {userRole === 'guest' ? (
            <div className="guest-badge-group">
              <span className="badge badge-guest">⚡ Guest Mode</span>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowAuthModal(true); setAuthMode('login'); }}>
                🔑 Sign In
              </button>
            </div>
          ) : (
            <div className="user-profile-badge">
              <span className="badge badge-user">👤 {userEmail.split('@')[0]}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('profile')}>
                ⚙️ Profile
              </button>
              <button className="btn btn-danger-link btn-sm" onClick={handleLogout}>
                Sign Out
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
                <h2>Input Text</h2>
                <label className="file-upload-btn">
                  📁 Upload File .txt
                  <input type="file" accept=".txt" onChange={handleTextFileUpload} hidden />
                </label>
              </div>

              <div className="form-group">
                <textarea
                  placeholder="Enter the English text you want to synthesize..."
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
                  <span>{text.length} / {charLimit} characters ({userRole.toUpperCase()})</span>
                </div>
              </div>

              {userRole === 'guest' && (
                <div className="notice-banner">
                  💡 You are using <strong>Guest</strong> mode (500-character limit and no saved history). <span className="link-span" onClick={() => setShowAuthModal(true)}>Sign in with Cognito</span> to unlock 3,000 characters.
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div className="action-button-row">
                <button 
                  className="btn btn-secondary"
                  disabled={isGenerating || !text.trim()}
                  onClick={() => handleGenerateTTS(true)}
                >
                  ▶ Preview
                </button>
                <button 
                  className="btn btn-primary"
                  disabled={isGenerating || !text.trim()}
                  onClick={() => handleGenerateTTS(false)}
                >
                  {isGenerating ? '⏳ Generating speech...' : '✨ Generate MP3'}
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
                        {formatDuration(audioCurrentTime)} / {formatDuration(audioDuration)}
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
              <h2>Voice Configuration</h2>

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
                <label>Voice Preset</label>
                <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                  {VOICE_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — {p.desc}</option>
                  ))}
                </select>
              </div>

              {/* Language & Voice */}
              <div className="form-row form-group">
                <div>
                  <label>Language</label>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="en-US">English (US)</option>
                    <option value="en-GB">English (UK)</option>
                  </select>
                </div>
                <div>
                  <label>Voice</label>
                  <select value={voice} onChange={(e) => setVoice(e.target.value)}>
                    {POLLY_VOICES.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Speed & Volume */}
              <div className="form-group slider-container">
                <div className="slider-header">
                  <label>Speech Rate</label>
                  <span className="slider-value">{speed}%</span>
                </div>
                <input 
                  type="range" min="20" max="200" step="5" 
                  value={speed} onChange={(e) => setSpeed(Number(e.target.value))} 
                />
              </div>

              <div className="form-group slider-container">
                <div className="slider-header">
                  <label>Volume</label>
                  <span className="slider-value">{volume > 0 ? `+${volume}` : volume} dB</span>
                </div>
                <input 
                  type="range" min="-10" max="10" step="1" 
                  value={volume} onChange={(e) => setVolume(Number(e.target.value))} 
                />
              </div>

              <div className="form-group slider-container">
                <div className="slider-header">
                  <label>Break Time</label>
                  <span className="slider-value">{breakTime} ms</span>
                </div>
                <input 
                  type="range" min="0" max="2000" step="100" 
                  value={breakTime} onChange={(e) => setBreakTime(Number(e.target.value))} 
                />
              </div>

              <hr className="divider" />
              <h3>Advanced SSML Settings</h3>

              {/* Standard Engine Options */}
              <div className={`form-group slider-container ${engine !== 'standard' ? 'disabled-option' : ''}`}>
                <div className="slider-header">
                  <label>Pitch</label>
                  <span className="slider-value">{pitch > 0 ? `+${pitch}` : pitch}%</span>
                </div>
                <input 
                  type="range" min="-20" max="20" step="1" 
                  value={pitch} onChange={(e) => setPitch(Number(e.target.value))} 
                  disabled={engine !== 'standard'}
                />
                {engine !== 'standard' && <span className="helper-text">⚠️ Supported by the Standard engine only</span>}
              </div>

              <div className={`form-group ${engine !== 'standard' ? 'disabled-option' : ''}`}>
                <label>Emphasis</label>
                <select 
                  value={emphasis} onChange={(e) => setEmphasis(e.target.value)}
                  disabled={engine !== 'standard'}
                >
                  <option value="none">None</option>
                  <option value="reduced">Reduced</option>
                  <option value="moderate">Moderate</option>
                  <option value="strong">Strong</option>
                </select>
              </div>

              {/* Neural Engine Option */}
              <div className={`form-group ${engine !== 'neural' ? 'disabled-option' : ''}`}>
                <label>Domain Style</label>
                <select 
                  value={domainStyle} onChange={(e) => setDomainStyle(e.target.value)}
                  disabled={engine !== 'neural'}
                >
                  <option value="none">Default</option>
                  <option value="news">News</option>
                  <option value="conversational">Conversational</option>
                </select>
                {engine !== 'neural' && <span className="helper-text">⚠️ Supported by the Neural engine only</span>}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: SPEECH-TO-TEXT (STT) ================= */}
        {activeTab === 'stt' && (
          <SpeechToTextPage
            file={sttFile}
            isTranscribing={isTranscribing}
            progress={transcribeProgress}
            resultText={sttResultText}
            onFileChange={handleSttFileUpload}
            onTranscribe={handleTranscribe}
          />
        )}

        {/* ================= TAB 3: HISTORY (USER ONLY) ================= */}
        {activeTab === 'history' && userRole === 'user' && (
          <HistoryPage
            activeType={historyTab}
            query={searchQuery}
            ttsItems={ttsHistory}
            sttItems={sttHistory}
            onTypeChange={setHistoryTab}
            onQueryChange={setSearchQuery}
            onPlay={togglePlayAudio}
            onDeleteTts={handleDeleteTtsHistory}
            onDeleteStt={handleDeleteSttHistory}
          />
        )}

        {/* ================= TAB 4: PROFILE ================= */}
        {activeTab === 'profile' && (
          <AuthenticatedOnly authenticated={userRole === 'user'}>
            <ProfilePage cognitoSub={cognitoSub} email={userEmail} />
          </AuthenticatedOnly>
        )}

      </main>

      {/* ================= COGNITO AUTH MODAL ================= */}
      {showAuthModal && (
        <div className="modal-backdrop">
          <div className="modal-content glass-panel">
            <button className="modal-close" onClick={() => setShowAuthModal(false)}>✕</button>
            <h2>
              {authMode === 'login' && '🔑 Sign In with Amazon Cognito'}
              {authMode === 'register' && '📝 Create an Account'}
              {authMode === 'confirm' && '✉️ Confirm Your Email'}
            </h2>
            
            {authError && <div className="auth-error">{authError}</div>}
            {authMessage && <div className="auth-message">{authMessage}</div>}

            <form onSubmit={handleAuthSubmit}>
              {authMode === 'register' && (
                <div className="form-group">
                  <label>Full name</label>
                  <input 
                    type="text" 
                    placeholder="Enter your full name"
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

              {authMode === 'confirm' ? (
                <div className="form-group">
                  <label>Confirmation code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Enter the code from your email"
                    value={authConfirmationCode}
                    onChange={e => setAuthConfirmationCode(e.target.value)}
                    required
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label>Password (at least 8 characters)</label>
                  <input 
                    type="password" 
                    placeholder="••••••••" 
                    value={authPasswordInput} 
                    onChange={e => setAuthPasswordInput(e.target.value)} 
                    required 
                  />
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={isAuthSubmitting}>
                {isAuthSubmitting
                  ? 'Processing...'
                  : authMode === 'login'
                    ? 'Sign In'
                    : authMode === 'register'
                      ? 'Create Account'
                      : 'Confirm Account'}
              </button>
            </form>

            <div className="modal-footer">
              {authMode === 'login' ? (
                <span>New here? <span className="link-span" onClick={() => { setAuthMode('register'); setAuthError(''); setAuthMessage(''); }}>Create an account</span></span>
              ) : authMode === 'register' ? (
                <span>Already have an account? <span className="link-span" onClick={() => { setAuthMode('login'); setAuthError(''); setAuthMessage(''); }}>Sign in</span></span>
              ) : (
                <div className="confirmation-actions">
                  <button type="button" className="link-button" disabled={isAuthSubmitting} onClick={handleResendConfirmationCode}>
                    Resend code
                  </button>
                  <span>·</span>
                  <button type="button" className="link-button" onClick={() => { setAuthMode('login'); setAuthError(''); setAuthMessage(''); }}>
                    Back to sign in
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkspacePage;
