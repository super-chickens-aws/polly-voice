import { useState, useEffect } from 'react';
import './index.css';

function App() {
  const [engine, setEngine] = useState<'neural' | 'standard' | 'long-form'>('neural');
  const [text, setText] = useState('');
  
  // Settings State
  const [preset, setPreset] = useState('none');
  const [language, setLanguage] = useState('en-US');
  const [voice, setVoice] = useState('Joanna');
  
  // Sliders
  const [speed, setSpeed] = useState(100); // 20 - 200%
  const [volume, setVolume] = useState(0); // -6 to +6 dB
  const [breakTime, setBreakTime] = useState(0); // 0 - 5000ms
  
  // Conditional Settings
  const [pitch, setPitch] = useState(0); // -20 to +20 %
  const [emphasis, setEmphasis] = useState('none');
  const [domainStyle, setDomainStyle] = useState('none');

  // Presets configuration
  const presets = [
    { id: 'none', name: 'Custom (No Preset)' },
    { id: 'deep_male', name: 'Deep Male', voice: 'Matthew', engine: 'neural' },
    { id: 'young_male', name: 'Young Male', voice: 'Kevin', engine: 'neural' },
    { id: 'soft_female', name: 'Soft Female', voice: 'Joanna', engine: 'neural' },
    { id: 'expressive_female', name: 'Expressive Female', voice: 'Danielle', engine: 'long-form' },
    { id: 'mc', name: 'MC', voice: 'Stephen', engine: 'neural' },
    { id: 'podcast', name: 'Podcast', voice: 'Matthew', engine: 'neural', domain: 'conversational' },
    { id: 'audiobook', name: 'Audiobook', voice: 'Joanna', engine: 'long-form' }
  ];

  const voices = ['Joanna', 'Matthew', 'Kevin', 'Danielle', 'Stephen', 'Amy', 'Emma', 'Brian'];

  // Handle Preset Change
  useEffect(() => {
    if (preset !== 'none') {
      const selectedPreset = presets.find(p => p.id === preset);
      if (selectedPreset) {
        setVoice(selectedPreset.voice);
        setEngine(selectedPreset.engine as 'neural' | 'standard' | 'long-form');
        if (selectedPreset.domain) {
          setDomainStyle(selectedPreset.domain);
        } else {
          setDomainStyle('none');
        }
      }
    }
  }, [preset]);

  return (
    <div className="app-container">
      <header>
        <h1>Polly Voice TTS</h1>
        <p>Advanced Text-to-Speech Generation with AWS Polly</p>
      </header>

      <main className="main-content">
        {/* LEFT COLUMN: Input & Preview */}
        <section className="input-section">
          <div className="glass-panel">
            <div className="form-group">
              <label htmlFor="text-input">Text Input</label>
              <textarea
                id="text-input"
                placeholder="Enter text to convert to speech..."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="char-count">
                {text.length} / 3000 characters
              </div>
            </div>

            <div className="form-row">
              <button className="btn btn-secondary">
                ▶ Play Preview
              </button>
              <button className="btn btn-primary">
                Generate Audio (MP3)
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Settings */}
        <section className="settings-section">
          <div className="glass-panel">
            <h2>Voice Settings</h2>

            {/* Engine Selection */}
            <label>Engine</label>
            <div className="engine-selector">
              <div 
                className={`engine-tab ${engine === 'neural' ? 'active' : ''}`}
                onClick={() => setEngine('neural')}
              >
                Neural
              </div>
              <div 
                className={`engine-tab ${engine === 'standard' ? 'active' : ''}`}
                onClick={() => setEngine('standard')}
              >
                Standard
              </div>
              <div 
                className={`engine-tab ${engine === 'long-form' ? 'active' : ''}`}
                onClick={() => setEngine('long-form')}
              >
                Long-form
              </div>
            </div>

            {/* Preset & Basic */}
            <div className="form-group">
              <label>Preset</label>
              <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                {presets.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

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
                  {voices.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Common Sliders */}
            <div className="form-group slider-container">
              <div className="slider-header">
                <label>Speed (Rate)</label>
                <span className="slider-value">{speed}%</span>
              </div>
              <input 
                type="range" min="20" max="200" step="10" 
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

            <hr style={{ borderColor: 'var(--panel-border)', margin: '1.5rem 0', opacity: 0.5 }} />
            
            <h2>Advanced SSML</h2>

            {/* Standard Engine Only */}
            <div className={`form-group slider-container ${engine !== 'standard' ? 'disabled' : ''}`}>
              <div className="slider-header">
                <label>Pitch</label>
                <span className="slider-value">{pitch > 0 ? `+${pitch}` : pitch}%</span>
              </div>
              <input 
                type="range" min="-20" max="20" step="1" 
                value={pitch} onChange={(e) => setPitch(Number(e.target.value))} 
                disabled={engine !== 'standard'}
              />
              {engine !== 'standard' && <span className="helper-text">Only available for Standard engine</span>}
            </div>

            <div className={`form-group ${engine !== 'standard' ? 'disabled' : ''}`}>
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

            {/* Neural Engine Only */}
            <div className={`form-group ${engine !== 'neural' ? 'disabled' : ''}`}>
              <label>Domain Style</label>
              <select 
                value={domainStyle} onChange={(e) => setDomainStyle(e.target.value)}
                disabled={engine !== 'neural'}
              >
                <option value="none">Default</option>
                <option value="news">News</option>
                <option value="conversational">Conversational</option>
              </select>
              {engine !== 'neural' && <span className="helper-text">Only available for Neural engine</span>}
            </div>

          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
