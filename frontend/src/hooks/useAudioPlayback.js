import { useRef, useCallback } from 'react'

// Gemini outputs 24kHz PCM int16, we play it back at 24kHz
const PLAYBACK_RATE = 24000

export function useAudioPlayback() {
  const contextRef = useRef(null)
  const nextStartRef = useRef(0)

  const ensureContext = useCallback(() => {
    if (!contextRef.current || contextRef.current.state === 'closed') {
      contextRef.current = new AudioContext({ sampleRate: PLAYBACK_RATE })
      nextStartRef.current = 0
    }
    if (contextRef.current.state === 'suspended') {
      contextRef.current.resume()
    }
    return contextRef.current
  }, [])

  const enqueue = useCallback((arrayBuffer) => {
    const ctx = ensureContext()
    const samples = new Int16Array(arrayBuffer)
    const floats = new Float32Array(samples.length)
    for (let i = 0; i < samples.length; i++) {
      floats[i] = samples[i] / 32768
    }
    const buffer = ctx.createBuffer(1, floats.length, PLAYBACK_RATE)
    buffer.copyToChannel(floats, 0)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    const now = ctx.currentTime
    const startAt = Math.max(now + 0.01, nextStartRef.current)
    source.start(startAt)
    nextStartRef.current = startAt + buffer.duration
  }, [ensureContext])

  const stop = useCallback(() => {
    if (contextRef.current) {
      contextRef.current.close()
      contextRef.current = null
      nextStartRef.current = 0
    }
  }, [])

  return { enqueue, stop }
}
