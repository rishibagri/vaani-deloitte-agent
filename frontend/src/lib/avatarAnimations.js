// avatarAnimations.js
// ---------------------------------------------------------------------------
// Model-agnostic animation loader + animator for React Three Fiber / three.js.
//
// Pure JS + three (NO React).
//
// CONVENTION
// ----------
// Callers drop Mixamo animation GLB exports into the public folder at:
//
//     frontend/public/anims/idle.glb
//     frontend/public/anims/sit.glb
//     frontend/public/anims/standUp.glb
//     frontend/public/anims/walk.glb
//     frontend/public/anims/talk.glb
//
// then pass those URLs to loadClipSet():
//
//     const { clips, available } = await loadClipSet({
//       idle:    '/anims/idle.glb',
//       sit:     '/anims/sit.glb',
//       standUp: '/anims/standUp.glb',
//       walk:    '/anims/walk.glb',
//       talk:    '/anims/talk.glb',
//     });
//
// ANY SUBSET works — keys are optional, missing/failed loads are simply
// omitted from `clips` (and absent from `available`). The caller is expected
// to fall back to procedural motion for states it doesn't have a clip for.
//
// RETARGETING
// -----------
// Mixamo clips name their tracks like `mixamorig:LeftArm.quaternion`. At
// bind time (makeAnimator), each track's node name is remapped to the matching
// bone in the *target* rig using the shared CANONICAL_BONES alias table from
// avatarRig.js. We keep rotation (.quaternion) tracks for every resolvable
// bone, keep the hips `.position` track (root motion / sway), and drop other
// position/scale tracks (they cause skeleton explosion when retargeting across
// differently-proportioned rigs). Tracks whose bone cannot be resolved are
// dropped. Nothing throws on a missing bone or clip — it just skips.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { canonicalForBoneName } from './avatarRig.js';

const _loader = new GLTFLoader();

function loadGLB(url) {
  return new Promise((resolve, reject) => {
    _loader.load(url, resolve, undefined, reject);
  });
}

// Pick the "best" clip out of a loaded GLB's animations: prefer the longest
// non-empty clip (Mixamo single-action exports usually contain exactly one).
function pickClip(gltf) {
  const anims = (gltf && gltf.animations) || [];
  if (!anims.length) return null;
  let best = null;
  for (const c of anims) {
    if (!c || !c.tracks || !c.tracks.length) continue;
    if (!best || c.duration > best.duration) best = c;
  }
  return best;
}

/**
 * Load a set of external animation clips (Mixamo GLB exports).
 * All keys optional; failures are skipped without throwing.
 *
 * @param {{idle?:string, sit?:string, standUp?:string, walk?:string, talk?:string}} urls
 * @returns {Promise<{ clips: Object, available: Set<string> }>}
 */
export async function loadClipSet(urls) {
  const clips = {};
  const available = new Set();
  if (!urls || typeof urls !== 'object') return { clips, available };

  const entries = Object.entries(urls).filter(([, url]) => !!url);

  await Promise.all(
    entries.map(async ([state, url]) => {
      try {
        const gltf = await loadGLB(url);
        const clip = pickClip(gltf);
        if (clip) {
          clip.name = state; // normalize name to the state key
          clips[state] = clip;
          available.add(state);
        }
      } catch (err) {
        // Defensive: a missing/broken clip must never break the set.
        // eslint-disable-next-line no-console
        console.warn(`[avatarAnimations] failed to load "${state}" from ${url}:`, err && err.message ? err.message : err);
      }
    })
  );

  return { clips, available };
}

// Given a raw track name ("mixamorig:LeftArm.quaternion") return
// { node, prop } where node is the bone name and prop the property path tail.
function splitTrackName(trackName) {
  const dot = trackName.lastIndexOf('.');
  if (dot === -1) return { node: trackName, prop: '' };
  return { node: trackName.slice(0, dot), prop: trackName.slice(dot + 1) };
}

/**
 * Retarget a source (Mixamo) clip's tracks onto the target rig's bone names.
 * Returns a NEW AnimationClip referencing the target rig's actual bone names
 * (clip.uuid'd by state), or null if no tracks could be resolved.
 *
 * @param {THREE.AnimationClip} clip
 * @param {object} rig                result of buildRig()
 * @param {{stripRootXZ?:boolean}} [opts]
 *   stripRootXZ — flatten the hips X/Z translation to its first frame (keeping
 *   the vertical bob). Use for locomotion clips whose forward "root motion" is
 *   baked into the hips: we drive world travel from the nav path instead, so the
 *   clip must play *in place* or it will drift off / fight the path.
 */
function retargetClip(clip, rig, opts = {}) {
  if (!clip || !rig || !rig.boneByCanonical) return null;
  const { stripRootXZ = false } = opts;

  const newTracks = [];
  for (const track of clip.tracks) {
    const { node, prop } = splitTrackName(track.name);

    // Only retarget rotation tracks for any bone, and the hips position track.
    const isQuat = prop === 'quaternion';
    const isPos = prop === 'position';
    if (!isQuat && !isPos) continue; // drop scale / morph / unknown tracks

    const canonical = canonicalForBoneName(node);
    if (!canonical) continue; // can't resolve -> drop

    // Keep position only for hips (root motion / vertical sway).
    if (isPos && canonical !== 'hips') continue;

    const targetBone = rig.boneByCanonical.get(canonical);
    if (!targetBone) continue; // target rig lacks this bone -> drop

    // Clone the track but point it at the target bone's actual name.
    const cloned = track.clone();
    cloned.name = `${targetBone.name}.${prop}`;

    // Flatten baked horizontal root motion (X,Z) for locomotion clips so the
    // walk plays in place; the vertical (Y) bob is preserved for natural gait.
    if (isPos && canonical === 'hips' && stripRootXZ &&
        cloned.values && cloned.values.length >= 3) {
      const x0 = cloned.values[0], z0 = cloned.values[2];
      for (let i = 0; i < cloned.values.length; i += 3) {
        cloned.values[i] = x0;       // hold X
        cloned.values[i + 2] = z0;   // hold Z (keep Y = vertical bob)
      }
    }

    newTracks.push(cloned);
  }

  if (!newTracks.length) return null;

  const out = new THREE.AnimationClip(clip.name, clip.duration, newTracks);
  return out;
}

/**
 * Build an animator bound to a mixer + rig. Retargets each provided clip onto
 * the target skeleton at bind time and exposes a small crossfading API.
 *
 * @param {THREE.AnimationMixer} mixer
 * @param {object} rig   result of buildRig()
 * @param {Object} clips map of stateName -> THREE.AnimationClip (from loadClipSet)
 * @param {Object} [perState] map of stateName -> retarget opts ({stripRootXZ})
 * @returns {{
 *   play: (state:string, opts?:{fade?:number, loop?:boolean, clampWhenFinished?:boolean}) => boolean,
 *   has: (state:string) => boolean,
 *   update: (dt:number) => void,
 *   current: () => string|null
 * }}
 */
export function makeAnimator(mixer, rig, clips, perState = {}) {
  const actions = new Map();     // state -> THREE.AnimationAction
  let currentState = null;
  let currentAction = null;

  const safeClips = clips && typeof clips === 'object' ? clips : {};
  const safeOpts = perState && typeof perState === 'object' ? perState : {};

  if (mixer && rig) {
    for (const [state, clip] of Object.entries(safeClips)) {
      try {
        const retargeted = retargetClip(clip, rig, safeOpts[state] || {});
        if (!retargeted) continue;
        const action = mixer.clipAction(retargeted);
        actions.set(state, action);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[avatarAnimations] could not bind action "${state}":`, err && err.message ? err.message : err);
      }
    }
  }

  function has(state) {
    return actions.has(state);
  }

  function play(state, opts = {}) {
    const action = actions.get(state);
    if (!action) return false; // caller falls back to procedural motion

    const {
      fade = 0.3,
      // standUp defaults: non-looping + clamp. Otherwise loop.
      loop = state !== 'standUp',
      clampWhenFinished = state === 'standUp',
    } = opts;

    if (action === currentAction) return true; // already playing

    action.enabled = true;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !!clampWhenFinished;
    action.reset();
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);

    if (currentAction && fade > 0) {
      action.play();
      currentAction.crossFadeTo(action, fade, false);
    } else {
      if (currentAction) currentAction.stop();
      action.play();
    }

    currentAction = action;
    currentState = state;
    return true;
  }

  function update(dt) {
    if (mixer) mixer.update(dt || 0);
  }

  function current() {
    return currentState;
  }

  return { play, has, update, current };
}

export default makeAnimator;
