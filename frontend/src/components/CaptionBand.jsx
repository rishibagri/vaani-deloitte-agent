export function CaptionBand({ text, visible }) {
  if (!visible || !text) return null
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
      height: 36,
      background: 'rgba(1,13,32,0.90)',
      backdropFilter: 'blur(8px)',
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 24px', overflow: 'hidden'
    }}>
      <span style={{
        fontSize: 12, color: 'var(--text-secondary)',
        whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden',
        maxWidth: '100%'
      }}>
        {text}
      </span>
    </div>
  )
}
