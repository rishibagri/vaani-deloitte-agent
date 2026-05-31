import { useEffect, useState } from 'react'

const LANG_FONTS = {
  hi: "'Noto Sans Devanagari', sans-serif",
  mr: "'Noto Sans Devanagari', sans-serif",
  ta: "'Noto Sans Tamil', sans-serif",
  te: "'Noto Sans Telugu', sans-serif",
  kn: "'Noto Sans Kannada', sans-serif",
  ml: "'Noto Sans Malayalam', sans-serif",
  bn: "'Noto Sans Bengali', sans-serif",
  ur: "'Noto Nastaliq Urdu', sans-serif",
}

function BubbleTail({ side = 'left' }) {
  /* CSS triangle via clip-path — no inline border tricks */
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 16,
        ...(side === 'left' ? { left: -8 } : { right: -8 }),
        width: 0,
        height: 0,
        borderTop: '7px solid transparent',
        borderBottom: '7px solid transparent',
        ...(side === 'left'
          ? { borderRight: '8px solid rgba(0,100,180,0.55)' }
          : { borderLeft:  '8px solid rgba(0,163,224,0.28)' }
        ),
      }}
    />
  )
}

export function AgentBubble({ streamBuffer, finalMessages, detectedLang }) {
  const lang       = detectedLang?.code
  const fontFamily = LANG_FONTS[lang] || "'Inter', sans-serif"
  const isRTL      = lang === 'ur'

  const [displayed, setDisplayed] = useState([])

  useEffect(() => {
    if (finalMessages.length > 0) {
      setDisplayed(finalMessages.slice(-2))
    }
  }, [finalMessages])

  if (!streamBuffer && displayed.length === 0) return null

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Vaani's response"
      style={{
        position: 'absolute',
        /* Floats to the right of the avatar circle.
           left = avatar full width + 20px gap */
        left: 'calc(var(--avatar-size) + 20px)',
        top: '15%',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 'var(--z-bubbles)',
        maxWidth: 'clamp(200px, 30vw, 300px)',
        pointerEvents: 'none',
        /* On small screens, move below the avatar via a media-query-equivalent
           using container-relative positioning */
      }}
    >
      {/* Ghost trail — previous messages */}
      {displayed.map((msg, i) => (
        <div
          key={msg.id}
          style={{
            background: 'rgba(1,40,100,0.72)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(0,163,224,0.16)',
            borderRadius: '14px 14px 14px 3px',
            padding: '10px 14px',
            color: 'var(--text-primary)',
            fontSize: 13,
            lineHeight: 1.6,
            fontFamily,
            direction: isRTL ? 'rtl' : 'ltr',
            opacity: i === displayed.length - 1 ? 0.55 : 0.28,
            transform: `translateY(-${(displayed.length - 1 - i) * 6}px)`,
            transition: 'opacity 400ms var(--ease-standard), transform 400ms var(--ease-standard)',
            position: 'relative',
          }}
        >
          {msg.text}
        </div>
      ))}

      {/* Live streaming bubble */}
      {streamBuffer && (
        <div
          style={{
            background: 'rgba(1,44,110,0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(0,163,224,0.26)',
            borderRadius: '14px 14px 14px 3px',
            padding: '12px 16px',
            color: 'var(--text-primary)',
            fontSize: 14,
            lineHeight: 1.65,
            fontFamily,
            direction: isRTL ? 'rtl' : 'ltr',
            animation: 'bubble-enter 240ms var(--ease-out-quart)',
            position: 'relative',
          }}
        >
          <BubbleTail side="left" />
          <span>{streamBuffer}</span>
          {/* Blinking cursor */}
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 2,
              height: 13,
              background: 'var(--brand-blue)',
              borderRadius: 1,
              verticalAlign: 'middle',
              marginLeft: 3,
              animation: 'cursor-blink 700ms steps(1) infinite',
            }}
          />
        </div>
      )}
    </div>
  )
}
