import { useState, useCallback } from 'react'

export function useConversation() {
  const [messages, setMessages] = useState([])
  const [agentStreamBuffer, setAgentStreamBuffer] = useState('')
  const [userInterim, setUserInterim] = useState('')
  const [detectedLanguage, setDetectedLanguage] = useState(null)

  const addUserMessage = useCallback((text) => {
    setUserInterim('')
    setMessages(prev => [...prev, { role: 'user', text, id: Date.now() }])
  }, [])

  const appendAgentToken = useCallback((text) => {
    setAgentStreamBuffer(prev => prev + text)
  }, [])

  const finalizeAgentMessage = useCallback(() => {
    setAgentStreamBuffer(buf => {
      if (buf) {
        setMessages(prev => [...prev, { role: 'agent', text: buf, id: Date.now() }])
      }
      return ''
    })
  }, [])

  const handleMessage = useCallback((msg) => {
    if (msg.type === 'transcript_user' && msg.final) {
      addUserMessage(msg.text)
    } else if (msg.type === 'transcript_user' && !msg.final) {
      setUserInterim(msg.text)
    } else if (msg.type === 'transcript_agent') {
      if (msg.streaming) {
        appendAgentToken(msg.text)
      } else {
        appendAgentToken(msg.text)
        finalizeAgentMessage()
      }
    } else if (msg.type === 'turn_complete') {
      finalizeAgentMessage()
    } else if (msg.type === 'language_detected') {
      setDetectedLanguage({ code: msg.code, name: msg.name || msg.code })
    }
  }, [addUserMessage, appendAgentToken, finalizeAgentMessage])

  return {
    messages,
    agentStreamBuffer,
    userInterim,
    detectedLanguage,
    handleMessage
  }
}
