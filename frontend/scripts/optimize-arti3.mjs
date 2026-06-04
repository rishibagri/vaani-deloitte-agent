/* Optimize Arti3.glb (454MB Reallusion CC full-body rig) into a tiny depth-ready
   GLB for the pin-wall avatar. The consumer renders MeshDepthMaterial, so visuals
   are irrelevant — we only need head/face geometry + a few mouth/jaw morphs.

   Run: node --max-old-space-size=16384 scripts/optimize-arti3.mjs            */

import { NodeIO } from '@gltf-transform/core'
import { KHRDracoMeshCompression, ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { weld, simplify, prune, dedup } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import draco3d from 'draco3dgltf'
import * as fs from 'node:fs'

const IN  = 'public/arti2.glb'
const OUT = 'public/arti2.opt.glb'

// CC mesh node names we keep (face + framing silhouette) vs drop (clothing/occlusion).
const KEEP_MESH = new Set(['CC_Base_Body', 'CC_Base_Teeth', 'CC_Base_Tongue', 'CC_Base_Eye',
  'Hair_Base', 'Bun', 'Real_Hair', 'Bang'])
const MORPH_MESH = 'CC_Base_Body'   // only the body carries the facial blendshapes
const KEEP_MORPHS = 12              // pruned-down mouth/jaw + eye/blink morph count

const log = (...a) => console.log('[opt]', ...a)

async function main() {
  await MeshoptSimplifier.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })

  log('reading', IN, '(' + (fs.statSync(IN).size / 1048576).toFixed(0) + 'MB) — materializing accessors…')
  const doc = await io.read(IN)
  const root = doc.getRoot()

  // ── 0. Bake each kept mesh-node's world transform into its geometry, then map
  //       mesh → node so detection/orientation work in a clean world frame. ──
  const meshNode = new Map()
  for (const node of root.listNodes()) {
    const m = node.getMesh()
    if (m && !meshNode.has(m)) meshNode.set(m, node)
  }

  // ── 1. Drop clothing / occlusion meshes outright. ──
  for (const mesh of root.listMeshes()) {
    const name = (meshNode.get(mesh)?.getName()) || mesh.getName() || ''
    if (!KEEP_MESH.has(name)) { log('drop mesh', name || '(unnamed)'); mesh.dispose() }
  }

  // ── 2. Free the morph NORMAL deltas immediately (depth render ignores normals)
  //       — this alone reclaims ~900MB. Also drop TANGENT. ──
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const t of prim.listTargets()) {
        t.setAttribute('NORMAL', null)
        t.setAttribute('TANGENT', null)
      }
    }
  }

  // ── 3. Detect the mouth/jaw morphs on CC_Base_Body and keep only the best set. ──
  const bodyMesh = root.listMeshes().find(m => (meshNode.get(m)?.getName() || m.getName()) === MORPH_MESH)
  if (!bodyMesh) throw new Error('CC_Base_Body not found after pruning')

  // Global bbox of the body (bind pose) to locate the head band.
  let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity, minX = Infinity, maxX = -Infinity
  for (const prim of bodyMesh.listPrimitives()) {
    const p = prim.getAttribute('POSITION').getArray()
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] < minX) minX = p[i]; if (p[i] > maxX) maxX = p[i]
      if (p[i+1] < minY) minY = p[i+1]; if (p[i+1] > maxY) maxY = p[i+1]
      if (p[i+2] < minZ) minZ = p[i+2]; if (p[i+2] > maxZ) maxZ = p[i+2]
    }
  }
  const H = maxY - minY, headH = H * 0.16, headBot = maxY - headH
  const loFaceBand = [headBot + headH * 0.05, headBot + headH * 0.55]  // jaw/mouth/chin
  const eyeBand    = [headBot + headH * 0.55, headBot + headH * 0.82]  // eyes/lids
  const cz = (minZ + maxZ) / 2
  log('body bbox Y', minY.toFixed(3), maxY.toFixed(3), '| head band', headBot.toFixed(3), maxY.toFixed(3))

  // Score morphs by downward (−Y) displacement in the mouth band (jaw openers) and
  // separately in the eye band (eyelid closers = blink), plus overall mouth motion.
  const nTargets = bodyMesh.listPrimitives()[0].listTargets().length
  const downScore = new Float64Array(nTargets)   // jaw / mouth-open
  const magScore  = new Float64Array(nTargets)   // overall mouth-region motion (lip shapes)
  const eyeScore  = new Float64Array(nTargets)   // eyelid down = blink
  let frontZAccum = 0, frontZCount = 0           // for facing detection (nose region)
  for (const prim of bodyMesh.listPrimitives()) {
    const base = prim.getAttribute('POSITION').getArray()
    const targets = prim.listTargets()
    for (let v = 0; v < base.length / 3; v++) {
      const by = base[v*3+1]
      const inMouth = by >= loFaceBand[0] && by <= loFaceBand[1]
      const inEye   = by >= eyeBand[0]   && by <= eyeBand[1]
      if (!inMouth && !inEye) continue
      if (inMouth && Math.abs(base[v*3] - (minX+maxX)/2) < (maxX-minX)*0.06) { frontZAccum += base[v*3+2]; frontZCount++ }
      for (let m = 0; m < nTargets; m++) {
        const d = targets[m].getAttribute('POSITION')?.getArray()
        if (!d) continue
        const dy = d[v*3+1], dx = d[v*3], dz = d[v*3+2]
        if (inMouth) {
          if (dy < 0) downScore[m] += -dy
          magScore[m] += Math.sqrt(dx*dx + dy*dy + dz*dz)
        } else if (dy < 0) {
          eyeScore[m] += -dy
        }
      }
    }
  }
  const byDown = Array.from(downScore, (s,i)=>[s,i]).sort((a,b)=>b[0]-a[0])
  const byMag  = Array.from(magScore,  (s,i)=>[s,i]).sort((a,b)=>b[0]-a[0])
  const byEye  = Array.from(eyeScore,  (s,i)=>[s,i]).sort((a,b)=>b[0]-a[0])
  const keep = new Set()
  byDown.slice(0,4).forEach(([s,i])=>{ if(s>0) keep.add(i) })   // jaw openers
  byEye.slice(0,2).forEach(([s,i])=>{ if(s>0) keep.add(i) })    // eyelid closers (blink)
  for (const [s,i] of byMag) { if (keep.size >= KEEP_MORPHS) break; if (s>0) keep.add(i) }
  const keepIdx = [...keep].sort((a,b)=>a-b)
  log('jawOpen src idx =', byDown[0][1], '| blink src idx =', byEye[0][1],
      '| keeping morph indices', keepIdx.join(','))

  // Facing: nose should point +Z. If the central lower-face sits behind head-center, flip 180° about Y.
  const noseZ = frontZCount ? frontZAccum / frontZCount : cz
  const facesNegZ = noseZ < cz
  log('nose meanZ', noseZ.toFixed(3), 'headCenterZ', cz.toFixed(3), '→ faces', facesNegZ ? '-Z (will flip)' : '+Z')

  // ── 4. Prune morph targets to the keep set across all body primitives; drop all
  //       morphs on every other mesh. ──
  for (const mesh of root.listMeshes()) {
    const isBody = mesh === bodyMesh
    for (const prim of mesh.listPrimitives()) {
      prim.listTargets().forEach((t, i) => {
        if (isBody && keep.has(i)) return
        prim.removeTarget(t); t.dispose()
      })
    }
    mesh.setWeights(new Array(isBody ? keepIdx.length : 0).fill(0))
    const extras = mesh.getExtras() || {}
    if (extras.targetNames) extras.targetNames = isBody ? keepIdx.map(String) : []
    mesh.setExtras(extras)
  }

  // ── 5. Strip skins, animations, textures (all irrelevant to a depth render). ──
  for (const node of root.listNodes()) node.setSkin(null)
  root.listSkins().forEach(s => s.dispose())
  root.listAnimations().forEach(a => a.dispose())
  root.listTextures().forEach(t => t.dispose())

  // ── 6. Drop heavy non-essential vertex attributes (keep POSITION; NORMAL kept
  //       through simplify for quality, dropped after). ──
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives())
      for (const a of ['TEXCOORD_0','TEXCOORD_1','COLOR_0','JOINTS_0','WEIGHTS_0','TANGENT'])
        prim.setAttribute(a, null)

  // ── 7. Flip facing if needed (rotate 180° about Y by negating X and Z on base
  //       positions AND morph deltas). ──
  if (facesNegZ) {
    for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
      const flip = (acc) => { if(!acc) return; const a = acc.getArray(); for (let i=0;i<a.length;i+=3){ a[i]=-a[i]; a[i+2]=-a[i+2] } acc.setArray(a) }
      flip(prim.getAttribute('POSITION'))
      flip(prim.getAttribute('NORMAL'))
      for (const t of prim.listTargets()) flip(t.getAttribute('POSITION'))
    }
  }

  // ── 7b. Explicit accessor GC. prune() reliably fails to collect detached
  //        morph-target / nulled-NORMAL accessors here, so we compute the exact
  //        set still referenced by a kept primitive and dispose everything else. ──
  const keepAcc = new Set()
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) {
      prim.listAttributes().forEach(a => keepAcc.add(a))
      const idx = prim.getIndices(); if (idx) keepAcc.add(idx)
      for (const t of prim.listTargets()) t.listAttributes().forEach(a => keepAcc.add(a))
    }
  let disposed = 0
  for (const a of root.listAccessors()) if (!keepAcc.has(a)) { a.dispose(); disposed++ }
  log('GC: disposed', disposed, 'orphan accessors →', root.listAccessors().length, 'remain')

  // ── 8. Weld + decimate. Keep generous FACE detail (the head is only ~16% of
  //       the body's verts, so we decimate gently); morph targets are preserved. ──
  log('weld + simplify…')
  await doc.transform(
    weld({ tolerance: 1e-5 }),
    // Keep the face dense so lips/eyes/nostrils survive into the depth map. (Hair is
    // over-resolved as a side effect, but the file stays small.)
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.9, error: 0.0006, lockBorder: false }),
  )

  // Drop NORMAL now (MeshDepthMaterial doesn't use it).
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives())
      prim.setAttribute('NORMAL', null)

  // prune() misses detached morph-target accessors — sweep any accessor whose only
  // remaining parent is the Root (i.e. unreferenced) before writing.
  await doc.transform(prune(), dedup())
  let swept = 0
  for (const acc of root.listAccessors()) {
    if (acc.listParents().every(p => p.propertyType === 'Root')) { acc.dispose(); swept++ }
  }
  log('swept orphaned accessors', swept)
  await doc.transform(prune(), dedup())

  // ── 9. Draco-compress geometry. ──
  doc.createExtension(KHRDracoMeshCompression).setRequired(true)
    .setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER })

  log('writing', OUT, '…')
  await io.write(OUT, doc)
  const size = fs.statSync(OUT).size
  log('DONE →', OUT, (size/1048576).toFixed(2) + 'MB')

  // ── 10. Reload + verify. ──
  const v = await io.read(OUT)
  for (const mesh of v.getRoot().listMeshes()) {
    const node = [...v.getRoot().listNodes()].find(n => n.getMesh() === mesh)
    let verts = 0, morphs = 0
    for (const prim of mesh.listPrimitives()) { verts += prim.getAttribute('POSITION').getCount(); morphs = prim.listTargets().length }
    log('verify mesh', (node?.getName()||mesh.getName()||'?').padEnd(16), 'verts', verts, 'morphs', morphs)
  }
  log('SUMMARY size', (size/1048576).toFixed(2)+'MB', '| kept morph indices', keepIdx.join(','),
      '| jawOpen(original idx)', byDown[0][1], '| facing +Z')
}

main().catch(e => { console.error('[opt] FAILED:', e); process.exit(1) })
