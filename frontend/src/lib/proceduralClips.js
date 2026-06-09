// proceduralClips.js
// ---------------------------------------------------------------------------
// Procedural seated / stand-up animation clips for a model-agnostic humanoid
// rig (built by avatarRig.js -> buildRig()).
//
// Pure JS + three (NO React).
//
// WHY THIS EXISTS
// ---------------
// The bundled RPM mocap set has idle / walk / talk but NO chair sit/stand. The
// old fallback ("standing idle, lowered into the floor") read as "standing in a
// pit": straight legs, no hip fold. These clips author a believable SEATED pose
// (thighs flexed toward horizontal, knees bent back, a slight hip recline, arms
// relaxed) and a non-looping STAND-UP transition (seated -> bind/neutral).
//
// They are generated as real THREE.AnimationClip objects on the rig's CANONICAL
// bones (rig.boneByCanonical), so the SAME mixer drives them and crossfades into
// the loaded idle/walk/talk clips work. If a real /anims/sit.glb or
// /anims/standUp.glb is present, the loaded clip is PREFERRED (the caller merges
// procedural clips only for keys the loaded set doesn't already provide).
//
// LOCAL-AXIS CAVEAT (important)
// -----------------------------
// RPM / Mixamo leg-bone *local* axes vary between exporters. We therefore never
// hard-set an Euler; instead each seated rotation is a DELTA quaternion
// (setFromAxisAngle about the bone's LOCAL flexion axis) composed with the
// bone's BIND local quaternion:  q_seated = q_bind * q_delta.
// The flex angles + the per-group axis & sign are exposed as tunable constants
// at the top so they can be flipped after a quick visual check (the desk top at
// y~=0.78 occludes the lap, so lower-body precision is forgiving — she mainly
// just needs to READ as seated, not standing).
// ---------------------------------------------------------------------------

import * as THREE from 'three';

/* ──────────────────────────────────────────────────────────────────────────
   TUNABLE KNOBS — flip signs / nudge angles after a visual check.

   Axis is the bone's LOCAL flexion axis. For RPM/Avaturn & Mixamo rigs the
   limb bones flex about their local X; if a swapped-in rig folds sideways
   instead, change the axis vector. Sign chooses the fold DIRECTION:
     • thigh must swing FORWARD (lap forward),
     • knee must bend BACKWARD (shin tucks under the chair),
   so the two leg signs are deliberately opposite.
─────────────────────────────────────────────────────────────────────────── */
export const SIT_TUNING = {
  // Local flexion axis shared by the leg/arm bones (most RPM/Mixamo rigs: X).
  flexAxis: new THREE.Vector3(1, 0, 0),

  // Hip / thigh: rotate thigh from straight-down toward horizontal (~80°).
  thighFlex: 1.40,        // radians (~80°)
  thighSign: +1,          // FLIP if thighs kick backward instead of forward

  // Knee: bend the shin back under the seat (~95°), opposite sense to the thigh.
  kneeFlex: 1.65,         // radians (~95°)
  kneeSign: -1,           // FLIP if shins splay forward instead of tucking

  // Slight backward recline of the pelvis/spine so she leans into the chair.
  hipRecline: 0.10,       // radians (~6°) about flexAxis on hips
  hipReclineSign: -1,
  spineRecline: 0.06,     // radians, gentle, spread over spine if present
  spineReclineSign: -1,

  // Arms fall from the T-pose toward the sides / lap (relaxed shoulders).
  // Upper-arm down-swing is about the LOCAL Z for RPM arms (shoulder abduction);
  // exposed separately so it can be tuned independently of the legs.
  armAxis: new THREE.Vector3(0, 0, 1),
  upperArmDrop: 1.15,     // radians (~66°) bring arms down from T toward sides
  // left/right arms mirror, so their signs are opposite:
  leftArmSign: -1,
  rightArmSign: +1,

  // Forearm slight bend so hands rest toward the lap.
  foreArmBend: 0.35,
  leftForeSign: -1,
  rightForeSign: +1,
};

export const SIT_SECONDS = 0.0001;   // sit is a static held pose (1-frame loop)
export const STAND_SECONDS = 0.95;   // seated -> neutral transition length

// Helper: delta quat about a LOCAL axis by `angle`, composed onto the bone's
// bind-local quaternion -> the bone's seated local quaternion.
function seatedLocalQuat(bone, axis, angle, sign) {
  const bind = bone.quaternion.clone();                 // current = bind local
  const delta = new THREE.Quaternion().setFromAxisAngle(axis, angle * sign);
  return bind.multiply(delta);                          // q_bind * q_delta
}

// Build the map of canonical bone -> { bone, bind:Quaternion, seated:Quaternion }
// for every bone we want to pose while seated. Bones absent on this rig are
// simply skipped (model-agnostic).
function buildSeatedTargets(rig) {
  const T = SIT_TUNING;
  const get = (k) => rig.boneByCanonical.get(k) || null;
  const out = [];

  const add = (key, axis, angle, sign) => {
    const bone = get(key);
    if (!bone) return;
    out.push({
      key,
      bone,
      bind: bone.quaternion.clone(),
      seated: seatedLocalQuat(bone, axis, angle, sign),
    });
  };

  // Legs — the read-as-seated essentials.
  add('leftUpLeg',  T.flexAxis, T.thighFlex, T.thighSign);
  add('rightUpLeg', T.flexAxis, T.thighFlex, T.thighSign);
  add('leftLeg',    T.flexAxis, T.kneeFlex,  T.kneeSign);
  add('rightLeg',   T.flexAxis, T.kneeFlex,  T.kneeSign);

  // Pelvis / spine recline (subtle).
  add('hips',  T.flexAxis, T.hipRecline,   T.hipReclineSign);
  add('spine', T.flexAxis, T.spineRecline, T.spineReclineSign);

  // Arms relaxed from the T-pose toward the sides + slight forearm bend.
  add('leftArm',     T.armAxis,  T.upperArmDrop, T.leftArmSign);
  add('rightArm',    T.armAxis,  T.upperArmDrop, T.rightArmSign);
  add('leftForeArm', T.armAxis,  T.foreArmBend,  T.leftForeSign);
  add('rightForeArm',T.armAxis,  T.foreArmBend,  T.rightForeSign);

  return out;
}

// Convert a list of { bone, q } at two keyframe times into a quaternion track.
function quatTrack(boneName, times, quats) {
  const values = new Float32Array(quats.length * 4);
  for (let i = 0; i < quats.length; i++) {
    const q = quats[i];
    values[i * 4 + 0] = q.x;
    values[i * 4 + 1] = q.y;
    values[i * 4 + 2] = q.z;
    values[i * 4 + 3] = q.w;
  }
  return new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values);
}

/**
 * buildSitClip(rig) — a held SEATED pose as a (tiny, looping) clip so the mixer
 * can crossfade INTO it from standUp/idle and keep holding it. Single steady
 * keyframe per bone (start == end) -> effectively a static pose under LoopRepeat.
 *
 * @param {object} rig  result of buildRig()
 * @returns {THREE.AnimationClip|null}
 */
export function buildSitClip(rig) {
  if (!rig || !rig.boneByCanonical) return null;
  const targets = buildSeatedTargets(rig);
  if (!targets.length) return null;

  const times = [0, SIT_SECONDS];
  const tracks = [];
  for (const t of targets) {
    tracks.push(quatTrack(t.bone.name, times, [t.seated, t.seated]));
  }
  if (!tracks.length) return null;
  return new THREE.AnimationClip('sit', SIT_SECONDS, tracks);
}

/**
 * buildStandUpClip(rig) — interpolate the SEATED pose -> the BIND/neutral pose
 * over STAND_SECONDS. Non-looping; the caller plays it with clampWhenFinished so
 * it settles on neutral before crossfading into walk/idle.
 *
 * @param {object} rig  result of buildRig()
 * @returns {THREE.AnimationClip|null}
 */
export function buildStandUpClip(rig) {
  if (!rig || !rig.boneByCanonical) return null;
  const targets = buildSeatedTargets(rig);
  if (!targets.length) return null;

  const times = [0, STAND_SECONDS];
  const tracks = [];
  for (const t of targets) {
    // seated -> bind (neutral standing local rotation)
    tracks.push(quatTrack(t.bone.name, times, [t.seated, t.bind]));
  }
  if (!tracks.length) return null;
  return new THREE.AnimationClip('standUp', STAND_SECONDS, tracks);
}

export default { buildSitClip, buildStandUpClip, SIT_TUNING, SIT_SECONDS, STAND_SECONDS };
