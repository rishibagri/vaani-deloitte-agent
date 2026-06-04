import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket }    from './hooks/useWebSocket'
import { useMicrophone }   from './hooks/useMicrophone'
import { useAudioPlayback }from './hooks/useAudioPlayback'
import { useConversation } from './hooks/useConversation'
import { useFaceCapture }  from './hooks/useFaceCapture'

import { BootSequence }       from './components/BootSequence'
import { AdvancedConnectingOverlay } from './components/AdvancedConnectingOverlay'
import { ParticleCanvas }     from './components/ParticleCanvas'
import { AvatarDisplay }      from './components/AvatarDisplay'
import { Avatar3D }           from './components/Avatar3D'
import { PinScreenAvatar }    from './components/PinScreenAvatar'
import { PinWallStage }       from './components/PinWallStage'
import { TranscriptOverlay }  from './components/TranscriptOverlay'
import { HUDReadout }         from './components/HUDReadout'
import { Header }             from './components/Header'
import { MicButton }          from './components/MicButton'
import { StatusBadge }        from './components/StatusBadge'
import { QuickReplies }       from './components/QuickReplies'
import { ToastContainer, toast } from './components/ToastContainer'
import { NameCollectionOverlay } from './components/NameCollectionOverlay'
import { AdminLogin }         from './components/AdminLogin'
import { AdminDashboard }     from './components/AdminDashboard'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

// ── Admin shell ───────────────────────────────────────────────────────────────
function AdminShell() {
  const [token, setToken] = useState(() => sessionStorage.getItem('vaani_admin_token'))

  const handleLogout = () => {
    sessionStorage.removeItem('vaani_admin_token')
    setToken(null)
  }

  if (!token) {
    return (
      <AdminLogin
        onSuccess={(t) => {
          sessionStorage.setItem('vaani_admin_token', t)
          setToken(t)
        }}
      />
    )
  }
  return <AdminDashboard token={token} onLogout={handleLogout} />
}

// ── Connecting overlay ────────────────────────────────────────────────────────
const INIT_MSGS = [
  'Initializing neural networks...',
  'Loading voice synthesis engine...',
  'Calibrating real-time inference...',
  'Connecting to Gemini Live...',
  'Preparing avatar pipeline...',
  'Warming up language models...',
  'Almost ready...',
]

function ConnectingOverlay({ connected, geminiReady }) {
  const [msgIdx, setMsgIdx] = useState(0)
  const [fade,   setFade]   = useState(true)
  const isWaitingForGemini = connected === 'connected' && !geminiReady

  useEffect(() => {
    const cycle = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setMsgIdx(i => (i + 1) % INIT_MSGS.length)
        setFade(true)
      }, 300)
    }, 2400)
    return () => clearInterval(cycle)
  }, [])

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
        /* Deep, dimensional black with a soft green core glow — the product
           "warming up" rather than a flat scrim. */
        background:
          'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(134,188,37,0.06) 0%, transparent 55%),' +
          'radial-gradient(circle at 50% 50%, rgba(3,8,12,0.92) 0%, rgba(2,5,8,0.97) 100%)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        pointerEvents: 'none',
        animation: 'cv-fadein 500ms ease both',
      }}
    >
      {/* Brand lockup */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontFamily: "'Syne', 'Plus Jakarta Sans', sans-serif",
          fontWeight: 700, fontSize: 30, lineHeight: 1,
          letterSpacing: '-0.03em', userSelect: 'none',
        }}>
          <span style={{ color: 'var(--green, #86BC25)' }}>V</span>
          <span style={{ color: 'rgba(242,246,252,0.95)' }}>AANI</span>
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8.5, letterSpacing: '0.42em',
          textTransform: 'uppercase',
          color: 'rgba(134,188,37,0.6)',
          paddingRight: '0.42em',
        }}>Deloitte · Avatar Intelligence</span>
      </div>

      {/* Concentric init reticle — precise, engineered, not a generic spinner */}
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '1px solid rgba(134,188,37,0.10)', borderTopColor: 'var(--green, #86BC25)',
          animation: 'cv-spin 1100ms cubic-bezier(0.5,0,0.5,1) infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 11, borderRadius: '50%',
          border: '1px solid rgba(61,90,138,0.12)', borderBottomColor: 'rgba(61,90,138,0.65)',
          animation: 'cv-spin-rev 1800ms cubic-bezier(0.5,0,0.5,1) infinite',
        }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%', background: 'var(--green, #86BC25)',
            boxShadow: '0 0 12px rgba(134,188,37,0.7)',
            animation: 'cv-pulse 1300ms ease-in-out infinite',
          }} />
        </div>
      </div>

      {/* Telemetry line + progress */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, letterSpacing: '0.16em',
          color: isWaitingForGemini ? 'rgba(134,188,37,0.7)' : 'rgba(220,228,236,0.42)',
          textTransform: 'uppercase',
          opacity: fade ? 1 : 0,
          transition: 'opacity 300ms ease, color 400ms ease',
          minHeight: 16, paddingRight: '0.16em', textAlign: 'center',
        }}>
          {isWaitingForGemini ? 'Opening Gemini Live session' : INIT_MSGS[msgIdx]}
        </div>
        <div style={{
          width: 210, height: 2, borderRadius: 2, overflow: 'hidden',
          background: 'rgba(61,90,138,0.16)',
        }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: 'linear-gradient(90deg, rgba(61,90,138,0.6), var(--green, #86BC25))',
            boxShadow: '0 0 10px rgba(134,188,37,0.4)',
            animation: 'cv-progress 2400ms cubic-bezier(0.4,0,0.2,1) infinite',
          }} />
        </div>
      </div>

      <style>{`
        @keyframes cv-fadein   { from { opacity:0 } to { opacity:1 } }
        @keyframes cv-spin     { to { transform: rotate(360deg) } }
        @keyframes cv-spin-rev { to { transform: rotate(-360deg) } }
        @keyframes cv-pulse    { 0%,100% { opacity:.4; transform:scale(1) } 50% { opacity:1; transform:scale(1.5) } }
        @keyframes cv-progress { 0% { transform: translateX(-100%) } 60%,100% { transform: translateX(0) } }
        @media (prefers-reduced-motion: reduce) {
          [aria-label="Connecting to Vaani"] * { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

// ── Main app — extracted so hooks are never conditional ───────────────────────
function MainApp() {
  const [bootDone,       setBootDone]       = useState(false)
  const [sessionId,      setSessionId]      = useState(null)
  const [appState,       setAppState]       = useState('idle')
  const [connected,      setConnected]      = useState('connecting')
  const [currentLang,    setCurrentLang]    = useState('en')
  const [suggestions,    setSuggestions]    = useState([])
  const [showSuggestions,setShowSuggestions]= useState(false)
  const [sessionRunning, setSessionRunning] = useState(false)
  const [geminiReady,    setGeminiReady]    = useState(false)
  const [botConfig,      setBotConfig]      = useState(null)

  /* face ID */
  const [identityReady,  setIdentityReady]  = useState(false)
  const [showNameOverlay,setShowNameOverlay]= useState(false)
  const pendingImageRef = useRef(null)

  const videoFrameHandlerRef = useRef(null)
  const clearCanvasRef = useRef(null)
  /* Latest ARKit blendshape weights from the backend neural stream (Phase 5).
     A ref (not state) so the 30Hz updates never trigger React re-renders —
     the Three.js render loop reads .current directly. */
  const facialWeightsRef = useRef(null)

  const { status: cameraStatus, captureFrame } = useFaceCapture()

  const {
    messages, agentStreamBuffer, userInterim, detectedLanguage, handleMessage: handleConvMessage,
  } = useConversation()

  const audioPlayback = useAudioPlayback()

  const onAudioChunk = useCallback((buf) => audioPlayback.enqueue(buf), [audioPlayback])
  const onVideoFrame = useCallback((buf) => {
    if (videoFrameHandlerRef.current) videoFrameHandlerRef.current(buf)
  }, [])

  const onMessage = useCallback((msg) => {
    if (msg.type === 'connected') {
      setConnected('connected')
      setSessionRunning(true)
    } else if (msg.type === 'disconnected') {
      setConnected('connecting')
      setSessionRunning(false)
      fetchConfig()
    } else if (msg.type === 'state') {
      setAppState(msg.value)
      setGeminiReady(true)
      setShowSuggestions(msg.value === 'idle')
    } else if (msg.type === 'suggestions') {
      setSuggestions(msg.items || [])
    } else if (msg.type === 'interrupt') {
      // Barge-in: stop the avatar's audio playback and clear the animation instantly.
      audioPlayback.stop()
      if (clearCanvasRef.current) clearCanvasRef.current()
    } else if (msg.type === 'session_renewed') {
      toast('Session renewed')
    } else if (msg.type === 'error') {
      // Transient socket errors are expected while the backend boots and the
      // client auto-reconnects; the connection dot + overlay already convey this,
      // so don't spam the user with a toast for every retry. Surface real,
      // server-reported errors only.
      if (msg.message !== 'WebSocket connection error') {
        toast(msg.message || 'Something went wrong', 'error')
      }
    }
    handleConvMessage(msg)
  }, [handleConvMessage, audioPlayback])

  const onFacialWeights = useCallback((weights) => {
    facialWeightsRef.current = weights
  }, [])

  const { sendJson, sendBinary } = useWebSocket({
    sessionId: identityReady ? sessionId : null,
    onAudioChunk,
    onVideoFrame,
    onMessage,
    onFacialWeights,
    backendUrl: BACKEND_URL,
  })

  /* Fetch bot config — on mount and on reconnect */
  const fetchConfig = useCallback(() => {
    fetch(`${BACKEND_URL}/config`)
      .then(r => r.json())
      .then(cfg => {
        setBotConfig(cfg)
        if (cfg.primary_color) {
          document.documentElement.style.setProperty('--color-brand', cfg.primary_color)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  /* Fallback: force identityReady after 2s so camera permission dialog never blocks WS */
  useEffect(() => {
    if (identityReady) return
    const t = setTimeout(() => setIdentityReady(true), 2000)
    return () => clearTimeout(t)
  }, [identityReady])

  useEffect(() => {
    document.body.style.background = '#000000'
    const onForce = () => setGeminiReady(true)
    window.addEventListener('vaani_force_ready', onForce)
    return () => window.removeEventListener('vaani_force_ready', onForce)
  }, [])

  /* Step 1 — create session, retry with backoff until backend is ready */
  useEffect(() => {
    let cancelled = false
    const attempt = (n) => {
      fetch(`${BACKEND_URL}/session`, { method: 'POST' })
        .then(r => r.json())
        .then(d => { if (!cancelled) setSessionId(d.session_id) })
        .catch(() => {
          if (!cancelled) {
            const delay = Math.min(1000 * Math.pow(2, n), 8000)
            setTimeout(() => attempt(n + 1), delay)
          }
        })
    }
    attempt(0)
    return () => { cancelled = true }
  }, [])

  /* Step 2 — identify user once camera + session are ready */
  useEffect(() => {
    if (!sessionId || cameraStatus === 'idle' || cameraStatus === 'requesting') return
    if (cameraStatus === 'unavailable') { setIdentityReady(true); return }

    const image = captureFrame()
    if (!image) { setIdentityReady(true); return }

    fetch(`${BACKEND_URL}/session/${sessionId}/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.known) {
          toast(`Welcome back, ${data.name}!`)
        } else if (!data.reason) {
          pendingImageRef.current = image
          setShowNameOverlay(true)
          return
        }
        setIdentityReady(true)
      })
      .catch(() => setIdentityReady(true))
  }, [sessionId, cameraStatus, captureFrame])

  const onMicChunk = useCallback((buf) => sendBinary(buf), [sendBinary])

  const { isRecording, amplitudes, startRecording, stopRecording } =
    useMicrophone({ onChunk: onMicChunk })

  const handleMicStart = useCallback(() => {
    startRecording()
    sendJson({ type: 'start_listening' })
    setShowSuggestions(false)
  }, [startRecording, sendJson])

  const handleMicStop = useCallback(() => {
    stopRecording()
    sendJson({ type: 'stop_listening' })
  }, [stopRecording, sendJson])

  const handleNameSubmit = useCallback(({ name, role }) => {
    const image = pendingImageRef.current
    setShowNameOverlay(false)
    if (!image || !sessionId) { setIdentityReady(true); return }
    fetch(`${BACKEND_URL}/session/${sessionId}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, name, role }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.enrolled)                               toast(`Nice to meet you, ${data.name}!`)
        else if (data.reason === 'no_face_detected')     toast('No face detected — memory not saved', 'error')
        else if (data.reason?.startsWith('db'))          toast('Memory unavailable', 'error')
      })
      .catch(() => toast('Enrollment failed', 'error'))
      .finally(() => setIdentityReady(true))
  }, [sessionId])

  const handleNameSkip = useCallback(() => {
    setShowNameOverlay(false)
    setIdentityReady(true)
  }, [])

  const handleLanguageChange = useCallback((code) => {
    setCurrentLang(code)
    sendJson({ type: 'set_language', code })
  }, [sendJson])

  const handleQuickReply = useCallback((text) => {
    sendJson({ type: 'quick_reply', text })
    setShowSuggestions(false)
  }, [sendJson])

  /* Transcript overlay content */
  const lastAgentMsg = messages.length > 0 && messages[messages.length - 1].role === 'agent'
    ? messages[messages.length - 1].text
    : ''
  const agentText   = agentStreamBuffer || lastAgentMsg
  const isStreaming  = !!agentStreamBuffer

  const userFinalText = messages.length > 0 && messages[messages.length - 1].role === 'user'
    ? messages[messages.length - 1].text
    : ''
  const userText = isRecording ? userInterim : userFinalText

  const mainVisible = bootDone
  const isPinWall = botConfig?.render_mode === 'pinscreen'
  const micDisabled = !geminiReady || appState === 'thinking' || connected !== 'connected'

  return (
    <>
      {!isPinWall && <ParticleCanvas appState={appState} />}

      {!bootDone && (
        <BootSequence onComplete={() => setBootDone(true)} />
      )}

      {bootDone && (connected !== 'connected' || !geminiReady || !botConfig) && (
        isPinWall ? (
          <ConnectingOverlay connected={connected} geminiReady={geminiReady} />
        ) : (
          <AdvancedConnectingOverlay connected={connected} geminiReady={geminiReady} mode={botConfig?.render_mode} />
        )
      )}

      {isPinWall ? (
        bootDone && (
          <PinWallStage
            appState={appState}
            connected={connected}
            currentLang={currentLang}
            onLanguageChange={handleLanguageChange}
            getLevel={audioPlayback.getLevel}
            getVisemes={audioPlayback.getVisemes}
            facialWeightsRef={facialWeightsRef}
            imageUrl={botConfig?.pinscreen_image_url || null}
            isRecording={isRecording}
            onMicStart={handleMicStart}
            onMicStop={handleMicStop}
            micDisabled={micDisabled}
            agentText={agentText}
            userText={userText}
            isStreaming={isStreaming}
            sessionRunning={sessionRunning}
          />
        )
      ) : (
      <>
      <Header
        connected={connected}
        onLanguageChange={handleLanguageChange}
        currentLang={currentLang}
        sessionRunning={sessionRunning}
      />

      {/* Floating Status — Top Left */}
      <div style={{ position: 'fixed', top: 100, left: 40, zIndex: 100, opacity: mainVisible ? 1 : 0, transition: 'opacity 500ms' }}>
        <StatusBadge appState={appState} connected={connected} />
      </div>

      {/* Branding Label — Top Right */}
      <div style={{
        position: 'fixed', top: 100, right: 40, zIndex: 100,
        textAlign: 'right', opacity: mainVisible ? 0.6 : 0, transition: 'opacity 500ms'
      }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, color: '#86BC25', letterSpacing: '0.2em' }}>
          DELOITTE DCIT
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'white', letterSpacing: '0.1em' }}>
          AVATAR SYSTEMS · INDIA
        </div>
      </div>

      <main
        role="main"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-content)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          opacity: mainVisible ? 1 : 0,
          transform: mainVisible ? 'scale(1)' : 'scale(0.98)',
          transition: 'opacity 800ms var(--ease-out-quart), transform 800ms var(--ease-out-quart)',
        }}
      >
        {/* Avatar + HUD */}
        <div className="avatar-stage" style={{ 
          position: 'relative', 
          width: 720, height: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
        }}>
          {botConfig?.render_mode === '3d' ? (
            <Avatar3D
              appState={appState}
              getLevel={audioPlayback.getLevel}
              getLipsync={audioPlayback.getLipsync}
              avatarUrl={botConfig?.avatar_3d_url || null}
            />
          ) : (
            <AvatarDisplay
              appState={appState}
              amplitudes={amplitudes}
              onVideoFrame={(handler) => { videoFrameHandlerRef.current = handler }}
              onClearCanvas={(fn) => { clearCanvasRef.current = fn }}
              avatarSrc={botConfig?.avatar_video_url || null}
            />
          )}
        </div>

        <div style={{ marginTop: 20, pointerEvents: 'auto' }}>
          <QuickReplies
            suggestions={suggestions}
            onSelect={handleQuickReply}
            visible={showSuggestions && suggestions.length > 0}
          />
        </div>
      </main>

      {/* Mic Button — Floating Bottom Right */}
      <div style={{ position: 'fixed', bottom: 40, right: 40, zIndex: 200, opacity: mainVisible ? 1 : 0, transition: 'opacity 500ms' }}>
        <MicButton
          isRecording={isRecording}
          isDisabled={!geminiReady || appState === 'thinking' || connected !== 'connected'}
          onStart={handleMicStart}
          onStop={handleMicStop}
          appState={appState}
        />
      </div>

      {/* Transcript Overlay — Bottom Left Alignment */}
      <div style={{ position: 'fixed', bottom: 40, left: 40, zIndex: 200, pointerEvents: 'none', opacity: mainVisible ? 1 : 0, transition: 'opacity 500ms' }}>
        <div style={{ maxWidth: 640, pointerEvents: 'auto' }}>
          <TranscriptOverlay
            agentText={agentText}
            isStreaming={isStreaming}
            userText={userText}
            currentLang={detectedLanguage?.code || currentLang}
          />
        </div>
      </div>
      </>
      )}

      <ToastContainer />

      {showNameOverlay && (
        <NameCollectionOverlay
          onSubmit={handleNameSubmit}
          onSkip={handleNameSkip}
        />
      )}

      <style>{`
        @media (max-width: 768px) {
          .hud-layer > * { display: none !important; }
        }
        /* The avatar stage has a fixed 460px footprint; scale it to fit
           narrow viewports so it stays centered and never overflows. */
        @media (max-width: 520px) {
          .avatar-stage {
            transform: scale(calc((100vw - 32px) / 460));
            transform-origin: center top;
          }
        }
        @media (max-width: 360px) {
          .avatar-stage {
            transform: scale(calc((100vw - 24px) / 460));
          }
        }
      `}</style>
    </>
  )
}

// ── Router ────────────────────────────────────────────────────────────────────
export default function App() {
  const [isAdmin, setIsAdmin] = useState(() => window.location.hash === '#admin')

  useEffect(() => {
    const onHash = () => setIsAdmin(window.location.hash === '#admin')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return isAdmin ? <AdminShell /> : <MainApp />
}
