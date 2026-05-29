import { useState } from 'react'

const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'ur', label: 'Urdu', native: 'اردو' },
]

export function Header({ connected, onLanguageChange, currentLang = 'en', agentName = 'Vaani' }) {
  const [langOpen, setLangOpen] = useState(false)

  const dotColor = connected === 'connected'
    ? '#86BC25'
    : connected === 'connecting'
    ? '#F5A623'
    : '#D93B3B'

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      height: 52,
      background: 'rgba(1,13,32,0.90)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'center',
      padding: '0 24px', justifyContent: 'space-between'
    }}>
      <span style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 800,
        fontSize: 20, letterSpacing: '-0.03em', color: 'var(--text-primary)'
      }}>
        <span style={{ color: 'var(--text-brand)' }}>V</span>aani
      </span>

      <span style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 700,
        fontSize: 16, color: 'var(--text-primary)',
        position: 'absolute', left: '50%', transform: 'translateX(-50%)'
      }}>
        {agentName}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setLangOpen(o => !o)}
            style={{
              background: 'var(--bg-surface-1)', border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-full)', padding: '4px 12px',
              color: 'var(--text-secondary)', fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer'
            }}
          >
            {currentLang.toUpperCase()} {langOpen ? '▲' : '▼'}
          </button>
          {langOpen && (
            <div style={{
              position: 'absolute', top: 34, right: 0, zIndex: 100,
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden', minWidth: 160,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
            }}>
              {LANGUAGES.map(lang => (
                <button key={lang.code} onClick={() => {
                  onLanguageChange(lang.code)
                  setLangOpen(false)
                }} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 14px', background: 'none',
                  border: 'none', cursor: 'pointer',
                  color: lang.code === currentLang ? 'var(--text-brand)' : 'var(--text-secondary)',
                  fontSize: 13,
                  borderBottom: '1px solid var(--border-subtle)'
                }}>
                  {lang.native} <span style={{ opacity: 0.6 }}>{lang.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: dotColor,
            animation: connected === 'connecting' ? 'dot-pulse 1200ms infinite' : 'none'
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: 'var(--text-muted)'
          }}>
            {connected === 'connected' ? 'Connected' : connected === 'connecting' ? 'Connecting...' : 'Offline'}
          </span>
        </div>
      </div>
    </header>
  )
}
