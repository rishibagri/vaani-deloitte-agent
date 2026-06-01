import { useEffect, useRef } from 'react'

const NODE_COUNT_DESKTOP = 80
const NODE_COUNT_MOBILE  = 44
const CONNECTION_DIST    = 140
const BASE_VEL           = 0.20

/* Idle speed = 1.0 → effective 0.20. Speaking = 2.25 → effective 0.45 */
const STATE_SPEED = {
  idle:      1.00,
  listening: 1.50,
  thinking:  0.55,
  speaking:  2.25,
}

function makeNode(w, h, i) {
  return {
    x:       Math.random() * w,
    y:       Math.random() * h,
    vx:      (Math.random() - 0.5) * BASE_VEL * 2,
    vy:      (Math.random() - 0.5) * BASE_VEL * 2,
    radius:  1.2 + Math.random() * 1.4,
    isGreen: i % 2 === 0,
  }
}

export function useParticles(canvasRef, appState) {
  const nodesRef = useRef([])
  const rafRef   = useRef(null)
  const stateRef = useRef(appState)
  const speedRef = useRef(1.0)

  useEffect(() => { stateRef.current = appState }, [appState])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      const count = window.innerWidth < 768 ? NODE_COUNT_MOBILE : NODE_COUNT_DESKTOP
      nodesRef.current = Array.from({ length: count }, (_, i) =>
        makeNode(canvas.width, canvas.height, i)
      )
    }

    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const { width: w, height: h } = canvas
      const target = STATE_SPEED[stateRef.current] ?? 1.0
      speedRef.current += (target - speedRef.current) * 0.04
      const mult = speedRef.current

      ctx.clearRect(0, 0, w, h)

      const nodes = nodesRef.current

      for (const n of nodes) {
        n.x += n.vx * mult
        n.y += n.vy * mult
        if (n.x < 0) n.x = w
        if (n.x > w) n.x = 0
        if (n.y < 0) n.y = h
        if (n.y > h) n.y = 0
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx   = nodes[i].x - nodes[j].x
          const dy   = nodes[i].y - nodes[j].y
          const dist = Math.hypot(dx, dy)
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.10
            ctx.beginPath()
            ctx.strokeStyle = nodes[i].isGreen
              ? `rgba(134,188,37,${alpha})`
              : `rgba(0,163,224,${alpha})`
            ctx.lineWidth = 0.75
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }

      for (const n of nodes) {
        ctx.beginPath()
        ctx.fillStyle = n.isGreen
          ? 'rgba(134,188,37,0.20)'
          : 'rgba(0,163,224,0.15)'
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [canvasRef])
}
