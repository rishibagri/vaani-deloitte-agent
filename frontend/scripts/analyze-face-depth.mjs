/* Deep analysis: replicate the pin-wall framing + ortho depth projection on the
   optimized GLB, then dump the centerline depth profile so we can see exactly where
   the nose/lips/chin land in the field and whether the lips produce any depth signal.
   Run: node --max-old-space-size=8192 scripts/analyze-face-depth.mjs                */

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import * as THREE from 'three'

// Frontend constants (must match PinScreenAvatar.jsx).
const fieldW = 4.6, fieldH = 2.3
const HEAD_FRAC = 0.20, FACE_FILL = 0.96

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
})
const doc = await io.read('public/arti2.opt.glb')
const root = doc.getRoot()

// World matrices via scene-graph walk.
const worldOf = new Map()
const visit = (node, parentWorld) => {
  const local = new THREE.Matrix4().fromArray(node.getMatrix())
  const world = new THREE.Matrix4().multiplyMatrices(parentWorld, local)
  worldOf.set(node, world)
  node.listChildren().forEach(c => visit(c, world))
}
root.listScenes().forEach(s => s.listChildren().forEach(n => visit(n, new THREE.Matrix4())))

// Body = the morph-bearing mesh; collect world-space face verts. Also whole-model bbox.
let bodyNode = null
const allBox = new THREE.Box3()
const v = new THREE.Vector3()
const meshNodes = root.listNodes().filter(n => n.getMesh())
for (const node of meshNodes) {
  const mesh = node.getMesh()
  const W = worldOf.get(node)
  const hasMorph = mesh.listPrimitives().some(p => p.listTargets().length > 0)
  if (hasMorph && !bodyNode) bodyNode = node
  for (const prim of mesh.listPrimitives()) {
    const a = prim.getAttribute('POSITION').getArray()
    for (let i = 0; i < a.length; i += 3) { v.set(a[i], a[i+1], a[i+2]).applyMatrix4(W); allBox.expandByPoint(v) }
  }
}
const facePts = []
{
  const W = worldOf.get(bodyNode)
  for (const prim of bodyNode.getMesh().listPrimitives()) {
    const a = prim.getAttribute('POSITION').getArray()
    for (let i = 0; i < a.length; i += 3) { v.set(a[i], a[i+1], a[i+2]).applyMatrix4(W); facePts.push([v.x, v.y, v.z]) }
  }
}

// Framing (mirror the effect in PinScreenAvatar.jsx).
const size = new THREE.Vector3(); allBox.getSize(size)
const ctr  = new THREE.Vector3(); allBox.getCenter(ctr)
const headH  = size.y * HEAD_FRAC
const headCY = allBox.max.y - headH / 2
const scale  = (fieldH * FACE_FILL) / headH

// near/far bracket from FACE-mesh head-band z (RAW), like the frontend.
const yLoRaw = allBox.max.y - headH
let hzMin = Infinity, hzMax = -Infinity
for (const [,y,z] of facePts) { if (y < yLoRaw) continue; if (z < hzMin) hzMin = z; if (z > hzMax) hzMax = z }
const frontZ = (hzMax - ctr.z) * scale
const backZ  = (hzMin - ctr.z) * scale
const pad = Math.max(0.02, (frontZ - backZ) * 0.06)
const D = frontZ + pad
const near = pad * 0.5, far = (D - backZ) + pad

console.log('=== FRAMING ===')
console.log('model bbox Y', allBox.min.y.toFixed(2), allBox.max.y.toFixed(2), 'sizeY', size.y.toFixed(2))
console.log('headH', headH.toFixed(2), 'headCY', headCY.toFixed(2), 'scale', scale.toFixed(3))
console.log('face head-band z raw:', hzMin.toFixed(3), '..', hzMax.toFixed(3), '| cam D', D.toFixed(3), 'near', near.toFixed(3), 'far', far.toFixed(3))

// Project every face vert; keep the FRONT-most depth per (uvc) cell along centerline.
const NB = 140
const binFront = new Array(NB).fill(-Infinity)   // max d (nearest surface) per uvc.y bin
let inField = 0, total = 0
for (const [x, y, z] of facePts) {
  const wx = (x - ctr.x) * scale, wy = (y - headCY) * scale, wz = (z - ctr.z) * scale
  const ux = wx / fieldW + 0.5, uy = wy / fieldH + 0.5
  total++
  if (ux < 0 || ux > 1 || uy < 0 || uy > 1) continue
  inField++
  if (Math.abs(ux - 0.5) > 0.03) continue           // tight centerline strip
  const zp = D - wz
  const fragZ = (zp - near) / (far - near)
  const d = 1 - fragZ                                // matches shader .r
  const b = Math.min(NB - 1, Math.max(0, Math.floor(uy * NB)))
  if (d > binFront[b]) binFront[b] = d
}
console.log(`\nface verts: ${total}, in-field: ${inField} (${(100*inField/total).toFixed(0)}%)`)

// High-pass the profile to expose small features (lips) the raw curve hides.
console.log('\n=== CENTERLINE PROFILE (uvc.y 0.30–0.58 = nose→chin) — d, and local high-pass ===')
for (let b = NB - 1; b >= 0; b--) {
  const uy = (b + 0.5) / NB
  if (uy < 0.30 || uy > 0.58 || binFront[b] === -Infinity) continue
  // local mean over ±2 bins
  let s = 0, n = 0
  for (let k = -2; k <= 2; k++) { const bb = b + k; if (bb>=0 && bb<NB && binFront[bb]!==-Infinity){ s+=binFront[bb]; n++ } }
  const hp = binFront[b] - s / n
  const bar = '#'.repeat(Math.max(0, Math.round(binFront[b] * 50)))
  const hpMark = hp > 0.004 ? '  ▲ridge' : hp < -0.004 ? '  ▼crease' : ''
  console.log(`uvc.y ${uy.toFixed(3)}  d ${binFront[b].toFixed(3)}  hp ${hp>=0?'+':''}${hp.toFixed(3)}${hpMark}  |${bar}`)
}
