export function CaptionBand({ text, visible }) {
  if (!visible || !text) return null

  return (
    <div
      role="region"
      aria-label="Captions"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        zIndex: 'var(--z-caption)',
        height: 'var(--caption-height)',
        background: 'rgba(1,9,22,0.92)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 32px',
        overflow: 'hidden',
        animation: 'caption-enter 200ms var(--ease-out-quart)',
      }}
    >
      <span style={{
        fontSize: 14,
        fontFamily: "'Inter', sans-serif",
        fontWeight: 400,
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        maxWidth: 800,
        lineHeight: 1,
      }}>
        {text}
      </span>
    </div>
  )
}
