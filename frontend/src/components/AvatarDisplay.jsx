import { useRef, useEffect, useCallback } from 'react'

/* Ring timings */
const RING_DELAYS_SPEAKING  = [0, 700, 1400]
const RING_DELAYS_LISTENING = [0, 900, 1800]
const RING_DUR_SPEAKING     = 2200
const RING_DUR_LISTENING    = 3000

/* Outer container = 460px; video = 400px, centered (30px inset each side) */
const SIZE       = 460
const VIDEO_SIZE = 400
const INSET      = (SIZE - VIDEO_SIZE) / 2  // 30

/* Arc SVG dimensions — sits between ring-2 and ring-1 */
const ARC_D = 420    // diameter of arc circle
const ARC_R = ARC_D / 2
const ARC_CX = SIZE / 2
const ARC_CY = SIZE / 2
const CIRC   = Math.PI * ARC_D             // circumference ≈ 1319
const ARC_LEN = CIRC / 6                  // 60° arc ≈ 220px

/* Tick marks for ring-2 */
const TICKS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
  const r2    = (ARC_D + 20) / 2  // 220 — ring-2 radius (440/2)
  const r1    = r2 - 8
  return {
    x1: ARC_CX + r1 * Math.cos(angle),
    y1: ARC_CY + r1 * Math.sin(angle),
    x2: ARC_CX + r2 * Math.cos(angle),
    y2: ARC_CY + r2 * Math.sin(angle),
  }
})

function arcColor(appState) {
  return {
    idle:      '#3D5A8A',
    listening: '#86BC25',
    thinking:  '#F5A623',
    speaking:  '#00A3E0',
  }[appState] || '#3D5A8A'
}

function arcDuration(appState) {
  return {
    idle:      '20000ms',
    listening: '8000ms',
    thinking:  '2000ms',
    speaking:  '5000ms',
  }[appState] || '20000ms'
}

function glowShadow(appState) {
  return {
    idle:      'var(--glow-idle)',
    listening: 'var(--glow-listening)',
    thinking:  'var(--glow-thinking)',
    speaking:  'var(--glow-speaking)',
  }[appState] || 'none'
}

/* Circular waveform: 24 bars radiating from avatar edge */
function CircularWaveform({ amplitudes, visible }) {
  const BAR_COUNT = 24
  const CENTER = SIZE / 2
  const R_INNER = VIDEO_SIZE / 2 + 4  // just outside video edge
  const MAX_H   = 22

  const expanded = Array.from({ length: BAR_COUNT }, (_, i) => {
    const srcIdx = Math.floor((i / BAR_COUNT) * (amplitudes.length || 5))
    const amp    = amplitudes[srcIdx] ?? 0
    return Math.max(0.08, amp)
  })

  return (
    <svg
      aria-hidden="true"
      width={SIZE}
      height={SIZE}
      style={{
        position: 'absolute',
        inset: 0,
        opacity: visible ? 1 : 0,
        transition: 'opacity 400ms var(--ease-standard)',
        pointerEvents: 'none',
        zIndex: 6,
      }}
    >
      {expanded.map((amp, i) => {
        const angle  = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2
        const barH   = amp * MAX_H
        const x1     = CENTER + R_INNER * Math.cos(angle)
        const y1     = CENTER + R_INNER * Math.sin(angle)
        const x2     = CENTER + (R_INNER + barH) * Math.cos(angle)
        const y2     = CENTER + (R_INNER + barH) * Math.sin(angle)
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

export function AvatarDisplay({ appState, amplitudes = [], onVideoFrame }) {
  const canvasRef = useRef(null)
  const videoRef  = useRef(null)
  const fadeTimer = useRef(null)
  const bitmapBuf = useRef(null)

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

  useEffect(() => () => {
    if (bitmapBuf.current) { bitmapBuf.current.close(); bitmapBuf.current = null }
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
  }, [])

  const isSpeakingOrListening = appState === 'speaking' || appState === 'listening'
  const ringDelays    = appState === 'speaking' ? RING_DELAYS_SPEAKING  : RING_DELAYS_LISTENING
  const ringDuration  = appState === 'speaking' ? RING_DUR_SPEAKING     : RING_DUR_LISTENING
  const ringAnimation = appState === 'speaking' ? 'ring-pulse-blue'     : 'ring-pulse-green'
  const ringColor     = appState === 'speaking'
    ? 'rgba(0,163,224,0.38)'
    : 'rgba(134,188,37,0.35)'

  const color   = arcColor(appState)
  const arcDur  = arcDuration(appState)

  const avatarScale = appState === 'speaking' ? 'scale(1.02)' : 'scale(1)'

  return (
    <div
      role="img"
      aria-label={`Vaani avatar — ${appState}`}
      style={{
        position: 'relative',
        width: SIZE,
        height: SIZE,
        flexShrink: 0,
        animation: 'avatar-reveal 700ms var(--ease-out-expo) 200ms both',
        willChange: 'transform',
      }}
    >
      {/* ── Layer 1: outer dashed ring 460px, counter-rotating ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: appState === 'idle'
            ? '1px dashed rgba(0,163,224,0.05)'
            : '1px dashed rgba(0,163,224,0.10)',
          animation: 'thinking-spin-reverse 80000ms linear infinite',
          willChange: 'transform',
          pointerEvents: 'none',
          transition: 'border-color 600ms var(--ease-standard)',
        }}
      />

      {/* ── Layer 2: ring 440px with tick marks, rotating slowly ── */}
      <svg
        aria-hidden="true"
        width={SIZE}
        height={SIZE}
        style={{
          position: 'absolute',
          inset: 0,
          animation: 'thinking-spin 60000ms linear infinite',
          willChange: 'transform',
          pointerEvents: 'none',
          opacity: appState === 'idle' ? 0.4 : 0.8,
          transition: 'opacity 600ms var(--ease-standard)',
        }}
      >
        <circle
          cx={ARC_CX} cy={ARC_CY} r={(ARC_D + 20) / 2}
          fill="none"
          stroke="rgba(134,188,37,0.15)"
          strokeWidth={1}
        />
        {TICKS.map((tk, i) => (
          <line
            key={i}
            x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2}
            stroke="rgba(134,188,37,0.30)"
            strokeWidth={1.5}
          />
        ))}
      </svg>

      {/* ── Layer 3: glowing arc that orbits ── */}
      <svg
        aria-hidden="true"
        width={SIZE}
        height={SIZE}
        style={{
          position: 'absolute',
          inset: 0,
          animation: `thinking-spin ${arcDur} linear infinite`,
          willChange: 'transform',
          pointerEvents: 'none',
          transition: 'opacity 600ms var(--ease-standard)',
          opacity: appState === 'idle' ? 0.5 : 1,
        }}
      >
        <circle
          cx={ARC_CX}
          cy={ARC_CY}
          r={ARC_R}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={`${ARC_LEN} ${CIRC - ARC_LEN}`}
          style={{
            filter: `drop-shadow(0 0 6px ${color})`,
            transition: 'stroke 600ms var(--ease-standard), filter 600ms var(--ease-standard)',
          }}
        />
      </svg>

      {/* ── Radial pulse rings — listening / speaking ── */}
      {isSpeakingOrListening && ringDelays.map((delay) => (
        <div
          key={delay}
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: INSET,
            borderRadius: '50%',
            border: `1.5px solid ${ringColor}`,
            animation: `${ringAnimation} ${ringDuration}ms var(--ease-out-quart) ${delay}ms infinite`,
            willChange: 'transform, opacity',
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* ── Thinking spinner overlay on video edge ── */}
      {appState === 'thinking' && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: INSET - 5,
            borderRadius: '50%',
            border: '1.5px dashed rgba(245,166,35,0.55)',
            animation: 'thinking-spin 3500ms linear infinite',
            willChange: 'transform',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* ── Idle breathe ring ── */}
      {appState === 'idle' && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: INSET - 5,
            borderRadius: '50%',
            border: '1.5px solid rgba(134,188,37,0.22)',
            animation: 'glow-idle 3200ms ease-in-out infinite',
            willChange: 'opacity',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* ── Layer 4: avatar circle (video hidden for now) ── */}
      <div
        style={{
          position: 'absolute',
          top: INSET,
          left: INSET,
          width: VIDEO_SIZE,
          height: VIDEO_SIZE,
          borderRadius: '50%',
          overflow: 'hidden',
          background: '#010A1A',
          boxShadow: glowShadow(appState),
          transform: avatarScale,
          transition: `box-shadow 600ms var(--ease-standard), transform 400ms var(--ease-standard)`,
          willChange: 'box-shadow, transform',
        }}
      >
        {/* Video hidden until avatar asset is confirmed */}
        <video
          ref={videoRef}
          src="/avatar_idle.mp4"
          loop
          autoPlay
          muted
          playsInline
          aria-hidden="true"
          style={{ display: 'none' }}
        />
      </div>

      {/* ── Layer 5: MuseTalk canvas ── */}
      <canvas
        ref={canvasRef}
        width={360}
        height={360}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: INSET,
          left: INSET,
          width: VIDEO_SIZE,
          height: VIDEO_SIZE,
          borderRadius: '50%',
          zIndex: 5,
          opacity: 0,
          transition: 'opacity 200ms var(--ease-standard)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Layer 6: Circular audio waveform ── */}
      <CircularWaveform
        amplitudes={amplitudes}
        visible={appState === 'speaking'}
      />
    </div>
  )
}
