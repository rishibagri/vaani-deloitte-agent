import { useState, useEffect } from 'react'

const COACH_KEY = 'vaani_journey_v2'

const STEPS = [
  {
    id: 'speak',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="1" width="6" height="13" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
    title: 'Hold SPACE to speak',
    body: 'Press and hold the spacebar — or tap the button — to start a turn. Release to send.',
  },
  {
    id: 'language',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
      </svg>
    ),
    title: 'Any language, automatically',
    body: 'Vaani detects your language as you speak — Hindi, Tamil, Telugu, and 8 others. Switch mid-conversation freely.',
  },
  {
    id: 'interrupt',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    ),
    title: 'Interrupt at any time',
    body: "Press SPACE while Vaani is speaking to cut in — she'll stop and listen immediately.",
  },
]

export function UserJourneyCoach({ ready }) {
  const [step, setStep]       = useState(0)
  const [visible, setVisible] = useState(false)
  const [show, setShow]       = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (!ready) return
    if (localStorage.getItem(COACH_KEY)) return
    // Small delay so it doesn't appear mid-boot
    const t = setTimeout(() => {
      setShow(true)
      requestAnimationFrame(() => setVisible(true))
    }, 900)
    return () => clearTimeout(t)
  }, [ready])

  const advance = () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
    } else {
      dismiss()
    }
  }

  const dismiss = () => {
    setExiting(true)
    localStorage.setItem(COACH_KEY, '1')
    setTimeout(() => setShow(false), 350)
  }

  if (!show) return null

  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 168,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--z-toast)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'all',
          background: 'rgba(1,10,26,0.96)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          width: 320,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(134,188,37,0.08)',
          opacity: visible && !exiting ? 1 : 0,
          transform: visible && !exiting ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 320ms var(--ease-out-quart), transform 320ms var(--ease-out-quart)',
        }}
      >
        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                height: 2,
                flex: 1,
                borderRadius: 'var(--radius-full)',
                background: i <= step ? 'var(--green)' : 'var(--border-default)',
                transition: 'background 250ms',
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ color: 'var(--green)', flexShrink: 0, marginTop: 1 }}>
            {current.icon}
          </div>
          <div>
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--text-primary)',
              marginBottom: 4,
              letterSpacing: '-0.01em',
            }}>
              {current.title}
            </div>
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
            }}>
              {current.body}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <button
            onClick={dismiss}
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-muted)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: 'pointer', padding: '4px 0',
              transition: 'color 150ms',
            }}
            onMouseEnter={(e) => { e.target.style.color = 'var(--text-secondary)' }}
            onMouseLeave={(e) => { e.target.style.color = 'var(--text-muted)' }}
          >
            Skip
          </button>
          <button
            onClick={advance}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px',
              background: 'var(--green)',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              color: '#010A1A',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 600, fontSize: 13,
              cursor: 'pointer',
              transition: 'opacity 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            {isLast ? "Let's go" : 'Next'}
            {!isLast && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>

        {/* Arrow pointing down toward mic */}
        <div aria-hidden="true" style={{
          position: 'absolute',
          bottom: -7,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 12, height: 7,
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            top: 0, left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            width: 10, height: 10,
            background: 'rgba(1,10,26,0.96)',
            border: '1px solid var(--border-default)',
            borderTop: 'none',
            borderLeft: 'none',
          }} />
        </div>
      </div>
    </div>
  )
}
