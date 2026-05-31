import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { useMicrophone } from './hooks/useMicrophone'
import { useAudioPlayback } from './hooks/useAudioPlayback'
import { useParticles } from './hooks/useParticles'
import { useConversation } from './hooks/useConversation'
import { useFaceCapture } from './hooks/useFaceCapture'
import { AvatarDisplay } from './components/AvatarDisplay'
import { AgentBubble } from './components/AgentBubble'
import { UserBubble } from './components/UserBubble'
import { MicButton } from './components/MicButton'
import { StatusBadge } from './components/StatusBadge'
import { AudioWaveform } from './components/AudioWaveform'
import { LanguagePill } from './components/LanguagePill'
import { Header } from './components/Header'
import { CaptionBand } from './components/CaptionBand'
import { QuickReplies } from './components/QuickReplies'
import { ToastContainer, toast } from './components/ToastContainer'
import { NameCollectionOverlay } from './components/NameCollectionOverlay'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

export default function App() {
  const [sessionId, setSessionId] = useState(null)
  const [appState, setAppState] = useState('idle')
  const [connected, setConnected] = useState('connecting')
  const [currentLang, setCurrentLang] = useState('en')
  const [captionsOn, setCaptionsOn] = useState(true)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [sessionRunning, setSessionRunning] = useState(false)

  // memory / face ID state
  const [identityReady, setIdentityReady] = useState(false)
  const [showNameOverlay, setShowNameOverlay] = useState(false)
  const pendingImageRef = useRef(null)

  const particlesCanvasRef = useRef(null)
  const videoFrameHandlerRef = useRef(null)

  useParticles(particlesCanvasRef, appState)

  const { status: cameraStatus, captureFrame } = useFaceCapture()

  const { messages, agentStreamBuffer, userInterim, detectedLanguage, handleMessage: handleConvMessage } =
    useConversation()

  const audioPlayback = useAudioPlayback()

  const onAudioChunk = useCallback((buf) => {
    audioPlayback.enqueue(buf)
  }, [audioPlayback])

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
      if (msg.value === 'idle') {
        setShowSuggestions(true)
      } else {
        setShowSuggestions(false)
      }
    } else if (msg.type === 'suggestions') {
      setSuggestions(msg.items || [])
    } else if (msg.type === 'session_renewed') {
      toast('Session renewed')
    } else if (msg.type === 'error') {
      toast(msg.message || 'Something went wrong', 'error')
    }
    handleConvMessage(msg)
  }, [handleConvMessage])

  // only connect WebSocket after face identification is resolved
  const { sendJson, sendBinary } = useWebSocket({
    sessionId: identityReady ? sessionId : null,
    onAudioChunk,
    onVideoFrame,
    onMessage,
    backendUrl: BACKEND_URL
  })

  // Step 1 — create session
  useEffect(() => {
    fetch(`${BACKEND_URL}/session`, { method: 'POST' })
      .then(r => r.json())
      .then(d => setSessionId(d.session_id))
      .catch(() => setConnected('error'))
  }, [])

  // Step 2 — once session + camera are both ready, try to identify the user
  useEffect(() => {
    if (!sessionId || cameraStatus === 'idle' || cameraStatus === 'requesting') return

    if (cameraStatus === 'unavailable') {
      // no camera — proceed without memory
      setIdentityReady(true)
      return
    }

    // camera is ready — capture a frame and identify
    const image = captureFrame()
    if (!image) {
      setIdentityReady(true)
      return
    }

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
          // Unknown face — genuinely not enrolled yet, ask for name
          pendingImageRef.current = image
          setShowNameOverlay(true)
          return  // don't set identityReady yet — wait for overlay
        }
        // Any reason string (db_unavailable, face_recognition_unavailable, etc.)
        // means we can't identify — proceed without memory, don't ask for name
        setIdentityReady(true)
      })
      .catch(() => setIdentityReady(true))
  }, [sessionId, cameraStatus, captureFrame])

  const onMicChunk = useCallback((buffer) => {
    sendBinary(buffer)
  }, [sendBinary])

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
    if (!image || !sessionId) {
      setIdentityReady(true)
      return
    }
    fetch(`${BACKEND_URL}/session/${sessionId}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, name, role }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.enrolled) {
          toast(`Nice to meet you, ${data.name}!`)
        } else if (data.reason === 'no_face_detected') {
          toast('No face detected — memory not saved', 'error')
        } else if (data.reason === 'db_unavailable' || data.reason === 'db_error') {
          toast('Memory unavailable — name not saved', 'error')
        }
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

  const captionText = agentStreamBuffer ||
    (messages.length > 0 && messages[messages.length - 1].role === 'agent'
      ? messages[messages.length - 1].text
      : '')

  const agentFinalMessages = messages.filter(m => m.role === 'agent')
  const userFinalText = messages.length > 0 && messages[messages.length - 1].role === 'user'
    ? messages[messages.length - 1].text
    : ''

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Particle canvas */}
      <canvas
        ref={particlesCanvasRef}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0,
          zIndex: 'var(--z-particles)',
          pointerEvents: 'none'
        }}
      />

      {/* Background radial gradient */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0,
          zIndex: 'var(--z-bg)', pointerEvents: 'none',
          background: 'radial-gradient(ellipse 110% 90% at 50% -10%, #01347A 0%, #012169 28%, #010D20 70%)'
        }}
      />

      <Header
        connected={connected}
        onLanguageChange={handleLanguageChange}
        currentLang={currentLang}
        captionsOn={captionsOn}
        onToggleCaptions={() => setCaptionsOn(o => !o)}
        sessionRunning={sessionRunning}
        onSessionWarning={(secs) => toast(`Session renewing in ${Math.floor(secs / 60)} min...`)}
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
          paddingBottom: captionsOn ? 'var(--caption-height)' : 0,
          gap: 24,
        }}
      >
        {/* Avatar stage — hero element */}
        <div style={{ position: 'relative', zIndex: 'var(--z-avatar)' }}>
          <AvatarDisplay
            appState={appState}
            onVideoFrame={(handler) => { videoFrameHandlerRef.current = handler }}
          />

          <div style={{
            position: 'absolute',
            bottom: -20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 'var(--z-bubbles)'
          }}>
            <LanguagePill
              detected={detectedLanguage || (currentLang !== 'en' ? { code: currentLang } : null)}
            />
          </div>

          {/* Floating speech bubbles — positioned relative to avatar */}
          <AgentBubble
            streamBuffer={agentStreamBuffer}
            finalMessages={agentFinalMessages}
            detectedLang={detectedLanguage}
          />
          <UserBubble
            interimText={isRecording ? userInterim : ''}
            finalText={userFinalText}
          />
        </div>

        {/* State + waveform row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          zIndex: 'var(--z-content)'
        }}>
          <StatusBadge appState={appState} />
          <AudioWaveform amplitudes={amplitudes} visible={isRecording} />
        </div>

        {/* Primary action */}
        <MicButton
          isRecording={isRecording}
          isDisabled={appState === 'thinking' || connected !== 'connected'}
          onStart={handleMicStart}
          onStop={handleMicStop}
          appState={appState}
        />

        {/* Context suggestions */}
        <QuickReplies
          suggestions={suggestions}
          onSelect={handleQuickReply}
          visible={showSuggestions && suggestions.length > 0}
        />
      </main>

      <CaptionBand text={captionText} visible={captionsOn} />
      <ToastContainer />

      {showNameOverlay && (
        <NameCollectionOverlay
          onSubmit={handleNameSubmit}
          onSkip={handleNameSkip}
        />
      )}
    </div>
  )
}
