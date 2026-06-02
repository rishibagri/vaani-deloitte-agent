export function QuickReplies({ suggestions, onSelect, visible }) {
  if (!visible || !suggestions || suggestions.length === 0) return null
  return (
    <div role="group" aria-label="Suggested replies" style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
      marginTop: 4,
      padding: '0 16px',
    }}>
      {suggestions.map((text, i) => (
        <button
          key={text}
          onClick={() => onSelect(text)}
          style={{
            background: 'rgba(134,188,37,0.06)',
            border: '1px solid rgba(134,188,37,0.20)',
            borderRadius: 'var(--radius-full)',
            padding: '7px 16px',
            cursor: 'pointer',
            color: 'rgba(134,188,37,0.85)',
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: '0.01em',
            animation: `quick-reply-enter 300ms var(--ease-enter) ${i * 60}ms both`,
            whiteSpace: 'nowrap',
            transition: 'background 150ms, border-color 150ms, color 150ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(134,188,37,0.12)'
            e.currentTarget.style.borderColor = 'rgba(134,188,37,0.35)'
            e.currentTarget.style.color = 'var(--green)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(134,188,37,0.06)'
            e.currentTarget.style.borderColor = 'rgba(134,188,37,0.20)'
            e.currentTarget.style.color = 'rgba(134,188,37,0.85)'
          }}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
