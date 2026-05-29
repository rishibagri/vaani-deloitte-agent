import { useEffect, useRef } from 'react'

const NODE_COUNT_DESKTOP = 90
const NODE_COUNT_MOBILE = 50
const CONNECTION_DISTANCE = 140

function makeNode(w, h, index) {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    radius: 1.5 + Math.random() * 1.5,
    // half the nodes are green-tinted, half blue-tinted
    isGreen: index % 2 === 0
  }
}

export function useParticles(canvasRef, appState) {
  const nodesRef = useRef([])
  const rafRef = useRef(null)
  const stateRef = useRef(appState)

  useEffect(() => {
    stateRef.current = appState
  }, [appState])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      const count = window.innerWidth < 768 ? NODE_COUNT_MOBILE : NODE_COUNT_DESKTOP
      nodesRef.current = Array.from({ length: count }, (_, i) =>
        makeNode(canvas.width, canvas.height, i)
      )
    }

    resize()
    window.addEventListener('resize', resize)

    const speedForState = (state) => {
      if (state === 'listening') return 0.35
      if (state === 'thinking') return 0.15
      if (state === 'speaking') return 0.45
      return 0.20
    }

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      const state = stateRef.current
      const speed = speedForState(state)
      const opacityMult = state === 'thinking' ? 0.7 : state === 'idle' ? 1.0 : 1.4

      ctx.clearRect(0, 0, w, h)

      for (const node of nodesRef.current) {
        node.x += node.vx * speed / 0.20
        node.y += node.vy * speed / 0.20
        if (node.x < 0) node.x = w
        if (node.x > w) node.x = 0
        if (node.y < 0) node.y = h
        if (node.y > h) node.y = 0
      }

      const nodes = nodesRef.current
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECTION_DISTANCE) {
            const alpha = (1 - dist / CONNECTION_DISTANCE) * 0.12 * opacityMult
            const color = nodes[i].isGreen
              ? `rgba(134,188,37,${alpha})`
              : `rgba(0,163,224,${alpha})`
            ctx.beginPath()
            ctx.strokeStyle = color
            ctx.lineWidth = 0.8
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }

      for (const node of nodes) {
        const alpha = 0.22 * opacityMult
        ctx.beginPath()
        ctx.fillStyle = node.isGreen
          ? `rgba(134,188,37,${alpha})`
          : `rgba(0,163,224,${alpha})`
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
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
