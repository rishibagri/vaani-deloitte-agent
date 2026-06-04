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

function Readout({ label, children, visible, align = 'left' }) {
  return (
    <div style={{
      opacity: visible ? 1 : 0,
      animation: visible ? 'hud-reveal 400ms var(--ease-out-expo) 500ms both' : 'none',
      pointerEvents: 'none',
    }}>
      {/* Mono micro-label — house telemetry language */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 8.5,
        fontWeight: 500,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'rgba(134,188,37,0.50)',
        marginBottom: 4,
        paddingRight: align === 'right' ? '0.18em' : 0,
      }}>
        {label}
      </div>
      {children}
      {/* Gradient hairline rule — fades toward the avatar */}
      <div aria-hidden="true" style={{
        height: 1,
        width: 52,
        marginTop: 6,
        marginLeft: align === 'right' ? 'auto' : 0,
        background: align === 'right'
          ? 'linear-gradient(270deg, rgba(134,188,37,0.45), transparent)'
          : 'linear-gradient(90deg, rgba(134,188,37,0.45), transparent)',
        opacity: 0.6,
      }} />
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
      }}
    >
      {position === 'top-left' && (
        <Readout label="Session" visible={visible} align="left">
          <HUDTimer running={sessionRunning} />
        </Readout>
      )}

      {position === 'top-right' && (
        <Readout label="Language" visible={visible} align="right">
          <span style={{
            fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.005em',
          }}>
            {LANG_NAMES[currentLang] || 'English'}
          </span>
        </Readout>
      )}

      {position === 'bottom-left' && (
        <Readout label="Model" visible={visible} align="left">
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-secondary)',
            letterSpacing: '0.02em',
          }}>
            Gemini Live 3.1
          </span>
        </Readout>
      )}

      {position === 'bottom-right' && (
        <Readout label="Status" visible={visible} align="right">
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: STATE_COLOR[appState] || STATE_COLOR.idle,
            transition: 'color 400ms var(--ease-standard)',
            paddingRight: '0.06em',
          }}>
            {appState ? appState.charAt(0).toUpperCase() + appState.slice(1) : 'Idle'}
          </span>
        </Readout>
      )}
    </div>
  )
}
