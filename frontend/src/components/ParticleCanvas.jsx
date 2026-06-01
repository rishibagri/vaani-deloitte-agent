import { useRef } from 'react'
import { useParticles } from '../hooks/useParticles'

/* Hex grid tile encoded as data-URI — barely visible texture at 3% opacity */
const HEX_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="92">' +
  '<polygon points="40,0 80,23 80,69 40,92 0,69 0,23" ' +
  'fill="none" stroke="%2386BC25" stroke-width="0.6"/></svg>'
)
const HEX_BG = `url("data:image/svg+xml,${HEX_SVG}")`

function CornerBracket({ corner }) {
  const base = { position: 'fixed', width: 40, height: 40, pointerEvents: 'none', zIndex: 2 }
  const style = {
    'top-left':     { ...base, top: 0,    left: 0,    borderTop:    '1px solid rgba(134,188,37,0.25)', borderLeft:   '1px solid rgba(134,188,37,0.25)' },
    'top-right':    { ...base, top: 0,    right: 0,   borderTop:    '1px solid rgba(134,188,37,0.25)', borderRight:  '1px solid rgba(134,188,37,0.25)' },
    'bottom-left':  { ...base, bottom: 0, left: 0,    borderBottom: '1px solid rgba(134,188,37,0.25)', borderLeft:   '1px solid rgba(134,188,37,0.25)' },
    'bottom-right': { ...base, bottom: 0, right: 0,   borderBottom: '1px solid rgba(134,188,37,0.25)', borderRight:  '1px solid rgba(134,188,37,0.25)' },
  }[corner]
  return <div aria-hidden="true" style={style} />
}

export function ParticleCanvas({ appState }) {
  const canvasRef = useRef(null)
  useParticles(canvasRef, appState)

  return (
    <>
      {/* Deep radial background */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-bg)',
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse 120% 80% at 50% 0%, #012169 0%, #010A1A 100%)',
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
