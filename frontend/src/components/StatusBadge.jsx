const STATE_CONFIG = {
  idle:      { label: 'Ready',         color: 'var(--state-idle)',      pulse: false },
  listening: { label: 'Listening',     color: 'var(--state-listening)', pulse: true  },
  thinking:  { label: 'Thinking',      color: 'var(--state-thinking)',  pulse: true  },
  speaking:  { label: 'Speaking',      color: 'var(--state-speaking)',  pulse: true  },
  error:     { label: 'Disconnected',  color: 'var(--state-error)',     pulse: false },
}

const BG = {
  idle:      'rgba(74,100,145,0.10)',
  listening: 'rgba(134,188,37,0.09)',
  thinking:  'rgba(245,166,35,0.09)',
  speaking:  'rgba(0,163,224,0.09)',
  error:     'rgba(217,59,59,0.09)',
}

const BORDER = {
  idle:      'rgba(74,100,145,0.20)',
  listening: 'rgba(134,188,37,0.24)',
  thinking:  'rgba(245,166,35,0.22)',
  speaking:  'rgba(0,163,224,0.22)',
  error:     'rgba(217,59,59,0.24)',
}

export function StatusBadge({ appState }) {
  const cfg    = STATE_CONFIG[appState] || STATE_CONFIG.idle
  const bg     = BG[appState]     || BG.idle
  const border = BORDER[appState] || BORDER.idle

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Vaani status: ${cfg.label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-full)',
        padding: '5px 14px 5px 10px',
        transition: `background ${400}ms var(--ease-standard), border-color ${400}ms var(--ease-standard)`,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: cfg.color,
          flexShrink: 0,
          animation: cfg.pulse ? 'dot-pulse 1400ms ease-in-out infinite' : 'none',
          transition: `background ${400}ms var(--ease-standard)`,
        }}
      />
      <span
        style={{
          fontSize: 12,
          fontFamily: "'Inter', sans-serif",
          fontWeight: 500,
          letterSpacing: '0.02em',
          color: cfg.color,
          transition: `color ${400}ms var(--ease-standard)`,
        }}
      >
        {cfg.label}
      </span>
    </div>
  )
}
