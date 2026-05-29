const STATE_CONFIG = {
  idle:      { label: 'Ready',        color: 'var(--state-idle)',      pulse: false },
  listening: { label: 'Listening...', color: 'var(--state-listening)', pulse: true  },
  thinking:  { label: 'Thinking...',  color: 'var(--state-thinking)',  pulse: true  },
  speaking:  { label: 'Speaking',     color: 'var(--state-speaking)',  pulse: true  },
  error:     { label: 'Disconnected', color: 'var(--state-error)',     pulse: false }
}

export function StatusBadge({ appState }) {
  const cfg = STATE_CONFIG[appState] || STATE_CONFIG.idle
  const bgMap = {
    idle:      'rgba(61,90,138,0.12)',
    listening: 'rgba(134,188,37,0.10)',
    thinking:  'rgba(245,166,35,0.10)',
    speaking:  'rgba(0,163,224,0.10)',
    error:     'rgba(217,59,59,0.10)'
  }
  const borderMap = {
    idle:      'rgba(61,90,138,0.20)',
    listening: 'rgba(134,188,37,0.25)',
    thinking:  'rgba(245,166,35,0.22)',
    speaking:  'rgba(0,163,224,0.22)',
    error:     'rgba(217,59,59,0.25)'
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: bgMap[appState] || bgMap.idle,
      border: `1px solid ${borderMap[appState] || borderMap.idle}`,
      borderRadius: 'var(--radius-full)',
      padding: '5px 14px',
      transition: 'all 400ms var(--ease-standard)'
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: cfg.color,
        animation: cfg.pulse ? 'dot-pulse 1200ms ease-in-out infinite' : 'none',
        transition: 'background 400ms var(--ease-standard)'
      }} />
      <span style={{
        fontSize: 13, fontWeight: 500, color: cfg.color,
        transition: 'color 400ms var(--ease-standard)'
      }}>
        {cfg.label}
      </span>
    </div>
  )
}
