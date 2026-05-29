import { useRef, useEffect, useCallback } from 'react'

export function AvatarDisplay({ appState, onVideoFrame }) {
  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const fadeTimerRef = useRef(null)

  // draw incoming JPEG frames onto the canvas
  const renderFrame = useCallback((arrayBuffer) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const blob = new Blob([arrayBuffer], { type: 'image/jpeg' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
    }
    img.src = url
    canvas.style.opacity = '1'
    // fade canvas back to zero 300ms after the last frame arrives
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    fadeTimerRef.current = setTimeout(() => {
      if (canvas) canvas.style.opacity = '0'
    }, 300)
  }, [])

  useEffect(() => {
    if (onVideoFrame) onVideoFrame(renderFrame)
  }, [onVideoFrame, renderFrame])

  const glowStyle = {
    idle: 'none',
    listening: 'var(--glow-listening)',
    thinking: 'var(--glow-thinking)',
    speaking: 'var(--glow-speaking)'
  }[appState] || 'none'

  const scaleMap = {
    idle: 'scale(1.00)',
    listening: 'scale(1.02)',
    thinking: 'scale(1.00)',
    speaking: 'scale(1.03)'
  }

  return (
    <div style={{
      position: 'relative',
      width: 360,
      height: 360,
      borderRadius: '50%',
      boxShadow: glowStyle,
      transform: scaleMap[appState] || 'scale(1)',
      transition: 'box-shadow 600ms var(--ease-standard), transform 400ms var(--ease-standard)',
      flexShrink: 0,
      animation: 'avatar-reveal 600ms var(--ease-enter) 200ms both'
    }}>
      <video
        ref={videoRef}
        src="/avatar_idle.mp4"
        loop autoPlay muted playsInline
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          borderRadius: '50%', objectFit: 'cover', zIndex: 1
        }}
      />
      <canvas
        ref={canvasRef}
        width={360}
        height={360}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          borderRadius: '50%', zIndex: 2, opacity: 0,
          transition: 'opacity 250ms ease',
          pointerEvents: 'none'
        }}
      />
      {/* thinking rotation ring */}
      {appState === 'thinking' && (
        <div style={{
          position: 'absolute', inset: -4, borderRadius: '50%',
          border: '2px dashed var(--state-thinking)',
          animation: 'thinking-spin 3000ms linear infinite',
          zIndex: 3, pointerEvents: 'none'
        }} />
      )}
      {/* pulse rings */}
      {(appState === 'speaking' || appState === 'listening') && (
        <>
          {[0, 800, 1600].map((delay) => (
            <div key={delay} style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: `1.5px solid ${appState === 'speaking' ? 'rgba(0,163,224,0.40)' : 'rgba(134,188,37,0.40)'}`,
              animation: `${appState === 'speaking' ? 'ring-pulse-blue' : 'ring-pulse-green'} ${appState === 'speaking' ? 2400 : 3200}ms ease-out infinite`,
              animationDelay: `${delay}ms`,
              zIndex: 0, pointerEvents: 'none'
            }} />
          ))}
        </>
      )}
    </div>
  )
}
