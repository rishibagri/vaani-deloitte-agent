import { useEffect, useRef } from 'react'

const MicIcon = ({ color }) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)

export function MicButton({ isRecording, isDisabled, onStart, onStop }) {
  const holdRef = useRef(false)

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space' && !holdRef.current && !isDisabled) {
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
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [isDisabled, onStart, onStop])

  const bg = isDisabled
    ? 'var(--bg-surface-1)'
    : isRecording
    ? 'var(--mic-active-bg)'
    : 'var(--mic-default-bg)'

  const iconColor = isRecording ? 'var(--mic-active-icon)' : 'var(--text-secondary)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <button
        onPointerDown={() => !isDisabled && onStart()}
        onPointerUp={() => !isDisabled && onStop()}
        onPointerLeave={() => isRecording && !isDisabled && onStop()}
        disabled={isDisabled}
        style={{
          width: 72, height: 72, borderRadius: '50%',
          background: bg,
          border: `1.5px solid ${isRecording ? 'transparent' : 'var(--mic-default-border)'}`,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: isDisabled ? 0.35 : 1,
          transform: isRecording ? 'scale(1.10)' : 'scale(1)',
          boxShadow: isRecording
            ? '0 0 0 4px rgba(134,188,37,0.25), 0 0 24px rgba(134,188,37,0.30)'
            : 'none',
          transition: 'transform 150ms var(--ease-spring), background 200ms var(--ease-standard), box-shadow 200ms var(--ease-standard)',
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
          position: 'relative', overflow: 'hidden'
        }}
      >
        <MicIcon color={iconColor} />
      </button>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, color: 'var(--text-muted)',
        letterSpacing: '0.04em'
      }}>
        Hold SPACE to speak
      </span>
    </div>
  )
}
