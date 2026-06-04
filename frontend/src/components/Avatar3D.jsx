import { Suspense, Component, useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useAnimations, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'

const DEFAULT_GLB = 'https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb'

/* The 15 Oculus visemes wawa-lipsync emits — all present on this Avaturn rig. */
const VISEMES = [
  'viseme_PP', 'viseme_FF', 'viseme_TH', 'viseme_DD', 'viseme_kk',
  'viseme_CH', 'viseme_SS', 'viseme_nn', 'viseme_RR',
  'viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U',
]

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
  const { scene, animations } = useGLTF(url)
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

  // Frame the FULL BODY: feet on the ground (y=0), camera pulled back to see all of it.
  useEffect(() => {
    scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false })
    const box = new THREE.Box3().setFromObject(scene)
    const size = new THREE.Vector3(); box.getSize(size)
    const center = new THREE.Vector3(); box.getCenter(center)

    // Stand the model on the ground plane and center it horizontally.
    scene.position.set(-center.x, -box.min.y, -center.z)

    // Pull back so the whole body reads at a comfortable scale with room around it
    // (not filling the frame). fov 30° needs ~1.87·h to just fit; 2.6·h leaves margin.
    const h = size.y
    camera.position.set(0, h * 0.55, h * 2.6)
    camera.lookAt(0, h * 0.50, 0)
    camera.updateProjectionMatrix()
  }, [scene, camera])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const speaking = appState === 'speaking'

    // Openness from audio amplitude (smoothed). Kept GENTLE + capped so the mouth
    // articulates like real speech instead of gaping open. Real jawOpen for talking
    // sits ~0.15–0.30; vowels peak a touch higher — never a yawn.
    const rawOpen = (speaking && getLevel)
      ? THREE.MathUtils.clamp(getLevel() * 2.3, 0, 0.95) : 0
    openRef.current += (rawOpen - openRef.current) * Math.min(1, delta * 14)
    const openness = openRef.current

    // wawa dominant viseme → lip SHAPE (rounding / spread) on top of the openness.
    const lip = (speaking && getLipsync) ? getLipsync() : null
    const dominant = lip ? lip.viseme : 'viseme_sil'

    // Blink scheduling.
    if (!prefersReducedMotion && t > blinkNextRef.current) {
      blinkStartRef.current = t
      blinkNextRef.current = t + 2.4 + Math.random() * 3.6
    }
    const bt = t - blinkStartRef.current
    const blink = (!prefersReducedMotion && bt < 0.18) ? Math.sin((bt / 0.18) * Math.PI) : 0

    for (const mesh of morphMeshes) {
      const dict = mesh.morphTargetDictionary
      const inf = mesh.morphTargetInfluences
      const set = (name, target, rate = 0.4) => {
        const idx = dict[name]
        if (idx !== undefined) inf[idx] += (target - inf[idx]) * rate
      }
      // Subtle jaw open with loudness; the dominant viseme shapes the lips. Weights
      // kept low so it reads as natural speech, not a gaping mouth. Don't stack a
      // separate mouthOpen on top (that's what made it gape).
      set('jawOpen', openness * 0.42)
      for (const name of VISEMES) {
        set(name, (speaking && name === dominant) ? openness * 0.68 : 0)
      }
      set('mouthOpen', 0, 0.3)
      set('mouthClose', 0, 0.3)
      set('eyeBlinkLeft', blink, 0.6)
      set('eyeBlinkRight', blink, 0.6)
    }
  })

  return <primitive ref={rootRef} object={scene} />
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
    <mesh ref={meshRef} position={[0, 0.9, 0]}>
      <icosahedronGeometry args={[0.4, 4]} />
      <meshStandardMaterial ref={matRef} color={stateColorHex(appState)} emissive={stateColorHex(appState)}
        emissiveIntensity={0.8} transparent opacity={0.85} roughness={0.3} metalness={0.2} wireframe />
    </mesh>
  )
}

function SceneContents({ appState, getLevel, getLipsync, url }) {
  const rim = stateColorHex(appState)
  return (
    <>
      {/* Atmospheric depth so the figure sits IN the space, not on a flat card. */}
      <fog attach="fog" args={['#080b12', 4.5, 11]} />
      {/* Realistic lighting for the PBR Avaturn materials. */}
      <hemisphereLight args={['#cfe0ff', '#1a2230', 0.7]} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <directionalLight position={[-4, 2.5, 2]} intensity={0.5} color="#cfe0ff" />
      {/* State-colored rim from behind for separation + brand presence. */}
      <directionalLight position={[0, 3, -5]} intensity={1.1} color={rim} />
      <pointLight position={[0, 0.2, 2.5]} intensity={0.3} color={rim} />

      <ErrorCatcher fallback={<FallbackOrb appState={appState} getLevel={getLevel} />}>
        <Suspense fallback={null}>
          <AvatarFigure appState={appState} getLevel={getLevel} getLipsync={getLipsync} url={url} />
          {/* Soft contact shadow grounds the figure in the environment. */}
          <ContactShadows position={[0, 0.001, 0]} opacity={0.55} scale={6} blur={2.6} far={4} color="#000000" />
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

/* Full-screen 3D avatar scene (fills the viewport like the pin wall). */
export function Avatar3D({ appState = 'idle', getLevel, getLipsync, avatarUrl }) {
  const url = avatarUrl || DEFAULT_GLB

  return (
    <div role="img" aria-label={`Vaani 3D avatar — ${appState}`}
      style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        shadows
        camera={{ fov: 30, near: 0.1, far: 100, position: [0, 1.0, 2.8] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
        }}
        style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'transparent', zIndex: 3 }}
      >
        <SceneContents appState={appState} getLevel={getLevel} getLipsync={getLipsync} url={url} />
      </Canvas>
    </div>
  )
}

try { useGLTF.preload(DEFAULT_GLB) } catch (_) { /* ignore */ }
