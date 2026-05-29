export function UserBubble({ interimText, finalText }) {
  const text = interimText || finalText
  if (!text) return null
  const isFinal = !interimText && !!finalText

  return (
    <div style={{
      position: 'absolute',
      right: 'calc(50% + 195px)',
      top: 'calc(50% + 50px)',
      maxWidth: 240, zIndex: 10, pointerEvents: 'none',
      animation: 'user-bubble-enter 250ms var(--ease-enter)'
    }}>
      <div style={{
        background: isFinal ? 'rgba(0,163,224,0.15)' : 'transparent',
        border: `1px ${isFinal ? 'solid' : 'dashed'} rgba(0,163,224,${isFinal ? 0.35 : 0.28})`,
        borderRadius: '18px 18px 4px 18px',
        padding: '10px 14px',
        color: isFinal ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 13, lineHeight: 1.55,
        fontStyle: isFinal ? 'normal' : 'italic',
        transition: 'all 200ms ease',
        position: 'relative'
      }}>
        {text}
        <div style={{
          position: 'absolute', right: -10, top: 12,
          width: 0, height: 0,
          borderTop: '7px solid transparent',
          borderBottom: '7px solid transparent',
          borderLeft: `9px solid rgba(0,163,224,${isFinal ? 0.35 : 0.28})`
        }} />
      </div>
    </div>
  )
}
