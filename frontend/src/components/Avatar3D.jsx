import { Suspense, Component, useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

/* Matches the AvatarDisplay footprint so the HUD rings line up. */
const W = 460
const H = 480

const DEFAULT_GLB = 'https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb'

/* Per-state glow color (matches design tokens). */
function stateColorHex(appState) {
  return {
    idle:      '#3D5A8A', // dim navy/blue
    listening: '#86BC25', // brand green
    thinking:  '#F5A623', // amber
    speaking:  '#00E0FF', // bright cyan
  }[appState] || '#3D5A8A'
}

function glowRgba(appState) {
  return {
    idle:      'rgba(61,90,138,0.22)',
    listening: 'rgba(134,188,37,0.30)',
    thinking:  'rgba(245,166,35,0.26)',
    speaking:  'rgba(0,200,255,0.34)',
  }[appState] || 'rgba(61,90,138,0.22)'
}

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ──────────────────────────────────────────────────────────────────────────
   Holographic head — loads the GLB, applies a translucent cyan/fresnel shader,
   bobs gently, reacts to state color, and lip-syncs from live audio level.
─────────────────────────────────────────────────────────────────────────── */
function HoloHead({ appState, getLevel, getVisemes, url, glowRef }) {
  const { scene } = useGLTF(url)
  const groupRef = useRef()
  const { camera } = useThree()

  // Smoothed values (refs to avoid re-renders each frame).
  const targetColor = useRef(new THREE.Color(stateColorHex(appState)))
  const currentColor = useRef(new THREE.Color(stateColorHex(appState)))
  const mouthRef = useRef(0)
  const levelRef = useRef(0)       // smoothed voice energy
  const flickerRef = useRef(0)     // one-shot materialize flicker (1 → 0)
  const prevState = useRef(appState)

  useEffect(() => {
    targetColor.current.set(stateColorHex(appState))
    // Fire a one-shot "materialize" flicker when Vaani starts speaking.
    if (appState === 'speaking' && prevState.current !== 'speaking' && !prefersReducedMotion) {
      flickerRef.current = 1
    }
    prevState.current = appState
  }, [appState])

  // Collect morph-target meshes (RPM head/teeth) for lip-sync.
  const morphMeshes = useMemo(() => {
    const list = []
    scene.traverse((o) => {
      if (o.isMesh && o.morphTargetDictionary && o.morphTargetInfluences) {
        list.push(o)
      }
    })
    return list
  }, [scene])

  // Apply holographic material to every mesh and frame the head.
  const holoMaterial = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(stateColorHex(appState)),
      emissive: new THREE.Color(stateColorHex(appState)),
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.85,
      roughness: 0.25,
      metalness: 0.1,
      transmission: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    // Fresnel rim glow via onBeforeCompile.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRimColor = { value: new THREE.Color(stateColorHex(appState)) }
      shader.uniforms.uLevel = { value: 0 }   // live voice energy 0..1
      shader.uniforms.uTime  = { value: 0 }
      mat.userData.shader = shader
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform vec3 uRimColor;
           uniform float uLevel;
           uniform float uTime;
           varying vec3 vWorldNormalR;
           varying vec3 vWorldPosR;`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           vec3 viewDirR = normalize(cameraPosition - vWorldPosR);
           float fresnel = pow(1.0 - clamp(dot(viewDirR, normalize(vWorldNormalR)), 0.0, 1.0), 2.5);
           // Rim glow surges with the voice — the head "channels energy" as it speaks.
           float rimBoost = 2.2 + uLevel * 4.0;
           totalEmissiveRadiance += uRimColor * fresnel * rimBoost;
           // Holographic scanlines that drift upward and intensify with the voice.
           float scan = (0.90 - uLevel * 0.06) + (0.10 + uLevel * 0.10) * sin(vWorldPosR.y * 140.0 - uTime * 2.5);
           totalEmissiveRadiance *= scan;`
        )
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vWorldNormalR;
           varying vec3 vWorldPosR;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
           vWorldNormalR = mat3(modelMatrix) * normal;
           vWorldPosR = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        )
    }
    return mat
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scene.traverse((o) => {
      if (o.isMesh) {
        o.material = holoMaterial
        o.frustumCulled = false
      }
    })

    // Frame the head: compute the head bone / upper bounding box and aim the
    // camera at it so we get a floating bust.
    const box = new THREE.Box3().setFromObject(scene)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)

    // RPM half-body: the head sits near the top of the bounding box.
    const headY = box.max.y - size.y * 0.12
    // Re-center the model so the head is at origin height.
    scene.position.y = -headY
    scene.position.x = -center.x

    camera.position.set(0, 0, 1.05)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [scene, holoMaterial, camera])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime

    // Smooth idle bob / sway.
    if (groupRef.current) {
      if (prefersReducedMotion) {
        groupRef.current.position.y = 0
        groupRef.current.rotation.y = 0
      } else {
        groupRef.current.position.y = Math.sin(t * 0.8) * 0.012
        groupRef.current.rotation.y = Math.sin(t * 0.35) * 0.12
        groupRef.current.rotation.x = Math.sin(t * 0.5) * 0.03
      }
    }

    // Smooth color transition.
    currentColor.current.lerp(targetColor.current, Math.min(1, delta * 4))
    holoMaterial.color.copy(currentColor.current)
    holoMaterial.emissive.copy(currentColor.current)

    // Live voice energy (only meaningful while speaking), smoothed.
    const rawLevel = (appState === 'speaking' && getLevel)
      ? THREE.MathUtils.clamp(getLevel() * 3.0, 0, 1) : 0
    levelRef.current += (rawLevel - levelRef.current) * Math.min(1, delta * 10)
    const level = levelRef.current

    // Decay the one-shot materialize flicker (~0.45s) into a rapid flutter.
    flickerRef.current = Math.max(0, flickerRef.current - delta * 2.2)
    const flick = flickerRef.current > 0
      ? 1 - flickerRef.current * (0.45 + 0.45 * Math.sin(t * 55))
      : 1

    // Reduced motion: keep state color + gentle lip-sync, but suppress the
    // voice-driven surge, scanline drift, and flicker (continuous WebGL motion
    // the global CSS reduced-motion rule can't reach).
    const effLevel = prefersReducedMotion ? 0 : level

    const shader = holoMaterial.userData.shader
    if (shader) {
      if (shader.uniforms.uRimColor) shader.uniforms.uRimColor.value.copy(currentColor.current)
      if (shader.uniforms.uLevel) shader.uniforms.uLevel.value = effLevel
      if (shader.uniforms.uTime) shader.uniforms.uTime.value = prefersReducedMotion ? 0 : t
    }

    // Emissive: calm at idle, surges with the voice while speaking; flicker on entry.
    const baseEmissive = appState === 'speaking' ? 0.85 + effLevel * 1.3
      : appState === 'idle' ? 0.4 : 0.6
    holoMaterial.emissiveIntensity +=
      (baseEmissive - holoMaterial.emissiveIntensity) * Math.min(1, delta * 6)
    holoMaterial.emissiveIntensity *= flick
    // Holographic flutter also dips opacity slightly during materialize.
    holoMaterial.opacity = 0.85 * (0.6 + 0.4 * flick)

    // Audio-reactive bloom halo behind the head (driven from the frame loop).
    if (glowRef && glowRef.current) {
      const halo = 0.6 + effLevel * 0.9 + (1 - flick) * 0.6
      glowRef.current.style.opacity = String(Math.min(1.4, halo))
      if (!prefersReducedMotion) {
        glowRef.current.style.transform = `scale(${1 + effLevel * 0.18})`
      }
    }

    // Lip-sync: drive mouth from live audio visemes (Wawa-style) if available, else fallback to loudness.
    const clientWeights = getVisemes ? getVisemes() : null
    
    for (const mesh of morphMeshes) {
      const dict = mesh.morphTargetDictionary
      const inf = mesh.morphTargetInfluences
      const set = (name, v) => {
        const idx = dict[name]
        if (idx !== undefined) inf[idx] = THREE.MathUtils.lerp(inf[idx], v, 0.25)
      }

      if (appState === 'speaking' && clientWeights) {
        for (const [key, val] of Object.entries(clientWeights)) {
          set(key, val)
        }
      } else if (appState === 'speaking' && getLevel) {
        const open = THREE.MathUtils.clamp(level, 0, 1)
        set('mouthOpen', open)
        set('jawOpen', open * 0.9)
        const wobble = (Math.sin(t * 9) + 1) * 0.5
        set('viseme_aa', open * wobble)
        set('viseme_O', open * (1 - wobble) * 0.7)
      } else {
        // Close mouth
        for (let k = 0; k < inf.length; k++) inf[k] *= 0.8
      }
    }
  })

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  )
}

/* Graceful fallback: a glowing orb that pulses & shifts with state color. */
function FallbackOrb({ appState, getLevel }) {
  const meshRef = useRef()
  const matRef = useRef()
  const targetColor = useRef(new THREE.Color(stateColorHex(appState)))
  const currentColor = useRef(new THREE.Color(stateColorHex(appState)))
  const scaleRef = useRef(1)

  useEffect(() => {
    targetColor.current.set(stateColorHex(appState))
  }, [appState])

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

function SceneContents({ appState, getLevel, getVisemes, url, glowRef }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 3, 4]} intensity={0.8} />
      <pointLight position={[-2, -1, 2]} intensity={0.5} color={stateColorHex(appState)} />
      <ErrorCatcher fallback={<FallbackOrb appState={appState} getLevel={getLevel} />}>
        <Suspense fallback={null}>
          <HoloHead appState={appState} getLevel={getLevel} getVisemes={getVisemes} url={url} glowRef={glowRef} />
        </Suspense>
      </ErrorCatcher>
    </>
  )
}

/* Minimal React error boundary (class) — catches GLB load/parse failures. */
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
    console.warn('[Avatar3D] GLB failed to load, using fallback orb:', err?.message || err)
  }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

export function Avatar3D({ appState = 'idle', getLevel, getVisemes, avatarUrl }) {
  const url = avatarUrl || DEFAULT_GLB
  const [glow, setGlow] = useState(glowRgba(appState))
  const glowRef = useRef(null)

  useEffect(() => { setGlow(glowRgba(appState)) }, [appState])

  return (
    <div
      role="img"
      aria-label={`Vaani 3D avatar — ${appState}`}
      style={{
        position: 'relative',
        width: W,
        height: H,
        flexShrink: 0,
        animation: 'avatar-reveal 700ms var(--ease-out-expo) 200ms both',
      }}
    >
      {/* Soft radial CSS glow behind the head (bloom-lite). Color follows state;
          opacity + scale are driven by the live voice energy from the frame loop. */}
      <div
        ref={glowRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: -40,
          background: `radial-gradient(ellipse 60% 65% at 50% 42%, ${glow} 0%, transparent 70%)`,
          transition: 'background 800ms var(--ease-standard)',
          pointerEvents: 'none',
          willChange: 'opacity, transform',
          zIndex: 0,
        }}
      />

      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.1, far: 100, position: [0, 0, 1.05] }}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
          background: 'transparent',
        }}
      >
        <SceneContents appState={appState} getLevel={getLevel} getVisemes={getVisemes} url={url} glowRef={glowRef} />
      </Canvas>
    </div>
  )
}

// Preload the default GLB so the first render is fast.
try { useGLTF.preload(DEFAULT_GLB) } catch (_) { /* ignore */ }
