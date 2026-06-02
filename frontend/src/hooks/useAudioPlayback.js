import { useRef, useCallback } from 'react'

// Gemini outputs 24kHz PCM int16, we play it back at 24kHz
const PLAYBACK_RATE = 24000

export function useAudioPlayback() {
  const contextRef    = useRef(null)
  const nextStartRef  = useRef(0)
  const analyserRef   = useRef(null)
  const dataRef       = useRef(null)

  const ensureContext = useCallback(() => {
    if (!contextRef.current || contextRef.current.state === 'closed') {
      const ctx = new AudioContext({ sampleRate: PLAYBACK_RATE })
      contextRef.current = ctx
      nextStartRef.current = 0

      // Analyser sits in the graph (source -> analyser -> destination) so the
      // 3D avatar can read live loudness for lip-sync. It's a pass-through node,
      // so the MuseTalk audio path is unaffected.
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.6
      analyser.connect(ctx.destination)
      analyserRef.current = analyser
      dataRef.current = new Uint8Array(analyser.fftSize)
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
    // Route through the analyser when available, else straight to destination.
    source.connect(analyserRef.current || ctx.destination)

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
      analyserRef.current = null
      dataRef.current = null
    }
  }, [])

  // Returns the current playback loudness in [0,1] (RMS of the time-domain
  // waveform). Returns 0 when nothing is playing. Safe to poll every frame.
  const getLevel = useCallback(() => {
    const analyser = analyserRef.current
    const data = dataRef.current
    if (!analyser || !data) return 0
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128
      sum += v * v
    }
    return Math.sqrt(sum / data.length)
  }, [])

  return { enqueue, stop, getLevel }
}
