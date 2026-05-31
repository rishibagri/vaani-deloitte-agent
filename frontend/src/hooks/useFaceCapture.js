import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Requests webcam access and provides a captureFrame() function.
 * Degrades gracefully — status is "unavailable" if no camera exists.
 */
export function useFaceCapture() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | requesting | ready | unavailable

  useEffect(() => {
    let active = true
    setStatus('requesting')

    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        // attach to a hidden video element so the browser decodes frames
        const video = document.createElement('video')
        video.srcObject = stream
        video.autoplay = true
        video.playsInline = true
        video.muted = true
        videoRef.current = video
        video.onplaying = () => {
          // wait two frames so the captured image isn't a black canvas
          setTimeout(() => {
            if (active) setStatus('ready')
          }, 300)
        }
      })
      .catch(() => {
        if (active) setStatus('unavailable')
      })

    return () => {
      active = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const captureFrame = useCallback(() => {
    const video = videoRef.current
    if (!video || status !== 'ready') return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    // return base64 data-URL (JPEG, quality 0.85)
    return canvas.toDataURL('image/jpeg', 0.85)
  }, [status])

  return { status, captureFrame }
}
