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
  const optionRefs  = useRef([])

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
    const esc = (e) => {
      if (e.key === 'Escape') {
        setLangOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [langOpen])

  /* Move focus into the open list, landing on the selected option */
  useEffect(() => {
    if (!langOpen) return
    const idx = Math.max(0, LANGUAGES.findIndex(l => l.code === currentLang))
    optionRefs.current[idx]?.focus()
  }, [langOpen, currentLang])

  const onListKeyDown = (e) => {
    const opts = optionRefs.current.filter(Boolean)
    const idx = opts.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      opts[(idx + 1) % opts.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      opts[(idx - 1 + opts.length) % opts.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      opts[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      opts[opts.length - 1]?.focus()
    }
  }

  const dotColor = { connected: '#86BC25', connecting: '#C8A020', error: '#FF4444' }[connected] || '#3D5A8A'
  const connLabel = { connected: 'Online', connecting: 'Linking', error: 'Offline' }[connected] || 'Linking'
  const selected  = LANGUAGES.find(l => l.code === currentLang) || LANGUAGES[0]

  return (
    <header
      role="banner"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        zIndex: 'var(--z-header)',
        height: 'var(--header-height)',
        /* Cinematic glass: dark fill + blur + top-edge refraction, fades into the scene */
        background: 'linear-gradient(to bottom, rgba(4,8,2,0.78) 0%, rgba(4,8,2,0.30) 100%)',
        backdropFilter: 'blur(20px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px',
      }}
    >
      {/* Left — brand signature */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, flex: '0 0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 19,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            userSelect: 'none',
          }}>
            <span style={{ color: '#86BC25' }}>V</span>
            <span style={{ color: 'var(--text-primary)' }}>AANI</span>
          </span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 8,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(134,188,37,0.6)',
            lineHeight: 1,
            userSelect: 'none',
            paddingRight: '0.18em',
          }}>
            Autonomous Intelligence
          </span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>

        {/* Language selector */}
        <div style={{ position: 'relative' }}>
          <button
            ref={triggerRef}
            onClick={() => setLangOpen(o => !o)}
            aria-haspopup="listbox"
            aria-expanded={langOpen}
            aria-label={`Language: ${selected.label}. Change language.`}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: langOpen ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${langOpen ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.09)'}`,
              borderRadius: 'var(--radius-full)',
              padding: '5px 12px',
              color: 'var(--text-secondary)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              transition: 'background 150ms var(--ease-standard), border-color 150ms, box-shadow 150ms',
              outline: 'none',
              whiteSpace: 'nowrap',
              boxShadow: langOpen ? 'inset 0 1px 0 rgba(255,255,255,0.10)' : 'none',
            }}
            onFocus={(e)  => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(134,188,37,0.40)' }}
            onBlur={(e)   => { e.currentTarget.style.boxShadow = langOpen ? 'inset 0 1px 0 rgba(255,255,255,0.10)' : 'none' }}
          >
            <span style={{ fontSize: 12 }}>{selected.native}</span>
            <ChevronIcon open={langOpen} />
          </button>

          {langOpen && (
            <div
              ref={dropdownRef}
              role="listbox"
              aria-label="Select language"
              aria-activedescendant={`lang-opt-${currentLang}`}
              onKeyDown={onListKeyDown}
              style={{
                position: 'fixed',
                top: 'calc(var(--header-height) + 6px)',
                right: 24,
                zIndex: 'var(--z-dropdown)',
                background: 'rgba(2,5,0,0.95)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'auto',
                maxHeight: 320,
                minWidth: 176,
                boxShadow: '0 20px 56px rgba(0,0,0,0.80), inset 0 1px 0 rgba(255,255,255,0.08)',
                animation: 'message-enter 160ms var(--ease-out-quart)',
              }}
            >
              {LANGUAGES.map((lang, i) => {
                const sel = lang.code === currentLang
                return (
                  <button
                    key={lang.code}
                    id={`lang-opt-${lang.code}`}
                    ref={el => { optionRefs.current[i] = el }}
                    role="option"
                    aria-selected={sel}
                    tabIndex={-1}
                    onClick={() => { onLanguageChange(lang.code); setLangOpen(false); triggerRef.current?.focus() }}
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
                    onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = 'rgba(134,188,37,0.08)' }}
                    onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = 'none' }}
                    onFocus={(e)      => { e.currentTarget.style.background = 'rgba(134,188,37,0.08)' }}
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

        {/* Connection telemetry — dot + mono micro-label */}
        <div
          role="status"
          aria-live="polite"
          aria-label={`Connection: ${connLabel}`}
          title={connLabel}
          style={{ display: 'flex', alignItems: 'center', gap: 7 }}
        >
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
            animation: connected === 'connecting' ? 'dot-pulse 1200ms ease-in-out infinite' : 'none',
            transition: 'background 400ms var(--ease-standard)',
            boxShadow: connected === 'connected' ? `0 0 8px ${dotColor}aa` : 'none',
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: dotColor,
            lineHeight: 1,
            paddingRight: '0.14em',
            transition: 'color 400ms var(--ease-standard)',
            whiteSpace: 'nowrap',
          }}>
            {connLabel}
          </span>
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
          onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(134,188,37,0.40)' }}
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
