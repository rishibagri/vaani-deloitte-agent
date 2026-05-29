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

  const mins = Math.floor(seconds / 60).toString().padStart(2, '0')
  const secs = (seconds % 60).toString().padStart(2, '0')
  const isWarning = seconds >= 13 * 60

  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      color: isWarning ? 'var(--state-thinking)' : 'var(--text-muted)',
      transition: 'color 500ms'
    }}>
      {mins}:{secs}
    </span>
  )
}
