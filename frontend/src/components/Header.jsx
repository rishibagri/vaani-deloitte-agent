import { useState, useRef, useEffect } from 'react'

const LANGUAGES = [
  { code: 'en', label: 'English',   native: 'English'  },
  { code: 'hi', label: 'Hindi',     native: 'हिन्दी'   },
  { code: 'ta', label: 'Tamil',     native: 'தமிழ்'    },
  { code: 'te', label: 'Telugu',    native: 'తెలుగు'   },
  { code: 'kn', label: 'Kannada',   native: 'ಕನ್ನಡ'    },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം'   },
  { code: 'bn', label: 'Bengali',   native: 'বাংলা'    },
  { code: 'gu', label: 'Gujarati',  native: 'ગુજરાતી'  },
  { code: 'mr', label: 'Marathi',   native: 'मराठी'    },
  { code: 'pa', label: 'Punjabi',   native: 'ਪੰਜਾਬੀ'  },
  { code: 'ur', label: 'Urdu',      native: 'اردو'     },
]

function ChevronIcon({ open }) {
  return (
    <svg
      width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden="true"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--ease-out-quart)', flexShrink: 0 }}
    >
      <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Header({
  connected,
  onLanguageChange,
  currentLang = 'en',
  sessionRunning,
}) {
  const [langOpen, setLangOpen] = useState(false)
  const dropdownRef = useRef(null)
  const triggerRef  = useRef(null)

  useEffect(() => {
    if (!langOpen) return
    const close = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        triggerRef.current   && !triggerRef.current.contains(e.target)
      ) setLangOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [langOpen])

  useEffect(() => {
    if (!langOpen) return
    const esc = (e) => { if (e.key === 'Escape') setLangOpen(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [langOpen])

  const dotColor = { connected: '#86BC25', connecting: '#F5A623', error: '#FF4444' }[connected] || '#4A6491'
  const connLabel = { connected: 'Connected', connecting: 'Connecting', error: 'Offline' }[connected] || 'Connecting'
  const selected  = LANGUAGES.find(l => l.code === currentLang) || LANGUAGES[0]

  return (
    <header
      role="banner"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        zIndex: 'var(--z-header)',
        height: 'var(--header-height)',
        background: 'rgba(1,10,26,0.90)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px',
      }}
    >
      {/* Left — logo */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, flex: '0 0 auto' }}>
        <span style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: 20,
          letterSpacing: '-0.03em',
          lineHeight: 1,
          userSelect: 'none',
        }}>
          <span style={{ color: '#86BC25' }}>V</span>
          <span style={{ color: 'var(--text-primary)' }}>AANI</span>
        </span>
        <span style={{
          marginLeft: 8,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          letterSpacing: '0.04em',
          color: 'var(--text-muted)',
          lineHeight: 1,
          paddingBottom: 1,
        }}>
          v1.0
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '0 0 auto' }}>

        {/* Language selector */}
        <div style={{ position: 'relative' }}>
          <button
            ref={triggerRef}
            onClick={() => setLangOpen(o => !o)}
            aria-haspopup="listbox"
            aria-expanded={langOpen}
            aria-label={`Language: ${selected.label}. Change language.`}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: langOpen ? 'rgba(1,52,122,0.50)' : 'rgba(1,52,122,0.25)',
              border: `1px solid ${langOpen ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 'var(--radius-full)',
              padding: '4px 10px 4px 10px',
              color: 'var(--text-secondary)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              transition: 'background 150ms var(--ease-standard), border-color 150ms',
              outline: 'none',
              whiteSpace: 'nowrap',
            }}
            onFocus={(e)  => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,163,224,0.35)' }}
            onBlur={(e)   => { e.currentTarget.style.boxShadow = 'none' }}
          >
            <span style={{ fontSize: 12 }}>{selected.native}</span>
            <ChevronIcon open={langOpen} />
          </button>

          {langOpen && (
            <div
              ref={dropdownRef}
              role="listbox"
              aria-label="Select language"
              style={{
                position: 'fixed',
                top: 'calc(var(--header-height) + 4px)',
                right: 24,
                zIndex: 'var(--z-dropdown)',
                background: '#010F28',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'auto',
                maxHeight: 320,
                minWidth: 176,
                boxShadow: '0 16px 48px rgba(0,0,0,0.72)',
                animation: 'message-enter 160ms var(--ease-out-quart)',
              }}
            >
              {LANGUAGES.map((lang, i) => {
                const sel = lang.code === currentLang
                return (
                  <button
                    key={lang.code}
                    role="option"
                    aria-selected={sel}
                    onClick={() => { onLanguageChange(lang.code); setLangOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', textAlign: 'left',
                      padding: '9px 14px',
                      background: sel ? 'rgba(134,188,37,0.08)' : 'none',
                      border: 'none',
                      borderBottom: i < LANGUAGES.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      cursor: 'pointer',
                      transition: 'background var(--dur-fast)',
                      outline: 'none',
                    }}
                    onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = 'rgba(0,163,224,0.07)' }}
                    onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = 'none' }}
                    onFocus={(e)      => { e.currentTarget.style.background = 'rgba(0,163,224,0.07)' }}
                    onBlur={(e)       => { if (!sel) e.currentTarget.style.background = 'none' }}
                  >
                    <span style={{ color: sel ? '#86BC25' : 'var(--text-primary)', fontSize: 14, fontFamily: "'Inter', sans-serif" }}>
                      {lang.native}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
                      {lang.code.toUpperCase()}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Connection dot — subtle, no text label */}
        <div
          role="status"
          aria-live="polite"
          aria-label={`Connection: ${connLabel}`}
          title={connLabel}
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
            animation: connected === 'connecting' ? 'dot-pulse 1200ms ease-in-out infinite' : 'none',
            transition: 'background 400ms var(--ease-standard)',
            boxShadow: connected === 'connected' ? `0 0 6px ${dotColor}66` : 'none',
          }} />
        </div>

        {/* Admin gear */}
        <button
          onClick={() => { window.location.hash = 'admin' }}
          aria-label="Admin settings"
          title="Admin"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 'var(--radius-md)',
            background: 'none', border: '1px solid rgba(255,255,255,0.07)',
            color: 'var(--text-muted)', cursor: 'pointer',
            transition: 'color 150ms, border-color 150ms, background 150ms',
            outline: 'none',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
            e.currentTarget.style.background = 'none'
          }}
          onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,163,224,0.35)' }}
          onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  )
}
