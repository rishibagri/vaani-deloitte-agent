import { useRef, useCallback, useState } from 'react'

export function useMicrophone({ onChunk, sampleRate = 16000 }) {
  const contextRef = useRef(null)
  const workletRef = useRef(null)
  const streamRef = useRef(null)
  const [isRecording, setIsRecording] = useState(false)
  const [amplitudes, setAmplitudes] = useState([0, 0, 0, 0, 0])
  const analyserRef = useRef(null)
  const rafRef = useRef(null)

  const updateAmplitudes = useCallback(() => {
    if (!analyserRef.current) return
    const data = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(data)
    const bands = [
      avg(data, 0, 5), avg(data, 5, 12), avg(data, 12, 20),
      avg(data, 20, 30), avg(data, 30, 45)
    ]
    setAmplitudes(bands.map(v => v / 255))
    rafRef.current = requestAnimationFrame(updateAmplitudes)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate, channelCount: 1, echoCancellation: true }
      })

      contextRef.current = new AudioContext({ sampleRate })
      await contextRef.current.audioWorklet.addModule('/mic-processor.js')

      const source = contextRef.current.createMediaStreamSource(streamRef.current)

      analyserRef.current = contextRef.current.createAnalyser()
      analyserRef.current.fftSize = 128
      source.connect(analyserRef.current)

      workletRef.current = new AudioWorkletNode(contextRef.current, 'mic-processor')
      workletRef.current.port.onmessage = (e) => onChunk(e.data)
      source.connect(workletRef.current)

      setIsRecording(true)
      updateAmplitudes()
    } catch (e) {
      console.error('[AUDIO] Mic error:', e)
    }
  }, [sampleRate, onChunk, updateAmplitudes])

  const stopRecording = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (workletRef.current) workletRef.current.disconnect()
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (contextRef.current) contextRef.current.close()
    setIsRecording(false)
    setAmplitudes([0, 0, 0, 0, 0])
  }, [])

  return { isRecording, amplitudes, startRecording, stopRecording }
}

function avg(arr, start, end) {
  let sum = 0
  for (let i = start; i < end && i < arr.length; i++) sum += arr[i]
  return sum / (end - start)
}
