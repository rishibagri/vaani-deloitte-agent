import { Suspense, Component, useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/* Matches the AvatarDisplay / Avatar3D footprint so the HUD rings line up. */
const W = 460
const H = 480

/* Pin grid — single InstancedMesh, one draw call. */
const COLS = 80
const ROWS = 96
const COUNT = COLS * ROWS

/* World-space extent of the pin field (XY plane, centered at origin). */
const FIELD_W = 1.2
const FIELD_H = 1.44
const PIN_W = (FIELD_W / COLS) * 0.82  // small gap between pins
const PIN_D = 0.42                      // max extrusion travel in Z

/* Per-state color (mirrors --pin-* tokens in tokens.css; Three.js needs JS values). */
function stateColorHex(appState) {
  return {
    idle:      '#3D5A8A', // --pin-idle
    listening: '#86BC25', // --pin-listening
    thinking:  '#F5A623', // --pin-thinking
    speaking:  '#00E0FF', // --pin-speaking
  }[appState] || '#3D5A8A'
}

const RECESS_GLOW_HEX = '#FF6A2A' // --pin-recess-glow

function glowRgba(appState) {
  return {
    idle:      'rgba(61,90,138,0.22)',
    listening: 'rgba(134,188,37,0.30)',
    thinking:  'rgba(245,166,35,0.26)',
    speaking:  'rgba(0,224,255,0.34)',
  }[appState] || 'rgba(61,90,138,0.22)'
}

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ──────────────────────────────────────────────────────────────────────────
   Procedural fallback relief — a smooth, vaguely face-like height field built
   from gaussian bumps (cheeks/forehead), two eye recesses, a nose ridge, and a
   mouth line. Returns height in 0..1. Used when no image is provided / load
   fails so the screen never crashes and always reads as a face.
   u,v are normalized grid coords in 0..1 (origin top-left, like an image).
─────────────────────────────────────────────────────────────────────────── */
function proceduralRelief(u, v) {
  // Center the coords; x right, y up.
  const x = (u - 0.5) * 2.0       // -1..1
  const y = (0.5 - v) * 2.0       // -1..1 (up positive)

  const gauss = (dx, dy, sx, sy) => Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy))

  // Overall face mass — a broad oval bump that falls off at the edges.
  let h = gauss(x, y - 0.05, 0.62, 0.78) * 0.85

  // Brow / forehead fullness.
  h += gauss(x, y - 0.42, 0.5, 0.28) * 0.18

  // Nose ridge — a vertical raised bar down the center.
  h += gauss(x, y + 0.02, 0.085, 0.34) * 0.42
  // Nose tip.
  h += gauss(x, y + 0.26, 0.11, 0.13) * 0.22

  // Cheeks.
  h += gauss(x - 0.42, y + 0.12, 0.26, 0.30) * 0.16
  h += gauss(x + 0.42, y + 0.12, 0.26, 0.30) * 0.16

  // Eye recesses — subtract.
  h -= gauss(x - 0.32, y - 0.18, 0.20, 0.14) * 0.40
  h -= gauss(x + 0.32, y - 0.18, 0.20, 0.14) * 0.40

  // Mouth line recess.
  h -= gauss(x, y + 0.50, 0.34, 0.07) * 0.30

  return THREE.MathUtils.clamp(h, 0, 1)
}

/* Mouth region weight (0..1) for a grid cell — lower-center of the face.
   Used to add voice-driven extrusion. u,v normalized like above. */
function mouthWeight(u, v) {
  const x = (u - 0.5) * 2.0
  const y = (0.5 - v) * 2.0
  const dx = x
  const dy = y + 0.50 // mouth sits below center
  const sx = 0.30, sy = 0.12
  return Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy))
}

/* Load an image and sample per-cell luminance into a Float32Array (COUNT) in
   0..1. Resolves with the array, or rejects so the caller can use the
   procedural fallback. */
function loadImageHeights(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const cv = document.createElement('canvas')
        cv.width = COLS
        cv.height = ROWS
        const ctx = cv.getContext('2d', { willReadFrequently: true })
        if (!ctx) return reject(new Error('no 2d ctx'))
        // Cover-fit the portrait into the grid aspect.
        const targetAR = COLS / ROWS
        const srcAR = img.width / img.height
        let sx = 0, sy = 0, sw = img.width, sh = img.height
        if (srcAR > targetAR) { sw = img.height * targetAR; sx = (img.width - sw) / 2 }
        else { sh = img.width / targetAR; sy = (img.height - sh) / 2 }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, COLS, ROWS)
        const data = ctx.getImageData(0, 0, COLS, ROWS).data
        const out = new Float32Array(COUNT)
        for (let i = 0; i < COUNT; i++) {
          const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
          // Rec. 601 luma → height. Bright = raised (front-lit portrait relief).
          out[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        }
        resolve(out)
      } catch (e) { reject(e) }
    }
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
}

/* ──────────────────────────────────────────────────────────────────────────
   The pin field. Precomputes per-pin base coords / heights / mouth weights
   ONCE; the frame loop only writes instance matrices + colors (no allocation).
─────────────────────────────────────────────────────────────────────────── */
function PinField({ appState, getLevel, imageUrl, glowRef }) {
  const meshRef = useRef()

  // Reusable scratch objects (allocated once).
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tmpColor = useMemo(() => new THREE.Color(), [])
  const recessColor = useMemo(() => new THREE.Color(RECESS_GLOW_HEX), [])

  // Smoothed state values (refs → no per-frame re-render).
  const targetColor = useRef(new THREE.Color(stateColorHex(appState)))
  const currentColor = useRef(new THREE.Color(stateColorHex(appState)))
  const levelRef = useRef(0)

  // Per-pin static data, computed once.
  const baseHeights = useMemo(() => new Float32Array(COUNT), [])
  const mouthW      = useMemo(() => new Float32Array(COUNT), [])
  const posX        = useMemo(() => new Float32Array(COUNT), [])
  const posY        = useMemo(() => new Float32Array(COUNT), [])

  // Geometry: a slim rounded box pin. Pivot at its near face so scaling Z
  // extrudes toward the camera from the board plane.
  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(PIN_W, PIN_W, 1, 1, 1, 1)
    g.translate(0, 0, 0.5) // base sits at z=0, extends toward +z by scaleZ
    return g
  }, [])

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: 0xbfc6cf,
    metalness: 0.6,
    roughness: 0.45,
    emissive: new THREE.Color(stateColorHex(appState)),
    emissiveIntensity: 0.0, // per-instance color carries the emissive tint
    vertexColors: true,
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute grid coords + procedural base heights once.
  useEffect(() => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c
        const u = (c + 0.5) / COLS
        const v = (r + 0.5) / ROWS
        posX[i] = (u - 0.5) * FIELD_W
        posY[i] = (0.5 - v) * FIELD_H
        baseHeights[i] = proceduralRelief(u, v)
        mouthW[i] = mouthWeight(u, v)
      }
    }
  }, [baseHeights, mouthW, posX, posY])

  // If an image URL is given, try to load it and replace base heights.
  useEffect(() => {
    if (!imageUrl) return
    let cancelled = false
    loadImageHeights(imageUrl)
      .then((heights) => {
        if (cancelled) return
        for (let i = 0; i < COUNT; i++) baseHeights[i] = heights[i]
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[PinScreenAvatar] image relief failed, using procedural face:', err?.message || err)
      })
    return () => { cancelled = true }
  }, [imageUrl, baseHeights])

  useEffect(() => {
    targetColor.current.set(stateColorHex(appState))
  }, [appState])

  // Set up per-instance color buffer once the mesh exists.
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    if (!mesh.instanceColor) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3)
    }
  }, [])

  useFrame((state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = state.clock.elapsedTime
    const k = Math.min(1, delta * 4)

    // Smooth color transition between states.
    currentColor.current.lerp(targetColor.current, k)

    // Live voice energy (only while speaking), smoothed.
    const rawLevel = (appState === 'speaking' && getLevel)
      ? THREE.MathUtils.clamp(getLevel() * 3.0, 0, 1) : 0
    levelRef.current += (rawLevel - levelRef.current) * Math.min(1, delta * 10)
    const level = prefersReducedMotion ? 0 : levelRef.current

    // Ambient traveling shimmer — the one ambient loop, kept subtle.
    const shimmerOn = prefersReducedMotion ? 0 : 1
    const cR = currentColor.current

    for (let i = 0; i < COUNT; i++) {
      const x = posX[i]
      const y = posY[i]
      let h = baseHeights[i]

      // Subtle traveling sine wave across the field (micro z-displacement).
      if (shimmerOn) {
        h += Math.sin(x * 6.0 + y * 4.0 - t * 1.6) * 0.025
      }

      // Mouth region pushes out with the voice.
      h += mouthW[i] * level * 0.9

      h = h < 0 ? 0 : h > 1.2 ? 1.2 : h

      const depth = 0.02 + h * PIN_D // never fully flat, so tops catch light
      dummy.position.set(x, y, 0)
      dummy.scale.set(1, 1, depth)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      // Color: raised pins glow with state color; deep recesses get a faint
      // red/amber ember (like the reference). Brightness tracks height.
      const lit = 0.28 + h * 0.95
      tmpColor.copy(cR).multiplyScalar(lit)
      // Recess ember — strongest where height is lowest.
      const ember = Math.max(0, 0.32 - h) * 0.9
      tmpColor.r += recessColor.r * ember
      tmpColor.g += recessColor.g * ember
      tmpColor.b += recessColor.b * ember
      mesh.setColorAt(i, tmpColor)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    // Audio-reactive bloom halo behind the field (driven from the frame loop).
    if (glowRef && glowRef.current) {
      const halo = 0.6 + level * 0.9
      glowRef.current.style.opacity = String(Math.min(1.4, halo))
      if (!prefersReducedMotion) {
        glowRef.current.style.transform = `scale(${1 + level * 0.14})`
      }
    }
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, COUNT]}
      frustumCulled={false}
    />
  )
}

/* Graceful fallback: a glowing wireframe orb that shifts with state color.
   Mirrors the Avatar3D fallback so a WebGL/instancing failure is never blank. */
function FallbackOrb({ appState, getLevel }) {
  const meshRef = useRef()
  const matRef = useRef()
  const targetColor = useRef(new THREE.Color(stateColorHex(appState)))
  const currentColor = useRef(new THREE.Color(stateColorHex(appState)))
  const scaleRef = useRef(1)

  useEffect(() => { targetColor.current.set(stateColorHex(appState)) }, [appState])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    currentColor.current.lerp(targetColor.current, Math.min(1, delta * 4))
    if (matRef.current) {
      matRef.current.color.copy(currentColor.current)
      matRef.current.emissive.copy(currentColor.current)
    }
    let pulse = prefersReducedMotion ? 0 : Math.sin(t * 1.5) * 0.02
    if (appState === 'speaking' && getLevel) {
      pulse += THREE.MathUtils.clamp(getLevel() * 1.5, 0, 0.25)
    }
    const target = 1 + pulse
    scaleRef.current += (target - scaleRef.current) * Math.min(1, delta * 12)
    if (meshRef.current) {
      meshRef.current.scale.setScalar(scaleRef.current)
      if (!prefersReducedMotion) meshRef.current.rotation.y = t * 0.2
    }
  })

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[0.42, 4]} />
      <meshStandardMaterial
        ref={matRef}
        color={stateColorHex(appState)}
        emissive={stateColorHex(appState)}
        emissiveIntensity={0.8}
        transparent
        opacity={0.85}
        roughness={0.3}
        metalness={0.2}
        wireframe
      />
    </mesh>
  )
}

function SceneContents({ appState, getLevel, imageUrl, glowRef }) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[1.5, 2.5, 4]} intensity={1.1} />
      <directionalLight position={[-2, -1, 2]} intensity={0.35} color={stateColorHex(appState)} />
      <ErrorCatcher fallback={<FallbackOrb appState={appState} getLevel={getLevel} />}>
        <Suspense fallback={null}>
          <PinField appState={appState} getLevel={getLevel} imageUrl={imageUrl} glowRef={glowRef} />
        </Suspense>
      </ErrorCatcher>
    </>
  )
}

/* Minimal React error boundary (class) — catches instancing/WebGL failures. */
class ErrorCatcher extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(err) {
    // eslint-disable-next-line no-console
    console.warn('[PinScreenAvatar] pin field failed, using fallback orb:', err?.message || err)
  }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

export function PinScreenAvatar({ appState = 'idle', getLevel, imageUrl = null }) {
  const [glow, setGlow] = useState(glowRgba(appState))
  const glowRef = useRef(null)

  useEffect(() => { setGlow(glowRgba(appState)) }, [appState])

  return (
    <div
      role="img"
      aria-label={`Vaani pin-screen avatar — ${appState}`}
      style={{
        position: 'relative',
        width: W,
        height: H,
        flexShrink: 0,
        animation: 'avatar-reveal 700ms var(--ease-out-expo) 200ms both',
      }}
    >
      {/* Soft radial CSS glow behind the field (bloom-lite). Color follows
          state; opacity + scale are driven by the live voice from the loop. */}
      <div
        ref={glowRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: -40,
          background: `radial-gradient(ellipse 60% 65% at 50% 50%, ${glow} 0%, transparent 70%)`,
          transition: 'background 800ms var(--ease-standard)',
          pointerEvents: 'none',
          willChange: 'opacity, transform',
          zIndex: 0,
        }}
      />

      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        camera={{ fov: 32, near: 0.1, far: 100, position: [0, 0, 2.0] }}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
          background: 'transparent',
        }}
      >
        <SceneContents appState={appState} getLevel={getLevel} imageUrl={imageUrl} glowRef={glowRef} />
      </Canvas>
    </div>
  )
}
