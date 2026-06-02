import { useEffect, useRef, useState } from 'react'

/* Word stagger: builds a growing list of word items,
   animating only newly appended words. */
function useWordItems(text) {
  const [items, setItems] = useState([])
  const prevTextRef = useRef('')

  useEffect(() => {
    const prev = prevTextRef.current
    const curr = text || ''

    if (!curr) {
      setItems([])
      prevTextRef.current = ''
      return
    }

    const prevWords = prev.trim() ? prev.trim().split(/\s+/) : []
    const currWords = curr.trim().split(/\s+/)

    if (curr.startsWith(prev) && currWords.length > prevWords.length) {
      const newWords = currWords.slice(prevWords.length)
      setItems(existing => [
        ...existing.map(w => ({ ...w, isNew: false })),
        ...newWords.map((word, i) => ({
          id:    existing.length + i,
          word,
          isNew: true,
          delay: i * 80,
        })),
      ])
    } else if (!curr.startsWith(prev)) {
      setItems(currWords.map((word, i) => ({
        id: i, word, isNew: true, delay: i * 40,
      })))
    }

    prevTextRef.current = curr
  }, [text])

  return items
}

export function TranscriptOverlay({ agentText, isStreaming, userText, currentLang }) {
  const hasContent = !!(agentText || userText)
  const [mounted,  setMounted]  = useState(false)
  const [visible,  setVisible]  = useState(false)
  const hideTimer  = useRef(null)
  const wordItems  = useWordItems(agentText || '')

  /* Mount then animate in */
  useEffect(() => {
    if (hasContent) {
      clearTimeout(hideTimer.current)
      if (!mounted) setMounted(true)
      requestAnimationFrame(() => setVisible(true))
    }
  }, [hasContent, mounted])

  /* Auto-dismiss 2.5s after streaming ends and content stabilises */
  useEffect(() => {
    if (!isStreaming && agentText && !userText) {
      clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => {
        setVisible(false)
        setTimeout(() => setMounted(false), 320)
      }, 2500)
    }
    return () => clearTimeout(hideTimer.current)
  }, [isStreaming, agentText, userText])

  if (!mounted) return null

  return (
    <div
      role="region"
      aria-label="Transcript"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        zIndex: 'var(--z-transcript)',
        width: 'min(660px, 90vw)',
        background: 'rgba(1,15,38,0.72)',
        backdropFilter: 'blur(28px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderTop: '1.5px solid rgba(134,188,37,0.45)',
        borderRadius: 16,
        padding: '16px 20px 18px',
        opacity: visible ? 1 : 0,
        transform: visible
          ? 'translateX(-50%) translateY(0)'
          : 'translateX(-50%) translateY(16px)',
        transition: 'opacity 280ms var(--ease-out-quart), transform 280ms var(--ease-out-quart)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
      }}
    >
      {/* Agent text */}
      {(agentText || wordItems.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {/* Avatar dot */}
          <div style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 1,
            background: 'rgba(134,188,37,0.15)', border: '1.5px solid rgba(134,188,37,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isStreaming ? (
              <div style={{
                width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',
                animation: 'dot-pulse 900ms ease-in-out infinite',
              }} />
            ) : (
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 10, color: 'var(--green)', lineHeight: 1 }}>V</span>
            )}
          </div>

          <p style={{
            margin: 0,
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            lineHeight: 1.65,
            color: 'var(--text-primary)',
            textWrap: 'pretty',
            flex: 1,
          }}>
            {wordItems.map(item => (
              <span
                key={item.id}
                style={{
                  display: 'inline',
                  animation: item.isNew
                    ? `word-in 200ms var(--ease-out-quart) ${item.delay}ms both`
                    : 'none',
                }}
              >
                {item.word}{' '}
              </span>
            ))}
            {isStreaming && (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 2,
                  height: 13,
                  background: 'var(--brand-blue)',
                  borderRadius: 1,
                  verticalAlign: 'middle',
                  marginLeft: 2,
                  animation: 'cursor-blink 700ms steps(1) infinite',
                }}
              />
            )}
          </p>
        </div>
      )}

      {/* User text */}
      {userText && (
        <p style={{
          margin: agentText ? '10px 0 0 34px' : '0 0 0 34px',
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
          fontStyle: 'italic',
          opacity: 0.8,
        }}>
          {userText}
        </p>
      )}
    </div>
  )
}
