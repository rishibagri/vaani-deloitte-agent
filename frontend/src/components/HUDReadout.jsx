import { useEffect, useState } from 'react'

const LANG_NAMES = {
  en: 'English',  hi: 'Hindi',     ta: 'Tamil',
  te: 'Telugu',   kn: 'Kannada',   ml: 'Malayalam',
  bn: 'Bengali',  gu: 'Gujarati',  mr: 'Marathi',
  pa: 'Punjabi',  ur: 'Urdu',
}

const STATE_COLOR = {
  idle:      'var(--text-muted)',
  listening: 'var(--green)',
  thinking:  'var(--amber)',
  speaking:  'var(--blue)',
  error:     'var(--error)',
}

function Readout({ label, children, visible }) {
  return (
    <div style={{
      opacity: visible ? 1 : 0,
      animation: visible ? 'hud-reveal 400ms var(--ease-out-expo) 500ms both' : 'none',
      pointerEvents: 'none',
    }}>
      <div style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: '0.04em',
        color: 'rgba(139,163,199,0.55)',
        marginBottom: 2,
        textTransform: 'none',
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

/* Session timer internal to HUD */
function HUDTimer({ running }) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!running) { setSeconds(0); return }
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  const warn = seconds >= 13 * 60

  return (
    <span
      role="timer"
      aria-label={`Session time: ${m} minutes ${s} seconds`}
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontVariantNumeric: 'tabular-nums',
        fontSize: 13,
        color: warn ? 'var(--amber)' : 'var(--text-secondary)',
        transition: 'color 500ms var(--ease-standard)',
      }}
    >
      {m}:{s}
    </span>
  )
}

/* Four floating HUD panels positioned around the avatar.
   Position values are relative to the avatar wrapper div. */
const OFFSETS = {
  'top-left':     { top: -64,  left: -128 },
  'top-right':    { top: -64,  right: -128 },
  'bottom-left':  { bottom: -64, left: -128 },
  'bottom-right': { bottom: -64, right: -128 },
}

export function HUDReadout({
  position,
  appState,
  currentLang,
  sessionRunning,
  bootDone,
}) {
  const visible = bootDone
  const offsets = OFFSETS[position] || {}

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        ...offsets,
        minWidth: 110,
        textAlign: position.includes('right') ? 'right' : 'left',
        /* Hide on mobile */
        '@media (max-width: 768px)': { display: 'none' },
      }}
    >
      {position === 'top-left' && (
        <Readout label="Session" visible={visible}>
          <HUDTimer running={sessionRunning} />
        </Readout>
      )}

      {position === 'top-right' && (
        <Readout label="Language" visible={visible}>
          <span style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--text-secondary)',
            letterSpacing: '0.01em',
          }}>
            {LANG_NAMES[currentLang] || 'English'}
          </span>
        </Readout>
      )}

      {position === 'bottom-left' && (
        <Readout label="Model" visible={visible}>
          <span style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-secondary)',
            letterSpacing: '0.01em',
          }}>
            Gemini Live 3.1
          </span>
        </Readout>
      )}

      {position === 'bottom-right' && (
        <Readout label="Status" visible={visible}>
          <span style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.01em',
            color: STATE_COLOR[appState] || STATE_COLOR.idle,
            transition: 'color 400ms var(--ease-standard)',
          }}>
            {appState ? appState.charAt(0).toUpperCase() + appState.slice(1) : 'Idle'}
          </span>
        </Readout>
      )}
    </div>
  )
}
