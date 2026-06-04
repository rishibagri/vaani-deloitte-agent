export function QuickReplies({ suggestions, onSelect, visible }) {
  if (!visible || !suggestions || suggestions.length === 0) return null
  return (
    <div role="group" aria-label="Suggested replies" style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
      marginTop: 4,
      padding: '0 16px',
    }}>
      <style>{`
        .vaani-chip {
          transition: background 180ms var(--ease-out-quart),
                      border-color 180ms var(--ease-out-quart),
                      color 180ms var(--ease-out-quart),
                      transform 120ms var(--ease-out-quart);
        }
        .vaani-chip:active { transform: scale(0.97); }
        @media (prefers-reduced-motion: reduce) {
          .vaani-chip:active { transform: none; }
        }
      `}</style>
      {suggestions.map((text, i) => (
        <button
          key={text}
          className="vaani-chip"
          onClick={() => onSelect(text)}
          style={{
            /* Glass pill matching the dock language: inset top-edge refraction */
            background: 'rgba(134,188,37,0.07)',
            border: '1px solid rgba(134,188,37,0.22)',
            borderRadius: 'var(--radius-full)',
            padding: '8px 17px',
            cursor: 'pointer',
            color: 'rgba(168,192,112,0.92)',
            fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '0.005em',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            animation: `quick-reply-enter 320ms var(--ease-out-quart) ${i * 60}ms both`,
            whiteSpace: 'nowrap',
            outline: 'none',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(134,188,37,0.13)'
            e.currentTarget.style.borderColor = 'rgba(134,188,37,0.38)'
            e.currentTarget.style.color = 'var(--green)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(134,188,37,0.07)'
            e.currentTarget.style.borderColor = 'rgba(134,188,37,0.22)'
            e.currentTarget.style.color = 'rgba(168,192,112,0.92)'
          }}
          onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(134,188,37,0.40), inset 0 1px 0 rgba(255,255,255,0.06)' }}
          onBlur={e  => { e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
