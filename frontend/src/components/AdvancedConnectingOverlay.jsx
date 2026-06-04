import { useState, useEffect } from 'react'

const INIT_MSGS = {
  '3d': [
    'Initializing 3D Render Engine...',
    'Loading Neural Mesh...',
    'Calibrating ARKit Blendshapes...',
    'Warming up Viseme Model...',
    'Connecting to Gemini Live...',
    'Almost ready...',
  ],
  'musetalk': [
    'Connecting to GPU Cluster...',
    'Loading MuseTalk V1.5 Weights...',
    'Initializing Video Pipeline...',
    'Warming up Latent Predictor...',
    'Connecting to Gemini Live...',
    'Almost ready...',
  ],
  'default': [
    'Initializing neural networks...',
    'Loading voice synthesis engine...',
    'Calibrating real-time inference...',
    'Connecting to Gemini Live...',
    'Preparing avatar pipeline...',
    'Warming up language models...',
    'Almost ready...',
  ]
}

export function AdvancedConnectingOverlay({ connected, geminiReady, mode }) {
  const [msgIdx, setMsgIdx] = useState(0)
  const [fade,   setFade]   = useState(true)
  const [showSkip, setShowSkip] = useState(false)
  const isWaitingForGemini = connected === 'connected' && !geminiReady
  const currentMode = mode === '3d' ? '3d' : mode === 'musetalk' ? 'musetalk' : 'default'
  const msgs = INIT_MSGS[currentMode]

  useEffect(() => {
    const cycle = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setMsgIdx(i => (i + 1) % msgs.length)
        setFade(true)
      }, 300)
    }, 2400)
    
    // Safety skip if stuck — likely a WebSocket handshake lag or backend init delay
    const timer = setTimeout(() => setShowSkip(true), 7000)
    
    return () => {
      clearInterval(cycle)
      clearTimeout(timer)
    }
  }, [msgs.length])

  const handleForceStart = () => {
    window.dispatchEvent(new CustomEvent('vaani_force_ready'))
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Connecting to Vaani"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        background:
          'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(134,188,37,0.08) 0%, transparent 65%),' +
          'radial-gradient(circle at 50% 50%, rgba(3,8,12,0.98) 0%, rgba(1,3,5,1) 100%)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        pointerEvents: 'auto', // Enable interaction for the skip button
        animation: 'adv-fadein 600ms ease both',
      }}
    >
      {/* Background Tech-Grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.12,
        backgroundImage: 'linear-gradient(rgba(134,188,37,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(134,188,37,0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(circle at 50% 50%, black 20%, transparent 80%)',
        WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 20%, transparent 80%)',
        zIndex: -1,
      }} />

      {/* Data Stream Effect */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.05,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
        color: '#86BC25', overflow: 'hidden', pointerEvents: 'none',
        userSelect: 'none', zIndex: -1,
      }}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${i * 5}%`, top: '-10%',
            animation: `cv-stream ${5 + Math.random() * 5}s linear infinite`,
            animationDelay: `${Math.random() * 5}s`,
            writingMode: 'vertical-rl',
          }}>
            {Array.from({ length: 30 }).map(() => Math.random().toString(16).slice(2, 4)).join(' ')}
          </div>
        ))}
      </div>

      {/* Brand lockup */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <span style={{
          fontFamily: "'Syne', 'Plus Jakarta Sans', sans-serif",
          fontWeight: 700, fontSize: 36, lineHeight: 1,
          letterSpacing: '-0.04em', userSelect: 'none',
          textShadow: '0 0 20px rgba(134,188,37,0.3)',
        }}>
          <span style={{ color: 'var(--green, #86BC25)' }}>V</span>
          <span style={{ color: 'rgba(242,246,252,0.98)' }}>AANI</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 1, background: 'rgba(134,188,37,0.3)' }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9, letterSpacing: '0.42em',
            textTransform: 'uppercase',
            color: 'rgba(134,188,37,0.7)',
            paddingRight: '0.42em',
          }}>Deloitte · Avatar Intelligence</span>
          <div style={{ width: 40, height: 1, background: 'rgba(134,188,37,0.3)' }} />
        </div>
      </div>

      {/* Advanced Reticle */}
      <div style={{ position: 'relative', width: 90, height: 90 }}>
        {/* Outer Rotating Segmented Ring */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid rgba(134,188,37,0.05)',
          borderTop: '2px solid var(--green, #86BC25)',
          animation: 'adv-spin 1400ms linear infinite',
        }} />
        {/* Inner Counter-Rotating Hexagon/Ring */}
        <div style={{
          position: 'absolute', inset: 18, borderRadius: '50%',
          border: '1.5px dashed rgba(61,90,138,0.4)',
          animation: 'adv-spin-rev 2200ms linear infinite',
        }} />
        {/* Core Glow */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: 'var(--green, #86BC25)',
            boxShadow: '0 0 20px rgba(134,188,37,0.9)',
            animation: 'adv-pulse 1100ms ease-in-out infinite',
          }} />
        </div>
      </div>

      {/* Telemetry field */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, letterSpacing: '0.18em',
          color: isWaitingForGemini ? 'rgba(134,188,37,0.85)' : 'rgba(220,228,236,0.5)',
          textTransform: 'uppercase',
          opacity: fade ? 1 : 0,
          transition: 'opacity 300ms ease, color 400ms ease',
          minHeight: 18, paddingRight: '0.18em', textAlign: 'center',
          textShadow: isWaitingForGemini ? '0 0 10px rgba(134,188,37,0.4)' : 'none',
        }}>
          {isWaitingForGemini ? 'Negotiating Gemini Live Session' : msgs[msgIdx]}
        </div>
        
        {/* Progress Bar with Scanline */}
        <div style={{
          width: 260, height: 2, borderRadius: 2, overflow: 'hidden',
          background: 'rgba(134,188,37,0.08)', position: 'relative'
        }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: 'linear-gradient(90deg, rgba(134,188,37,0.4), var(--green, #86BC25))',
            boxShadow: '0 0 12px rgba(134,188,37,0.5)',
            animation: 'adv-progress 3s cubic-bezier(0.4,0,0.2,1) infinite',
            }} />

        </div>
        
        {/* Mode Indicator */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8, color: 'rgba(134,188,37,0.3)',
          letterSpacing: '0.2em', textTransform: 'uppercase'
        }}>
          Engine: {mode === '3d' ? 'R3F / Neural' : mode === 'musetalk' ? 'MuseTalk V1.5' : 'Standard'}
        </div>

        {/* Safety Hatch */}
        {showSkip && (
          <button
            onClick={handleForceStart}
            style={{
              marginTop: 20,
              background: 'rgba(134,188,37,0.1)',
              border: '1px solid rgba(134,188,37,0.4)',
              borderRadius: 4,
              color: '#86BC25',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              padding: '8px 16px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              transition: 'all 200ms ease',
              animation: 'adv-fadein 400ms ease both',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(134,188,37,0.2)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(134,188,37,0.1)'}
          >
            Bypass Connection Lock
          </button>
        )}
      </div>

      <style>{`
        @keyframes adv-fadein   { from { opacity:0; transform: scale(1.02); } to { opacity:1; transform: scale(1); } }
        @keyframes adv-spin     { to { transform: rotate(360deg) } }
        @keyframes adv-spin-rev { to { transform: rotate(-360deg) } }
        @keyframes adv-pulse    { 0%,100% { opacity:.5; transform:scale(1) } 50% { opacity:1; transform:scale(1.3) } }
        @keyframes adv-progress { 0% { transform: translateX(-100%) } 70%,100% { transform: translateX(0) } }
        @keyframes cv-stream   { to { transform: translateY(110vh); } }
        @media (prefers-reduced-motion: reduce) {
          [aria-label="Connecting to Vaani"] * { animation: none !important; }
        }
      `}</style>

    </div>
  )
}
