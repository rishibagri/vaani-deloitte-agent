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

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

export default function App() {
  const [bootDone,       setBootDone]       = useState(false)
  const [sessionId,      setSessionId]      = useState(null)
  const [appState,       setAppState]       = useState('idle')
  const [connected,      setConnected]      = useState('connecting')
  const [currentLang,    setCurrentLang]    = useState('en')
  const [suggestions,    setSuggestions]    = useState([])
  const [showSuggestions,setShowSuggestions]= useState(false)
  const [sessionRunning, setSessionRunning] = useState(false)
  const [geminiReady,   setGeminiReady]    = useState(false)

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
        if (data.enrolled)           toast(`Nice to meet you, ${data.name}!`)
        else if (data.reason === 'no_face_detected') toast('No face detected — memory not saved', 'error')
        else if (data.reason?.startsWith('db'))      toast('Memory unavailable', 'error')
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
  const agentText  = agentStreamBuffer || lastAgentMsg
  const isStreaming = !!agentStreamBuffer

  const userFinalText = messages.length > 0 && messages[messages.length - 1].role === 'user'
    ? messages[messages.length - 1].text
    : ''
  const userText = isRecording ? userInterim : userFinalText

  const mainVisible = bootDone

  return (
    <>
      {/* Particle canvas + background + corner brackets */}
      <ParticleCanvas appState={appState} />

      {/* Boot sequence — shows once per browser session */}
      {!bootDone && (
        <BootSequence onComplete={() => setBootDone(true)} />
      )}

      {/* Header */}
      <Header
        connected={connected}
        onLanguageChange={handleLanguageChange}
        currentLang={currentLang}
        sessionRunning={sessionRunning}
      />

      {/* Main stage */}
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

          {/* HUD readouts — hidden on mobile via CSS */}
          <div style={{ display: 'contents' }} className="hud-layer">
            <HUDReadout position="top-left"     appState={appState} currentLang={currentLang} sessionRunning={sessionRunning} bootDone={bootDone} />
            <HUDReadout position="top-right"    appState={appState} currentLang={detectedLanguage?.code || currentLang} sessionRunning={sessionRunning} bootDone={bootDone} />
            <HUDReadout position="bottom-left"  appState={appState} currentLang={currentLang} sessionRunning={sessionRunning} bootDone={bootDone} />
            <HUDReadout position="bottom-right" appState={appState} currentLang={currentLang} sessionRunning={sessionRunning} bootDone={bootDone} />
          </div>
        </div>

        {/* Status badge */}
        <StatusBadge appState={appState} />

        {/* Mic button */}
        <MicButton
          isRecording={isRecording}
          isDisabled={!geminiReady || appState === 'thinking' || connected !== 'connected'}
          onStart={handleMicStart}
          onStop={handleMicStop}
          appState={appState}
        />

        {/* Suggestions */}
        <QuickReplies
          suggestions={suggestions}
          onSelect={handleQuickReply}
          visible={showSuggestions && suggestions.length > 0}
        />
      </main>

      {/* Transcript overlay */}
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

      {/* Mobile HUD hide */}
      <style>{`
        @media (max-width: 768px) {
          .hud-layer > * { display: none !important; }
        }
        @media (max-width: 520px) {
          :root {
            --avatar-size: var(--avatar-size-mobile);
          }
        }
      `}</style>
    </>
  )
}
