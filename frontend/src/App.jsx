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

  /* Step 1 — create session */
  useEffect(() => {
    fetch(`${BACKEND_URL}/session`, { method: 'POST' })
      .then(r => r.json())
      .then(d => setSessionId(d.session_id))
      .catch(() => setConnected('error'))
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

      {bootDone && connected !== 'connected' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-overlay, 400)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          background: 'rgba(2,8,20,0.82)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          pointerEvents: 'none',
          animation: 'fadein 400ms ease',
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '2.5px solid rgba(0,163,224,0.18)',
            borderTopColor: 'var(--state-listening, #86BC25)',
            animation: 'spin 900ms linear infinite',
          }} />
          <span style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.45)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            Connecting to Vaani
          </span>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
            @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
          `}</style>
        </div>
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
