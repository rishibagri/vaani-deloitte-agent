/* 20-bar waveform. Center bars are taller (gaussian envelope) for a
   more natural voice-spectrum appearance. */
const BAR_COUNT = 20

function gaussianWeight(i, count) {
  const center = (count - 1) / 2
  const sigma  = count / 4
  return Math.exp(-((i - center) ** 2) / (2 * sigma ** 2))
}

export function AudioWaveform({ amplitudes, visible }) {
  /* Pad or trim to exactly BAR_COUNT */
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
    const raw = amplitudes[i] ?? 0
    return Math.max(0.08, raw) * gaussianWeight(i, BAR_COUNT) * 1.6
  })

  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2.5,
        height: 28,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scaleX(1)' : 'translateY(4px) scaleX(0.85)',
        transition: 'opacity 280ms var(--ease-out-quart), transform 280ms var(--ease-out-quart)',
        willChange: 'opacity, transform',
      }}
    >
      {bars.map((amp, i) => (
        <div
          key={i}
          style={{
            width: 2.5,
            height: 28,
            borderRadius: 2,
            background: 'var(--brand-green)',
            transformOrigin: 'center',
            transform: `scaleY(${Math.min(1, Math.max(0.08, amp))})`,
            transition: 'transform 55ms var(--ease-standard)',
            opacity: 0.75 + amp * 0.25,
            animation: (visible && amp < 0.12)
              ? `wave-idle 900ms ease-in-out infinite`
              : 'none',
            animationDelay: `${i * 45}ms`,
          }}
        />
      ))}
    </div>
  )
}
