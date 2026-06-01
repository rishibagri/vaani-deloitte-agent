import { useEffect, useRef, useState } from 'react'

const LANG_NAMES = {
  en: 'EN', hi: 'HI', ta: 'TA', te: 'TE', kn: 'KN',
  ml: 'ML', bn: 'BN', gu: 'GU', mr: 'MR', pa: 'PA', ur: 'UR',
}

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
      // Reset — new turn
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
  const langCode   = LANG_NAMES[currentLang] || 'EN'

  /* Mount then animate in */
  useEffect(() => {
    if (hasContent) {
      clearTimeout(hideTimer.current)
      if (!mounted) setMounted(true)
      requestAnimationFrame(() => setVisible(true))
    } else {
      /* No content — nothing to show yet */
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
        width: 'min(680px, 90vw)',
        background: 'rgba(1,33,105,0.60)',
        backdropFilter: 'blur(24px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
        borderTop: '2px solid #86BC25',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '0 0 20px 20px',
        padding: '14px 20px 16px',
        opacity: visible ? 1 : 0,
        transform: visible
          ? 'translateX(-50%) translateY(0)'
          : 'translateX(-50%) translateY(20px)',
        transition: 'opacity 300ms var(--ease-out-quart), transform 300ms var(--ease-out-quart)',
      }}
    >
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
      }}>
        {isStreaming && (
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#86BC25',
            flexShrink: 0,
            animation: 'dot-pulse 1200ms ease-in-out infinite',
          }} />
        )}
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          letterSpacing: '0.12em',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          flex: 1,
        }}>
          {isStreaming ? 'VAANI SPEAKING' : 'VAANI'}
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
        }}>
          {langCode}
        </span>
      </div>

      {/* Agent response text with word stagger */}
      {(agentText || wordItems.length > 0) && (
        <p style={{
          margin: 0,
          fontFamily: "'Inter', sans-serif",
          fontSize: 15,
          lineHeight: 1.7,
          color: 'var(--text-primary)',
          textWrap: 'pretty',
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
          {/* Streaming cursor */}
          {isStreaming && (
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 2,
                height: 14,
                background: 'var(--brand-blue)',
                borderRadius: 1,
                verticalAlign: 'middle',
                marginLeft: 2,
                animation: 'cursor-blink 700ms steps(1) infinite',
              }}
            />
          )}
        </p>
      )}

      {/* User text */}
      {userText && (
        <p style={{
          margin: '10px 0 0',
          fontFamily: "'Inter', sans-serif",
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
          fontStyle: 'italic',
          opacity: 0.75,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            letterSpacing: '0.1em',
            fontStyle: 'normal',
            color: 'var(--text-muted)',
            marginRight: 6,
          }}>YOU</span>
          {userText}
        </p>
      )}
    </div>
  )
}
