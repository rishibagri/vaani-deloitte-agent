/* Circular audio waveform — 24 radial bars around the avatar.
   This component is kept as a standalone export but its logic is
   already embedded inside AvatarDisplay as Layer 6. Import and
   use directly here if you need it outside the avatar context. */

const BAR_COUNT = 24
const CENTER = 230  /* half of 460px container */
const R_INNER = 204 /* just outside 400px video (200px radius + 4px gap) */
const MAX_BAR = 22  /* max bar height in px */

export function AudioWaveform({ amplitudes = [], visible, size = 460 }) {
  const expanded = Array.from({ length: BAR_COUNT }, (_, i) => {
    const srcIdx = Math.floor((i / BAR_COUNT) * (amplitudes.length || 5))
    return Math.max(0.08, amplitudes[srcIdx] ?? 0)
  })

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      style={{
        display: 'block',
        opacity: visible ? 1 : 0,
        transition: 'opacity 400ms var(--ease-standard)',
        pointerEvents: 'none',
      }}
    >
      {expanded.map((amp, i) => {
        const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2
        const barH  = amp * MAX_BAR
        const x1 = CENTER + R_INNER * Math.cos(angle)
        const y1 = CENTER + R_INNER * Math.sin(angle)
        const x2 = CENTER + (R_INNER + barH) * Math.cos(angle)
        const y2 = CENTER + (R_INNER + barH) * Math.sin(angle)
        return (
          <line
            key={i}
            x1={x1} y1={y1}
            x2={x2} y2={y2}
            stroke="rgba(0,163,224,0.70)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}
