import { useRef, useEffect, useCallback } from 'react'

const RING_DELAYS_SPEAKING  = [0, 700, 1400]
const RING_DELAYS_LISTENING = [0, 900, 1800]
const RING_DURATION_SPEAKING  = 2200
const RING_DURATION_LISTENING = 3000

export function AvatarDisplay({ appState, onVideoFrame }) {
  const canvasRef  = useRef(null)
  const videoRef   = useRef(null)
  const fadeTimer  = useRef(null)
  const bitmapBuf  = useRef(null)

  const renderFrame = useCallback((arrayBuffer) => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    canvas.style.opacity = '1'

    createImageBitmap(new Blob([arrayBuffer], { type: 'image/jpeg' }))
      .then((bitmap) => {
        const ctx = canvas.getContext('2d')
        if (bitmapBuf.current) bitmapBuf.current.close()
        bitmapBuf.current = bitmap
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      })

    fadeTimer.current = setTimeout(() => {
      if (canvasRef.current) canvasRef.current.style.opacity = '0'
    }, 320)
  }, [])

  useEffect(() => {
    if (onVideoFrame) onVideoFrame(renderFrame)
  }, [onVideoFrame, renderFrame])

  useEffect(() => {
    return () => {
      if (bitmapBuf.current) { bitmapBuf.current.close(); bitmapBuf.current = null }
      if (fadeTimer.current) clearTimeout(fadeTimer.current)
    }
  }, [])

  const glowStyle = {
    idle:      'none',
    listening: 'var(--glow-listening)',
    thinking:  'var(--glow-thinking)',
    speaking:  'var(--glow-speaking)',
  }[appState] || 'none'

  const scaleMap = {
    idle:      'scale(1.000)',
    listening: 'scale(1.018)',
    thinking:  'scale(1.000)',
    speaking:  'scale(1.025)',
  }

  const isSpeakingOrListening = appState === 'speaking' || appState === 'listening'
  const ringDelays     = appState === 'speaking' ? RING_DELAYS_SPEAKING  : RING_DELAYS_LISTENING
  const ringDuration   = appState === 'speaking' ? RING_DURATION_SPEAKING : RING_DURATION_LISTENING
  const ringAnimation  = appState === 'speaking' ? 'ring-pulse-blue'     : 'ring-pulse-green'
  const ringColor      = appState === 'speaking'
    ? 'rgba(0,163,224,0.38)'
    : 'rgba(134,188,37,0.35)'

  return (
    <div
      role="img"
      aria-label={`Vaani avatar — ${appState}`}
      style={{
        position: 'relative',
        width: 'var(--avatar-size)',
        height: 'var(--avatar-size)',
        borderRadius: '50%',
        boxShadow: glowStyle,
        transform: scaleMap[appState] || 'scale(1)',
        transition: `box-shadow ${600}ms var(--ease-standard), transform 400ms var(--ease-standard)`,
        flexShrink: 0,
        animation: 'avatar-reveal 700ms var(--ease-out-expo) 180ms both',
        willChange: 'transform, box-shadow',
      }}
    >
      {/* Idle glow breathe ring */}
      {appState === 'idle' && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: -6,
            borderRadius: '50%',
            border: '1.5px solid rgba(134,188,37,0.22)',
            animation: 'glow-idle 3200ms ease-in-out infinite',
            willChange: 'opacity',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Radial pulse rings */}
      {isSpeakingOrListening && ringDelays.map((delay) => (
        <div
          key={delay}
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `1.5px solid ${ringColor}`,
            animation: `${ringAnimation} ${ringDuration}ms var(--ease-out-quart) infinite`,
            animationDelay: `${delay}ms`,
            willChange: 'transform, opacity',
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Thinking double-ring spinner */}
      {appState === 'thinking' && (
        <>
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: -5,
              borderRadius: '50%',
              border: '1.5px dashed rgba(245,166,35,0.55)',
              animation: 'thinking-spin 4000ms linear infinite',
              willChange: 'transform',
              pointerEvents: 'none',
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: -11,
              borderRadius: '50%',
              border: '1px dashed rgba(245,166,35,0.25)',
              animation: 'thinking-spin-reverse 7000ms linear infinite',
              willChange: 'transform',
              pointerEvents: 'none',
            }}
          />
        </>
      )}

      {/* Idle video */}
      <video
        ref={videoRef}
        src="/avatar_idle.mp4"
        loop
        autoPlay
        muted
        playsInline
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          borderRadius: '50%',
          objectFit: 'cover',
          zIndex: 1,
        }}
      />

      {/* Live MuseTalk frames */}
      <canvas
        ref={canvasRef}
        width={360}
        height={360}
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          borderRadius: '50%',
          zIndex: 2,
          opacity: 0,
          transition: 'opacity 200ms var(--ease-standard)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
