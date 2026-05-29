import { useEffect, useRef, useCallback } from 'react'

const AUDIO_TYPE = 0x01
const VIDEO_TYPE = 0x02

export function useWebSocket({ sessionId, onAudioChunk, onVideoFrame, onMessage, backendUrl }) {
  const ws = useRef(null)
  const retryCount = useRef(0)
  const MAX_RETRIES = 5

  const connect = useCallback(() => {
    if (!sessionId) return
    const base = (backendUrl || 'http://localhost:8000').replace(/^http/, 'ws')
    const url = `${base}/ws/session/${sessionId}`

    ws.current = new WebSocket(url)
    ws.current.binaryType = 'arraybuffer'

    ws.current.onopen = () => {
      retryCount.current = 0
      onMessage({ type: 'connected' })
    }

    ws.current.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const view = new Uint8Array(event.data)
        const frameType = view[0]
        const payload = event.data.slice(1)
        if (frameType === AUDIO_TYPE) onAudioChunk(payload)
        else if (frameType === VIDEO_TYPE) onVideoFrame(payload)
      } else {
        try {
          const msg = JSON.parse(event.data)
          onMessage(msg)
        } catch {}
      }
    }

    ws.current.onclose = () => {
      onMessage({ type: 'disconnected' })
      if (retryCount.current < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, retryCount.current), 10000)
        retryCount.current++
        setTimeout(connect, delay)
      }
    }

    ws.current.onerror = () => {
      onMessage({ type: 'error', message: 'WebSocket connection error' })
    }
  }, [sessionId, backendUrl])

  useEffect(() => {
    connect()
    return () => {
      if (ws.current) ws.current.close()
    }
  }, [connect])

  const sendJson = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data))
    }
  }, [])

  const sendBinary = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(data)
    }
  }, [])

  return { sendJson, sendBinary }
}
