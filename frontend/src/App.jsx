import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { useMicrophone } from './hooks/useMicrophone'
import { useAudioPlayback } from './hooks/useAudioPlayback'
import { useParticles } from './hooks/useParticles'
import { useConversation } from './hooks/useConversation'
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
import { SessionTimer } from './components/SessionTimer'
import { ToastContainer, toast } from './components/ToastContainer'

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

  const particlesCanvasRef = useRef(null)
  const videoFrameHandlerRef = useRef(null)

  useParticles(particlesCanvasRef, appState)

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

  const { sendJson, sendBinary } = useWebSocket({
    sessionId,
    onAudioChunk,
    onVideoFrame,
    onMessage,
    backendUrl: BACKEND_URL
  })

  useEffect(() => {
    fetch(`${BACKEND_URL}/session`, { method: 'POST' })
      .then(r => r.json())
      .then(d => setSessionId(d.session_id))
      .catch(() => setConnected('error'))
  }, [])

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
      <canvas ref={particlesCanvasRef} style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none'
      }} />

      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 100% 80% at 50% 0%, #01347A 0%, #012169 30%, #010D20 100%)'
      }} />

      <Header
        connected={connected}
        onLanguageChange={handleLanguageChange}
        currentLang={currentLang}
        agentName="Vaani"
      />

      <main style={{
        position: 'relative', zIndex: 10,
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        paddingTop: 52, paddingBottom: captionsOn ? 52 : 24,
        gap: 20
      }}>
        <div style={{ position: 'relative' }}>
          <AvatarDisplay
            appState={appState}
            onVideoFrame={(handler) => { videoFrameHandlerRef.current = handler }}
          />
          <div style={{ position: 'absolute', bottom: -16, left: '50%', transform: 'translateX(-50%)' }}>
            <LanguagePill detected={detectedLanguage || (currentLang !== 'en' ? { code: currentLang } : null)} />
          </div>
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

        <StatusBadge appState={appState} />

        <AudioWaveform amplitudes={amplitudes} visible={isRecording} />

        <MicButton
          isRecording={isRecording}
          isDisabled={appState === 'thinking' || connected !== 'connected'}
          onStart={handleMicStart}
          onStop={handleMicStop}
        />

        <QuickReplies
          suggestions={suggestions}
          onSelect={handleQuickReply}
          visible={showSuggestions && suggestions.length > 0}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SessionTimer
            running={sessionRunning}
            onWarning={(secs) => toast(`Session renewing in ${Math.floor(secs / 60)} min...`)}
          />
          <button onClick={() => setCaptionsOn(o => !o)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: captionsOn ? 'var(--text-brand)' : 'var(--text-muted)',
            fontSize: 11, fontFamily: "'JetBrains Mono', monospace"
          }}>
            CC
          </button>
        </div>
      </main>

      <CaptionBand text={captionText} visible={captionsOn} />
      <ToastContainer />
    </div>
  )
}
