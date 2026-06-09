import { useRef, useCallback } from 'react'
import { Lipsync } from '../lib/wawa'

// Gemini outputs 24kHz PCM int16, we play it back at 24kHz
const PLAYBACK_RATE = 24000

export function useAudioPlayback() {
  const contextRef    = useRef(null)
  const nextStartRef  = useRef(0)
  const analyserRef   = useRef(null)
  const dataRef       = useRef(null)
  const freqRef       = useRef(null)
  const lipsyncRef    = useRef(null)   // wawa-lipsync (Oculus visemes for the 3D avatar)

  const ensureContext = useCallback(() => {
    if (!contextRef.current || contextRef.current.state === 'closed') {
      const ctx = new AudioContext({ sampleRate: PLAYBACK_RATE })
      contextRef.current = ctx
      nextStartRef.current = 0

      // Analyser sits in the graph (source -> analyser -> destination)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.15 // Lowered from 0.5 to reduce latency
      analyser.connect(ctx.destination)
      analyserRef.current = analyser
      dataRef.current = new Uint8Array(analyser.fftSize)
      freqRef.current = new Uint8Array(analyser.frequencyBinCount)

      // wawa-lipsync drives the 3D avatar's Oculus visemes.
      try {
        const lip = new Lipsync({ fftSize: 2048, historySize: 6 }) // Reduced history for snappier response
        const wawaAnalyser = ctx.createAnalyser()
        wawaAnalyser.fftSize = 2048
        wawaAnalyser.smoothingTimeConstant = 0.1 // Fast response for viseme analysis
        lip.audioContext = ctx
        lip.analyser = wawaAnalyser
        lip.dataArray = new Uint8Array(wawaAnalyser.frequencyBinCount)
        lip.sampleRate = ctx.sampleRate
        lip.binWidth = ctx.sampleRate / 2048
        analyser.connect(wawaAnalyser)
        lipsyncRef.current = lip
      } catch (e) {
        console.warn('[useAudioPlayback] wawa-lipsync init failed:', e?.message || e)
        lipsyncRef.current = null
      }
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
      freqRef.current = null
      lipsyncRef.current = null
    }
  }, [])

  // Returns the current playback loudness in [0,1]
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

  /**
   * getVisemes() — Inspired by wawa-lipsync
   * Analyzes frequency domain (FFT) to produce ARKit-compatible weights.
   * Low (100-500Hz)   -> O shape (mouthFunnel)
   * Mid (500-2000Hz)  -> A shape (jawOpen)
   * High (2000-8000Hz) -> E shape (mouthStretch)
   */
  const getVisemes = useCallback(() => {
    const analyser = analyserRef.current
    const freq = freqRef.current
    if (!analyser || !freq) return null

    analyser.getByteFrequencyData(freq)
    const binCount = analyser.frequencyBinCount
    const sampleRate = contextRef.current.sampleRate
    const hzPerBin = (sampleRate / 2) / binCount

    const getAverageInRange = (minHz, maxHz) => {
      const startBin = Math.floor(minHz / hzPerBin)
      const endBin   = Math.min(binCount - 1, Math.floor(maxHz / hzPerBin))
      if (startBin >= endBin) return 0
      let sum = 0
      for (let i = startBin; i <= endBin; i++) sum += freq[i]
      return sum / (endBin - startBin + 1) / 255
    }

    // Frequency ranges for human speech
    const low  = getAverageInRange(100, 500)   // O, U
    const mid  = getAverageInRange(500, 2500)  // A, I
    const high = getAverageInRange(2500, 7000) // E, S, F

    // Threshold and non-linear scaling for "snappier" mouth movement
    const process = (v, sens = 1.0) => Math.pow(Math.max(0, v - 0.05) * sens, 1.2)

    return {
      jawOpen:      process(mid, 1.8),
      mouthFunnel:  process(low, 1.4),
      mouthPucker:  process(low * 0.6, 1.2),
      mouthStretchLeft:  process(high, 1.5),
      mouthStretchRight: process(high, 1.5),
      mouthSmileLeft:    process(mid * 0.3, 1.0),
      mouthSmileRight:   process(mid * 0.3, 1.0),
    }
  }, [])

  /**
   * getLipsync() — wawa-lipsync analysis for the 3D avatar (Oculus visemes).
   * Returns the dominant viseme name + current volume, e.g.
   *   { viseme: 'viseme_aa', volume: 0.42 }
   * Call once per render frame. Separate from getVisemes() so the pin wall's
   * FFT-based weights stay exactly as they were.
   */
  const getLipsync = useCallback(() => {
    const lip = lipsyncRef.current
    if (!lip) return null
    try {
      lip.processAudio()
      return { 
        viseme: lip.viseme, 
        scores: lip.scores,
        volume: lip.features?.volume ?? 0 
      }
    } catch {
      return null
    }
  }, [])

  return { enqueue, stop, getLevel, getVisemes, getLipsync }
}
