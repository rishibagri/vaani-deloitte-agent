export function UserBubble({ interimText, finalText }) {
  const text    = interimText || finalText
  if (!text) return null
  const isFinal = !interimText && !!finalText

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      aria-label={isFinal ? `You said: ${text}` : `Listening: ${text}`}
      style={{
        position: 'absolute',
        /* Floats to the left of the avatar circle */
        right: 'calc(var(--avatar-size) / 2 + 20px)',
        top: '22%',
        maxWidth: 'clamp(180px, 28vw, 260px)',
        zIndex: 'var(--z-bubbles)',
        pointerEvents: 'none',
        animation: 'user-bubble-enter 220ms var(--ease-out-quart)',
      }}
    >
      <div
        style={{
          background: isFinal
            ? 'rgba(0,60,90,0.72)'
            : 'transparent',
          backdropFilter: isFinal ? 'blur(14px)' : 'none',
          WebkitBackdropFilter: isFinal ? 'blur(14px)' : 'none',
          border: `1px ${isFinal ? 'solid' : 'dashed'} rgba(0,163,224,${isFinal ? 0.30 : 0.24})`,
          borderRadius: '14px 14px 3px 14px',
          padding: '10px 14px',
          color: isFinal ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontSize: 13,
          lineHeight: 1.55,
          fontFamily: "'Inter', sans-serif",
          fontStyle: isFinal ? 'normal' : 'italic',
          transition: 'background 200ms var(--ease-standard), color 200ms var(--ease-standard), border-color 200ms var(--ease-standard)',
          position: 'relative',
        }}
      >
        {text}
        {/* Tail pointing right */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: -8,
            top: 14,
            width: 0,
            height: 0,
            borderTop: '7px solid transparent',
            borderBottom: '7px solid transparent',
            borderLeft: `8px solid rgba(0,163,224,${isFinal ? 0.30 : 0.24})`,
          }}
        />
      </div>
    </div>
  )
}
