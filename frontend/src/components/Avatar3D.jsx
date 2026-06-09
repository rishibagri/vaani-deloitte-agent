import { Suspense, Component, useState, useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, Environment, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { VISEMES } from '../lib/wawa'
import { buildRig } from '../lib/avatarRig'
import { loadClipSet, makeAnimator } from '../lib/avatarAnimations'
import { buildSitClip, buildStandUpClip } from '../lib/proceduralClips'

// Local default avatar so a tenant with no avatar_3d_url still works fully offline
// (the Ready Player Me CDN is not always reachable, and a hard external dependency
// is wrong for a multi-tenant on-prem demo). Any tenant can override via config.
const DEFAULT_GLB = '/avatar.glb'

// The Deloitte office, built in Blender and exported to GLB (Draco-compressed).
// It is authored in real-world metres in glTF/Y-up space, so the avatar marks
// below live in the SAME coordinate space and she stands on the actual floor.
const OFFICE_ROOM = '/office_room.glb'

// External animation clips (Mixamo GLB exports) mapped to presence states. Drop
// files at frontend/public/anims/<state>.glb — ANY subset works; a missing clip
// falls back to the procedural stand-in for that state. Fully model-agnostic:
// clips are retargeted onto whatever humanoid avatar GLB is loaded.
const CLIP_URLS = {
  idle:    '/anims/idle.glb',
  sit:     '/anims/sit.glb',
  standUp: '/anims/standUp.glb',
  walk:    '/anims/walk.glb',
  talk:    '/anims/talk.glb',
}

/* ──────────────────────────────────────────────────────────────────────────
   PHYSICAL STAGING — every mark is a real point in the room GLB (metres, Y-up,
   floor at y=0). These are *defaults / fallbacks only*. The actual obstacle
   geometry (desk, credenza, chairs, plants…) is discovered from the GLB scene
   graph at runtime (see buildColliders) so navigation stays correct even if the
   furniture is re-exported in a different layout.

     • Floor      x[0..8]  z[-7..0]
     • Desk box   x[2.6..4.6]  z[-5.2..-3.2]  top y=0.78   ← occluder + obstacle
     • Task chair centre (3.24, -3.99)                     ← she sits HERE
     • Monitor    (3.58, -4.55)                            ← faces this seated
     • Visitor    = camera, front-right corner
─────────────────────────────────────────────────────────────────────────── */
const SEAT     = new THREE.Vector3(3.24, 0, -3.99)
const MONITOR  = new THREE.Vector3(3.58, 0, -4.55)
const VISITOR  = new THREE.Vector3(6.9, 1.4, -0.35)
const PRESENT  = new THREE.Vector3(4.55, 0, -1.35) // greeting mark, open carpet (fallback)

// Floor extent of the room (fallback if it can't be measured from the GLB).
const FLOOR_FALLBACK = { minX: 0, maxX: 8, minZ: -7, maxZ: 0 }

// Desk-ish fallback footprint — only used if collider discovery finds nothing.
const DESK_FALLBACK = new THREE.Box3(
  new THREE.Vector3(2.6, 0, -5.2),
  new THREE.Vector3(4.6, 1.2, -3.2),
)

const AVATAR_RADIUS = 0.28   // inflate every collider by this (metres)
const SEATED_SINK = -0.46    // drop hips to seat height; desk hides the rest
const STAND_SECONDS = 0.95
const STEPOUT_SECONDS = 0.9  // roll back / step out of the desk footprint
const WALK_SPEED = 0.75      // metres / second along the path (calmer pace; reduces
                             // foot-skate against the in-place mocap walk cadence)
const GRID_CELL = 0.25       // A* grid resolution (metres)
const TARGET_HEIGHT = 1.65   // normalize ANY swapped-in avatar to this standing height (m)

// Model forward-axis correction. This RPM/Avaturn rig faces +Z, so the yaw math is
// already correct and 0 makes her face the camera at the greeting mark / the monitor
// while seated. (π was tried and made her face AWAY — only flip to Math.PI if a
// swapped-in model is authored facing −Z.) Single knob → seat, walk and greeting.
const FACE_OFFSET = 0

// ── Eye-life tuning (de-creep) ─────────────────────────────────────────────
// A frozen stare reads as creepy; we keep her blinking even mid-speech (just a
// touch less often) and add slow, small gaze saccades that settle to centre
// while listening (attentive). Amplitudes stay small so she never goes googly.
const BLINK_GAP_IDLE   = [2.4, 6.0]   // [min, +random] seconds between blinks at rest
const BLINK_GAP_SPEAK  = [3.6, 5.0]   // a bit rarer while speaking (but NOT frozen)
const GAZE_AMP         = 0.22         // max per-eye look-morph weight (≤ ~0.25)
const GAZE_SACCADE_GAP = [1.1, 2.4]   // [min, +random] seconds between gaze shifts

// Yaw so the model's +Z (its forward) points along world direction (dx,dz).
const yawTo = (dx, dz) => Math.atan2(dx, dz)
const SEAT_YAW = yawTo(MONITOR.x - SEAT.x, MONITOR.z - SEAT.z)

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

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

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/* ──────────────────────────────────────────────────────────────────────────
   COLLISION — runtime collider extraction + 2D A* navigation.

   We can't rely on furniture node names (the GLB will be re-exported), so we
   classify meshes structurally: anything that isn't the floor/ceiling/walls/
   window-glass/skyline becomes a solid obstacle. A mesh is treated as
   "architecture" (skipped) when its footprint is huge OR it's a thin slab that
   spans most of the room (a wall/floor/ceiling plane). Everything else — desk,
   credenza, armchairs, plants, the task chair — becomes an inflated AABB the
   avatar must route around.
─────────────────────────────────────────────────────────────────────────── */

const NAME_SKIP = /(floor|ground|carpet|rug|ceil|roof|wall|window|glass|glazing|pane|sky|backdrop|environment|light|sun|lamp)/i

function buildColliders(scene) {
  // 1) Whole-room bounds → floor extent.
  const roomBox = new THREE.Box3().setFromObject(scene)
  const floor = {
    minX: roomBox.min.x, maxX: roomBox.max.x,
    minZ: roomBox.min.z, maxZ: roomBox.max.z,
  }
  const roomW = floor.maxX - floor.minX
  const roomD = floor.maxZ - floor.minZ
  const roomFootprint = roomW * roomD

  const colliders = []
  const tmp = new THREE.Box3()
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    if (NAME_SKIP.test(o.name || '')) return
    tmp.setFromObject(o)
    if (tmp.isEmpty()) return
    const sx = tmp.max.x - tmp.min.x
    const sy = tmp.max.y - tmp.min.y
    const sz = tmp.max.z - tmp.min.z
    if (!isFinite(sx) || !isFinite(sy) || !isFinite(sz)) return

    const footprint = sx * sz
    // Skip room shell: a mesh whose footprint covers most of the room is a
    // floor/ceiling/large wall plane; a thin tall slab spanning a full wall is
    // a wall; tiny slivers are decoration we don't need to avoid.
    const coversRoom = footprint > roomFootprint * 0.55
    const isFloorOrCeil = sy < 0.12 && footprint > roomFootprint * 0.25
    const isWallSlab =
      (sx < 0.25 && sz > roomD * 0.6) || (sz < 0.25 && sx > roomW * 0.6)
    const negligible = footprint < 0.04 || sy < 0.05
    if (coversRoom || isFloorOrCeil || isWallSlab || negligible) return

    // Solid obstacle → inflate by avatar radius (XZ only).
    colliders.push(new THREE.Box3(
      new THREE.Vector3(tmp.min.x - AVATAR_RADIUS, 0, tmp.min.z - AVATAR_RADIUS),
      new THREE.Vector3(tmp.max.x + AVATAR_RADIUS, 5, tmp.max.z + AVATAR_RADIUS),
    ))
  })

  // Safety net: if discovery produced nothing solid (e.g. an unusual export),
  // fall back to the known desk footprint so she still routes around it.
  if (colliders.length === 0) {
    const d = DESK_FALLBACK.clone()
    colliders.push(new THREE.Box3(
      new THREE.Vector3(d.min.x - AVATAR_RADIUS, 0, d.min.z - AVATAR_RADIUS),
      new THREE.Vector3(d.max.x + AVATAR_RADIUS, 5, d.max.z + AVATAR_RADIUS),
    ))
  }
  return { floor, colliders }
}

// Point-in-any-collider test (XZ plane).
function blocked(colliders, x, z) {
  for (const c of colliders) {
    if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z) return true
  }
  return false
}

// Does straight segment a→b cross any collider? Coarse sampling is plenty here.
function segmentBlocked(colliders, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az)
  const steps = Math.max(2, Math.ceil(d / (GRID_CELL * 0.5)))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (blocked(colliders, ax + (bx - ax) * t, az + (bz - az) * t)) return true
  }
  return false
}

// Nudge a target point out of any collider it lands inside (push to nearest edge).
function pushOut(colliders, x, z) {
  for (let iter = 0; iter < 8; iter++) {
    let inside = null
    for (const c of colliders) {
      if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z) { inside = c; break }
    }
    if (!inside) break
    const dl = x - inside.min.x, dr = inside.max.x - x
    const db = z - inside.min.z, dt = inside.max.z - z
    const m = Math.min(dl, dr, db, dt)
    if (m === dl) x = inside.min.x - 0.02
    else if (m === dr) x = inside.max.x + 0.02
    else if (m === db) z = inside.min.z - 0.02
    else z = inside.max.z + 0.02
  }
  return [x, z]
}

/* A* over a coarse grid spanning the floor, routing around inflated AABBs.
   Returns an array of THREE.Vector3 (y=0) including start & goal, with collinear
   waypoints stripped (string-pulling) so motion stays smooth. */
function findPath(floor, colliders, start, goal) {
  const cell = GRID_CELL
  const cols = Math.max(2, Math.floor((floor.maxX - floor.minX) / cell))
  const rows = Math.max(2, Math.floor((floor.maxZ - floor.minZ) / cell))
  const toX = (c) => floor.minX + (c + 0.5) * cell
  const toZ = (r) => floor.minZ + (r + 0.5) * cell
  const toCol = (x) => THREE.MathUtils.clamp(Math.floor((x - floor.minX) / cell), 0, cols - 1)
  const toRow = (z) => THREE.MathUtils.clamp(Math.floor((z - floor.minZ) / cell), 0, rows - 1)
  const free = (c, r) => !blocked(colliders, toX(c), toZ(r))

  const sC = toCol(start.x), sR = toRow(start.z)
  const gC = toCol(goal.x),  gR = toRow(goal.z)
  const idx = (c, r) => r * cols + c
  const h = (c, r) => Math.hypot(c - gC, r - gR)
  // Treat the start/goal cells as walkable even if their snapped centre grazes a
  // collider — the endpoints were already pushed onto open floor by the caller.
  const walkable = (c, r) =>
    free(c, r) || (c === sC && r === sR) || (c === gC && r === gR)

  const open = [{ c: sC, r: sR, g: 0, f: h(sC, sR) }]
  const gScore = new Map([[idx(sC, sR), 0]])
  const came = new Map()
  const closed = new Set()
  const NEI = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
  let found = false

  while (open.length) {
    let bi = 0
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i
    const cur = open.splice(bi, 1)[0]
    const cid = idx(cur.c, cur.r)
    if (cur.c === gC && cur.r === gR) { found = true; break }
    if (closed.has(cid)) continue
    closed.add(cid)
    for (const [dc, dr] of NEI) {
      const nc = cur.c + dc, nr = cur.r + dr
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      if (!walkable(nc, nr)) continue
      // prevent corner-cutting through a diagonal gap between two blockers
      if (dc !== 0 && dr !== 0 && (!free(cur.c + dc, cur.r) || !free(cur.c, cur.r + dr))) continue
      const ng = cur.g + Math.hypot(dc, dr)
      const nid = idx(nc, nr)
      if (closed.has(nid)) continue
      if (ng < (gScore.get(nid) ?? Infinity)) {
        gScore.set(nid, ng)
        came.set(nid, cid)
        open.push({ c: nc, r: nr, g: ng, f: ng + h(nc, nr) })
      }
    }
  }

  // Reconstruct (or fall back to a straight line if no route found).
  const pts = []
  if (found) {
    let cid = idx(gC, gR)
    const chain = [cid]
    while (came.has(cid)) { cid = came.get(cid); chain.push(cid) }
    chain.reverse()
    for (const id of chain) {
      const c = id % cols, r = Math.floor(id / cols)
      pts.push(new THREE.Vector3(toX(c), 0, toZ(r)))
    }
  }
  // Always pin exact start/goal at the ends.
  const path = [start.clone().setY(0), ...pts, goal.clone().setY(0)]

  // String-pull: drop waypoints we can see past (line-of-sight simplification).
  const simplified = [path[0]]
  let anchor = 0
  for (let i = 2; i < path.length; i++) {
    if (segmentBlocked(colliders, path[anchor].x, path[anchor].z, path[i].x, path[i].z)) {
      simplified.push(path[i - 1])
      anchor = i - 1
    }
  }
  simplified.push(path[path.length - 1])
  return simplified
}

/* ──────────────────────────────────────────────────────────────────────────
   The office room — real 3D geometry. Rendered in the SAME scene as the avatar
   so the desk/credenza occlude her via the depth buffer (true occlusion).
   On load we extract navigation colliders and hand them up via onColliders().
─────────────────────────────────────────────────────────────────────────── */
function OfficeRoom({ onColliders, roomUrl }) {
  // roomUrl is an optional per-tenant override (multi-tenant); falls back to the
  // bundled Deloitte room so this never tries to load a missing asset. A bad tenant
  // URL is further contained by the ErrorCatcher wrapped around this in SceneContents.
  const { scene } = useGLTF(roomUrl || OFFICE_ROOM, true) // 2nd arg = use Draco decoder
  const logoTexture = useTexture('/deloitte_logo.png')

  const room = useMemo(() => {
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false
        o.receiveShadow = true
        o.frustumCulled = false

        if (o.name === 'LogoCircle') {
          logoTexture.flipY = false
          o.material = new THREE.MeshStandardMaterial({
            map: logoTexture,
            transparent: true,
            roughness: 0.3,
            metalness: 0.1
          })
        }
      }
    })
    return scene
  }, [scene, logoTexture])

  useEffect(() => {
    if (!onColliders) return
    try { onColliders(buildColliders(room)) }
    catch (e) { console.warn('[Avatar3D] collider build failed:', e?.message || e) }
  }, [room, onColliders])

  return <primitive object={room} />
}

/* ──────────────────────────────────────────────────────────────────────────
   Full-body avatar, physically grounded in the room. Loads the Avaturn/RPM GLB,
   plays the embedded idle clip, and runs the PRESENCE state machine:

     seated → standing → stepout → walking → present

   She starts SEATED in the real task chair (lower body occluded by the real
   desk). When `trigger` flips true she stands, ROLLS BACK out of the desk
   footprint (toward +z, the open front) so she never rises through the desk
   top, then walks a COLLISION-AWARE A* path to the greeting mark, turns to face
   the visitor, and calls onArrived() → which the app turns into an
   `avatar_arrived` WS message.

   sit/stand/walk are PROCEDURAL stand-ins (root translation + facing + stride
   bob). Drop real retargeted clips into clipFor and they take over.
─────────────────────────────────────────────────────────────────────────── */
function AvatarFigure({ appState, getLevel, getLipsync, url, trigger, onArrived, nav }) {
  const { scene, animations } = useGLTF(url)
  const [visible, setVisible] = useState(false)
  const rootRef = useRef()   // walk group — translated + yawed through the room
  const innerRef = useRef()  // holds the model; carries the sit-sink + stride bob

  // Model-agnostic rig + external-clip animator (Mixamo retargeting). When a clip
  // for the current state exists it drives the body; otherwise the procedural
  // stand-in (sit-sink / stride bob) takes over for that state.
  const rig = useMemo(() => { try { return scene ? buildRig(scene) : null } catch { return null } }, [scene])
  const mixer = useMemo(() => (scene ? new THREE.AnimationMixer(scene) : null), [scene])
  const animatorRef = useRef(null)
  const clipStateRef = useRef(null)
  // Which of sit/standUp are PROCEDURAL (bone-fold only, no hips-down track).
  // Procedural clips need `sink` kept (we lower the pelvis to seat height); a real
  // mocap GLB carries its own hips translation, so sink is dropped for those.
  const proceduralSeatRef = useRef({ sit: false, standUp: false })

  const openRef       = useRef(0)
  const blinkNextRef  = useRef(2)
  const blinkStartRef = useRef(-10)
  const yawRef        = useRef(SEAT_YAW)
  const headTiltRef   = useRef(0)   // additive attentive tilt layered over mocap

  // Living gaze (de-creep): smoothed current look direction + a randomly-retargeted
  // goal, so the eyes drift in slow small saccades instead of staring dead-ahead.
  const gazeRef       = useRef({ x: 0, y: 0 })          // smoothed (applied) gaze
  const gazeTargetRef = useRef({ x: 0, y: 0 })          // current saccade goal
  const gazeNextRef   = useRef(0)                       // next saccade time

  const phaseRef      = useRef('seated')
  const phaseStartRef = useRef(0)
  const arrivedSentRef = useRef(false)

  // Resolved at the moment she stands (so it reflects the *current* GLB layout).
  const stepOutRef = useRef(null)   // {from, to} — back out of the desk footprint
  const walkRef    = useRef(null)   // {pts, seg, total} — collision-aware A* walk
  const presentRef = useRef(PRESENT.clone())
  const presentYawRef = useRef(yawTo(VISITOR.x - PRESENT.x, VISITOR.z - PRESENT.z))

  const morphMeshes = useMemo(() => {
    const list = []
    scene.traverse((o) => {
      if (o.isMesh && o.morphTargetDictionary && o.morphTargetInfluences) list.push(o)
    })
    return list
  }, [scene])

  // Load external Mixamo clips, retarget onto this rig, build the animator. Any
  // clip the avatar GLB itself ships with becomes the default idle fallback.
  useEffect(() => {
    if (!mixer || !rig) return
    let alive = true
    loadClipSet(CLIP_URLS).then(({ clips }) => {
      if (!alive) return
      const merged = { ...clips }
      if (!merged.idle && animations && animations[0]) merged.idle = animations[0]

      // Procedural sit / standUp — generated on THIS rig's canonical bones so the
      // SAME mixer drives them and crossfades work. Only fill keys a REAL clip
      // didn't already provide: if /anims/sit.glb or /anims/standUp.glb exist they
      // were loaded into `clips` above and are PREFERRED (we never overwrite them).
      try {
        if (!merged.sit) { const c = buildSitClip(rig); if (c) { merged.sit = c; proceduralSeatRef.current.sit = true } }
        if (!merged.standUp) { const c = buildStandUpClip(rig); if (c) { merged.standUp = c; proceduralSeatRef.current.standUp = true } }
      } catch (e) { console.warn('[Avatar3D] procedural seated clips failed:', e?.message || e) }

      // walk: strip baked horizontal root motion — the A* nav path drives travel.
      try { animatorRef.current = makeAnimator(mixer, rig, merged, { walk: { stripRootXZ: true } }) }
      catch (e) { console.warn('[Avatar3D] animator init failed:', e?.message || e) }
    }).catch(() => {})
    return () => { alive = false; mixer.stopAllAction?.() }
  }, [mixer, rig, animations])

  // Normalize ANY swapped-in avatar to a consistent standing height, then centre
  // it in x/z and drop its FEET to y=0 (the room floor). The walk group owns world
  // placement. Cast shadows so she grounds on the floor.
  //
  // Avatar-swap robustness: a model exported at a different unit scale (cm vs m)
  // or simply taller/shorter would otherwise stand in/through the desk or float.
  // We measure the raw bbox height, rescale uniformly to TARGET_HEIGHT, then
  // RE-measure to re-ground feet & centre. SEATED_SINK is authored in the same
  // metre space as TARGET_HEIGHT, so after normalization it reads correctly for
  // any avatar (her head lands at desk-working height regardless of source scale).
  useEffect(() => {
    if (!scene) return
    scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true } })

    // 1) Correct only GENUINELY mis-scaled avatars (cm exports, tiny/huge rigs). A
    //    normal ~1.2–2.4 m human rig is left at its native scale, so the default
    //    avatar renders exactly as authored (no surprise resize on the demo model);
    //    the factor is clamped so a bad measurement can never blow her up.
    const rawBox = new THREE.Box3().setFromObject(scene)
    const rawHeight = rawBox.max.y - rawBox.min.y
    if (isFinite(rawHeight) && rawHeight > 0.05 && (rawHeight < 1.2 || rawHeight > 2.4)) {
      const s = THREE.MathUtils.clamp(TARGET_HEIGHT / rawHeight, 0.05, 20)
      scene.scale.setScalar(s)
      scene.updateWorldMatrix(true, true)
    }

    // 2) RE-measure after scaling, then centre x/z and drop feet to y=0.
    const box = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3(); box.getCenter(center)
    scene.position.set(-center.x, -box.min.y, -center.z)

    const timer = setTimeout(() => setVisible(true), 250) // avoid bind-pose flash
    return () => clearTimeout(timer)
  }, [scene])

  // Start seated in the chair, facing the monitor.
  useEffect(() => {
    if (rootRef.current) {
      rootRef.current.position.copy(SEAT)
      rootRef.current.rotation.y = SEAT_YAW + FACE_OFFSET
    }
  }, [])

  // Bones for procedural secondary motion (sway / nod / search).
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

  // Plan the whole exit (step-out + A* walk + greeting mark) using the LIVE
  // colliders discovered from the GLB. Called once, when she stands.
  function planRoute() {
    const cols = (nav.current && nav.current.colliders) || []
    const floor = (nav.current && nav.current.floor) || FLOOR_FALLBACK

    // 1) STEP-OUT: leave the desk footprint via the open front (+z). Find the
    //    collider she's sitting inside/behind (if any) and clear its +z edge.
    let backZ = SEAT.z
    for (const c of cols) {
      if (SEAT.x >= c.min.x && SEAT.x <= c.max.x && SEAT.z >= c.min.z - 0.4 && SEAT.z <= c.max.z + 0.4) {
        backZ = Math.max(backZ, c.max.z + 0.15) // step to just past the front edge
      }
    }
    // Fallback if no collider overlaps the seat: still nudge forward off the desk.
    if (backZ <= SEAT.z + 0.05) backZ = SEAT.z + 0.7
    backZ = Math.min(backZ, floor.maxZ - 0.3)
    let [sx, sz] = pushOut(cols, SEAT.x, backZ)
    const stepTo = new THREE.Vector3(sx, 0, sz)

    // 2) GREETING MARK: prefer the authored PRESENT spot; if the live layout put
    //    something there, push it onto open floor and keep it inside the room.
    let [px, pz] = pushOut(cols, PRESENT.x, PRESENT.z)
    px = THREE.MathUtils.clamp(px, floor.minX + 0.4, floor.maxX - 0.4)
    pz = THREE.MathUtils.clamp(pz, floor.minZ + 0.4, floor.maxZ - 0.4)
    const present = new THREE.Vector3(px, 0, pz)
    presentRef.current = present
    presentYawRef.current = yawTo(VISITOR.x - present.x, VISITOR.z - present.z)

    // 3) A* from the step-out point to the greeting mark, around all colliders.
    const pts = findPath(floor, cols, stepTo, present)
    const seg = []
    let total = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const len = pts[i].distanceTo(pts[i + 1])
      seg.push({ a: pts[i], b: pts[i + 1], len, start: total })
      total += len
    }
    stepOutRef.current = { from: SEAT.clone(), to: stepTo }
    walkRef.current = { pts, seg, total: Math.max(total, 0.0001) }
  }

  // Kick the FSM when the identity trigger arrives.
  useEffect(() => {
    if (trigger && phaseRef.current === 'seated') {
      phaseRef.current = 'standing'
      phaseStartRef.current = -1 // stamped on next frame
    }
  }, [trigger])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    if (phaseStartRef.current === -1) phaseStartRef.current = t
    const phase = phaseRef.current
    const since = t - phaseStartRef.current

    let bob = 0       // vertical stride bob on the inner group
    let sink = 0      // how far she's lowered into the chair
    let targetYaw = yawRef.current

    if (rootRef.current) {
      if (phase === 'seated') {
        rootRef.current.position.copy(SEAT)
        sink = SEATED_SINK
        targetYaw = SEAT_YAW
      } else if (phase === 'standing') {
        rootRef.current.position.copy(SEAT)
        const p = THREE.MathUtils.clamp(since / STAND_SECONDS, 0, 1)
        sink = SEATED_SINK * (1 - easeInOut(p))   // rise out of the chair
        targetYaw = SEAT_YAW
        if (p >= 1) {
          // Resolve the live route the moment she's upright, then step out.
          if (!walkRef.current) planRoute()
          phaseRef.current = 'stepout'
          phaseStartRef.current = t
        }
      } else if (phase === 'stepout') {
        // Roll back / step OUT of the desk footprint (toward the open front)
        // BEFORE walking — she must not traverse the desk top.
        const so = stepOutRef.current
        const p = THREE.MathUtils.clamp(since / STEPOUT_SECONDS, 0, 1)
        if (so) {
          rootRef.current.position.lerpVectors(so.from, so.to, easeInOut(p))
          // face the way she's backing toward (the open front)
          targetYaw = yawTo(so.to.x - so.from.x, so.to.z - so.from.z)
        }
        bob = prefersReducedMotion ? 0 : Math.abs(Math.sin(p * Math.PI * 2)) * 0.012
        if (p >= 1) { phaseRef.current = 'walking'; phaseStartRef.current = t }
      } else if (phase === 'walking') {
        const w = walkRef.current
        // Remove the 1.2s floor; for short paths, move faster to match the gait.
        const walkSecs = Math.max(0.4, w.total / WALK_SPEED)
        const p = THREE.MathUtils.clamp(since / walkSecs, 0, 1)
        // More linear walk for short segments, subtle ease only for longer ones.
        const ease = w.total > 1 ? easeInOut(p) : p
        const dist = ease * w.total
        let seg = w.seg[w.seg.length - 1] || { a: w.pts[0], b: w.pts[0], len: 0, start: 0 }
        for (const s of w.seg) { if (dist <= s.start + s.len) { seg = s; break } }
        const local = seg.len > 0 ? THREE.MathUtils.clamp((dist - seg.start) / seg.len, 0, 1) : 1
        rootRef.current.position.lerpVectors(seg.a, seg.b, local)
        // face the direction of travel
        const dx = seg.b.x - seg.a.x, dz = seg.b.z - seg.a.z
        if (Math.hypot(dx, dz) > 1e-4) targetYaw = yawTo(dx, dz)
        // stride bob, tapering at the very start/end of the whole walk
        bob = prefersReducedMotion ? 0
          : Math.abs(Math.sin(p * Math.PI * 9)) * 0.03 * (1 - Math.abs(0.5 - p) * 1.4)
        // If we are basically there, snap and transition.
        if (p >= 1) {
          phaseRef.current = 'present'
          phaseStartRef.current = t
          rootRef.current.position.copy(presentRef.current)
        }
      } else { // present
        rootRef.current.position.copy(presentRef.current)
        targetYaw = presentYawRef.current
        if (!arrivedSentRef.current) {
          arrivedSentRef.current = true
          onArrived && onArrived()   // → fires avatar_arrived WS, backend greets
        }
      }

      // smooth turn toward the target heading
      yawRef.current = lerpAngle(yawRef.current, targetYaw, Math.min(1, delta * 6))
      // FACE_OFFSET corrects the model's exported forward axis (RPM/Avaturn face
      // −Z) so she faces the way the yaw math intends (monitor when seated,
      // travel dir when walking, visitor when present) instead of showing her back.
      rootRef.current.rotation.y = yawRef.current + FACE_OFFSET
      // slight forward lean while walking
      const lean = phase === 'walking' ? 0.05 : 0
      rootRef.current.rotation.x = THREE.MathUtils.lerp(rootRef.current.rotation.x, lean, 0.08)
    }
    // ── External-clip playback (Mixamo) with procedural fallback ──
    // Map the current FSM phase (and talking state) to a clip; if that clip
    // exists it drives the body and we drop the conflicting procedural offset.
    const A = animatorRef.current
    if (A) {
      let want = 'idle'
      if (phase === 'seated') want = 'sit'
      else if (phase === 'standing') want = 'standUp'
      else if (phase === 'stepout' || phase === 'walking') want = 'walk'
      else want = (appState === 'speaking') ? 'talk' : 'idle'
      const eff = A.has(want) ? want : (A.has('idle') ? 'idle' : null)
      if (eff && eff !== clipStateRef.current) {
        A.play(eff, { fade: 0.25, loop: eff !== 'standUp', clampWhenFinished: eff === 'standUp' })
        clipStateRef.current = eff
      }
      A.update(delta)
      // A real mocap sit/standUp GLB carries its own hips translation → drop the
      // procedural sink. A PROCEDURAL clip only folds the legs, so we KEEP the
      // sink (pelvis lowered to seat height) and ride it up during standUp.
      if (phase === 'seated' && A.has('sit') && !proceduralSeatRef.current.sit) sink = 0
      if (phase === 'standing' && A.has('standUp') && !proceduralSeatRef.current.standUp) sink = 0
      if ((phase === 'stepout' || phase === 'walking') && A.has('walk')) bob = 0
    }
    if (innerRef.current) innerRef.current.position.y = sink + bob

    const speaking = appState === 'speaking'
    const thinking = appState === 'thinking'
    const listening = appState === 'listening'

    // ── Mouth openness — calm gain. ──
    const rawOpen = (speaking && getLevel)
      ? Math.pow(THREE.MathUtils.clamp(getLevel() * 2.2, 0, 0.95), 1.15) : 0
    openRef.current += (rawOpen - openRef.current) * Math.min(1, delta * 22)
    const openness = openRef.current

    const lip = (speaking && getLipsync) ? getLipsync() : null
    const scores = lip?.scores || {}

    // ── Secondary head motion ──
    // A mocap clip already animates the neck/head/spine, so the old procedural
    // sway would fight it (it lerps the bone back toward bind every frame). When
    // a clip is active we instead layer only a subtle *additive* attentive tilt
    // while listening, applied AFTER the mixer wrote the bone (non-accumulating,
    // re-set by the mixer each frame). With no clip we keep the full procedural
    // fallback so a clip-less avatar still feels alive.
    const clipsActive = !!(A && clipStateRef.current)
    if (clipsActive) {
      if (bones.neck) {
        const tgt = listening ? 0.06 : 0
        headTiltRef.current += (tgt - headTiltRef.current) * Math.min(1, delta * 4)
        bones.neck.rotation.z += headTiltRef.current
      }
    } else if (bones.neck || bones.head) {
      const swayX = Math.sin(t * 0.5) * 0.02
      const swayY = Math.cos(t * 0.4) * 0.02
      const tilt = listening ? 0.05 : 0
      const nod = speaking ? Math.sin(t * 6) * (openRef.current * 0.04) : 0
      const search = thinking ? Math.sin(t * 1.5) * 0.03 : 0
      if (bones.neck && bones.initials.neck) {
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

    // Blink — keep blinking even while speaking (a frozen stare is creepy); just
    // a touch less frequent mid-speech. Each blink is a quick 0.18s sine pulse.
    if (!prefersReducedMotion && t > blinkNextRef.current) {
      blinkStartRef.current = t
      const gap = speaking ? BLINK_GAP_SPEAK : BLINK_GAP_IDLE
      blinkNextRef.current = t + gap[0] + Math.random() * gap[1]
    }
    const bt = t - blinkStartRef.current
    const blink = (!prefersReducedMotion && bt < 0.18) ? Math.sin((bt / 0.18) * Math.PI) : 0

    // Living gaze (de-creep) — slow, small saccades that settle toward the
    // VISITOR (attentive) while speaking or listening.
    if (!prefersReducedMotion && t > gazeNextRef.current) {
      const gap = GAZE_SACCADE_GAP
      gazeNextRef.current = t + gap[0] + Math.random() * gap[1]
      const attentive = listening || speaking
      const reach = attentive ? 0.35 : 1.0
      
      // Calculate bias toward visitor's actual eye level if "present"
      let biasX = 0, biasY = 0
      if (phase === 'present' && rootRef.current) {
        const dx = VISITOR.x - rootRef.current.position.x
        const dz = VISITOR.z - rootRef.current.position.z
        const dist = Math.hypot(dx, dz)
        // Vertical bias: visitor eyes (1.4m) vs avatar eyes (~1.65m)
        biasY = THREE.MathUtils.clamp((1.4 - 1.65) / dist, -0.3, 0.3)
      }

      gazeTargetRef.current = {
        x: biasX + (Math.random() * 2 - 1) * GAZE_AMP * reach,
        y: biasY + (Math.random() * 2 - 1) * GAZE_AMP * reach * 0.6,
      }
    }
    // Ease the applied gaze toward its target.
    const gx = gazeRef.current.x + (gazeTargetRef.current.x - gazeRef.current.x) * Math.min(1, delta * 4.5)
    const gy = gazeRef.current.y + (gazeTargetRef.current.y - gazeRef.current.y) * Math.min(1, delta * 4.5)
    gazeRef.current.x = gx
    gazeRef.current.y = gy
    const gazeRightOut = Math.max(0, gx)
    const gazeLeftOut  = Math.max(0, -gx)
    const gazeUp       = Math.max(0, gy)
    const gazeDown     = Math.max(0, -gy)
    
    // ── Lip-sync mouth shape (articulate) ──
    const ppScore = scores[VISEMES.PP] || 0
    const ffScore = scores[VISEMES.FF] || 0
    const closure = THREE.MathUtils.clamp(ppScore * 1.3 + ffScore * 0.8, 0, 1)
    // Base jaw from loudness + dominant viseme weight for better articulation.
    const dominantViseme = Object.values(VISEMES).reduce((m, v) => Math.max(m, scores[v] || 0), 0)
    const jawTarget = speaking
      ? Math.max(0, (openness * 0.55 + dominantViseme * 0.45) * (1 - closure * 0.9))
      : 0

    for (const mesh of morphMeshes) {
      const dict = mesh.morphTargetDictionary
      const inf = mesh.morphTargetInfluences
      const set = (name, target, rate = 0.4) => {
        const idx = dict[name]
        if (idx !== undefined) inf[idx] += (target - inf[idx]) * rate
      }
      // Asymmetric jaw smoothing: fast attack (open quickly), gentle decay (calm
      // close) → snappier consonants without a flapping jaw.
      const ji = dict['jawOpen']
      if (ji !== undefined) {
        const opening = jawTarget > inf[ji]
        inf[ji] += (jawTarget - inf[ji]) * Math.min(1, delta * (opening ? 32 : 18))
      }
      // Per-viseme shaping (snappier above threshold; cleaner below).
      // Removed the 'openness' multiplier so visemes can reach full influence
      // even at moderate volumes, preventing the "mumbling" look.
      Object.values(VISEMES).forEach((visemeName) => {
        const score = scores[VISEMES[visemeName]] || scores[visemeName] || 0
        const weight = (score > 0.25) ? score * 1.1 : score * 0.5
        set(visemeName, speaking ? THREE.MathUtils.clamp(weight, 0, 1.1) : 0, 0.55)
      })
      // Actively press the lips together on bilabial/labiodental closures
      set('mouthClose', speaking ? closure * 0.85 : 0, 0.6)
      set('mouthPucker', speaking ? (scores[VISEMES.U] || 0) * 0.6 : 0, 0.5)
      set('mouthOpen', speaking ? jawTarget * 0.15 : 0, 0.4)

      // Blink — set BOTH the per-eye blink morphs AND 'eyesClosed' (meshes use
      // one or the other; guarded so absent ones are simply skipped).
      set('eyeBlinkLeft', blink, 0.6)
      set('eyeBlinkRight', blink, 0.6)
      set('eyesClosed', blink, 0.6)

      // Living gaze via ARKit eyeLook* morphs (small saccades, settle to centre).
      // Suppress the look-morphs at the peak of a blink so the eyes don't slide
      // while the lids are shut.
      const gazeGate = 1 - blink
      set('eyeLookOutRight', gazeRightOut * gazeGate, 0.5)
      set('eyeLookInLeft',   gazeRightOut * gazeGate, 0.5)
      set('eyeLookOutLeft',  gazeLeftOut * gazeGate, 0.5)
      set('eyeLookInRight',  gazeLeftOut * gazeGate, 0.5)
      set('eyeLookUpLeft',   gazeUp * gazeGate, 0.5)
      set('eyeLookUpRight',  gazeUp * gazeGate, 0.5)
      set('eyeLookDownLeft', gazeDown * gazeGate, 0.5)
      set('eyeLookDownRight',gazeDown * gazeGate, 0.5)
    }
  })

  return (
    <group ref={rootRef} visible={visible}>
      <group ref={innerRef}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

/* Graceful fallback orb if the avatar GLB fails to load. */
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
    <mesh ref={meshRef} position={PRESENT.clone().setY(1.2)}>
      <icosahedronGeometry args={[0.4, 4]} />
      <meshStandardMaterial ref={matRef} color={stateColorHex(appState)} emissive={stateColorHex(appState)}
        emissiveIntensity={0.8} transparent opacity={0.85} roughness={0.3} metalness={0.2} wireframe />
    </mesh>
  )
}

function AvatarLoadingPlaceholder() {
  const groupRef = useRef()
  useFrame((state) => {
    if (groupRef.current) groupRef.current.rotation.y = state.clock.elapsedTime * 0.5
  })
  return (
    <group ref={groupRef} position={PRESENT.clone().setY(1.2)}>
      <mesh><sphereGeometry args={[0.15, 32, 32]} /><meshStandardMaterial color="#86BC25" emissive="#86BC25" emissiveIntensity={2} /></mesh>
      <mesh><sphereGeometry args={[0.35, 16, 16]} /><meshStandardMaterial color="#86BC25" wireframe transparent opacity={0.2} /></mesh>
    </group>
  )
}

export function SceneContents({ appState, getLevel, getLipsync, url, trigger, onArrived, roomUrl, hologramType }) {
  // Live navigation data (floor extent + inflated AABB colliders) discovered
  // from the room GLB at load. Shared into the avatar so the walk routes around
  // the actual furniture, whatever layout the GLB ships with.
  const nav = useRef({ floor: FLOOR_FALLBACK, colliders: [] })

  return (
    <>
      {/* Image-based lighting for soft, realistic fill + reflections. The room
          itself stays the visible background (background={false}); apartment
          gives warmer, more interior-appropriate reflections than 'city'. */}
      <Environment preset="apartment" background={false} environmentIntensity={0.7} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#eef3fb', '#3a3632', 0.35]} />
      {/* "Window sun" — comes from the glazed wall (x≈0) into the room, casting
          a real soft floor shadow under the avatar. */}
      <directionalLight
        castShadow
        position={[-4, 7, 1]}
        intensity={2.2}
        color="#fff4e2"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={6}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
      />

      {/* The room is wrapped in an ErrorCatcher so a missing/invalid per-tenant
          room or logo URL degrades to "no room" instead of crashing the Canvas. */}
      <ErrorCatcher fallback={null}>
        <Suspense fallback={null}>
          <OfficeRoom onColliders={(data) => { nav.current = data }} roomUrl={roomUrl} />
        </Suspense>
      </ErrorCatcher>

      {/* 3D Hologram Panel — appears next to the avatar when triggered by the AI. */}
      <HologramPanel type={hologramType} />

      {/* Soft contact-shadow blob grounds the avatar on the carpet. */}
      <ContactShadows
        position={[PRESENT.x, 0.01, PRESENT.z]}
        scale={6}
        far={3}
        blur={2.6}
        opacity={0.5}
        resolution={1024}
        color="#1a1814"
      />

      <ErrorCatcher fallback={<FallbackOrb appState={appState} getLevel={getLevel} />}>
        <Suspense fallback={<AvatarLoadingPlaceholder />}>
          <AvatarFigure appState={appState} getLevel={getLevel} getLipsync={getLipsync}
            url={url} trigger={trigger} onArrived={onArrived} nav={nav} />
        </Suspense>
      </ErrorCatcher>
    </>
  )
}

function HologramPanel({ type }) {
  const groupRef = useRef()
  const visible = !!type
  
  useFrame((state) => {
    if (groupRef.current && visible) {
      groupRef.current.position.y = 1.3 + Math.sin(state.clock.elapsedTime * 2) * 0.05
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1
    }
  })

  if (!visible) return null

  return (
    <group ref={groupRef} position={[3.6, 1.3, -1.8]} rotation={[0, -0.4, 0]}>
      {/* Floating glass panel */}
      <mesh>
        <planeGeometry args={[1.2, 0.8]} />
        <meshStandardMaterial 
          color="#86BC25" 
          transparent 
          opacity={0.4} 
          metalness={0.9} 
          roughness={0.1}
          emissive="#86BC25"
          emissiveIntensity={0.5}
        />
      </mesh>
      {/* Glow border */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[1.22, 0.82]} />
        <meshBasicMaterial color="#86BC25" wireframe />
      </mesh>
      {/* Holographic content label */}
      <mesh position={[0, 0, 0.01]}>
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshBasicMaterial color="#fff" />
      </mesh>
    </group>
  )
}

class ErrorCatcher extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err) { console.warn('[Avatar3D] GLB failed to load, using fallback orb:', err?.message || err) }
  render() { return this.state.hasError ? this.props.fallback : this.props.children }
}

export function Avatar3D({ appState = 'idle', getLevel, getLipsync, avatarUrl, trigger = false, onArrived, roomUrl, hologramType }) {
  const url = avatarUrl && avatarUrl.trim() !== '' ? avatarUrl : DEFAULT_GLB

  return (
    /* Full-screen 3D office (real geometry IS the backdrop now — no CSS photo,
       no 2.5D desk matte; the depth buffer handles occlusion). */
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <Canvas
        shadows="soft"
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        camera={{ fov: 46, near: 0.1, far: 100, position: [7.4, 1.65, 1.0] }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(3.9, 0.95, -3.1)
          // Photoreal output: ACES Filmic tone mapping + sRGB output (three r0.165).
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.1
          gl.outputColorSpace = THREE.SRGBColorSpace
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <SceneContents 
          appState={appState} 
          getLevel={getLevel} 
          getLipsync={getLipsync}
          url={url} 
          trigger={trigger} 
          onArrived={onArrived} 
          roomUrl={roomUrl}
          hologramType={hologramType}
        />
      </Canvas>
    </div>
  )
}

try { useGLTF.preload(DEFAULT_GLB) } catch (_) { /* ignore */ }
try { useGLTF.preload(OFFICE_ROOM, true) } catch (_) { /* ignore */ }
