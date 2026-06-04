import { useRef } from 'react'
import { useParticles } from '../hooks/useParticles'

/* Hex grid tile encoded as data-URI — barely visible texture at 3% opacity */
const HEX_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="92">' +
  '<polygon points="40,0 80,23 80,69 40,92 0,69 0,23" ' +
  'fill="none" stroke="%2386BC25" stroke-width="0.6"/></svg>'
)
const HEX_BG = `url("data:image/svg+xml,${HEX_SVG}")`

/* Ambient wash color per conversation state — the room breathes with Vaani.
   Strictly Deloitte Green and neutral tones. */
const STATE_GLOW = {
  idle:      'rgba(134,188,37,0.0)',
  listening: 'rgba(134,188,37,0.15)',
  thinking:  'rgba(134,188,37,0.08)',
  speaking:  'rgba(134,188,37,0.12)',
  error:     'rgba(255,68,68,0.08)',
}

function CornerBracket({ corner }) {
  const base = { position: 'fixed', width: 40, height: 40, pointerEvents: 'none', zIndex: 2 }
  const style = {
    'top-left':     { ...base, top: 0,    left: 0,    borderTop:    '1px solid rgba(134,188,37,0.15)', borderLeft:   '1px solid rgba(134,188,37,0.15)' },
    'top-right':    { ...base, top: 0,    right: 0,   borderTop:    '1px solid rgba(134,188,37,0.15)', borderRight:  '1px solid rgba(134,188,37,0.15)' },
    'bottom-left':  { ...base, bottom: 0, left: 0,    borderBottom: '1px solid rgba(134,188,37,0.15)', borderLeft:   '1px solid rgba(134,188,37,0.15)' },
    'bottom-right': { ...base, bottom: 0, right: 0,   borderBottom: '1px solid rgba(134,188,37,0.15)', borderRight:  '1px solid rgba(134,188,37,0.15)' },
  }[corner]
  return <div aria-hidden="true" style={style} />
}

export function ParticleCanvas({ appState }) {
  const canvasRef = useRef(null)
  useParticles(canvasRef, appState)

  return (
    <>
      {/* Pure Obsidian Void Background */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-bg)',
          pointerEvents: 'none',
          background: 'radial-gradient(circle at 50% 40%, #080B04 0%, #020400 60%, #000000 100%)',
        }}
      />

      {/* Brand accent wash — Deloitte Green glow that reacts to state */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-bg)',
          pointerEvents: 'none',
          background: `radial-gradient(ellipse 80% 70% at 50% 50%, ${STATE_GLOW[appState] || STATE_GLOW.idle} 0%, transparent 75%)`,
          transition: 'background 1500ms var(--ease-standard)',
        }}
      />

      {/* Tech Grid Texture — Subtle green webbing */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-bg)',
          pointerEvents: 'none',
          backgroundImage: `
            linear-gradient(rgba(134,188,37,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(134,188,37,0.015) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
          opacity: 0.8,
          maskImage: 'radial-gradient(circle at 50% 50%, black 20%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 20%, transparent 85%)',
        }}
      />

      {/* Focus vignette — darkens the edges so attention falls on the avatar. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-particles)',
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse 75% 70% at 50% 46%, transparent 55%, rgba(1,5,14,0.55) 100%)',
        }}
      />

      {/* Hex texture overlay */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-bg)',
          pointerEvents: 'none',
          backgroundImage: HEX_BG,
          backgroundSize: '80px 92px',
          opacity: 0.03,
        }}
      />

      {/* Particle network canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-particles)',
          pointerEvents: 'none',
        }}
      />

      {/* Corner bracket accents */}
      <CornerBracket corner="top-left"     />
      <CornerBracket corner="top-right"    />
      <CornerBracket corner="bottom-left"  />
      <CornerBracket corner="bottom-right" />
    </>
  )
}
