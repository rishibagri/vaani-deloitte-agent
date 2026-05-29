export function QuickReplies({ suggestions, onSelect, visible }) {
  if (!visible || !suggestions || suggestions.length === 0) return null
  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
      marginTop: 4
    }}>
      {suggestions.map((text, i) => (
        <button key={i} onClick={() => onSelect(text)} style={{
          background: 'rgba(0,163,224,0.08)',
          border: '1px solid rgba(0,163,224,0.22)',
          borderRadius: 'var(--radius-full)',
          padding: '6px 14px', cursor: 'pointer',
          color: 'var(--text-blue)', fontSize: 13,
          animation: `quick-reply-enter 300ms var(--ease-enter) ${i * 60}ms both`,
          whiteSpace: 'nowrap'
        }}>
          {text}
        </button>
      ))}
    </div>
  )
}
