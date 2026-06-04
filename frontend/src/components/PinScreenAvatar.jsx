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
   PIN_D is reduced so the relief is subtle, like a face pressing through the wall. */
const FILL = {
  cols: 190, rows: 105,  // denser grid → ~9px pins vs ~17px before
  fieldW: 4.6, fieldH: 2.3,
  pinD: 0.35,            // significantly reduced from 0.82 for a bas-relief look
  fill: true,
  camera: { fov: 26, near: 0.1, far: 100, position: [0, 0, 3.4] },
}

/* Face occupies most of the field in fill mode. */
const FACE_W_FILL = 4.0  // ~87 % of fieldW=4.6
const FACE_H_FILL = 2.1  // ~91 % of fieldH=2.3

/* Face camera direction — +Z faces viewer by default; flip to -1 if depth looks inverted */
const FACE_CAM_SIGN = 1

/* Arti3 is a full-body Character-Creator rig (head ≈ top fifth of the bbox).
   We frame the depth camera tightly on the head+hair so the face fills the wall. */
const ARTI3_URL       = '/arti2.opt.glb'
const ARTI3_HEAD_FRAC = 0.20   // head+hair ≈ top 20% of the full-body bbox
const ARTI3_FACE_FILL = 0.96   // fraction of the field height the head fills

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

/* ── Lip-sync morph auto-detection ───────────────────────────────────────────
   The Arti3 (Character Creator) rig ships its blendshapes named numerically
   ("0".."151"), so we can't match ARKit names. Instead we geometrically detect
   which morph index opens the mouth: the one whose deltas push the lower-front
   face vertices furthest DOWN (−Y). Robust to renaming/decimation/Draco. */
function detectLipSyncMorph(root) {
  // Collect every morph-bearing mesh (the CC body is split into 6 primitives that
  // share the same morph set — the mouth verts live on one of them, so we must
  // drive them all). Indices line up across primitives.
  const meshes = []
  let nTargets = 0
  root.traverse(o => {
    const n = o.isMesh ? (o.geometry?.morphAttributes?.position?.length || 0) : 0
    if (n) { meshes.push(o); nTargets = Math.max(nTargets, n) }
  })
  if (!meshes.length) return null

  // Global head band across all morph meshes.
  const gbb = new THREE.Box3()
  meshes.forEach(m => { m.geometry.computeBoundingBox(); gbb.union(m.geometry.boundingBox) })
  const top = gbb.max.y, H = gbb.max.y - gbb.min.y
  const headBot = top - H * 0.16
  const headH   = top - headBot
  // Tighten mouth band: CC mouth is in bottom 40% of the head. 0.50 was too high
  // and caught eyes/brows.
  const mouthLo = headBot + headH * 0.05
  const mouthHi = headBot + headH * 0.42
  const eyeLo   = headBot + headH * 0.55       // eye band (upper-mid head)
  const eyeHi   = headBot + headH * 0.82
  const cz = (gbb.min.z + gbb.max.z) / 2

  const mouthScore = new Float32Array(nTargets)   // jaw / lips
  const eyeScore   = new Float32Array(nTargets)   // eyelid down = blink
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position
    const morphs = mesh.geometry.morphAttributes.position
    if (!morphs) continue
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (pos.getZ(i) < cz) continue                                  // front-facing only
      const inMouth = y >= mouthLo && y <= mouthHi
      const inEye   = y >= eyeLo   && y <= eyeHi
      if (!inMouth && !inEye) continue
      for (let m = 0; m < morphs.length; m++) {
        const dy = morphs[m].getY(i)
        if (dy >= 0) continue                                         // downward only
        if (inMouth) mouthScore[m] += -dy                             // jaw/mouth opening
        else eyeScore[m] += -dy                                       // eyelid closing
      }
    }
  }

  // To find a CLEAN jaw morph, we penalize candidates that move the eye area.
  // This prevents "dirty" morphs from jittering the eyelids during speech.
  const byCleanMouth = Array.from(mouthScore, (s, i) => {
    const penalty = eyeScore[i] * 12.0; // Very heavy penalty for eye movement
    return [s - penalty, i]
  }).sort((a, b) => b[0] - a[0])

  const byEye = Array.from(eyeScore, (s, i) => [s, i]).sort((a, b) => b[0] - a[0])
  
  let jawIdx = byCleanMouth[0]?.[1] ?? 0
  const blinkIdx = byEye[0]?.[1] ?? null
  
  // Secondary check: if the best mouth morph still has significant eye movement,
  // try to find a better one further down the list.
  if (eyeScore[jawIdx] > mouthScore[jawIdx] * 0.1 && byCleanMouth.length > 1) {
    jawIdx = byCleanMouth[1][1]
  }

  const lipIdxs = byCleanMouth.slice(1, 4).filter(([s]) => s > 0).map(([, i]) => i)
  return { meshes, jawIdx, lipIdxs, blinkIdx }
}

/* Project the verts a morph target moves into field-UV (weighted by delta magnitude)
   to auto-locate a feature — jaw morph → mouth, blink morph → eyes — so the shader's
   feature masks fit whatever model is loaded instead of hardcoded positions. Call with
   clone-local matrices (faceGroup identity), before baking the framing onto the clone. */
function morphFeatureUV(meshes, idx, ctr, headCY, scale, fieldW, fieldH) {
  if (idx == null || !meshes) return null
  const v = new THREE.Vector3()
  let lx = 0, ly = 0, lw = 0, rx = 0, ry = 0, rw = 0
  for (const mesh of meshes) {
    const mp = mesh.geometry.morphAttributes.position?.[idx]
    if (!mp) continue
    const base = mesh.geometry.attributes.position
    for (let i = 0; i < base.count; i++) {
      const dl = Math.hypot(mp.getX(i), mp.getY(i), mp.getZ(i))
      if (dl < 1e-4) continue
      v.fromBufferAttribute(base, i).applyMatrix4(mesh.matrixWorld)
      const ux = ((v.x - ctr.x) * scale) / fieldW + 0.5
      const uy = ((v.y - headCY) * scale) / fieldH + 0.5
      if (ux < 0.5) { lx += ux*dl; ly += uy*dl; lw += dl } else { rx += ux*dl; ry += uy*dl; rw += dl }
    }
  }
  const tw = lw + rw
  if (tw <= 0) return null
  const center = { x: (lx + rx) / tw, y: (ly + ry) / tw }
  return { center, l: lw > 0 ? { x: lx/lw, y: ly/lw } : center, r: rw > 0 ? { x: rx/rw, y: ry/rw } : center }
}

/* Collapse the incoming ARKit/viseme weight bag into a single 0..1 mouth-open
   scalar — enough to read as speech on a depth-relief pin wall. */
function opennessFromWeights(weights) {
  if (!weights) return 0
  return THREE.MathUtils.clamp(Math.max(
    weights.jawOpen     || 0,
    weights.mouthOpen   || 0,
    weights.viseme_aa   || 0,
    weights.viseme_O    || 0,
    weights.viseme_U    || 0,
    (weights.viseme_E   || 0) * 0.7,
  ), 0, 1)
}

/* ── Organic wave (idle mode) ────────────────────────────────────────────── */

/* Layered-sine noise: ocean-surface undulation.
   Smooth 300–400 ms cadence, physics-based feel (multiple overlapping waves). */
function organicWave(x, y, t) {
  const a = Math.sin(x * 2.6 + t * 0.75) * 0.32
  const b = Math.sin(y * 3.1 - t * 0.85) * 0.26
  const c = Math.sin((x * 0.9 + y * 1.3) + t * 0.55) * 0.24
  const d = Math.sin((x * 1.6 - y * 0.8) - t * 0.65) * 0.18
  const e = Math.sin(Math.sqrt(x * x + y * y) * 3.5 - t * 1.1) * 0.14
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

/* ── FILL mode sub-component ─────────────────────────────────────────────── */

function PinFieldFill({ appState, getLevel, getVisemes, facialWeightsRef, glowRef, config, showFace }) {
  const { cols, rows, fieldW, fieldH, pinD } = config
  const count = cols * rows
  const meshRef = useRef()
  const levelRef = useRef(0)

  /* Per-pin position arrays — static after mount. */
  const posX = useMemo(() => {
    const arr = new Float32Array(count)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        arr[r * cols + c] = ((c + 0.5) / cols - 0.5) * fieldW
    return arr
  }, [count, cols, rows, fieldW])

  const posY = useMemo(() => {
    const arr = new Float32Array(count)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        arr[r * cols + c] = (0.5 - (r + 0.5) / rows) * fieldH
    return arr
  }, [count, cols, rows, fieldH])

  /* Pin geometry: box along Z-axis, base at z=0, tip at z=1.
     Using boxes for a more professional, "digital" Zordon effect. */
  const pinSize = (fieldW / cols) * 0.72
  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(pinSize, pinSize, 1)
    g.translate(0, 0, 0.5)
    return g
  }, [pinSize])

  /* GPU depth render target + hidden scene + ortho camera. */
  const hiddenScene = useMemo(() => new THREE.Scene(), [])
  const depthCam    = useRef(null)
  const faceClone   = useRef(null)
  const depthRT = useMemo(() => new THREE.WebGLRenderTarget(512, 512, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
  }), [])

  /* Shader uniforms — ref so useFrame can update without triggering React re-renders. */
  const uniforms = useRef({
    uDepthTex:  { value: null },          // set after depthRT ready
    uFieldSize: { value: new THREE.Vector2(fieldW, fieldH) },
    uMaxExt:    { value: pinD },
    uWave:      { value: 1.0 },           // 1 = full wave (idle), 0 = full face — starts as the wave
    uTime:      { value: 0 },
    uTopCol:    { value: new THREE.Color(0.53, 0.74, 0.15) }, // Deloitte green
    uRecCol:    { value: new THREE.Color(0.04, 0.08, 0.01) },
    // Auto-located feature positions in field-UV (set from the morph targets in the
    // framing effect — robust to whatever model is loaded). Sensible defaults.
    uMouthUV:   { value: new THREE.Vector2(0.50, 0.44) },
    uMouthOpen: { value: 0 },              // 0..1 live lip-sync openness (audio-driven)
    uShowLips:  { value: 0 },              // 1 = highlight the detected lip pins (toggle: L)
    uEyeLUV:    { value: new THREE.Vector2(0.40, 0.65) },
    uEyeRUV:    { value: new THREE.Vector2(0.60, 0.65) },
  })

  /* Material with GPU vertex-shader displacement. */
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color:     0xB8C4CC,
      metalness: 0.72,
      roughness: 0.30,
    })
    mat.onBeforeCompile = (shader) => {
      // Inject uniforms
      Object.assign(shader.uniforms, uniforms.current)
      // Inject declarations before vertexShader
      shader.vertexShader = `
uniform sampler2D uDepthTex;
uniform vec2 uFieldSize;
uniform float uMaxExt;
uniform float uWave;
uniform float uTime;
uniform vec2 uMouthUV;
uniform float uMouthOpen;
varying float vH;
varying vec3 vSlopeN;
varying float vCrease;
varying vec2 vFaceUV;
varying float vUpperLip;
varying float vLowerLip;

float owave(vec2 p, float t){
  float a = sin(p.x*2.6 + t*0.75)*0.32;
  float b = sin(p.y*3.1 - t*0.85)*0.26;
  float c = sin((p.x*0.9 + p.y*1.3) + t*0.55)*0.24;
  float d = sin((p.x*1.6 - p.y*0.8) - t*0.65)*0.18;
  float e = sin(length(p)*3.5 - t*1.1)*0.14;
  return 0.5 + (a + b + c + d + e);
}
` + shader.vertexShader

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec2 ipos = vec2(instanceMatrix[3][0], instanceMatrix[3][1]);
vec2 uvc  = ipos / uFieldSize + 0.5;
// MeshDepthMaterial(BasicDepthPacking) writes .r = 1.0 - fragCoordZ, so .r == 1.0
// at the near plane (the nose) and 0.0 at the far plane. Target cleared to black,
// so empty background is 0.0. near/far are bracketed tightly to the face mesh.
float tx = 1.3 / 512.0;
float dC = texture2D(uDepthTex, uvc).r;
float dR = texture2D(uDepthTex, uvc + vec2( tx, 0.0)).r;
float dL = texture2D(uDepthTex, uvc + vec2(-tx, 0.0)).r;
float dU = texture2D(uDepthTex, uvc + vec2(0.0,  tx)).r;
float dD = texture2D(uDepthTex, uvc + vec2(0.0, -tx)).r;
// HEIGHT = the face's depth band, stretched for contrast (drops far hair/background
// near 0 so only the face protrudes). Nose nearest → tallest, recedes outward.
float blur4    = (dR + dL + dU + dD) * 0.25;
float detail   = clamp(dC - blur4, -0.08, 0.08);
float edgeAtten = 1.0 - smoothstep(0.07, 0.14, abs(detail));
// Concentrate the fine-detail height boost on the MOUTH/LIPS — a 2D gaussian over
// the lower-centre of the framed face (head centre sits at field centre uvc≈0.5,
// so the mouth is just below it). Low baseline elsewhere so scattered hair pins
// don't get pushed; the lips/creases get their definition from shading + darkening.
// Amplify the REAL fine depth (high-pass) hardest over the mouth so the model's own
// lips read. Measured lip rows: upper lip ≈uvc.y 0.47, seam ≈0.446, lower ≈0.428 —
// the signal is small (~0.006) so it needs strong, correctly-placed gain. Low
// baseline elsewhere so hair pins don't get pushed.
float mouthW = exp(-pow((uvc.y - uMouthUV.y) / 0.08, 2.0)) * exp(-pow((uvc.x - uMouthUV.x) / 0.20, 2.0));
float detailGain = 1.0 + 26.0 * mouthW;
// ULTRA-AGGRESSIVE THRESHOLD (0.32 -> 0.45): Kill stray pins around chin/neck/ears.
float faceH = clamp((dC - 0.45) * 2.8 + detail * edgeAtten * detailGain, 0.0, 1.7);
// FACE MASK: a taller-than-wide ellipse hugging the face (forehead↔chin). Fades
// height to 0 outside it, so the stray ear/cheek pins AND the neck/jaw spikes
// below the chin disappear and the face ends cleanly. Centre/radii are tunable.
vec2  fmv       = (uvc - vec2(0.50, 0.57)) / vec2(0.185, 0.30);
float radialMask = 1.0 - smoothstep(0.84, 1.06, length(fmv));
faceH *= radialMask;

// ── MOUTH: a smooth elliptical opening ───────────────────────────────────────
// Modelled as an ellipse whose HEIGHT grows with uMouthOpen. Closed = a thin
// horizontal lip line; open = a taller oval.
float mx = (uvc.x - uMouthUV.x);
float my = (uvc.y - uMouthUV.y);
float W  = 0.050;                                   // mouth half-width
// Significantly reduced amplitude: opens less wide to handle high viseme scores
float Hm = 0.009 + uMouthOpen * 0.010;              

float e  = length(vec2(mx / W, my / Hm));           // 1 on the lip outline
float inside = 1.0 - smoothstep(0.70, 1.00, e);     // mouth interior (recessed/dark)
float rim    = (1.0 - smoothstep(0.12, 0.46, abs(e - 1.0))) * (1.0 - inside); // the lips

// A very shallow recess for the inside of the mouth.
faceH = mix(faceH, faceH * 0.70, inside);
// Push the lips outward slightly when speaking for volume, heavily reduced.
float lipPush = 0.03 + uMouthOpen * 0.05;
faceH = mix(faceH, faceH + lipPush, rim);              
faceH = max(faceH, 0.0);
vUpperLip = rim * step(0.0,  my);                   // (debug colours only)
vLowerLip = rim * step(0.0, -my);

// Crease signal for the fragment shader (lip line, eye folds, nostrils, brow),
// boosted over the mouth so the subtle real lip seam darkens enough to read.
vCrease = max(0.0, -detail) * edgeAtten * (1.0 + mouthW * 9.0) * radialMask;
vFaceUV = uvc;
// SURFACE NORMAL from the depth gradient. Feature legibility comes from LIGHTING
// this normal in the fragment shader (nose ridge, lips, eye sockets, brows read as
// highlight/shadow) — far more readable than mapping height straight to brightness.
// Y-gradient weighted higher so horizontal features (the lip line, eyelid creases)
// shade strongly — they're the hardest to read on a fronto-parallel lower face.
vSlopeN = normalize(vec3((dL - dR) * 6.5, (dD - dU) * 10.0, 1.0));
float waveH = owave(ipos * 2.0, uTime);
float h = mix(faceH, waveH, uWave);
vH = h;
transformed.z *= (0.02 + h * uMaxExt);`
      )

      shader.fragmentShader = `uniform vec3 uTopCol; uniform vec3 uRecCol; uniform float uTime; uniform float uWave; uniform vec2 uEyeLUV; uniform vec2 uEyeRUV; uniform float uShowLips; varying float vH; varying vec3 vSlopeN; varying float vCrease; varying vec2 vFaceUV; varying float vUpperLip; varying float vLowerLip;\n` + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
// Lit relief: a directional light over the depth-gradient normal makes facial
// structure read as highlight & shadow — nose ridge, lips, eye sockets, brows.
// Unlit in wave mode (uWave=1) so the idle wave keeps its flat glow.
float diff = clamp(dot(normalize(vSlopeN), normalize(vec3(-0.40, 0.42, 0.82))), 0.0, 1.0);
float litShade = 0.30 + 0.85 * diff;
float shade = mix(1.0, litShade, 1.0 - uWave);

// Base color from height, then shaded by the lighting.
vec3 baseCol = mix(uRecCol, uTopCol, clamp(vH * 0.9, 0.0, 1.0)) * shade;

// ── Feature darkening (face mode only) ──────────────────────────────────────
// Creases (lip line, eye folds, nostrils, brow) read as recesses → darken them so
// the structure is sharp instead of a smooth bright dome.
// PITCH BLACK LIPS: (36.0 -> 60.0) Extreme contrast for the lip seam.
float creaseDark = clamp(vCrease * 32.0, 0.0, 0.88);
// Eyes (measured: above the nose tip at uvc.y≈0.55 → eyes ≈0.65, ±x from centre):
// gently darken two discs so the eyes read without going hollow/scary.
float eyeL = exp(-(pow((vFaceUV.x - uEyeLUV.x) / 0.055, 2.0) + pow((vFaceUV.y - uEyeLUV.y) / 0.042, 2.0)));
float eyeR = exp(-(pow((vFaceUV.x - uEyeRUV.x) / 0.055, 2.0) + pow((vFaceUV.y - uEyeRUV.y) / 0.042, 2.0)));
float eyeMask = clamp(eyeL + eyeR, 0.0, 1.0);
float featureDark = (1.0 - creaseDark) * (1.0 - 0.24 * eyeMask);
baseCol *= mix(1.0, featureDark, 1.0 - uWave);

// Smoother Zordon scanline + subtle holographic flicker (face mode only)
float scanline = sin(vH * 32.0 + uTime * 3.5) * 0.05 + 0.95;
float flicker = mix(1.0, 0.99 + sin(uTime * 45.0) * 0.01, 1.0 - uWave);
baseCol *= scanline * flicker;

// Height-based emissive glow (tips glow more)
float glow = smoothstep(1.0, 1.45, vH) * 0.35;
vec3 finalCol = baseCol * 1.5 + uTopCol * glow;

gl_FragColor.rgb *= finalCol;
// Soft highlight compression (Reinhard) so the fronto-parallel lower face doesn't
// clip to a flat green plateau — preserves the lip/chin gradient near the top end.
gl_FragColor.rgb = gl_FragColor.rgb / (1.0 + gl_FragColor.rgb * 0.55);

// ── LIP STRUCTURE MARKER (uShowLips=1) ───────────────────────────────────────
// Upper lip → magenta, lower lip → cyan, so we can see the two lips and the
// opening between them. Face mode only. Toggle with L.
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.12, 0.66), vUpperLip * uShowLips * (1.0 - uWave));
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.10, 0.85, 1.0), vLowerLip * uShowLips * (1.0 - uWave));`
      )
    }
    mat.needsUpdate = true
    return mat
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  /* Load GLB, build hidden face scene + ortho depth camera. */
  const { scene: glbScene } = useGLTF(ARTI3_URL)
  const depthScene = useMemo(() => new THREE.Scene(), [])
  const faceGroup  = useRef(new THREE.Group())
  const morphDet   = useRef(null)   // { mesh, jawIdx, lipIdxs } — detected lip-sync morphs

  useEffect(() => {
    if (!glbScene) return

    // Clone so we never mutate the cached GLB.
    const clone = glbScene.clone(true)
    faceGroup.current.clear()
    faceGroup.current.add(clone)
    // faceGroup stays at identity — it is the idle-sway pivot, with the head centre
    // sitting at its origin. All framing (scale + centering) is baked onto the clone,
    // so faceGroup rotation/bob in the frame loop pivots cleanly about the head.
    faceGroup.current.position.set(0, 0, 0)
    faceGroup.current.rotation.set(0, 0, 0)
    faceGroup.current.scale.setScalar(1)
    depthScene.add(faceGroup.current)

    // Measure the raw model (clone + faceGroup both identity → matrixWorld is
    // clone-local). Full-body rig: head+hair ≈ top 20% of the bbox.
    clone.updateMatrixWorld(true)
    const box  = new THREE.Box3().setFromObject(clone)
    const size = new THREE.Vector3(); box.getSize(size)
    const ctr  = new THREE.Vector3(); box.getCenter(ctr)
    const headH  = Math.max(1e-4, size.y * ARTI3_HEAD_FRAC)
    const headCY = box.max.y - headH / 2
    const scale  = (fieldH * ARTI3_FACE_FILL) / headH

    // Detect the lip-sync + blink morphs (numeric names → geometric detection).
    morphDet.current = detectLipSyncMorph(clone)

    // Bracket the ortho depth camera's near/far to the FACE mesh only (the
    // morph-bearing CC_Base_Body), within the head band — measured in RAW
    // (clone-local) space. Bracketing off all geometry pulls the near plane out to
    // the forward-flowing hair (face recesses); off the whole body flattens it into
    // a saturated plateau. Face-only → nose protrudes, features grade cleanly.
    const faceMeshes = morphDet.current?.meshes?.length
      ? morphDet.current.meshes
      : (() => { const a = []; clone.traverse(o => { if (o.isMesh && o.geometry?.attributes?.position) a.push(o) }); return a })()
    const yLo = box.max.y - headH               // head band, clone-local space
    const vtmp = new THREE.Vector3()
    let hzMin = Infinity, hzMax = -Infinity
    for (const o of faceMeshes) {
      const p = o.geometry.attributes.position
      for (let i = 0; i < p.count; i++) {
        vtmp.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld)
        if (vtmp.y < yLo) continue
        if (vtmp.z < hzMin) hzMin = vtmp.z
        if (vtmp.z > hzMax) hzMax = vtmp.z
      }
    }

    // Auto-locate the mouth (lips) and eyes (blink morph) in field-UV so the
    // shader's feature masks fit this model. Must run while the clone is still at
    // identity (matrixWorld is clone-local), i.e. before baking the framing below.
    // To find the LIPS specifically, we anchor it to the expected UV center (0.5, 0.44).
    const mouthCandidates = [morphDet.current?.jawIdx, ...(morphDet.current?.lipIdxs || [])]
    let bestDist = Infinity
    let bestMouth = null
    for (const idx of mouthCandidates) {
      if (idx == null) continue
      const m = morphFeatureUV(faceMeshes, idx, ctr, headCY, scale, fieldW, fieldH)
      // Pick the morph closest to the expected mouth UV (0.50, 0.44).
      // STRICT: If it's above 0.50, it's definitely an eye/brow morph, skip it.
      if (m && m.center.y < 0.50) {
        const d = Math.hypot(m.center.x - 0.5, m.center.y - 0.44)
        if (d < bestDist) { bestDist = d; bestMouth = m }
      }
    }
    // The morph/crease auto-detection kept placing the mouth too low (on the chin),
    // so we pin a FIXED, calibrated lip row instead — the framing is consistent
    // across loads. ~6 pin-rows up from the old 0.44 anchor. Fine-tune live with the
    // arrow keys, then lock the final value here.
    const anchorX = 0.50
    const anchorY = 0.50
    uniforms.current.uMouthUV.value.set(anchorX, anchorY)

    const eyes = morphFeatureUV(faceMeshes, morphDet.current?.blinkIdx, ctr, headCY, scale, fieldW, fieldH)
    if (eyes) {
      uniforms.current.uEyeLUV.value.set(eyes.l.x, eyes.l.y)
      uniforms.current.uEyeRUV.value.set(eyes.r.x, eyes.r.y)
    }
    console.log('[PinScreen] auto features — mouth', {anchorX, anchorY}, 'eyeL', eyes?.l, 'eyeR', eyes?.r)

    // Bake framing onto the clone: scale, then translate so the head CENTRE lands at
    // the faceGroup origin (the sway pivot). The body falls below the ortho frustum.
    clone.scale.setScalar(scale)
    clone.position.set(-ctr.x * scale, -headCY * scale, -ctr.z * scale)

    // Camera looks at origin (= head centre). Face is +Z → nose = max-z of head band.
    const frontZ = (hzMax - ctr.z) * scale
    const backZ  = (hzMin - ctr.z) * scale
    const pad = Math.max(0.02, (frontZ - backZ) * 0.06)
    const D = frontZ + pad
    const cam = new THREE.OrthographicCamera(
      -fieldW / 2, fieldW / 2, fieldH / 2, -fieldH / 2,
      pad * 0.5, (D - backZ * 0.55) + pad,
    )
    cam.position.set(0, 0, D)
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix()
    depthCam.current = cam

    depthScene.overrideMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking })
    uniforms.current.uDepthTex.value = depthRT.texture

    return () => { depthScene.remove(faceGroup.current) }
  }, [glbScene, depthScene, depthRT, fieldW, fieldH])

  /* Lip-target calibration:
       L            → toggle the magenta detected-lip marker on/off
       Arrow keys   → nudge the lip target (uMouthUV) onto the real lips
     The current value is logged on every nudge so we can hardcode it once aligned. */
  useEffect(() => {
    const STEP = 0.004
    const onKey = (e) => {
      const u = uniforms.current
      if (e.key === 'l' || e.key === 'L') {
        u.uShowLips.value = u.uShowLips.value > 0.5 ? 0 : 1
        console.log('[PinScreen] lip marker', u.uShowLips.value ? 'ON' : 'OFF')
        return
      }
      let moved = true
      // uvc.y increases UP, so ArrowUp raises the target.
      if      (e.key === 'ArrowUp')    u.uMouthUV.value.y += STEP
      else if (e.key === 'ArrowDown')  u.uMouthUV.value.y -= STEP
      else if (e.key === 'ArrowLeft')  u.uMouthUV.value.x -= STEP
      else if (e.key === 'ArrowRight') u.uMouthUV.value.x += STEP
      else moved = false
      if (moved) {
        e.preventDefault()
        console.log('[PinScreen] uMouthUV =', u.uMouthUV.value.x.toFixed(3), u.uMouthUV.value.y.toFixed(3))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* Static placement of all pins — run once after mount. */
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < count; i++) {
      dummy.position.set(posX[i], posY[i], 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [count, posX, posY, dummy])

  useFrame((state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t  = state.clock.elapsedTime
    const gl = state.gl

    // ── Live lip-sync openness → direct shader mouth articulation ─────────────
    // We deliberately do NOT drive the GLB jaw morph here. Re-rendering the depth
    // map through the morph (a) barely moved the mouth (jaw-open is a −Y motion a
    // head-on depth render hardly sees) and (b) tugged the eyes (the CC rig's
    // visemes aren't perfectly isolated). Instead we feed the openness scalar to
    // uMouthOpen and articulate the mouth pins in the shader — the depth map (and
    // therefore the eyes) stays perfectly still, and the lips always move.
    let openness = 0
    if (!prefersReducedMotion && appState === 'speaking') {
      // Prefer the browser FFT visemes; fall back to backend weights, then loudness.
      const clientWeights = getVisemes ? getVisemes() : null
      const weights = clientWeights || facialWeightsRef?.current
      openness = opennessFromWeights(weights)
      if (!weights && getLevel) {
        openness = THREE.MathUtils.clamp(getLevel() * 3.0, 0, 1)
      }
      openness = THREE.MathUtils.clamp(openness * 1.0, 0, 1)  // subtle, demo-readable amplitude
    }
    // Snappy attack, gentler release so syllables read crisply without chattering.
    const moU  = uniforms.current.uMouthOpen
    const rate = openness > moU.value ? 0.55 : 0.22
    moU.value += (openness - moU.value) * rate

    // Render hidden scene to depth render target
    const prevC = new THREE.Color()
    gl.getClearColor(prevC)
    const prevA = gl.getClearAlpha()
    gl.setRenderTarget(depthRT)
    gl.setClearColor(0x000000, 1)   // black bg → .r=0 there, distinct from the near-plane face
    gl.clear()
    if (depthCam.current) gl.render(depthScene, depthCam.current)
    gl.setRenderTarget(null)
    gl.setClearColor(prevC, prevA)

    // Update shader time uniform
    uniforms.current.uTime.value = t

    // Lerp wave ↔ face blend — slow exponential ease so the wall melts into the face
    // (and back) gradually rather than snapping. ~1.5s feel.
    const targetWave = (showFace || prefersReducedMotion) ? 0 : 1
    uniforms.current.uWave.value = THREE.MathUtils.lerp(
      uniforms.current.uWave.value, targetWave, 1 - Math.exp(-delta * 1.3))

    // Drive CSS glow halo with audio level
    const rawLevel = (appState === 'speaking' && getLevel)
      ? THREE.MathUtils.clamp(getLevel() * 3.0, 0, 1) : 0
    levelRef.current += (rawLevel - levelRef.current) * Math.min(1, delta * 10)
    const level = prefersReducedMotion ? 0 : levelRef.current

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

/* ── BOXED mode sub-component (unchanged logic) ──────────────────────────── */

function PinFieldBoxed({ appState, getLevel, imageUrl, glowRef, config }) {
  const { cols, rows, fieldW, fieldH, pinD } = config
  const count = cols * rows
  const meshRef = useRef()

  const dummy     = useMemo(() => new THREE.Object3D(), [])
  const tmpColor  = useMemo(() => new THREE.Color(), [])
  const recessClr = useMemo(() => new THREE.Color(RECESS_GEL_HEX), [])

  const targetClr  = useRef(new THREE.Color(stateColorHex(appState)))
  const currentClr = useRef(new THREE.Color(stateColorHex(appState)))
  const levelRef   = useRef(0)

  const baseH  = useMemo(() => new Float32Array(count), [count])
  const mouthW = useMemo(() => new Float32Array(count), [count])
  const posX   = useMemo(() => new Float32Array(count), [count])
  const posY   = useMemo(() => new Float32Array(count), [count])

  const pinRadius = (fieldW / cols) * 0.36
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(pinRadius, pinRadius, 1, 8, 1, false)
    g.rotateX(Math.PI / 2)
    g.translate(0, 0, 0.5)
    return g
  }, [pinRadius])

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color:            0xB8C4CC,
    metalness:        0.72,
    roughness:        0.30,
    vertexColors:     true,
    emissiveIntensity: 0.0,
  }), [])

  useEffect(() => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const u = (c + 0.5) / cols
        const v = (r + 0.5) / rows
        posX[i] = (u - 0.5) * fieldW
        posY[i] = (0.5 - v) * fieldH
        baseH[i]  = proceduralRelief(u, v)
        mouthW[i] = mouthWeight(u, v)
      }
    }
  }, [baseH, mouthW, posX, posY, cols, rows, fieldW, fieldH])

  /* Image-based relief. */
  useEffect(() => {
    if (!imageUrl) return
    let cancelled = false
    loadImageSampler(imageUrl, cols, rows)
      .then((sample) => {
        if (cancelled) return
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            const u = (c + 0.5) / cols, v = (r + 0.5) / rows
            baseH[r * cols + c] = sample(u, v)
          }
      })
      .catch((err) => console.warn('[PinScreenAvatar] image relief failed:', err?.message || err))
    return () => { cancelled = true }
  }, [imageUrl, baseH, cols, rows])

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
    const t = state.clock.elapsedTime
    const k = Math.min(1, delta * 4)
    currentClr.current.lerp(targetClr.current, k)

    const rawLevel = (appState === 'speaking' && getLevel)
      ? THREE.MathUtils.clamp(getLevel() * 3.0, 0, 1) : 0
    levelRef.current += (rawLevel - levelRef.current) * Math.min(1, delta * 10)
    const level = prefersReducedMotion ? 0 : levelRef.current
    const shimmer = prefersReducedMotion ? 0 : 1

    for (let i = 0; i < count; i++) {
      const x = posX[i], y = posY[i]
      let h = baseH[i]
      if (shimmer) h += Math.sin(x * 6.0 + y * 4.0 - t * 1.6) * 0.018
      h += mouthW[i] * level * 0.9
      h = h < 0 ? 0 : h > 1.2 ? 1.2 : h

      const depth = 0.02 + h * pinD
      dummy.position.set(x, y, 0)
      dummy.scale.set(1, 1, depth)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      const lit  = 0.28 + h * 0.95
      tmpColor.copy(currentClr.current).multiplyScalar(lit)
      const ember = Math.max(0, 0.32 - h) * 0.9
      tmpColor.r += recessClr.r * ember
      tmpColor.g += recessClr.g * ember
      tmpColor.b += recessClr.b * ember
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

function SceneContents({ appState, getLevel, getVisemes, facialWeightsRef, imageUrl, glowRef, config, showFace }) {
  return (
    <>
      {config.fill ? (
        /* Even more dulled cinematic lighting for Zordon effect */
        <>
          <ambientLight intensity={0.10} color="#051005" />
          <directionalLight position={[-2.5, 3.0, 5.0]} intensity={0.4} color="#A0B0C0" />
          <directionalLight position={[2.0, -1.5, 3.0]} intensity={0.15} color="#406010" />
          <directionalLight position={[0, 0, 4]} intensity={0.08} color="#B0B0B0" />
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
          {config.fill ? (
            <PinFieldFill
              appState={appState}
              getLevel={getLevel}
              getVisemes={getVisemes}
              facialWeightsRef={facialWeightsRef}
              glowRef={glowRef}
              config={config}
              showFace={showFace}
            />
          ) : (
            <PinFieldBoxed
              appState={appState}
              getLevel={getLevel}
              imageUrl={imageUrl}
              glowRef={glowRef}
              config={config}
            />
          )}
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
  appState         = 'idle',
  getLevel,
  getVisemes,
  facialWeightsRef,              // React ref: .current = { jawOpen: 0..1, ... } | null — ARKit blendshapes ~30Hz
  imageUrl         = null,
  fill             = false,
  showFace         = false,
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
          getVisemes={getVisemes}
          facialWeightsRef={facialWeightsRef}
          imageUrl={imageUrl}
          glowRef={glowRef}
          config={config}
          showFace={showFace}
        />
      </Canvas>
    </div>
  )
}
