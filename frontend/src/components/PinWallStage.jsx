import { useEffect, useRef, useState } from 'react'
import { PinScreenAvatar } from './PinScreenAvatar'
import { MicButton } from './MicButton'
import { SessionTimer } from './SessionTimer'

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

/* appState → status: color + label + pulse speed */
const STATUS = {
  idle:      { color: '#4A6030',  label: 'Idle',      pulseSpeed: '3s',    glowColor: 'rgba(42,64,32,0.15)'    },
  listening: { color: '#86BC25',  label: 'Listening', pulseSpeed: '1.1s',  glowColor: 'rgba(134,188,37,0.25)'  },
  thinking:  { color: '#C8A020',  label: 'Thinking',  pulseSpeed: '1.8s',  glowColor: 'rgba(200,160,32,0.18)'  },
  speaking:  { color: '#86BC25',  label: 'Speaking',  pulseSpeed: '0.85s', glowColor: 'rgba(134,188,37,0.25)'  },
}

/* Minimal word-stagger hook — emits word items, animating only new ones */
function useWordItems(text) {
  const [items, setItems] = useState([])
  const prevRef = useRef('')

  useEffect(() => {
    const prev = prevRef.current
    const curr = text || ''
    if (!curr) { setItems([]); prevRef.current = ''; return }

    const prevWords = prev.trim() ? prev.trim().split(/\s+/) : []
    const currWords = curr.trim().split(/\s+/)

    if (curr.startsWith(prev) && currWords.length > prevWords.length) {
      const newWords = currWords.slice(prevWords.length)
      setItems(ex => [
        ...ex.map(w => ({ ...w, isNew: false })),
        ...newWords.map((word, i) => ({ id: ex.length + i, word, isNew: true, delay: i * 35 })),
      ])
    } else if (!curr.startsWith(prev)) {
      setItems(currWords.map((word, i) => ({ id: i, word, isNew: true, delay: i * 35 })))
    }
    prevRef.current = curr
  }, [text])

  return items
}

function ChevronIcon({ open }) {
  return (
    <svg width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden="true"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--ease-out-quart)', flexShrink: 0 }}>
      <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ClockGlyph({ color }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function SensorsGlyph({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="2" />
      <path d="M7.76 16.24a6 6 0 0 1 0-8.49M16.24 7.76a6 6 0 0 1 0 8.49M4.93 19.07a10 10 0 0 1 0-14.14M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

function GearGlyph({ color }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

const Divider = () => (
  <div aria-hidden="true" style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.09)', flexShrink: 0 }} />
)

export function PinWallStage({
  appState = 'idle',
  connected,
  currentLang = 'en',
  onLanguageChange,
  getLevel,
  imageUrl,
  isRecording,
  onMicStart,
  onMicStop,
  micDisabled,
  agentText,
  userText,
  isStreaming,
  sessionRunning,
}) {
  const [langOpen, setLangOpen] = useState(false)
  const dropdownRef = useRef(null)
  const triggerRef  = useRef(null)
  const optionRefs  = useRef([])

  /* showFace: true when Vaani is active (listening / thinking / speaking).
     Delays returning to wave by 2.2s so brief pauses don't cause flicker. */
  const [showFace, setShowFace] = useState(false)
  const hideTimerRef = useRef(null)

  useEffect(() => {
    if (appState !== 'idle') {
      clearTimeout(hideTimerRef.current)
      setShowFace(true)
    } else {
      hideTimerRef.current = setTimeout(() => setShowFace(false), 2200)
    }
    return () => clearTimeout(hideTimerRef.current)
  }, [appState])

  /* Decorative readout — gently animating throughput value */
  const [thru, setThru] = useState('4.2')
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const id = setInterval(() => setThru((3.6 + Math.random() * 1.2).toFixed(1)), 2400)
    return () => clearInterval(id)
  }, [])

  /* Dropdown: outside-click + escape close */
  useEffect(() => {
    if (!langOpen) return
    const onDown = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        triggerRef.current  && !triggerRef.current.contains(e.target)
      ) setLangOpen(false)
    }
    const onEsc = (e) => { if (e.key === 'Escape') { setLangOpen(false); triggerRef.current?.focus() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc) }
  }, [langOpen])

  useEffect(() => {
    if (!langOpen) return
    const idx = Math.max(0, LANGUAGES.findIndex(l => l.code === currentLang))
    optionRefs.current[idx]?.focus()
  }, [langOpen, currentLang])

  const onListKeyDown = (e) => {
    const opts = optionRefs.current.filter(Boolean)
    const idx = opts.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); opts[(idx + 1) % opts.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); opts[(idx - 1 + opts.length) % opts.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); opts[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); opts[opts.length - 1]?.focus() }
  }

  const selected    = LANGUAGES.find(l => l.code === currentLang) || LANGUAGES[0]
  const status      = STATUS[appState] || STATUS.idle
  const agentWords  = useWordItems(agentText || '')
  const transcriptFont = "'Plus Jakarta Sans', 'Inter', sans-serif"

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-base)', overflow: 'hidden', color: '#dee3e8' }}>
      <style>{`
        /* State-speed status dot */
        .pinwall-status-dot { animation: pinwall-dot-pulse var(--pinwall-pulse-speed, 3s) ease-in-out infinite; }

        @keyframes pinwall-dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.3; transform: scale(0.65); }
        }

        /* Word reveal for transcript */
        @keyframes pinwall-word-in {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Trigger line breathe */
        @keyframes pinwall-trigger-breathe {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 1; }
        }

        /* Dock hover-reveal — asymmetric: fast exit, spring enter */
        .pinwall-dock-zone {
          transform: translateY(-98%);
          transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .pinwall-dock-zone:hover,
        .pinwall-dock-zone:focus-within {
          transform: translateY(0);
          transition: transform 0.34s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Dock item press scale */
        .pinwall-dock-btn {
          cursor: pointer;
          transition: transform 120ms var(--ease-out-quart), color 150ms, border-color 150ms, background 150ms;
        }
        .pinwall-dock-btn:active { transform: scale(0.96) !important; }

        /* Readout fade-gradient rule */
        .pinwall-readout-rule {
          background: linear-gradient(90deg, var(--blue), transparent);
          height: 1px;
          margin-top: 5px;
          width: 64px;
          opacity: 0.5;
          animation: pinwall-readout-pulse 4s ease-in-out infinite;
        }
        .pinwall-readout-rule-r {
          background: linear-gradient(270deg, var(--blue), transparent);
          height: 1px;
          margin-top: 5px;
          width: 64px;
          margin-left: auto;
          opacity: 0.5;
          animation: pinwall-readout-pulse 4s ease-in-out infinite;
        }
        @keyframes pinwall-readout-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.8; }
        }

        /* Scanning line — sweeps across to indicate face-detection */
        @keyframes pinwall-scan-line {
          0%   { transform: scaleX(0.1) translateX(-200px); opacity: 0; }
          30%  { opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: scaleX(0.1) translateX(200px); opacity: 0; }
        }

        /* Dock entrance animation */
        @keyframes pinwall-dock-enter {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .pinwall-status-dot       { animation: none !important; }
          .pinwall-trigger-breathe  { animation: none !important; }
          .pinwall-dock-zone        { transition: none !important; }
          .pinwall-readout-rule,
          .pinwall-readout-rule-r   { animation: none !important; }
        }
      `}</style>

      {/* ── BACKGROUND: fullscreen pin wall (z 0) ── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <PinScreenAvatar fill appState={appState} getLevel={getLevel} imageUrl={imageUrl} showFace={showFace} />
      </div>

      {/* ── AMBIENT STATE GLOW — subtle bloom behind face center (z 1) ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%', top: '50%',
          transform: 'translate(-50%, -52%)',
          width: 520, height: 600,
          zIndex: 1, pointerEvents: 'none',
          background: `radial-gradient(ellipse 55% 60% at 50% 50%, ${status.glowColor} 0%, transparent 70%)`,
          transition: 'background 900ms var(--ease-standard)',
          willChange: 'background',
          /* Gentle bloom pulse when active */
          animation: appState !== 'idle' ? 'glow-pulse 3s ease-in-out infinite' : 'none',
        }}
      />

      {/* ── CORNER READOUTS (decorative, below dock zone) ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 68, left: 20, zIndex: 5,
        opacity: 0.18, pointerEvents: 'none',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, lineHeight: 1.7, color: 'var(--blue)',
        letterSpacing: '0.09em',
      }}>
        <div>COORD_X: 048.117</div>
        <div>COORD_Y: 192.004</div>
        <div className="pinwall-readout-rule" />
      </div>
      <div aria-hidden="true" style={{
        position: 'absolute', top: 68, right: 20, zIndex: 5,
        opacity: 0.18, pointerEvents: 'none', textAlign: 'right',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, lineHeight: 1.7, color: 'var(--blue)',
        letterSpacing: '0.09em',
      }}>
        <div>BUFFER: STABLE</div>
        <div>THRUPUT: {thru} GB/S</div>
        <div className="pinwall-readout-rule-r" />
      </div>

      {/* ── TOP DOCK (z 50): hidden, slides down on hover ── */}
      <div
        className="pinwall-dock-zone"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 10, paddingBottom: 4,
        }}
      >
        {/* Full-width trigger line — gradient fade to transparent at edges */}
        <div
          className="pinwall-trigger-breathe"
          aria-hidden="true"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 2,
            background: 'linear-gradient(90deg, transparent 0%, rgba(134,188,37,0.7) 35%, rgba(134,188,37,0.95) 50%, rgba(134,188,37,0.7) 65%, transparent 100%)',
            boxShadow: '0 0 14px rgba(134,188,37,0.5)',
            animation: 'pinwall-trigger-breathe 3.2s ease-in-out infinite',
          }}
        />

        {/* Dock bar */}
        <nav
          role="toolbar"
          aria-label="Vaani controls"
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            /* Cinematic glassmorphism: slightly darker fill + stronger blur + top-edge refraction */
            background: 'rgba(5,10,2,0.65)',
            backdropFilter: 'blur(24px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 'var(--radius-full)',
            padding: '9px 20px',
            boxShadow: [
              '0 16px 56px rgba(0,0,0,0.65)',
              'inset 0 1px 0 rgba(255,255,255,0.12)',  /* glass top-edge refraction */
              'inset 0 -1px 0 rgba(0,0,0,0.20)',
            ].join(', '),
            animation: 'pinwall-dock-enter 600ms var(--ease-out-expo) 800ms both',
          }}
        >
          {/* (1) Agent / sensors tile */}
          <div aria-hidden="true" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: 'var(--radius-md)',
            background: 'rgba(134,188,37,0.08)',
            border: '1px solid rgba(134,188,37,0.28)',
            boxShadow: '0 0 16px rgba(134,188,37,0.28), inset 0 0 10px rgba(134,188,37,0.08)',
            color: 'var(--green)', flexShrink: 0,
          }}>
            <SensorsGlyph color="var(--green)" />
          </div>

          <Divider />

          {/* (3) Brand block — green V signature */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
            <span style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 700, fontSize: 19, lineHeight: 1,
              letterSpacing: '-0.03em', userSelect: 'none',
            }}>
              <span style={{ color: 'var(--green)' }}>V</span>
              <span style={{ color: 'var(--text-primary)' }}>AANI</span>
            </span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 8, letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'rgba(134,188,37,0.65)',
              lineHeight: 1, userSelect: 'none',
              paddingRight: '0.16em', /* compensate letter-spacing on last char */
            }}>
              Autonomous Intelligence
            </span>
          </div>

          {/* (4) Language pill */}
          <div style={{ position: 'relative' }}>
            <button
              ref={triggerRef}
              className="pinwall-dock-btn"
              onClick={() => setLangOpen(o => !o)}
              aria-haspopup="listbox"
              aria-expanded={langOpen}
              aria-label={`Language: ${selected.label}. Change language.`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: langOpen ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${langOpen ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.09)'}`,
                borderRadius: 'var(--radius-full)',
                padding: '5px 12px',
                color: 'var(--text-secondary)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, letterSpacing: '0.04em',
                outline: 'none', whiteSpace: 'nowrap',
                boxShadow: langOpen ? 'inset 0 1px 0 rgba(255,255,255,0.10)' : 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(134,188,37,0.40)' }}
              onBlur={(e)  => { e.currentTarget.style.boxShadow = langOpen ? 'inset 0 1px 0 rgba(255,255,255,0.10)' : 'none' }}
            >
              <span style={{ fontSize: 12 }}>{selected.native}</span>
              <ChevronIcon open={langOpen} />
            </button>

            {langOpen && (
              <div
                ref={dropdownRef}
                role="listbox"
                aria-label="Select language"
                aria-activedescendant={`pinwall-lang-${currentLang}`}
                onKeyDown={onListKeyDown}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: '50%', transform: 'translateX(-50%)',
                  zIndex: 60,
                  background: 'rgba(2,5,0,0.95)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'auto', maxHeight: 320, minWidth: 176,
                  boxShadow: '0 20px 56px rgba(0,0,0,0.80), inset 0 1px 0 rgba(255,255,255,0.08)',
                  animation: 'message-enter 160ms var(--ease-out-quart)',
                }}
              >
                {LANGUAGES.map((lang, i) => {
                  const sel = lang.code === currentLang
                  return (
                    <button
                      key={lang.code}
                      id={`pinwall-lang-${lang.code}`}
                      ref={el => { optionRefs.current[i] = el }}
                      role="option"
                      aria-selected={sel}
                      tabIndex={-1}
                      onClick={() => { onLanguageChange?.(lang.code); setLangOpen(false); triggerRef.current?.focus() }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', textAlign: 'left', padding: '9px 14px',
                        background: sel ? 'rgba(134,188,37,0.09)' : 'none',
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
                      <span style={{ color: sel ? 'var(--green)' : 'var(--text-primary)', fontSize: 14, fontFamily: "'Inter', sans-serif" }}>
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

          {/* (5) Timer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Session time">
            <ClockGlyph color="var(--text-muted)" />
            <SessionTimer running={sessionRunning} />
          </div>

          <Divider />

          {/* (7) Status — state-speed pulse via CSS variable */}
          <div
            role="status"
            aria-live="polite"
            aria-label={`Status: ${status.label}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span
              className="pinwall-status-dot"
              aria-hidden="true"
              style={{
                '--pinwall-pulse-speed': status.pulseSpeed,
                width: 7, height: 7, borderRadius: '50%',
                background: status.color, flexShrink: 0,
                boxShadow: `0 0 10px ${status.color}cc`,
                transition: 'background 400ms var(--ease-standard), box-shadow 400ms var(--ease-standard)',
              }}
            />
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: status.color,
              transition: 'color 400ms var(--ease-standard)',
              whiteSpace: 'nowrap',
              paddingRight: '0.14em',
            }}>
              {status.label}
            </span>
          </div>

          {/* (8) Settings gear */}
          <button
            className="pinwall-dock-btn"
            onClick={() => { window.location.hash = 'admin' }}
            aria-label="Admin settings"
            title="Admin"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: 'var(--text-muted)',
              outline: 'none', flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--text-secondary)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            }}
            onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(134,188,37,0.40)' }}
            onBlur={e  => { e.currentTarget.style.boxShadow = 'none' }}
          >
            <GearGlyph color="currentColor" />
          </button>
        </nav>
      </div>

      {/* ── BOTTOM STRIP (z 10) ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10,
        paddingBottom: 36, paddingTop: 140,
        /* Gradient: full bg at bottom, fades cleanly into transparent — less aggressive cutoff */
        background: 'linear-gradient(to top, #000000 0%, rgba(0,5,0,0.70) 50%, transparent 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22,
        pointerEvents: 'none',
      }}>

        {/* (a0) Wave-mode presence indicator — only visible when pins are in wave mode */}
        {!showFace && (
          <div aria-hidden="true" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            {/* Scanning line — sweeps across to indicate face-detection */}
            <div style={{
              width: 180, height: 1,
              background: 'linear-gradient(90deg, transparent, #86BC25, transparent)',
              animation: 'pinwall-scan-line 2.4s ease-in-out infinite',
              boxShadow: '0 0 8px rgba(134,188,37,0.6)',
            }} />
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, letterSpacing: '0.20em',
              textTransform: 'uppercase',
              color: 'rgba(134,188,37,0.45)',
              paddingRight: '0.20em',
            }}>
              AWAITING PRESENCE
            </span>
          </div>
        )}

        {/* (a) Transcript — word-stagger reveal */}
        {(agentText || userText) && (
          <div
            role="region"
            aria-label="Transcript"
            aria-live="polite"
            style={{ maxWidth: '58rem', width: '88%', textAlign: 'center' }}
          >
            {agentText && (
              <p style={{
                margin: 0,
                fontFamily: transcriptFont,
                fontStyle: 'italic',
                fontSize: 'clamp(17px, 2.4vw, 24px)',
                fontWeight: 400,
                lineHeight: 1.68,
                color: 'rgba(242,246,252,0.94)',
                textWrap: 'pretty',
                /* Layered text shadow: legibility + depth */
                textShadow: '0 1px 12px rgba(0,0,0,0.7), 0 4px 32px rgba(0,0,0,0.4)',
                letterSpacing: '0.01em',
              }}>
                {agentWords.map(item => (
                  <span
                    key={item.id}
                    style={{
                      display: 'inline',
                      animation: item.isNew
                        ? `pinwall-word-in 190ms var(--ease-out-quart) ${item.delay}ms both`
                        : 'none',
                    }}
                  >
                    {item.word}{' '}
                  </span>
                ))}
                {isStreaming && (
                  <span aria-hidden="true" style={{
                    display: 'inline-block', width: 2, height: '0.85em',
                    background: 'var(--green)', borderRadius: 1,
                    verticalAlign: 'text-bottom', marginLeft: 3,
                    animation: 'cursor-blink 700ms steps(1) infinite',
                  }} />
                )}
              </p>
            )}
            {userText && (
              <p style={{
                margin: agentText ? '10px 0 0' : 0,
                fontFamily: "'Inter', sans-serif",
                fontStyle: 'italic',
                fontSize: 13, lineHeight: 1.55,
                color: 'var(--text-secondary)',
                opacity: 0.72,
                letterSpacing: '0.005em',
              }}>
                {userText}
              </p>
            )}
          </div>
        )}

        {/* (b) Mic + state caption */}
        <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <MicButton
            isRecording={isRecording}
            isDisabled={micDisabled}
            onStart={onMicStart}
            onStop={onMicStop}
            appState={appState}
          />
          {/* State caption below mic — 4px dot + label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 4, height: 4, borderRadius: '50%',
              background: status.color,
              boxShadow: `0 0 6px ${status.color}`,
              transition: 'background 400ms var(--ease-standard)',
            }} />
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9.5, letterSpacing: '0.16em',
              textTransform: 'uppercase', color: status.color,
              transition: 'color 400ms var(--ease-standard)',
              paddingRight: '0.16em',
            }}>
              {status.label}
            </span>
          </div>
        </div>
      </div>

      {/* ── VIGNETTE — elliptical for cinematic widescreen feel (z 20) ── */}
      <div aria-hidden="true" style={{
        position: 'fixed', inset: 0, zIndex: 20, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 110% 90% at 50% 50%, transparent 30%, rgba(0,5,0,0.45) 100%)',
      }} />
    </div>
  )
}
