import { Suspense, Component, useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

/* ── Config ──────────────────────────────────────────────────────────────── */

const BOXED = {
  cols: 80, rows: 96,
  fieldW: 1.2, fieldH: 1.44,
  pinD: 0.42,           // max extrusion travel
  fill: false,
  W: 460, H: 480,
  camera: { fov: 32, near: 0.1, far: 100, position: [0, 0, 2.0] },
}

/* In fill mode the pin field is wide and the face fills almost the whole view.
   PIN_D is much larger so the relief is dramatically physical. */
const FILL = {
  cols: 190, rows: 105,  // denser grid → ~9px pins vs ~17px before
  fieldW: 4.6, fieldH: 2.3,
  pinD: 0.82,
  fill: true,
  camera: { fov: 26, near: 0.1, far: 100, position: [0, 0, 3.4] },
}

/* Face occupies most of the field in fill mode. */
const FACE_W_FILL = 4.0  // ~87 % of fieldW=4.6
const FACE_H_FILL = 2.1  // ~91 % of fieldH=2.3

/* ── Color helpers ───────────────────────────────────────────────────────── */

/* State-tint for BOXED mode only (kept from original). */
function stateColorHex(appState) {
  return {
    idle:      '#2A4020',
    listening: '#86BC25',
    thinking:  '#C8A020',
    speaking:  '#86BC25',
  }[appState] || '#2A4020'
}

function glowRgba(appState) {
  return {
    idle:      'rgba(42,64,32,0.25)',
    listening: 'rgba(134,188,37,0.35)',
    thinking:  'rgba(200,160,32,0.28)',
    speaking:  'rgba(134,188,37,0.40)',
  }[appState] || 'rgba(42,64,32,0.25)'
}

/* Physical pin-art palette (fill mode):
   raised tops → Deloitte green, recessed gaps → near-black green recess. */
const FILL_PIN_TOP    = new THREE.Color(0.53, 0.74, 0.15)  // #86BC25 Deloitte green
const FILL_RECESS     = new THREE.Color(0.04, 0.08, 0.01)  // near-black green recess
const RECESS_GEL_HEX  = '#1A2A08'  // --pin-recess-glow, used in boxed mode

/* ── Procedural face relief ──────────────────────────────────────────────── */

/* Returns height 0..1. u,v ∈ [0,1] with (0,0) = top-left. */
function proceduralRelief(u, v) {
  const x = (u - 0.5) * 2.0    // −1..1, right+
  const y = (0.5 - v) * 2.0    // −1..1, up+
  const g = (dx, dy, sx, sy) => Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy))

  let h = g(x, y - 0.05, 0.62, 0.78) * 0.85  // head oval
  h += g(x, y - 0.42, 0.50, 0.28) * 0.18       // forehead
  h += g(x, y + 0.02, 0.09, 0.34) * 0.44       // nose ridge
  h += g(x, y + 0.26, 0.12, 0.13) * 0.24       // nose tip
  h += g(x - 0.42, y + 0.12, 0.26, 0.30) * 0.16 // cheeks
  h += g(x + 0.42, y + 0.12, 0.26, 0.30) * 0.16
  h -= g(x - 0.32, y - 0.18, 0.20, 0.14) * 0.42  // eye recesses
  h -= g(x + 0.32, y - 0.18, 0.20, 0.14) * 0.42
  // Upper lip ridge — raised above the mouth opening
  h += g(x, y + 0.42, 0.28, 0.06) * 0.18
  // Lower lip — raised below the opening
  h += g(x, y + 0.60, 0.30, 0.08) * 0.20
  // Mouth opening recess — between the lips
  h -= g(x, y + 0.51, 0.22, 0.055) * 0.38
  // Mouth corners
  h -= g(x - 0.28, y + 0.51, 0.08, 0.06) * 0.15
  h -= g(x + 0.28, y + 0.51, 0.08, 0.06) * 0.15
  // Chin definition
  h += g(x, y + 0.78, 0.35, 0.14) * 0.12
  return THREE.MathUtils.clamp(h, 0, 1)
}

function mouthWeight(u, v) {
  const x = (u - 0.5) * 2.0
  const y = (0.5 - v) * 2.0
  // Wider gaussian covering both lips + jaw area
  const dx = x, dy = y + 0.51
  return Math.exp(-(dx * dx) / (2 * 0.18) - (dy * dy) / (2 * 0.055))
}

function smoothstep(a, b, t) {
  const x = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1)
  return x * x * (3 - 2 * x)
}

/* ── Organic wave (idle mode) ────────────────────────────────────────────── */

/* Layered-sine noise: ocean-surface undulation.
   Smooth 300–400 ms cadence, physics-based feel (multiple overlapping waves). */
function organicWave(x, y, t) {
  const a = Math.sin(x * 2.6 + t * 0.75) * 0.32   // was 0.28
  const b = Math.sin(y * 3.1 - t * 0.85) * 0.26   // was 0.22
  const c = Math.sin((x * 0.9 + y * 1.3) + t * 0.55) * 0.24  // was 0.20
  const d = Math.sin((x * 1.6 - y * 0.8) - t * 0.65) * 0.18  // was 0.16
  const e = Math.sin(Math.sqrt(x * x + y * y) * 3.5 - t * 1.1) * 0.14 // was 0.12
  return 0.5 + (a + b + c + d + e)  // 0..1 range
}

/* ── Image sampler ───────────────────────────────────────────────────────── */

function loadImageSampler(url, sw, sh) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const cv = document.createElement('canvas')
        cv.width = sw; cv.height = sh
        const ctx = cv.getContext('2d', { willReadFrequently: true })
        if (!ctx) return reject(new Error('no 2d ctx'))
        const ar = img.width / img.height, tar = sw / sh
        let sx = 0, sy = 0, iw = img.width, ih = img.height
        if (ar > tar) { iw = ih * tar; sx = (img.width - iw) / 2 }
        else           { ih = iw / tar; sy = (img.height - ih) / 2 }
        ctx.drawImage(img, sx, sy, iw, ih, 0, 0, sw, sh)
        const d = ctx.getImageData(0, 0, sw, sh).data
        const luma = new Float32Array(sw * sh)
        for (let i = 0; i < luma.length; i++) {
          luma[i] = (0.299 * d[i*4] + 0.587 * d[i*4+1] + 0.114 * d[i*4+2]) / 255
        }
        resolve((nu, nv) => {
          if (nu < 0 || nu > 1 || nv < 0 || nv > 1) return 0
          const cx = Math.min(Math.floor(nu * sw), sw - 1)
          const cy = Math.min(Math.floor(nv * sh), sh - 1)
          return luma[cy * sw + cx]
        })
      } catch (e) { reject(e) }
    }
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
}

/* ── PinField ────────────────────────────────────────────────────────────── */

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function PinField({ appState, getLevel, imageUrl, glowRef, config, showFace }) {
  const { cols, rows, fieldW, fieldH, pinD, fill } = config
  const count = cols * rows
  const meshRef = useRef()

  /* Scratch objects — allocated once. */
  const dummy      = useMemo(() => new THREE.Object3D(), [])
  const tmpColor   = useMemo(() => new THREE.Color(), [])
  const recessClr  = useMemo(() => new THREE.Color(RECESS_GEL_HEX), [])

  /* State color smoothing (boxed mode). */
  const targetClr  = useRef(new THREE.Color(stateColorHex(appState)))
  const currentClr = useRef(new THREE.Color(stateColorHex(appState)))
  const levelRef   = useRef(0)

  /* Wave ↔ face transition progress: 0 = wave, 1 = face. */
  const transitionRef = useRef(0)

  /* GLB loaded flag — true once GLB raycasting successfully populated baseH. */
  const glbLoaded = useRef(false)

  /* Jaw animation — pre-computed depth delta between closed and fully-open jaw.
     jawOpenH[i] = depth when jawOpen morph target = 1.0.
     If the model has the jawOpen blend shape, we interpolate per-frame using audio.
     jawMapsReady = true once both baseH and jawOpenH are computed. */
  const jawOpenH     = useMemo(() => new Float32Array(count), [count])
  const jawMapsReady = useRef(false)

  /* Per-pin static arrays — sized to count. */
  const baseH  = useMemo(() => new Float32Array(count), [count])
  const mouthW = useMemo(() => new Float32Array(count), [count])
  const posX   = useMemo(() => new Float32Array(count), [count])
  const posY   = useMemo(() => new Float32Array(count), [count])

  /* World-space Y of mouth center (used for analytical jaw fallback). */
  const MOUTH_Y_WORLD = -(0.51 * FACE_H_FILL * 0.5)  // ≈ −0.535

  /* Pin geometry: CylinderGeometry rotated to Z-axis so scale.z = depth.
     8-sided octagonal approximation — visually round, cheap to render.
     Skill guidance: "tactile, physical, 3D depth, realistic cylindrical form". */
  const pinRadius  = (fieldW / cols) * 0.36   // ~72% fill — tighter gaps, smaller pins
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(pinRadius, pinRadius, 1, 8, 1, false)
    g.rotateX(Math.PI / 2)  // align along Z-axis
    g.translate(0, 0, 0.5)  // pivot at base; tip at z=depth
    return g
  }, [pinRadius])

  /* Material: physically-based metallic for the pin-art physical look.
     Skill: Silver #C0C0C0, metalness 0.75, roughness 0.28 — shiny but not chrome.
     vertexColors: true so per-instance colors drive albedo; lighting creates shadows. */
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color:            0xB8C4CC,   // neutral silver base
    metalness:        0.72,
    roughness:        0.30,
    vertexColors:     true,
    emissiveIntensity: 0.0,
  }), [])

  /* Load GLB for raycasting-based face relief. */
  const { scene: glbScene } = useGLTF('/avatar.glb')

  /* Compute per-pin world coords + procedural base heights. */
  useEffect(() => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const u = (c + 0.5) / cols
        const v = (r + 0.5) / rows
        const x = (u - 0.5) * fieldW
        const y = (0.5 - v) * fieldH
        posX[i] = x
        posY[i] = y

        if (fill) {
          /* Map world coords into the centered face region. */
          const fu = x / FACE_W_FILL + 0.5
          const fv = 0.5 - y / FACE_H_FILL
          /* Radial window: smooth fade so the face merges with flat margin. */
          const nx = x / (FACE_W_FILL * 0.5)
          const ny = y / (FACE_H_FILL * 0.5)
          const win = 1 - smoothstep(0.82, 1.12, Math.hypot(nx, ny))
          const raw = proceduralRelief(fu, fv)
          /* Amplify contrast: 1.3× push raises the face peaks while keeping
             recesses deep — this is what makes the pins read as a real face. */
          baseH[i] = THREE.MathUtils.clamp(raw * 1.3 * win, 0, 1)
          mouthW[i] = mouthWeight(fu, fv) * win
        } else {
          baseH[i]  = proceduralRelief(u, v)
          mouthW[i] = mouthWeight(u, v)
        }
      }
    }
  }, [baseH, mouthW, posX, posY, cols, rows, fieldW, fieldH, fill])

  /* GLB raycasting pipeline — highest priority, replaces procedural/image relief.
     Fires once the scene loads and only in fill mode. */
  useEffect(() => {
    if (!glbScene || !fill) return

    /* Find the best face mesh.
       Priority 1: explicitly named head/face mesh (reliable for RPM, VRM models).
       Priority 2: mesh whose bounding-box CENTER is closest to (0,0,0) — a body
         mesh sits low (y<0), clothing wraps the body, the HEAD is nearest origin.
       Priority 3: largest by vertex count (fallback). */
    const allMeshes = []
    glbScene.traverse(obj => { if (obj.isMesh) allMeshes.push(obj) })
    if (allMeshes.length === 0) return

    let faceMesh = allMeshes.find(m => /head|face|wolf3d_head/i.test(m.name)) || null

    if (!faceMesh) {
      /* Pick mesh whose center is closest to origin. */
      let minDist = Infinity
      for (const m of allMeshes) {
        m.updateMatrixWorld(true)
        const c = new THREE.Vector3()
        new THREE.Box3().setFromObject(m).getCenter(c)
        const d = c.length()
        if (d < minDist) { minDist = d; faceMesh = m }
      }
    }
    if (!faceMesh) return

    /* Center + scale face mesh into the FACE_W_FILL × FACE_H_FILL window. */
    faceMesh.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(faceMesh)
    const size   = new THREE.Vector3(); box.getSize(size)
    const center = new THREE.Vector3(); box.getCenter(center)

    if (size.x < 0.001 || size.y < 0.001) return  // degenerate geometry

    const scaleXY = Math.min(FACE_W_FILL / size.x, FACE_H_FILL / size.y) * 0.85

    /* Build transform: scale-then-translate to center. */
    const mat = new THREE.Matrix4()
    mat.makeScale(scaleXY, scaleXY, scaleXY)
    const tx = -center.x * scaleXY
    const ty = -center.y * scaleXY
    const tz = -center.z * scaleXY
    mat.setPosition(tx, ty, tz)

    const prevMatrix = faceMesh.matrixWorld.clone()
    faceMesh.matrixWorld.copy(mat)

    /* Ensure geometry is ready for raycasting (required by Three.js). */
    faceMesh.geometry.computeBoundingBox()
    faceMesh.geometry.computeBoundingSphere()

    const raycaster = new THREE.Raycaster()
    raycaster.near = 0; raycaster.far = 100

    /* Probe from CENTER of the field — the face is centered, so probing
       from the first 100 pins (top-left corner) always yields 0 hits and
       causes the whole raycasting to be silently abandoned. */
    const centerIdx  = Math.floor(count / 2)
    const probeStart = Math.max(0, centerIdx - 50)
    const probeEnd   = Math.min(count - 1, centerIdx + 50)

    /* Try shooting toward -Z (face toward camera); count hits. */
    const dirA = new THREE.Vector3(0, 0, -1)
    let hitsA = 0
    for (let i = probeStart; i <= probeEnd; i++) {
      raycaster.set(new THREE.Vector3(posX[i], posY[i], 20), dirA)
      if (raycaster.intersectObject(faceMesh, false).length > 0) hitsA++
    }

    /* Also try toward +Z (face away from camera). */
    const dirB = new THREE.Vector3(0, 0, 1)
    let hitsB = 0
    for (let i = probeStart; i <= probeEnd; i++) {
      raycaster.set(new THREE.Vector3(posX[i], posY[i], -20), dirB)
      if (raycaster.intersectObject(faceMesh, false).length > 0) hitsB++
    }

    const dir     = hitsA >= hitsB ? dirA : dirB
    const originZ = hitsA >= hitsB ? 20 : -20
    const hitCount = Math.max(hitsA, hitsB)

    /* Cast all rays — NaN = no hit (avoids false-zero ambiguity). */
    const rawZ = new Float32Array(count).fill(NaN)
    let minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < count; i++) {
      raycaster.set(new THREE.Vector3(posX[i], posY[i], originZ), dir)
      const hits = raycaster.intersectObject(faceMesh, false)
      if (hits.length > 0) {
        rawZ[i] = hits[0].point.z
        if (rawZ[i] < minZ) minZ = rawZ[i]
        if (rawZ[i] > maxZ) maxZ = rawZ[i]
      }
    }

    /* Accept if >3% of pins hit (face doesn't need to fill the whole field). */
    const totalHits = rawZ.reduce((n, v) => n + (isNaN(v) ? 0 : 1), 0)
    if (totalHits < count * 0.03) {
      faceMesh.matrixWorld.copy(prevMatrix)
      return
    }

    /* Normalize to 0..1 + apply radial window. */
    const range = maxZ - minZ || 1
    for (let i = 0; i < count; i++) {
      if (!isNaN(rawZ[i])) {
        const nx = posX[i] / (FACE_W_FILL * 0.5)
        const ny = posY[i] / (FACE_H_FILL * 0.5)
        const win = 1 - smoothstep(0.82, 1.12, Math.hypot(nx, ny))
        const normalized = (rawZ[i] - minZ) / range
        baseH[i] = THREE.MathUtils.clamp(normalized * win * 1.3, 0, 1)
      } else {
        baseH[i] = 0  // no hit → flat background
      }
    }

    faceMesh.matrixWorld.copy(prevMatrix)
    glbLoaded.current = true

    /* ── Step 2: blend procedural mouth into GLB data ──────────────────────
       The GLB default pose has a CLOSED, flat mouth — raycasting gives near-zero
       depth variation in the lip area. Blend in the procedural lip anatomy
       (which has explicit upper/lower lip bumps + recess) so the mouth is
       visible in the depth map even before the avatar starts speaking. */
    for (let i = 0; i < count; i++) {
      const fu = posX[i] / FACE_W_FILL + 0.5
      const fv = 0.5 - posY[i] / FACE_H_FILL
      const procH = proceduralRelief(fu, fv)
      const lipBlend = Math.min(mouthW[i] * 1.8, 0.9)  // max 90% blend in lip zone
      if (lipBlend > 0.02) {
        baseH[i] = baseH[i] * (1 - lipBlend) + procH * lipBlend
      }
    }

    /* ── Step 3: jaw-open depth map (morph target pipeline) ────────────────
       Avaturn / ReadyPlayerMe models have ARKit blend shapes.
       Look for jawOpen, jaw_open, or Jaw_Open. If found:
       - Set morph target to 1.0 (fully open)
       - Re-raycast only the mouth+chin region (~bottom 45% of face)
       - Store as jawOpenH[i]
       - Reset morph target to 0
       This pre-computation runs ONCE; per-frame animation is just lerp(baseH, jawOpenH, level). */
    const dict = faceMesh.morphTargetDictionary
    const jawKey = dict && (
      dict['jawOpen'] !== undefined      ? 'jawOpen'      :
      dict['jaw_open'] !== undefined     ? 'jaw_open'     :
      dict['Jaw_Open'] !== undefined     ? 'Jaw_Open'     :
      dict['mouthOpen'] !== undefined    ? 'mouthOpen'    :
      null
    )

    if (jawKey !== null) {
      const jawIdx = dict[jawKey]
      /* Copy current influences, open jaw fully. */
      const prevInfluences = [...(faceMesh.morphTargetInfluences || [])]
      if (faceMesh.morphTargetInfluences) faceMesh.morphTargetInfluences[jawIdx] = 1.0
      faceMesh.updateMatrix(); faceMesh.matrixWorld.copy(mat)

      /* Re-raycast only the mouth+chin band: face_y from −0.2 to −0.85 */
      const MOUTH_MIN_FY = -0.85, MOUTH_MAX_FY = -0.15
      let jMinZ = Infinity, jMaxZ = -Infinity
      const jRawZ = new Float32Array(count).fill(NaN)

      for (let i = 0; i < count; i++) {
        const fy = posY[i] / (FACE_H_FILL * 0.5)  // normalized −1..1
        if (fy < MOUTH_MIN_FY || fy > MOUTH_MAX_FY) {
          jawOpenH[i] = baseH[i]  // outside jaw zone: copy closed-mouth depth
          continue
        }
        raycaster.set(new THREE.Vector3(posX[i], posY[i], originZ), dir)
        const hits = raycaster.intersectObject(faceMesh, false)
        if (hits.length > 0) {
          jRawZ[i] = hits[0].point.z
          if (jRawZ[i] < jMinZ) jMinZ = jRawZ[i]
          if (jRawZ[i] > jMaxZ) jMaxZ = jRawZ[i]
        }
      }

      /* Normalize jaw-open depths using the SAME minZ/maxZ as the base map
         so scales match and interpolation is meaningful. */
      for (let i = 0; i < count; i++) {
        if (!isNaN(jRawZ[i])) {
          const nx = posX[i] / (FACE_W_FILL * 0.5)
          const ny = posY[i] / (FACE_H_FILL * 0.5)
          const win = 1 - smoothstep(0.82, 1.12, Math.hypot(nx, ny))
          const normalized = (jRawZ[i] - minZ) / range
          jawOpenH[i] = THREE.MathUtils.clamp(normalized * win * 1.3, 0, 1)
          /* Blend in open-mouth procedural for this region too */
          const fu2 = posX[i] / FACE_W_FILL + 0.5
          const fv2 = 0.5 - posY[i] / FACE_H_FILL
          const procH2 = proceduralRelief(fu2, fv2)
          const lb2 = Math.min(mouthW[i] * 1.4, 0.7)
          if (lb2 > 0.02) jawOpenH[i] = jawOpenH[i] * (1 - lb2) + procH2 * lb2
        }
      }

      /* Restore original morph influences. */
      if (faceMesh.morphTargetInfluences) {
        prevInfluences.forEach((v, idx) => { faceMesh.morphTargetInfluences[idx] = v })
      }
      faceMesh.matrixWorld.copy(prevMatrix)
      jawMapsReady.current = true
    } else {
      /* No jawOpen morph — fall back to analytical jaw simulation in useFrame. */
      faceMesh.matrixWorld.copy(prevMatrix)
    }
  }, [glbScene, fill, count, posX, posY, baseH, jawOpenH, mouthW])

  /* Image-based relief — fires only when GLB raycasting did NOT succeed. */
  useEffect(() => {
    if (!imageUrl) return
    /* GLB takes priority; skip image if GLB already populated baseH. */
    if (glbLoaded.current) return

    let cancelled = false
    loadImageSampler(imageUrl, cols, rows)
      .then((sample) => {
        if (cancelled || glbLoaded.current) return
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const i = r * cols + c
            if (fill) {
              const x = posX[i], y = posY[i]
              const fu = x / FACE_W_FILL + 0.5
              const fv = 0.5 - y / FACE_H_FILL
              const nx = x / (FACE_W_FILL * 0.5)
              const ny = y / (FACE_H_FILL * 0.5)
              const win = 1 - smoothstep(0.82, 1.12, Math.hypot(nx, ny))
              baseH[i] = THREE.MathUtils.clamp(sample(fu, fv) * win, 0, 1)
            } else {
              const u = (c + 0.5) / cols, v = (r + 0.5) / rows
              baseH[i] = sample(u, v)
            }
          }
        }
      })
      .catch((err) => console.warn('[PinScreenAvatar] image relief failed:', err?.message || err))
    return () => { cancelled = true }
  }, [imageUrl, baseH, posX, posY, cols, rows, fill])

  useEffect(() => { targetClr.current.set(stateColorHex(appState)) }, [appState])

  /* Ensure per-instance color buffer exists once the mesh mounts. */
  useEffect(() => {
    const m = meshRef.current
    if (!m || m.instanceColor) return
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
  }, [count])

  useFrame((state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t   = state.clock.elapsedTime
    const k   = Math.min(1, delta * 4)

    currentClr.current.lerp(targetClr.current, k)

    const rawLevel = (appState === 'speaking' && getLevel)
      ? THREE.MathUtils.clamp(getLevel() * 3.0, 0, 1) : 0
    levelRef.current += (rawLevel - levelRef.current) * Math.min(1, delta * 10)
    const level = prefersReducedMotion ? 0 : levelRef.current

    const shimmer = prefersReducedMotion ? 0 : 1

    /* Wave ↔ face transition.
       In boxed mode always show face (tp = 1).
       In fill mode lerp toward showFace target at ~0.5–0.8 s speed. */
    if (fill && !prefersReducedMotion) {
      const targetT = showFace ? 1 : 0
      transitionRef.current += (targetT - transitionRef.current) * Math.min(1, delta * 2.5)
    } else {
      transitionRef.current = 1  // boxed / reduced-motion: always face
    }
    const tp = transitionRef.current  // 0 = full wave, 1 = full face

    for (let i = 0; i < count; i++) {
      const x = posX[i], y = posY[i]

      let h
      if (fill) {
        const waveH = organicWave(x, y, t)
        const shimmerOffset = shimmer ? Math.sin(x * 6.0 + y * 4.0 - t * 1.6) * 0.016 : 0
        /* Residual wave keeps pins breathing even in face mode (15% amplitude). */
        const residual = waveH * 0.12 * tp

        let faceDepth
        if (tp > 0.05 && jawMapsReady.current) {
          /* ── Morph-target jaw: interpolate closed ↔ open depth maps ──────
             jawOpenH was pre-computed with jawOpen=1. Blend by audio level.
             This gives TRUE jaw movement — only mouth/chin region animates. */
          faceDepth = baseH[i] + (jawOpenH[i] - baseH[i]) * level
        } else if (tp > 0.05) {
          /* ── Analytical jaw fallback (no morph targets in model) ──────────
             Lower-jaw pins drop forward; upper-lip slightly retracts.
             No global face waves — only the jaw region animates. */
          let jaw = 0
          if (mouthW[i] > 0.02) {
            if (y <= MOUTH_Y_WORLD) {
              /* Lower jaw: deeper pins drop more (distance-weighted). */
              const drop = Math.min(Math.max(0, MOUTH_Y_WORLD - y) * 2.2, 1.0)
              jaw = mouthW[i] * drop * level * 3.5
            } else if (y < MOUTH_Y_WORLD + 0.22) {
              /* Upper lip: slight backward pull as jaw opens. */
              jaw = -mouthW[i] * 0.35 * level
            }
          }
          faceDepth = baseH[i] + jaw
        } else {
          faceDepth = baseH[i]
        }

        const faceH = faceDepth * tp + residual + shimmerOffset
        h = waveH * (1 - tp) + faceH
      } else {
        /* Boxed: original shimmer + audio, no wave. */
        h = baseH[i]
        if (shimmer) h += Math.sin(x * 6.0 + y * 4.0 - t * 1.6) * 0.018
        h += mouthW[i] * level * 0.9
      }

      h = h < 0 ? 0 : h > 1.2 ? 1.2 : h

      const depth = 0.02 + h * pinD
      dummy.position.set(x, y, 0)
      dummy.scale.set(1, 1, depth)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      if (fill) {
        /* Physical pin-art coloring:
           - Raised (h→1): silver-white tops (skill: Silver #C0C0C0)
           - Recessed (h→0): deep crimson gaps (skill: Burgundy #800020)
           The directional raking light then sculpts the cylinder sides. */
        tmpColor.lerpColors(FILL_RECESS, FILL_PIN_TOP, THREE.MathUtils.clamp(h * 1.4, 0, 1))
      } else {
        /* Boxed mode: original state-tinted coloring. */
        const lit   = 0.28 + h * 0.95
        tmpColor.copy(currentClr.current).multiplyScalar(lit)
        const ember = Math.max(0, 0.32 - h) * 0.9
        tmpColor.r += recessClr.r * ember
        tmpColor.g += recessClr.g * ember
        tmpColor.b += recessClr.b * ember
      }
      mesh.setColorAt(i, tmpColor)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    if (glowRef?.current) {
      const halo = 0.6 + level * 0.9
      glowRef.current.style.opacity = String(Math.min(1.4, halo))
      if (!prefersReducedMotion) glowRef.current.style.transform = `scale(${1 + level * 0.14})`
    }
  })

  return (
    <instancedMesh
      ref={meshRef}
      key={count}
      args={[geometry, material, count]}
      frustumCulled={false}
    />
  )
}

/* ── FallbackOrb ─────────────────────────────────────────────────────────── */

function FallbackOrb({ appState, getLevel }) {
  const meshRef = useRef()
  const matRef  = useRef()
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
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[0.42, 4]} />
      <meshStandardMaterial ref={matRef} color={stateColorHex(appState)} emissive={stateColorHex(appState)}
        emissiveIntensity={0.8} transparent opacity={0.85} roughness={0.3} metalness={0.2} wireframe />
    </mesh>
  )
}

/* ── SceneContents ───────────────────────────────────────────────────────── */

function SceneContents({ appState, getLevel, imageUrl, glowRef, config, showFace }) {
  return (
    <>
      {config.fill ? (
        /* Physical pin-art lighting:
           - Very low ambient so recesses stay dark (crimson shows through)
           - Strong raking directional from upper-left (creates shadows on pin cylinders — exactly the reference image look)
           - Subtle warm fill from lower-right (prevents complete blackout on back faces)
           Skill guidance: "realistic shadows, physics lighting, multi-layer shadow depth 20–40%" */
        <>
          <ambientLight intensity={0.10} color="#1A2030" />
          <directionalLight position={[-2.8, 3.5, 5.5]} intensity={3.2} color="#EAF0F8" />
          <directionalLight position={[2.5, -2.0, 3.0]} intensity={0.55} color="#FFD4A0" />
          <directionalLight position={[0, 0, 6]} intensity={0.25} color="#FFFFFF" />
        </>
      ) : (
        <>
          <ambientLight intensity={0.55} />
          <directionalLight position={[1.5, 2.5, 4]} intensity={1.1} />
          <directionalLight position={[-2, -1, 2]} intensity={0.35} color={stateColorHex(appState)} />
        </>
      )}
      <ErrorCatcher fallback={<FallbackOrb appState={appState} getLevel={getLevel} />}>
        <Suspense fallback={null}>
          <PinField
            appState={appState}
            getLevel={getLevel}
            imageUrl={imageUrl}
            glowRef={glowRef}
            config={config}
            showFace={showFace}
          />
        </Suspense>
      </ErrorCatcher>
    </>
  )
}

/* ── ErrorCatcher ────────────────────────────────────────────────────────── */

class ErrorCatcher extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err) { console.warn('[PinScreenAvatar] pin field failed, using fallback orb:', err?.message || err) }
  render() { return this.state.hasError ? this.props.fallback : this.props.children }
}

/* ── PinScreenAvatar (exported) ──────────────────────────────────────────── */

export function PinScreenAvatar({
  appState  = 'idle',
  getLevel,
  imageUrl  = null,
  fill      = false,
  showFace  = false,   // NEW: triggers organic-wave → face transition
}) {
  const [glow, setGlow] = useState(glowRgba(appState))
  const glowRef = useRef(null)
  const config  = fill ? FILL : BOXED

  useEffect(() => { setGlow(glowRgba(appState)) }, [appState])

  return (
    <div
      role="img"
      aria-label={`Vaani pin-screen avatar — ${appState}`}
      style={
        fill
          ? {
              /* Wrapper is just a semantic/aria container in fill mode.
                 The Canvas itself is position:fixed 100vw/100vh so it is
                 immune to this wrapper's dimensions entirely. No animation
                 transform here — transforms create stacking contexts that
                 confine position:fixed children to the element, not viewport. */
              position: 'fixed', inset: 0,
              overflow: 'hidden',
            }
          : {
              position: 'relative', width: BOXED.W, height: BOXED.H, flexShrink: 0,
              animation: 'avatar-reveal 700ms var(--ease-out-expo) 200ms both',
            }
      }
    >
      <div
        ref={glowRef}
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: fill
            ? `radial-gradient(ellipse 55% 60% at 50% 48%, rgba(60,90,20,0.30) 0%, transparent 70%)`
            : `radial-gradient(ellipse 60% 65% at 50% 50%, ${glow} 0%, transparent 70%)`,
          transition: 'background 800ms var(--ease-standard)',
          pointerEvents: 'none', willChange: 'opacity, transform', zIndex: 0,
        }}
      />

      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        camera={{
          fov:      config.camera.fov,
          near:     config.camera.near,
          far:      config.camera.far,
          position: config.camera.position,
        }}
        style={{
          /* position:fixed + 100vw/100vh = immune to parent transforms,
             overflow:hidden, container sizing bugs, and Chrome sidebar
             shrinking window.innerWidth on initial mount. */
          position: 'fixed',
          top: 0, left: 0,
          width: '100vw', height: '100vh',
          zIndex: 3, background: 'transparent',
        }}
        onCreated={({ gl, camera }) => {
          /* Force renderer to actual window dimensions on mount, bypassing any
             CSS timing race where the canvas element isn't sized yet. */
          const sync = () => {
            gl.setSize(window.innerWidth, window.innerHeight, false)
            if (camera.isPerspectiveCamera) {
              camera.aspect = window.innerWidth / window.innerHeight
              camera.updateProjectionMatrix()
            }
          }
          sync()
          window.addEventListener('resize', sync)
        }}
      >
        <SceneContents
          appState={appState}
          getLevel={getLevel}
          imageUrl={imageUrl}
          glowRef={glowRef}
          config={config}
          showFace={showFace}
        />
      </Canvas>
    </div>
  )
}
