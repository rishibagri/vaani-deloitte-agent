import { useState, useRef, useEffect } from 'react'
import { SessionTimer } from './SessionTimer'

const LANGUAGES = [
  { code: 'en', label: 'English',    native: 'English'  },
  { code: 'hi', label: 'Hindi',      native: 'हिन्दी'   },
  { code: 'ta', label: 'Tamil',      native: 'தமிழ்'    },
  { code: 'te', label: 'Telugu',     native: 'తెలుగు'   },
  { code: 'kn', label: 'Kannada',    native: 'ಕನ್ನಡ'    },
  { code: 'ml', label: 'Malayalam',  native: 'മലയാളം'   },
  { code: 'bn', label: 'Bengali',    native: 'বাংলা'    },
  { code: 'gu', label: 'Gujarati',   native: 'ગુજરાતી'  },
  { code: 'mr', label: 'Marathi',    native: 'मराठी'    },
  { code: 'pa', label: 'Punjabi',    native: 'ਪੰਜਾਬੀ'  },
  { code: 'ur', label: 'Urdu',       native: 'اردو'     },
]

/* Deloitte wordmark — SVG text-based, no external assets required */
function DeloitteMark() {
  return (
    <svg
      width="86"
      height="20"
      viewBox="0 0 86 20"
      fill="none"
      aria-label="Deloitte"
      role="img"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* "Deloitte" logotype in Deloitte Green */}
      <text
        x="0"
        y="15"
        fontFamily="'Inter', system-ui, sans-serif"
        fontWeight="700"
        fontSize="15"
        letterSpacing="-0.02em"
        fill="#86BC25"
      >
        Deloitte
      </text>
      {/* Signature dot */}
      <circle cx="83.5" cy="14.5" r="2.5" fill="#86BC25" />
    </svg>
  )
}

function LangChevron({ open }) {
  return (
    <svg
      width="10" height="6" viewBox="0 0 10 6" fill="none"
      aria-hidden="true"
      style={{
        transform: open ? 'rotate(180deg)' : 'none',
        transition: 'transform 200ms var(--ease-out-quart)',
        flexShrink: 0,
      }}
    >
      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Header({
  connected,
  onLanguageChange,
  currentLang = 'en',
  captionsOn,
  onToggleCaptions,
  sessionRunning,
  onSessionWarning,
}) {
  const [langOpen, setLangOpen] = useState(false)
  const dropdownRef = useRef(null)
  const triggerRef  = useRef(null)

  /* Close dropdown on outside click */
  useEffect(() => {
    if (!langOpen) return
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        triggerRef.current   && !triggerRef.current.contains(e.target)
      ) {
        setLangOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [langOpen])

  /* Close on Escape */
  useEffect(() => {
    if (!langOpen) return
    const handler = (e) => { if (e.key === 'Escape') setLangOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [langOpen])

  const dotColor = {
    connected:  '#86BC25',
    connecting: '#F5A623',
    error:      '#D93B3B',
  }[connected] || '#4A6491'

  const connLabel = {
    connected:  'Connected',
    connecting: 'Connecting',
    error:      'Offline',
  }[connected] || 'Connecting'

  const selectedLang = LANGUAGES.find(l => l.code === currentLang) || LANGUAGES[0]

  return (
    <header
      role="banner"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        zIndex: 'var(--z-header)',
        height: 'var(--header-height)',
        background: 'rgba(1,9,22,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px',
        gap: 0,
      }}
    >
      {/* Left — Deloitte mark + divider + Vaani */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, flex: '0 0 auto' }}>
        <DeloitteMark />
        <div style={{
          width: 1, height: 20, background: 'var(--border-default)',
          margin: '0 14px', flexShrink: 0,
        }} />
        <span style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: '-0.03em',
          color: 'var(--text-primary)',
          lineHeight: 1,
        }}>
          Vaani
        </span>
        <span style={{
          marginLeft: 8,
          fontSize: 11,
          fontFamily: "'Inter', sans-serif",
          fontWeight: 500,
          color: 'var(--text-muted)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          lineHeight: 1,
          alignSelf: 'flex-end',
          paddingBottom: 2,
        }}>
          DCIT
        </span>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>

        {/* Session timer */}
        <SessionTimer
          running={sessionRunning}
          onWarning={onSessionWarning}
        />

        {/* Captions toggle */}
        <button
          onClick={onToggleCaptions}
          aria-label={captionsOn ? 'Turn off captions' : 'Turn on captions'}
          aria-pressed={captionsOn}
          style={{
            background: captionsOn ? 'rgba(134,188,37,0.10)' : 'transparent',
            border: `1px solid ${captionsOn ? 'rgba(134,188,37,0.28)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '4px 8px',
            cursor: 'pointer',
            color: captionsOn ? 'var(--text-brand)' : 'var(--text-muted)',
            fontSize: 11,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            letterSpacing: '0.04em',
            transition: 'all var(--dur-fast) var(--ease-standard)',
            outline: 'none',
          }}
          onFocus={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(134,188,37,0.40)' }}
          onBlur={(e)  => { e.currentTarget.style.boxShadow = 'none' }}
        >
          CC
        </button>

        {/* Language selector */}
        <div style={{ position: 'relative' }}>
          <button
            ref={triggerRef}
            onClick={() => setLangOpen(o => !o)}
            aria-haspopup="listbox"
            aria-expanded={langOpen}
            aria-label={`Language: ${selectedLang.label}. Change language.`}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: langOpen ? 'var(--bg-surface-2)' : 'var(--bg-surface-1)',
              border: `1px solid ${langOpen ? 'var(--border-default)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-full)',
              padding: '5px 12px 5px 10px',
              color: 'var(--text-secondary)',
              fontSize: 12,
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
              outline: 'none',
              whiteSpace: 'nowrap',
            }}
            onFocus={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,163,224,0.35)' }}
            onBlur={(e)  => { e.currentTarget.style.boxShadow = 'none' }}
          >
            <span style={{ fontSize: 13 }}>{selectedLang.native}</span>
            <LangChevron open={langOpen} />
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
                background: '#011840',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'auto',
                maxHeight: 320,
                minWidth: 176,
                boxShadow: '0 12px 40px rgba(0,0,0,0.70), 0 2px 8px rgba(0,0,0,0.40)',
                animation: 'message-enter 180ms var(--ease-out-quart)',
              }}
            >
              {LANGUAGES.map((lang, i) => {
                const isSelected = lang.code === currentLang
                return (
                  <button
                    key={lang.code}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { onLanguageChange(lang.code); setLangOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', textAlign: 'left',
                      padding: '9px 14px',
                      background: isSelected ? 'rgba(134,188,37,0.08)' : 'none',
                      border: 'none',
                      borderBottom: i < LANGUAGES.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      cursor: 'pointer',
                      transition: 'background var(--dur-fast) var(--ease-standard)',
                      outline: 'none',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(0,163,224,0.07)' }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'none' }}
                    onFocus={(e)      => { e.currentTarget.style.background = 'rgba(0,163,224,0.07)' }}
                    onBlur={(e)       => { if (!isSelected) e.currentTarget.style.background = 'none' }}
                  >
                    <span style={{
                      color: isSelected ? 'var(--text-brand)' : 'var(--text-primary)',
                      fontSize: 14, fontFamily: "'Inter', sans-serif",
                    }}>
                      {lang.native}
                    </span>
                    <span style={{
                      color: 'var(--text-muted)', fontSize: 11,
                      fontFamily: "'Inter', sans-serif",
                    }}>
                      {lang.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Connection status */}
        <div
          role="status"
          aria-live="polite"
          aria-label={`Connection: ${connLabel}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
            animation: connected === 'connecting' ? 'dot-pulse 1200ms ease-in-out infinite' : 'none',
            transition: 'background 400ms var(--ease-standard)',
          }} />
          <span style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 500,
            fontSize: 11,
            color: 'var(--text-muted)',
            letterSpacing: '0.01em',
          }}>
            {connLabel}
          </span>
        </div>
      </div>
    </header>
  )
}
