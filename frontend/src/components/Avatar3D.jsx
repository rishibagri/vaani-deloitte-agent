import { Suspense, Component, useState, useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useAnimations, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { VISEMES } from '../lib/wawa'

const DEFAULT_GLB = 'https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb'

function stateColorHex(appState) {
  return {
    idle:      '#3D5A8A',
    listening: '#86BC25',
    thinking:  '#F5A623',
    speaking:  '#00E0FF',
  }[appState] || '#3D5A8A'
}

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ──────────────────────────────────────────────────────────────────────────
   Full-body avatar: loads the Avaturn GLB with its real materials, plays the
   embedded idle animation (natural pose — not the A-pose bind), frames the whole
   body, blinks, and lip-syncs from wawa-lipsync's Oculus visemes.
─────────────────────────────────────────────────────────────────────────── */
function AvatarFigure({ appState, getLevel, getLipsync, url }) {
  console.log('[Avatar3D] Rendering AvatarFigure:', url)
  const { scene, animations } = useGLTF(url)
  const [visible, setVisible] = useState(false)
  const rootRef = useRef()
  const { actions } = useAnimations(animations, rootRef)
  const { camera } = useThree()

  const openRef      = useRef(0)        // smoothed mouth openness
  const blinkNextRef = useRef(2)
  const blinkStartRef = useRef(-10)

  // Morph-bearing meshes (Head/Teeth/Tongue → visemes; Head/EyeAO/Eyelash → blink).
  const morphMeshes = useMemo(() => {
    const list = []
    scene.traverse((o) => {
      if (o.isMesh && o.morphTargetDictionary && o.morphTargetInfluences) list.push(o)
    })
    return list
  }, [scene])

  // Play the embedded idle animation → natural standing pose.
  useEffect(() => {
    const first = actions && Object.values(actions)[0]
    if (first) {
      first.reset().fadeIn(0.4).play()
      first.setLoop(THREE.LoopRepeat, Infinity)
    }
    return () => { if (first) first.fadeOut(0.2) }
  }, [actions])

  // Frame the FULL BODY: centered at origin.
  useEffect(() => {
    if (!scene) return
    console.log('[Avatar3D] Framing scene...')
    scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false })
    const box = new THREE.Box3().setFromObject(scene)
    const size = new THREE.Vector3(); box.getSize(size)
    const center = new THREE.Vector3(); box.getCenter(center)

    // Center the model's torso at the origin for reliable framing.
    scene.position.set(-center.x, -center.y, -center.z)

    const h = size.y
    camera.position.set(0, 0, h * 2.2) // Increased distance so shoes aren't cut off
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    
    // Set visible after framing is done to avoid T-pose/flicker
    const timer = setTimeout(() => {
      console.log('[Avatar3D] Setting visible = true')
      setVisible(true)
    }, 250)
    return () => clearTimeout(timer)
  }, [scene, camera])

  // Procedural Gesture Engine: Locates bones to drive natural secondary motion.
  const bones = useMemo(() => {
    const b = { neck: null, head: null, spine: null, initials: {} }
    scene.traverse((o) => {
      if (o.isBone) {
        const name = o.name.toLowerCase()
        if (name.includes('neck')) { b.neck = o; b.initials.neck = o.rotation.clone() }
        if (name.includes('head')) b.head = o
        if (name.includes('spine') && (name.includes('2') || name.includes('02'))) { b.spine = o; b.initials.spine = o.rotation.clone() }
      }
    })
    return b
  }, [scene])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const speaking = appState === 'speaking'
    const thinking = appState === 'thinking'
    const listening = appState === 'listening'

    // Openness from audio amplitude (smoothed). Accentuated for more expressive
    // movement — increased gain and non-linear response for "snappier" articulation.
    const rawOpen = (speaking && getLevel)
      ? Math.pow(THREE.MathUtils.clamp(getLevel() * 3.2, 0, 1.0), 1.1) : 0
    openRef.current += (rawOpen - openRef.current) * Math.min(1, delta * 22)
    const openness = openRef.current

    // wawa viseme blending → multiple lip SHAPES on top of the openness.
    const lip = (speaking && getLipsync) ? getLipsync() : null
    const scores = lip?.scores || {}

    // ── Gesture Logic ──
    if (bones.neck || bones.head) {
      // Subtle idle sway (always active)
      const swayX = Math.sin(t * 0.5) * 0.02
      const swayY = Math.cos(t * 0.4) * 0.02
      
      // Listening: Slight inquisitive tilt
      const tilt = listening ? 0.05 : 0
      
      // Speaking: Empathetic nodding / micro-gestures tied to audio level
      const nod = speaking ? Math.sin(t * 6) * (openRef.current * 0.04) : 0
      
      // Thinking: Slight "searching" movement
      const search = thinking ? Math.sin(t * 1.5) * 0.03 : 0

      if (bones.neck && bones.initials.neck) {
        // Apply offsets RELATIVE to the bone's initial rigged rotation
        const init = bones.initials.neck
        bones.neck.rotation.x = THREE.MathUtils.lerp(bones.neck.rotation.x, init.x + nod, 0.1)
        bones.neck.rotation.y = THREE.MathUtils.lerp(bones.neck.rotation.y, init.y + swayX + search, 0.1)
        bones.neck.rotation.z = THREE.MathUtils.lerp(bones.neck.rotation.z, init.z + swayY + tilt, 0.1)
      }
      if (bones.spine && bones.initials.spine) {
        const init = bones.initials.spine
        bones.spine.rotation.y = THREE.MathUtils.lerp(bones.spine.rotation.y, init.y + (swayX * 0.5), 0.05)
      }
    }

    // Blink scheduling — DISABLED while speaking to keep eyes still
    if (!prefersReducedMotion && !speaking && t > blinkNextRef.current) {
      blinkStartRef.current = t
      blinkNextRef.current = t + 2.4 + Math.random() * 3.6
    }
    const bt = t - blinkStartRef.current
    const blink = (!prefersReducedMotion && !speaking && bt < 0.18) ? Math.sin((bt / 0.18) * Math.PI) : 0

    for (const mesh of morphMeshes) {
      const dict = mesh.morphTargetDictionary
      const inf = mesh.morphTargetInfluences
      const set = (name, target, rate = 0.4) => {
        const idx = dict[name]
        if (idx !== undefined) inf[idx] += (target - inf[idx]) * rate
      }
      
      // Advanced blending: Use all scores above a threshold for natural transitions.
      set('jawOpen', openness * 0.7)
      
      // Map through all visemes in our library
      Object.values(VISEMES).forEach((visemeName) => {
        const score = scores[visemeName] || 0
        const weight = (score > 0.3) ? score * 0.95 : score * 0.4
        set(visemeName, speaking ? openness * weight : 0, 0.42)
      })
      
      set('mouthOpen', openness * 0.12, 0.3) 
      set('mouthClose', 0, 0.3)
      set('eyeBlinkLeft', blink, 0.6)
      set('eyeBlinkRight', blink, 0.6)
    }
  })

  return (
    <group visible={visible}>
      <primitive ref={rootRef} object={scene} />
    </group>
  )
}

/* Graceful fallback orb if the GLB fails to load. */
function FallbackOrb({ appState, getLevel }) {
  const meshRef = useRef()
  const matRef = useRef()
  const tgt = useRef(new THREE.Color(stateColorHex(appState)))
  const cur = useRef(new THREE.Color(stateColorHex(appState)))
  const scl = useRef(1)
  useEffect(() => { tgt.current.set(stateColorHex(appState)) }, [appState])
  useFrame((state, delta) => {
    cur.current.lerp(tgt.current, Math.min(1, delta * 4))
    if (matRef.current) { matRef.current.color.copy(cur.current); matRef.current.emissive.copy(cur.current) }
    let pulse = prefersReducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 1.5) * 0.02
    if (appState === 'speaking' && getLevel) pulse += THREE.MathUtils.clamp(getLevel() * 1.5, 0, 0.25)
    scl.current += (1 + pulse - scl.current) * Math.min(1, delta * 12)
    if (meshRef.current) {
      meshRef.current.scale.setScalar(scl.current)
      if (!prefersReducedMotion) meshRef.current.rotation.y = state.clock.elapsedTime * 0.2
    }
  })
  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <icosahedronGeometry args={[0.4, 4]} />
      <meshStandardMaterial ref={matRef} color={stateColorHex(appState)} emissive={stateColorHex(appState)}
        emissiveIntensity={0.8} transparent opacity={0.85} roughness={0.3} metalness={0.2} wireframe />
    </mesh>
  )
}

function AvatarLoadingPlaceholder() {
  const groupRef = useRef()
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.5
    }
  })
  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Core pulsating sphere */}
      <mesh>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshStandardMaterial color="#86BC25" emissive="#86BC25" emissiveIntensity={2} />
      </mesh>
      
      {/* Outer wireframe shell */}
      <mesh>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color="#86BC25" wireframe transparent opacity={0.2} />
      </mesh>

      {/* Orbital rings */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.45, 0.005, 16, 100]} />
        <meshStandardMaterial color="#86BC25" transparent opacity={0.4} />
      </mesh>
      <mesh rotation={[Math.PI / 2.5, Math.PI / 4, 0]}>
        <torusGeometry args={[0.5, 0.005, 16, 100]} />
        <meshStandardMaterial color="#3D5A8A" transparent opacity={0.3} />
      </mesh>
      
      {/* Vertical scan ring */}
      <mesh position={[0, Math.sin(performance.now() * 0.002) * 0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.4, 0.01, 4, 64]} />
        <meshStandardMaterial color="#86BC25" emissive="#86BC25" emissiveIntensity={1} transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

export function SceneContents({ appState, getLevel, getLipsync, url }) {
  const rim = stateColorHex(appState)
  return (
    <>
      {/* Pure Void aesthetic — no fog or ground shadows to clip models */}
      <hemisphereLight args={['#ffffff', '#000000', 0.6]} />
      <directionalLight position={[3, 5, 4]} intensity={1.5} />
      <directionalLight position={[-4, 2.5, 2]} intensity={0.5} color="#cfe0ff" />
      {/* State-colored rim for brand presence. */}
      <directionalLight position={[0, 3, -5]} intensity={1.8} color={rim} />
      <pointLight position={[0, 0.2, 2.5]} intensity={0.6} color={rim} />

      <ErrorCatcher fallback={<FallbackOrb appState={appState} getLevel={getLevel} />}>
        <Suspense fallback={<AvatarLoadingPlaceholder />}>
          <AvatarFigure appState={appState} getLevel={getLevel} getLipsync={getLipsync} url={url} />
        </Suspense>
      </ErrorCatcher>
    </>
  )
}

class ErrorCatcher extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err) { console.warn('[Avatar3D] GLB failed to load, using fallback orb:', err?.message || err) }
  render() { return this.state.hasError ? this.props.fallback : this.props.children }
}

export function Avatar3D({ appState = 'idle', getLevel, getLipsync, avatarUrl }) {
  const url = avatarUrl && avatarUrl.trim() !== '' ? avatarUrl : DEFAULT_GLB

  return (
    <div style={{ position: 'relative', width: 720, height: 800, flexShrink: 0 }}>
      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.1, far: 100, position: [0, 0, 3] }}
        onCreated={() => console.log('[Avatar3D] Canvas Created')}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'transparent', zIndex: 3 }}
      >
        <SceneContents appState={appState} getLevel={getLevel} getLipsync={getLipsync} url={url} />
      </Canvas>
    </div>
  )
}

try { useGLTF.preload(DEFAULT_GLB) } catch (_) { /* ignore */ }
