import { useEffect, useState, useRef } from 'react'

// the language-to-font map must stay in sync with the Noto imports in index.html
const LANG_FONTS = {
  hi: "'Noto Sans Devanagari', sans-serif",
  mr: "'Noto Sans Devanagari', sans-serif",
  ta: "'Noto Sans Tamil', sans-serif",
  te: "'Noto Sans Telugu', sans-serif",
  kn: "'Noto Sans Kannada', sans-serif",
  ml: "'Noto Sans Malayalam', sans-serif",
  bn: "'Noto Sans Bengali', sans-serif",
  ur: "'Noto Nastaliq Urdu', sans-serif"
}

export function AgentBubble({ streamBuffer, finalMessages, detectedLang }) {
  const lang = detectedLang?.code
  const fontFamily = LANG_FONTS[lang] || "'Inter', sans-serif"
  const isRTL = lang === 'ur'

  const [displayed, setDisplayed] = useState([])

  useEffect(() => {
    if (finalMessages.length > 0) {
      setDisplayed(finalMessages.slice(-2))
    }
  }, [finalMessages])

  if (!streamBuffer && displayed.length === 0) return null

  return (
    <div style={{
      position: 'absolute',
      left: 'calc(50% + 195px)',
      top: 'calc(50% + 20px)',
      display: 'flex', flexDirection: 'column', gap: 10,
      zIndex: 10, maxWidth: 290, pointerEvents: 'none'
    }}>
      {displayed.map((msg, i) => (
        <div key={msg.id} style={{
          background: 'rgba(1,52,122,0.80)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(0,163,224,0.20)',
          borderRadius: '18px 18px 18px 4px',
          padding: '10px 14px',
          color: 'var(--text-primary)',
          fontSize: 14, lineHeight: 1.6,
          fontFamily, direction: isRTL ? 'rtl' : 'ltr',
          opacity: i === displayed.length - 1 ? 0.65 : 0.4,
          transform: `translateY(-${(displayed.length - 1 - i) * 8}px)`,
          transition: 'opacity 400ms, transform 400ms'
        }}>
          {msg.text}
        </div>
      ))}

      {streamBuffer && (
        <div style={{
          background: 'rgba(1,52,122,0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(0,163,224,0.28)',
          borderRadius: '18px 18px 18px 4px',
          padding: '12px 16px',
          color: 'var(--text-primary)',
          fontSize: 14, lineHeight: 1.65,
          fontFamily, direction: isRTL ? 'rtl' : 'ltr',
          animation: 'bubble-enter 280ms var(--ease-spring)',
          position: 'relative'
        }}>
          <span style={{ marginRight: 2 }}>{streamBuffer}</span>
          <span style={{
            display: 'inline-block', width: 2, height: 14,
            background: 'var(--state-speaking)', borderRadius: 1,
            verticalAlign: 'middle', marginLeft: 2,
            animation: 'cursor-blink 700ms steps(1) infinite'
          }} />
          <div style={{
            position: 'absolute', left: -10, top: 14,
            width: 0, height: 0,
            borderTop: '8px solid transparent',
            borderBottom: '8px solid transparent',
            borderRight: '10px solid rgba(0,163,224,0.28)'
          }} />
        </div>
      )}
    </div>
  )
}
