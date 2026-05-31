import { useEffect, useState } from 'react'

export function SessionTimer({ running, onWarning }) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!running) return
    setSeconds(0)
    const id = setInterval(() => {
      setSeconds(s => {
        const next = s + 1
        if (next === 13 * 60 && onWarning) onWarning(120)
        if (next === 14 * 60 && onWarning) onWarning(60)
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [running, onWarning])

  const mins      = Math.floor(seconds / 60).toString().padStart(2, '0')
  const secs      = (seconds % 60).toString().padStart(2, '0')
  const isWarning = seconds >= 13 * 60

  return (
    <span
      role="timer"
      aria-label={`Session time: ${mins} minutes ${secs} seconds`}
      style={{
        fontFamily: "'Inter', sans-serif",
        fontVariantNumeric: 'tabular-nums',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.04em',
        color: isWarning ? 'var(--state-thinking)' : 'var(--text-muted)',
        transition: 'color 500ms var(--ease-standard)',
      }}
    >
      {mins}:{secs}
    </span>
  )
}
