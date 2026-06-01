const STATE_CONFIG = {
  idle:      { label: 'READY',         color: 'var(--state-idle)',      pulse: false },
  listening: { label: 'LISTENING',     color: 'var(--state-listening)', pulse: true  },
  thinking:  { label: 'THINKING',      color: 'var(--state-thinking)',  pulse: true  },
  speaking:  { label: 'SPEAKING',      color: 'var(--state-speaking)',  pulse: true  },
  error:     { label: 'DISCONNECTED',  color: 'var(--state-error)',     pulse: false },
}

const BG = {
  idle:      'rgba(61,90,138,0.08)',
  listening: 'rgba(134,188,37,0.08)',
  thinking:  'rgba(245,166,35,0.08)',
  speaking:  'rgba(0,163,224,0.08)',
  error:     'rgba(255,68,68,0.08)',
}

const BORDER = {
  idle:      'rgba(61,90,138,0.18)',
  listening: 'rgba(134,188,37,0.22)',
  thinking:  'rgba(245,166,35,0.20)',
  speaking:  'rgba(0,163,224,0.20)',
  error:     'rgba(255,68,68,0.22)',
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
        transition: `background 400ms var(--ease-standard), border-color 400ms var(--ease-standard)`,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 6, height: 6,
          borderRadius: '50%',
          background: cfg.color,
          flexShrink: 0,
          animation: cfg.pulse ? 'dot-pulse 1400ms ease-in-out infinite' : 'none',
          transition: `background 400ms var(--ease-standard)`,
        }}
      />
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        letterSpacing: '0.10em',
        color: cfg.color,
        transition: `color 400ms var(--ease-standard)`,
      }}>
        {cfg.label}
      </span>
    </div>
  )
}
