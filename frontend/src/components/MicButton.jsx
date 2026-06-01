import { useEffect, useRef, useState } from 'react'

const LABEL_KEY    = 'vaani_mic_label_shown'
const RIPPLE_DELAYS = [0, 600]

function MicIcon({ color, size = 26 }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="1" width="6" height="13" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8"  y1="23" x2="16" y2="23" />
    </svg>
  )
}

export function MicButton({ isRecording, isDisabled, onStart, onStop, appState }) {
  const holdRef   = useRef(false)
  const [showLabel, setShowLabel] = useState(!localStorage.getItem(LABEL_KEY))

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat && !holdRef.current && !isDisabled) {
        e.preventDefault()
        holdRef.current = true
        onStart()
      }
    }
    const onKeyUp = (e) => {
      if (e.code === 'Space' && holdRef.current) {
        e.preventDefault()
        holdRef.current = false
        onStop()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup',   onKeyUp)
    }
  }, [isDisabled, onStart, onStop])

  const handleStart = () => {
    if (isDisabled) return
    onStart()
    if (showLabel) {
      localStorage.setItem(LABEL_KEY, '1')
      setShowLabel(false)
    }
  }

  const isThinking = appState === 'thinking'

  const bg = isDisabled
    ? 'var(--bg-surface-1)'
    : isRecording
    ? 'var(--mic-active-bg)'
    : 'var(--mic-default-bg)'

  const border = isRecording
    ? 'transparent'
    : isDisabled
    ? 'var(--border-subtle)'
    : 'var(--mic-default-border)'

  const iconColor = isRecording
    ? 'var(--mic-active-icon)'
    : isDisabled
    ? 'var(--text-muted)'
    : 'var(--text-secondary)'

  const ariaLabel = isDisabled
    ? (isThinking ? 'Vaani is thinking — please wait' : 'Microphone unavailable')
    : isRecording
    ? 'Recording — release to send'
    : 'Hold to speak'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        {/* Ripple rings when recording */}
        {isRecording && RIPPLE_DELAYS.map((delay) => (
          <div
            key={delay}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '1.5px solid rgba(134,188,37,0.45)',
              animation: `mic-ripple 1600ms var(--ease-out-quart) ${delay}ms infinite`,
              willChange: 'transform, opacity',
              pointerEvents: 'none',
            }}
          />
        ))}

        <button
          onPointerDown={handleStart}
          onPointerUp={()    => !isDisabled && onStop()}
          onPointerLeave={()  => isRecording && !isDisabled && onStop()}
          disabled={isDisabled}
          aria-label={ariaLabel}
          aria-pressed={isRecording}
          style={{
            position: 'relative',
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: bg,
            border: `1.5px solid ${border}`,
            boxShadow: isRecording
              ? 'inset 0 0 0 8px rgba(1,52,122,0.3), 0 0 0 3px rgba(134,188,37,0.22), 0 0 28px rgba(134,188,37,0.30)'
              : 'inset 0 0 0 8px rgba(1,52,122,0.5)',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isDisabled ? 'var(--mic-disabled-opacity)' : 1,
            transform: isRecording ? 'scale(1.10)' : 'scale(1)',
            transition: [
              'transform 220ms var(--ease-spring)',
              'background var(--dur-base) var(--ease-standard)',
              'box-shadow 220ms var(--ease-standard)',
              'opacity var(--dur-fast) var(--ease-standard)',
              'border-color 220ms var(--ease-standard)',
            ].join(', '),
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            userSelect: 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,163,224,0.45)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = isRecording
              ? 'inset 0 0 0 8px rgba(1,52,122,0.3), 0 0 0 3px rgba(134,188,37,0.22), 0 0 28px rgba(134,188,37,0.30)'
              : 'inset 0 0 0 8px rgba(1,52,122,0.5)'
          }}
          onMouseEnter={(e) => {
            if (!isDisabled && !isRecording) {
              e.currentTarget.style.borderColor = 'rgba(134,188,37,0.50)'
              e.currentTarget.style.transform = 'scale(1.04)'
            }
          }}
          onMouseLeave={(e) => {
            if (!isDisabled && !isRecording) {
              e.currentTarget.style.borderColor = 'var(--mic-default-border)'
              e.currentTarget.style.transform = 'scale(1)'
            }
          }}
        >
          <MicIcon color={iconColor} />
        </button>
      </div>

      {/* HOLD SPACE label — disappears after first use */}
      {showLabel && !isRecording && (
        <span
          aria-hidden="true"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            opacity: 0.85,
            userSelect: 'none',
          }}
        >
          HOLD SPACE TO ACTIVATE
        </span>
      )}
    </div>
  )
}
