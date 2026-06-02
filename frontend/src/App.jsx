import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket }    from './hooks/useWebSocket'
import { useMicrophone }   from './hooks/useMicrophone'
import { useAudioPlayback }from './hooks/useAudioPlayback'
import { useConversation } from './hooks/useConversation'
import { useFaceCapture }  from './hooks/useFaceCapture'

import { BootSequence }       from './components/BootSequence'
import { ParticleCanvas }     from './components/ParticleCanvas'
import { AvatarDisplay }      from './components/AvatarDisplay'
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
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 400,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
      background: 'rgba(1,10,26,0.90)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      pointerEvents: 'none',
      animation: 'cv-fadein 500ms ease both',
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.55em',
          textTransform: 'uppercase',
          color: '#86BC25',
          paddingRight: '0.55em',
        }}>DELOITTE</span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: 'rgba(61,90,138,0.70)',
          paddingRight: '0.28em',
        }}>VAANI // AVATAR INTELLIGENCE</span>
      </div>

      {/* Spinner ring */}
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          border: '1.5px solid rgba(134,188,37,0.12)',
          borderTopColor: '#86BC25',
          animation: 'cv-spin 1000ms linear infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 8,
          borderRadius: '50%',
          border: '1px solid rgba(0,163,224,0.10)',
          borderBottomColor: 'rgba(0,163,224,0.50)',
          animation: 'cv-spin-rev 1600ms linear infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: '#86BC25',
            animation: 'cv-pulse 1200ms ease-in-out infinite',
            boxShadow: '0 0 8px rgba(134,188,37,0.6)',
          }} />
        </div>
      </div>

      {/* Status message */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        letterSpacing: '0.08em',
        color: isWaitingForGemini ? 'rgba(134,188,37,0.60)' : 'rgba(255,255,255,0.38)',
        textTransform: 'uppercase',
        opacity: fade ? 1 : 0,
        transition: 'opacity 300ms ease, color 400ms ease',
        minHeight: 16,
        paddingRight: '0.08em',
      }}>
        {isWaitingForGemini ? 'Opening Gemini Live session...' : INIT_MSGS[msgIdx]}
      </div>

      {/* Progress bar — slow pulse */}
      <div style={{ width: 180, height: 1, background: 'rgba(61,90,138,0.20)' }}>
        <div style={{
          height: '100%',
          background: 'linear-gradient(90deg, #3D5A8A, #86BC25)',
          animation: 'cv-progress 2400ms ease-in-out infinite',
        }} />
      </div>

      <style>{`
        @keyframes cv-fadein   { from { opacity:0 } to { opacity:1 } }
        @keyframes cv-spin     { to { transform: rotate(360deg) } }
        @keyframes cv-spin-rev { to { transform: rotate(-360deg) } }
        @keyframes cv-pulse    { 0%,100% { opacity:.4; transform:scale(1) } 50% { opacity:1; transform:scale(1.4) } }
        @keyframes cv-progress { 0% { width:0% } 60% { width:100% } 100% { width:100% } }
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
    } else if (msg.type === 'session_renewed') {
      toast('Session renewed')
    } else if (msg.type === 'error') {
      toast(msg.message || 'Something went wrong', 'error')
    }
    handleConvMessage(msg)
  }, [handleConvMessage])

  const { sendJson, sendBinary } = useWebSocket({
    sessionId: identityReady ? sessionId : null,
    onAudioChunk,
    onVideoFrame,
    onMessage,
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

  return (
    <>
      <ParticleCanvas appState={appState} />

      {!bootDone && (
        <BootSequence onComplete={() => setBootDone(true)} />
      )}

      {bootDone && (connected !== 'connected' || !geminiReady) && (
        <ConnectingOverlay connected={connected} geminiReady={geminiReady} />
      )}

      <Header
        connected={connected}
        onLanguageChange={handleLanguageChange}
        currentLang={currentLang}
        sessionRunning={sessionRunning}
      />

      <main
        role="main"
        style={{
          position: 'relative',
          zIndex: 'var(--z-content)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 'var(--header-height)',
          paddingBottom: 120,
          gap: 28,
          opacity: mainVisible ? 1 : 0,
          transform: mainVisible ? 'scale(1)' : 'scale(0.96)',
          transition: 'opacity 500ms var(--ease-out-quart), transform 500ms var(--ease-out-quart)',
        }}
      >
        {/* Avatar + HUD */}
        <div style={{ position: 'relative' }}>
          <AvatarDisplay
            appState={appState}
            amplitudes={amplitudes}
            onVideoFrame={(handler) => { videoFrameHandlerRef.current = handler }}
            avatarSrc={botConfig?.avatar_video_url || null}
          />

          <div style={{ display: 'contents' }} className="hud-layer">
            <HUDReadout position="top-left"     appState={appState} currentLang={currentLang} sessionRunning={sessionRunning} bootDone={bootDone} />
            <HUDReadout position="top-right"    appState={appState} currentLang={detectedLanguage?.code || currentLang} sessionRunning={sessionRunning} bootDone={bootDone} />
            <HUDReadout position="bottom-left"  appState={appState} currentLang={currentLang} sessionRunning={sessionRunning} bootDone={bootDone} />
            <HUDReadout position="bottom-right" appState={appState} currentLang={currentLang} sessionRunning={sessionRunning} bootDone={bootDone} />
          </div>
        </div>

        <StatusBadge appState={appState} connected={connected} />

        <MicButton
          isRecording={isRecording}
          isDisabled={!geminiReady || appState === 'thinking' || connected !== 'connected'}
          onStart={handleMicStart}
          onStop={handleMicStop}
          appState={appState}
        />

        <QuickReplies
          suggestions={suggestions}
          onSelect={handleQuickReply}
          visible={showSuggestions && suggestions.length > 0}
        />
      </main>

      <TranscriptOverlay
        agentText={agentText}
        isStreaming={isStreaming}
        userText={userText}
        currentLang={detectedLanguage?.code || currentLang}
      />

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
        @media (max-width: 520px) {
          :root { --avatar-size: var(--avatar-size-mobile); }
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
