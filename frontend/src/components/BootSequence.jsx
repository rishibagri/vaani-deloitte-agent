import { useEffect, useState, useRef } from 'react'

const BOOT_KEY = 'vaani_boot_played'

const STATUS_LINES = [
  { label: 'GEMINI LIVE API',  pending: 'CONNECTING',    done: 'CONNECTED' },
  { label: 'AVATAR MODULE',    pending: 'LOADING',       done: 'READY'     },
  { label: 'MEMORY LAYER',     pending: 'INITIALIZING',  done: 'ONLINE'    },
  { label: 'SESSION HANDLER',  pending: 'STANDBY',       done: 'ACTIVE'    },
]

const PAD = 24

function StatusLine({ label, pending, done, visible, flickered }) {
  const [displayText, setDisplayText] = useState(pending)
  const [textColor,   setTextColor]   = useState('#3D5A8A')
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!flickered) return
    let count = 0
    intervalRef.current = setInterval(() => {
      count++
      setTextColor(count % 2 === 0 ? '#3D5A8A' : 'rgba(61,90,138,0.1)')
      if (count >= 6) {
        clearInterval(intervalRef.current)
        setDisplayText(done)
        setTextColor('#86BC25')
      }
    }, 50)
    return () => clearInterval(intervalRef.current)
  }, [flickered, done])

  const dots = '.'.repeat(Math.max(2, PAD - label.length))

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      letterSpacing: '0.05em',
      display: 'flex',
      gap: 0,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(4px)',
      transition: 'opacity 250ms ease-out, transform 250ms ease-out',
    }}>
      <span style={{ color: '#3D5A8A' }}>{label}</span>
      <span style={{ color: 'rgba(61,90,138,0.25)', letterSpacing: '0.04em' }}>{dots}</span>
      <span style={{ color: textColor, transition: 'color 40ms' }}>{displayText}</span>
    </div>
  )
}

export function BootSequence({ onComplete }) {
  const [showDeloitte,  setShowDeloitte]  = useState(false)
  const [showSubtitle,  setShowSubtitle]  = useState(false)
  const [showBar,       setShowBar]       = useState(false)
  const [barFill,       setBarFill]       = useState(false)
  const [lineVisible,   setLineVisible]   = useState([false, false, false, false])
  const [lineFlickered, setLineFlickered] = useState([false, false, false, false])
  const [showHex,       setShowHex]       = useState(false)
  const [fading,        setFading]        = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(BOOT_KEY)) {
      onComplete()
      return
    }

    const timers = []
    const at = (ms, fn) => timers.push(setTimeout(fn, ms))

    at(600,  () => setShowDeloitte(true))
    at(1000, () => setShowSubtitle(true))
    at(1400, () => { setShowBar(true); at(60, () => setBarFill(true)) })

    STATUS_LINES.forEach((_, i) => {
      at(1800 + i * 200, () => {
        setLineVisible(p  => { const n = [...p]; n[i] = true; return n })
        at(420, () => {
          setLineFlickered(p => { const n = [...p]; n[i] = true; return n })
        })
      })
    })

    at(3600, () => setShowHex(true))
    at(4200, () => setFading(true))
    at(4800, () => {
      sessionStorage.setItem(BOOT_KEY, '1')
      onComplete()
    })

    return () => timers.forEach(clearTimeout)
  }, [onComplete])

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-boot)',
        background: '#010A1A',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: fading ? 0 : 1,
        transition: 'opacity 600ms ease-out',
        pointerEvents: fading ? 'none' : 'all',
      }}
    >
      {/* Scanline */}
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        height: 2,
        background: 'rgba(134,188,37,0.4)',
        animation: 'scanline-sweep 600ms ease-out forwards',
        pointerEvents: 'none',
      }} />

      {/* Hex wireframe */}
      <svg
        viewBox="0 0 200 232"
        width="560"
        height="650"
        fill="none"
        aria-hidden="true"
        style={{
          position: 'absolute',
          opacity: showHex ? 0.07 : 0,
          transition: 'opacity 600ms ease-out',
          stroke: '#86BC25',
          strokeWidth: 0.8,
          animation: showHex ? 'hex-rotate 45000ms linear infinite' : 'none',
          transformOrigin: 'center center',
          pointerEvents: 'none',
        }}
      >
        <polygon points="100,4 196,52 196,180 100,228 4,180 4,52" />
        <polygon points="100,30 172,72 172,160 100,202 28,160 28,72" />
        <polygon points="100,56 148,92 148,140 100,176 52,140 52,92" />
        <line x1="100" y1="4"   x2="100" y2="228" strokeOpacity="0.4" />
        <line x1="4"   y1="52"  x2="196" y2="180" strokeOpacity="0.4" />
        <line x1="196" y1="52"  x2="4"   y2="180" strokeOpacity="0.4" />
      </svg>

      {/* Boot content */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
        position: 'relative',
        zIndex: 1,
      }}>

        {/* DELOITTE */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          letterSpacing: '0.5em',
          textTransform: 'uppercase',
          color: '#86BC25',
          opacity: showDeloitte ? 1 : 0,
          transform: showDeloitte ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 400ms ease-out, transform 400ms ease-out',
          paddingRight: '0.5em', /* compensate for letter-spacing on last char */
        }}>
          DELOITTE
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: '#3D5A8A',
          marginTop: 8,
          opacity: showSubtitle ? 1 : 0,
          transform: showSubtitle ? 'translateY(0)' : 'translateY(4px)',
          transition: 'opacity 400ms ease-out, transform 400ms ease-out',
          paddingRight: '0.28em',
        }}>
          DCIT // AVATAR INTELLIGENCE SYSTEM
        </div>

        {/* Progress bar */}
        <div style={{
          marginTop: 20,
          width: 200,
          height: 1,
          background: 'rgba(61,90,138,0.20)',
          opacity: showBar ? 1 : 0,
          transition: 'opacity 200ms ease-out',
        }}>
          <div style={{
            height: '100%',
            background: '#86BC25',
            width: barFill ? '100%' : '0%',
            transition: 'width 500ms ease-out',
          }} />
        </div>

        {/* Status lines */}
        <div style={{
          marginTop: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          alignItems: 'flex-start',
        }}>
          {STATUS_LINES.map((line, i) => (
            <StatusLine
              key={line.label}
              label={line.label}
              pending={line.pending}
              done={line.done}
              visible={lineVisible[i]}
              flickered={lineFlickered[i]}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
