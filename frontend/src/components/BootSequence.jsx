import { useEffect, useState, useRef } from 'react'

const BOOT_KEY = 'vaani_boot_played'

const STATUS_LINES = [
  { label: 'GEMINI LIVE API', pending: 'LINK',   done: 'CONNECTED' },
  { label: 'AVATAR ENGINE',   pending: 'WARMUP', done: 'READY'     },
  { label: 'MEMORY LAYER',    pending: 'SYNC',   done: 'ONLINE'    },
  { label: 'SESSION',         pending: 'HOLD',   done: 'ACTIVE'    },
]

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const PAD = 18

/* A single telemetry line: pending label flickers once, then resolves to "done" in brand green. */
function StatusLine({ label, pending, done, visible, flickered }) {
  const [displayText, setDisplayText] = useState(pending)
  const [resolved, setResolved] = useState(false)
  const [flickerOn, setFlickerOn] = useState(true)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!flickered) return
    if (prefersReduced) {
      setDisplayText(done)
      setResolved(true)
      return
    }
    let count = 0
    intervalRef.current = setInterval(() => {
      count++
      setFlickerOn((v) => !v)
      if (count >= 4) {
        clearInterval(intervalRef.current)
        setFlickerOn(true)
        setDisplayText(done)
        setResolved(true)
      }
    }, 55)
    return () => clearInterval(intervalRef.current)
  }, [flickered, done])

  const dots = '·'.repeat(Math.max(2, PAD - label.length))

  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10.5,
        letterSpacing: '0.16em',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        opacity: visible ? (flickerOn ? 1 : 0.35) : 0,
        transform: visible ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 90ms linear, transform 380ms cubic-bezier(0.16,1,0.3,1)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'rgba(240,240,240,0.82)' }}>{label}</span>
      <span style={{ color: 'rgba(74,96,48,0.55)', padding: '0 6px', letterSpacing: '0.1em' }}>{dots}</span>
      <span
        style={{
          color: resolved ? '#86BC25' : '#A8C070',
          minWidth: 82,
          textAlign: 'right',
          transition: 'color 150ms ease-out',
          textShadow: resolved ? '0 0 16px rgba(134,188,37,0.65)' : 'none',
          fontWeight: resolved ? 600 : 400,
        }}
      >
        {displayText}
      </span>
    </div>
  )
}

export function BootSequence({ onComplete }) {
  const [stage, setStage] = useState({
    mark: false,
    word: false,
    sub: false,
    bar: false,
    barFill: false,
    field: false,
    fading: false,
  })
  const [lineVisible, setLineVisible] = useState([false, false, false, false])
  const [lineFlickered, setLineFlickered] = useState([false, false, false, false])

  const set = (k, v) => setStage((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (sessionStorage.getItem(BOOT_KEY)) {
      onComplete()
      return
    }

    const timers = []
    const at = (ms, fn) => timers.push(setTimeout(fn, ms))

    if (prefersReduced) {
      // Static, accessible path: reveal everything, brief hold, exit.
      set('mark', true); set('word', true); set('sub', true)
      set('bar', true); set('barFill', true); set('field', true)
      setLineVisible([true, true, true, true])
      setLineFlickered([true, true, true, true])
      at(1400, () => set('fading', true))
      at(1900, () => { sessionStorage.setItem(BOOT_KEY, '1'); onComplete() })
      return () => timers.forEach(clearTimeout)
    }

    at(220,  () => set('mark', true))
    at(560,  () => set('word', true))
    at(820,  () => set('sub', true))
    at(1080, () => { set('field', true); set('bar', true); at(40, () => set('barFill', true)) })

    STATUS_LINES.forEach((_, i) => {
      at(1240 + i * 150, () => {
        setLineVisible((p) => { const n = [...p]; n[i] = true; return n })
        at(260, () => setLineFlickered((p) => { const n = [...p]; n[i] = true; return n }))
      })
    })

    at(2900, () => set('fading', true))
    at(3450, () => { sessionStorage.setItem(BOOT_KEY, '1'); onComplete() })

    return () => timers.forEach(clearTimeout)
  }, [onComplete])

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-boot)',
        background:
          'radial-gradient(120% 90% at 50% 38%, #0b1016 0%, #05080d 52%, #03060a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: stage.fading ? 0 : 1,
        transform: stage.fading ? 'scale(1.012)' : 'scale(1)',
        transition: 'opacity 520ms cubic-bezier(0.4,0,0.2,1), transform 520ms cubic-bezier(0.4,0,0.2,1)',
        pointerEvents: stage.fading ? 'none' : 'all',
      }}
    >
      {/* Fine vertical grid haze — engineered backdrop, not decoration */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(90deg, rgba(134,188,37,0.05) 1px, transparent 1px), linear-gradient(rgba(134,188,37,0.02) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(60% 50% at 50% 42%, #000 0%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(60% 50% at 50% 42%, #000 0%, transparent 85%)',
          opacity: stage.mark ? 0.6 : 0,
          transition: 'opacity 1200ms ease-out',
          pointerEvents: 'none',
        }}
      />

      {/* Opening scanline sweep */}
      {!prefersReduced && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 1,
            background:
              'linear-gradient(90deg, transparent, rgba(134,188,37,0.55) 50%, transparent)',
            animation: 'scanline-sweep 560ms cubic-bezier(0.16,1,0.3,1) forwards',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Boot content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          position: 'relative',
          zIndex: 1,
          padding: '0 24px',
        }}
      >
        {/* Brand mark — concentric ring with a single drawn-in stroke */}
        <svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          fill="none"
          aria-hidden="true"
          style={{
            marginBottom: 26,
            opacity: stage.mark ? 1 : 0,
            transform: stage.mark ? 'scale(1)' : 'scale(0.82)',
            transition:
              'opacity 600ms ease-out, transform 700ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <circle cx="32" cy="32" r="30" stroke="rgba(134,188,37,0.16)" strokeWidth="1" />
          <circle
            cx="32"
            cy="32"
            r="30"
            stroke="#86BC25"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="188.5"
            strokeDashoffset={stage.mark ? 0 : 188.5}
            transform="rotate(-90 32 32)"
            style={{
              transition: 'stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1) 120ms',
              filter: 'drop-shadow(0 0 6px rgba(134,188,37,0.5))',
            }}
          />
          {/* Inner solid dot — the "intelligence is live" core */}
          <circle
            cx="32"
            cy="32"
            r="5"
            fill="#86BC25"
            style={{
              opacity: stage.sub ? 1 : 0,
              transform: stage.sub ? 'scale(1)' : 'scale(0.4)',
              transformOrigin: 'center',
              transition: 'opacity 400ms ease-out, transform 500ms cubic-bezier(0.16,1,0.3,1)',
              filter: 'drop-shadow(0 0 8px rgba(134,188,37,0.7))',
            }}
          />
        </svg>

        {/* Wordmark — Vaani, the product */}
        <div
          style={{
            fontFamily: "'Syne', 'Plus Jakarta Sans', sans-serif",
            fontSize: 46,
            fontWeight: 700,
            letterSpacing: '0.02em',
            lineHeight: 1,
            color: '#F0F0F0',
            opacity: stage.word ? 1 : 0,
            transform: stage.word ? 'translateY(0)' : 'translateY(10px)',
            filter: stage.word ? 'blur(0)' : 'blur(6px)',
            transition:
              'opacity 600ms ease-out, transform 700ms cubic-bezier(0.16,1,0.3,1), filter 700ms ease-out',
          }}
        >
          Vaani
        </div>

        {/* Eyebrow — provenance line in mono */}
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9.5,
            letterSpacing: '0.42em',
            textTransform: 'uppercase',
            color: 'rgba(168,192,112,0.7)',
            marginTop: 16,
            paddingLeft: '0.42em',
            opacity: stage.sub ? 1 : 0,
            transform: stage.sub ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 500ms ease-out, transform 500ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          Deloitte&nbsp;&nbsp;DCIT&nbsp;&nbsp;India
        </div>

        {/* Progress hairline */}
        <div
          style={{
            marginTop: 30,
            width: 220,
            height: 1,
            background: 'rgba(61,90,138,0.22)',
            position: 'relative',
            overflow: 'hidden',
            opacity: stage.bar ? 1 : 0,
            transition: 'opacity 300ms ease-out',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transformOrigin: 'left center',
              transform: stage.barFill ? 'scaleX(1)' : 'scaleX(0)',
              background:
                'linear-gradient(90deg, rgba(134,188,37,0.5), #86BC25)',
              boxShadow: '0 0 10px rgba(134,188,37,0.6)',
              transition: 'transform 1700ms cubic-bezier(0.4,0,0.2,1)',
            }}
          />
        </div>

        {/* Telemetry field */}
        <div
          style={{
            marginTop: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: 11,
            alignItems: 'flex-start',
            opacity: stage.field ? 1 : 0,
            transition: 'opacity 400ms ease-out',
          }}
        >
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
