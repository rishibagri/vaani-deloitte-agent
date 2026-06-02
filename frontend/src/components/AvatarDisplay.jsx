import { useRef, useEffect, useState, useCallback } from 'react'

const W         = 460   // total container width (ring decorations use this)
const VID_W     = 380   // video display width
const VID_H     = 480   // video display height (portrait)
const VID_LEFT  = (W - VID_W) / 2  // 40 — centers video horizontally

const RING_CX   = W / 2
const RING_CY   = VID_H / 2        // rings orbit around the vertical center of the video

/* Arc dimensions */
const ARC_D   = 420
const ARC_R   = ARC_D / 2
const CIRC    = Math.PI * ARC_D
const ARC_LEN = CIRC / 6

/* Tick marks */
const TICKS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
  const r2    = (ARC_D + 20) / 2
  const r1    = r2 - 8
  return {
    x1: RING_CX + r1 * Math.cos(angle),
    y1: RING_CY + r1 * Math.sin(angle),
    x2: RING_CX + r2 * Math.cos(angle),
    y2: RING_CY + r2 * Math.sin(angle),
  }
})

const RING_DELAYS_SPEAKING  = [0, 700, 1400]
const RING_DELAYS_LISTENING = [0, 900, 1800]

function stateColor(appState) {
  return {
    idle:      '#3D5A8A',
    listening: '#86BC25',
    thinking:  '#F5A623',
    speaking:  '#00A3E0',
  }[appState] || '#3D5A8A'
}

function glowColor(appState) {
  return {
    idle:      'rgba(61,90,138,0.22)',
    listening: 'rgba(134,188,37,0.28)',
    thinking:  'rgba(245,166,35,0.24)',
    speaking:  'rgba(0,163,224,0.30)',
  }[appState] || 'rgba(61,90,138,0.22)'
}

function arcDuration(appState) {
  return { idle: '20000ms', listening: '8000ms', thinking: '2000ms', speaking: '5000ms' }[appState] || '20000ms'
}

function CircularWaveform({ amplitudes, visible }) {
  const BAR_COUNT = 24
  const R_INNER   = VID_W / 2 + 6
  const MAX_H     = 20

  const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
    const srcIdx = Math.floor((i / BAR_COUNT) * (amplitudes.length || 5))
    return Math.max(0.08, amplitudes[srcIdx] ?? 0)
  })

  return (
    <svg
      aria-hidden="true"
      width={W}
      height={VID_H}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        opacity: visible ? 1 : 0,
        transition: 'opacity 400ms var(--ease-standard)',
        pointerEvents: 'none',
        zIndex: 6,
      }}
    >
      {bars.map((amp, i) => {
        const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2
        const barH  = amp * MAX_H
        const cx    = RING_CX
        const cy    = RING_CY
        return (
          <line
            key={i}
            x1={cx + R_INNER * Math.cos(angle)}
            y1={cy + R_INNER * Math.sin(angle)}
            x2={cx + (R_INNER + barH) * Math.cos(angle)}
            y2={cy + (R_INNER + barH) * Math.sin(angle)}
            stroke="rgba(0,163,224,0.70)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

export function AvatarDisplay({ appState, amplitudes = [], onVideoFrame, onClearCanvas, avatarSrc }) {
  const canvasRef = useRef(null)
  const videoRef  = useRef(null)
  const fadeTimer = useRef(null)
  const bitmapBuf = useRef(null)

  // Expose a way for the parent to instantly clear the MuseTalk canvas (barge-in).
  const clearCanvas = useCallback(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    if (canvasRef.current) canvasRef.current.style.opacity = '0'
  }, [])

  useEffect(() => {
    if (onClearCanvas) onClearCanvas(clearCanvas)
  }, [onClearCanvas, clearCanvas])

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
        // Draw with "cover" + top-anchored crop to match the idle <video>
        // (objectFit: cover, objectPosition: center top), so the swapped-face
        // frame lines up exactly with the idle video underneath (no flashing).
        const cw = canvas.width, ch = canvas.height
        const scale = Math.max(cw / bitmap.width, ch / bitmap.height)
        const dw = bitmap.width * scale, dh = bitmap.height * scale
        const dx = (cw - dw) / 2  // center horizontally
        const dy = 0              // anchor to top
        ctx.clearRect(0, 0, cw, ch)
        ctx.drawImage(bitmap, dx, dy, dw, dh)
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

  // One-shot burst on every state change — announces the transition decisively.
  const [burstKey, setBurstKey] = useState(0)
  const prevState = useRef(appState)
  useEffect(() => {
    if (appState !== prevState.current) {
      prevState.current = appState
      setBurstKey(k => k + 1)
    }
  }, [appState])

  const isSpeakingOrListening = appState === 'speaking' || appState === 'listening'
  const ringDelays   = appState === 'speaking' ? RING_DELAYS_SPEAKING : RING_DELAYS_LISTENING
  const ringDuration = appState === 'speaking' ? 2200 : 3000
  const ringAnim     = appState === 'speaking' ? 'ring-pulse-blue' : 'ring-pulse-green'
  const ringColor    = appState === 'speaking' ? 'rgba(0,163,224,0.38)' : 'rgba(134,188,37,0.35)'
  const color        = stateColor(appState)
  const arcDur       = arcDuration(appState)
  const avatarScale  = appState === 'speaking' ? 'scale(1.01)' : 'scale(1)'
  const videoSource  = avatarSrc || '/avatar_idle.mp4'

  return (
    <div
      role="img"
      aria-label={`Vaani avatar — ${appState}`}
      style={{
        position: 'relative',
        width: W,
        height: VID_H,
        flexShrink: 0,
        animation: 'avatar-reveal 700ms var(--ease-out-expo) 200ms both',
      }}
    >
      {/* ── Deep background glow (state-reactive) ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: -60,
          background: `radial-gradient(ellipse 70% 75% at 50% 50%, ${glowColor(appState)} 0%, transparent 70%)`,
          transition: 'background 800ms var(--ease-standard)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* ── Outer dashed ring ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: RING_CY - ARC_D / 2 - 20,
          left: RING_CX - ARC_D / 2 - 20,
          width: ARC_D + 40,
          height: ARC_D + 40,
          borderRadius: '50%',
          border: appState === 'idle' ? '1px dashed rgba(0,163,224,0.05)' : '1px dashed rgba(0,163,224,0.10)',
          animation: 'thinking-spin-reverse 80000ms linear infinite',
          pointerEvents: 'none',
          transition: 'border-color 600ms var(--ease-standard)',
        }}
      />

      {/* ── Tick-mark ring ── */}
      <svg
        aria-hidden="true"
        width={W}
        height={VID_H}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          animation: 'thinking-spin 60000ms linear infinite',
          pointerEvents: 'none',
          opacity: appState === 'idle' ? 0.4 : 0.8,
          transition: 'opacity 600ms var(--ease-standard)',
          zIndex: 1,
        }}
      >
        <circle cx={RING_CX} cy={RING_CY} r={(ARC_D + 20) / 2}
          fill="none" stroke="rgba(134,188,37,0.15)" strokeWidth={1} />
        {TICKS.map((tk, i) => (
          <line key={i} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2}
            stroke="rgba(134,188,37,0.30)" strokeWidth={1.5} />
        ))}
      </svg>

      {/* ── Glowing arc ── */}
      <svg
        aria-hidden="true"
        width={W}
        height={VID_H}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          animation: `thinking-spin ${arcDur} linear infinite`,
          pointerEvents: 'none',
          opacity: appState === 'idle' ? 0.5 : 1,
          transition: 'opacity 600ms var(--ease-standard)',
          zIndex: 1,
        }}
      >
        <circle cx={RING_CX} cy={RING_CY} r={ARC_R}
          fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round"
          strokeDasharray={`${ARC_LEN} ${CIRC - ARC_LEN}`}
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke 600ms var(--ease-standard)' }}
        />
      </svg>

      {/* ── Radial pulse rings ── */}
      {isSpeakingOrListening && ringDelays.map((delay) => (
        <div
          key={delay}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: RING_CY - VID_W / 2,
            left: VID_LEFT,
            width: VID_W,
            height: VID_W,
            borderRadius: '50%',
            border: `1.5px solid ${ringColor}`,
            animation: `${ringAnim} ${ringDuration}ms var(--ease-out-quart) ${delay}ms infinite`,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      ))}

      {/* ── State-change burst — one decisive ring per transition ── */}
      <div
        key={burstKey}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: RING_CY - VID_W / 2,
          left: VID_LEFT,
          width: VID_W,
          height: VID_W,
          borderRadius: '50%',
          border: `2px solid ${color}`,
          animation: burstKey > 0 ? 'state-burst 620ms var(--ease-out-expo) both' : 'none',
          willChange: 'transform, opacity',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* ── Thinking spinner ── */}
      {appState === 'thinking' && (
        <div aria-hidden="true" style={{
          position: 'absolute',
          top: RING_CY - VID_W / 2 - 5,
          left: VID_LEFT - 5,
          width: VID_W + 10,
          height: VID_W + 10,
          borderRadius: '50%',
          border: '1.5px dashed rgba(245,166,35,0.55)',
          animation: 'thinking-spin 3500ms linear infinite',
          pointerEvents: 'none',
          zIndex: 2,
        }} />
      )}

      {/* ── Idle breathe ring ── */}
      {appState === 'idle' && (
        <div aria-hidden="true" style={{
          position: 'absolute',
          top: RING_CY - VID_W / 2 - 5,
          left: VID_LEFT - 5,
          width: VID_W + 10,
          height: VID_W + 10,
          borderRadius: '50%',
          border: '1.5px solid rgba(134,188,37,0.22)',
          animation: 'glow-idle 3200ms ease-in-out infinite',
          pointerEvents: 'none',
          zIndex: 2,
        }} />
      )}

      {/* ── Avatar video — portrait, gradient-masked ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: VID_LEFT,
          width: VID_W,
          height: VID_H,
          zIndex: 3,
          transform: avatarScale,
          transition: 'transform 400ms var(--ease-standard)',
          maskImage: 'radial-gradient(ellipse 88% 92% at 50% 46%, black 48%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 88% 92% at 50% 46%, black 48%, transparent 100%)',
        }}
      >
        <video
          ref={videoRef}
          key={videoSource}
          src={videoSource}
          loop
          autoPlay
          muted
          playsInline
          aria-hidden="true"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center top',
            display: 'block',
          }}
        />
      </div>

      {/* ── MuseTalk canvas overlay — exactly overlays the idle video box ── */}
      <canvas
        ref={canvasRef}
        width={VID_W}
        height={VID_H}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: VID_LEFT,
          width: VID_W,
          height: VID_H,
          zIndex: 5,
          opacity: 0,
          transform: avatarScale,
          transition: 'opacity 200ms var(--ease-standard)',
          pointerEvents: 'none',
          maskImage: 'radial-gradient(ellipse 88% 92% at 50% 46%, black 48%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 88% 92% at 50% 46%, black 48%, transparent 100%)',
        }}
      />

      {/* ── Circular audio waveform ── */}
      <CircularWaveform amplitudes={amplitudes} visible={appState === 'speaking'} />

      {/* ── Bottom ground reflection ── */}
      <div aria-hidden="true" style={{
        position: 'absolute',
        bottom: -10,
        left: VID_LEFT + 20,
        width: VID_W - 40,
        height: 40,
        background: `radial-gradient(ellipse 80% 100% at 50% 100%, ${glowColor(appState)} 0%, transparent 100%)`,
        filter: 'blur(8px)',
        pointerEvents: 'none',
        transition: 'background 800ms var(--ease-standard)',
        zIndex: 1,
      }} />
    </div>
  )
}
