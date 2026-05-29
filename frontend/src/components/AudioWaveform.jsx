export function AudioWaveform({ amplitudes, visible }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 4, height: 32,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(6px)',
      transition: 'opacity 300ms, transform 300ms var(--ease-enter)'
    }}>
      {amplitudes.map((amp, i) => (
        <div key={i} style={{
          width: 4,
          height: 32,
          borderRadius: 2,
          background: 'var(--state-listening)',
          transformOrigin: 'bottom center',
          transform: `scaleY(${Math.max(0.15, amp)})`,
          transition: 'transform 60ms var(--ease-standard)',
          animation: visible && amp < 0.05
            ? `wave-idle 800ms ease-in-out infinite`
            : 'none',
          animationDelay: `${i * 100}ms`
        }} />
      ))}
    </div>
  )
}
