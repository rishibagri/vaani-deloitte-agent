const STATE_CONFIG = {
  connecting: { label: 'Connecting',      color: 'var(--text-muted)',      pulse: true  },
  idle:       { label: 'Ready',           color: 'var(--state-idle)',      pulse: false },
  listening:  { label: 'Listening',       color: 'var(--state-listening)', pulse: true  },
  thinking:   { label: 'Thinking',        color: 'var(--state-thinking)',  pulse: true  },
  speaking:   { label: 'Speaking',        color: 'var(--state-speaking)',  pulse: true  },
  error:      { label: 'Offline',         color: 'var(--state-error)',     pulse: false },
}

const BG = {
  connecting: 'rgba(255,255,255,0.04)',
  idle:       'rgba(61,90,138,0.07)',
  listening:  'rgba(134,188,37,0.07)',
  thinking:   'rgba(245,166,35,0.07)',
  speaking:   'rgba(0,163,224,0.07)',
  error:      'rgba(255,68,68,0.07)',
}

const BORDER = {
  connecting: 'rgba(255,255,255,0.10)',
  idle:       'rgba(61,90,138,0.15)',
  listening:  'rgba(134,188,37,0.20)',
  thinking:   'rgba(245,166,35,0.18)',
  speaking:   'rgba(0,163,224,0.18)',
  error:      'rgba(255,68,68,0.20)',
}

export function StatusBadge({ appState, connected }) {
  const key    = connected !== 'connected' ? 'connecting' : (appState || 'idle')
  const cfg    = STATE_CONFIG[key] || STATE_CONFIG.idle
  const bg     = BG[key]     || BG.idle
  const border = BORDER[key] || BORDER.idle

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Vaani: ${cfg.label}${connected !== 'connected' ? ' — waiting for backend' : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-full)',
        padding: '6px 15px 6px 11px',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
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
          boxShadow: cfg.pulse ? `0 0 8px ${cfg.color}` : 'none',
          animation: cfg.pulse ? 'dot-pulse 1400ms ease-in-out infinite' : 'none',
          transition: `background 400ms var(--ease-standard)`,
        }}
      />
      <span
        key={key}
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10.5,
          fontWeight: 500,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: cfg.color,
          paddingRight: '0.14em',
          transition: `color 400ms var(--ease-standard)`,
          animation: 'hud-reveal 320ms var(--ease-out-quart) both',
        }}
      >
        {cfg.label}
      </span>
    </div>
  )
}
