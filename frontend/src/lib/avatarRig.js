// avatarRig.js
// ---------------------------------------------------------------------------
// Model-agnostic humanoid rig builder for React Three Fiber / three.js.
//
// Pure JS + three (NO React). Given a loaded GLB scene (THREE.Object3D),
// inspect its skeleton and produce a best-effort *canonical* bone map plus
// the geometric facts an animation/locomotion layer needs (ground offset,
// standing height, forward axis, morph-target meshes for visemes/blinks).
//
// Supports any humanoid rig naming scheme: Mixamo (`mixamorig:Hips`),
// ReadyPlayerMe / Avaturn (`Hips`, `LeftArm`, ...), and common variants.
// Matching is tolerant: a leading `mixamorig:` / `mixamorig` prefix is
// stripped, names are lowercased, and a CANONICAL -> [aliases] table maps
// many real-world bone names onto a single canonical key.
//
// The same CANONICAL_BONES alias table is exported and reused by
// avatarAnimations.js to retarget Mixamo animation tracks onto an arbitrary
// target skeleton.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

// Canonical bone key -> list of accepted aliases (already in the
// "normalized" form: prefix-stripped + lowercased + non-alphanumerics removed).
// Keep aliases normalized so they compare directly against normalizeBoneName().
export const CANONICAL_BONES = {
  hips:        ['hips', 'pelvis', 'root', 'hip', 'cog'],
  spine:       ['spine', 'spine0', 'lowerspine', 'abdomen'],
  spine1:      ['spine1', 'chest', 'spine01', 'midspine'],
  spine2:      ['spine2', 'upperchest', 'spine02', 'upperspine'],
  neck:        ['neck', 'neck1'],
  head:        ['head'],

  leftShoulder:  ['leftshoulder', 'lshoulder', 'shoulderl', 'leftclavicle', 'lclavicle', 'claviclel'],
  rightShoulder: ['rightshoulder', 'rshoulder', 'shoulderr', 'rightclavicle', 'rclavicle', 'clavicler'],

  leftArm:       ['leftarm', 'larm', 'leftupperarm', 'lupperarm', 'upperarml', 'leftshoulderarm'],
  rightArm:      ['rightarm', 'rarm', 'rightupperarm', 'rupperarm', 'upperarmr'],
  leftForeArm:   ['leftforearm', 'lforearm', 'leftlowerarm', 'llowerarm', 'lowerarml', 'forearml'],
  rightForeArm:  ['rightforearm', 'rforearm', 'rightlowerarm', 'rlowerarm', 'lowerarmr', 'forearmr'],
  leftHand:      ['lefthand', 'lhand', 'handl'],
  rightHand:     ['righthand', 'rhand', 'handr'],

  leftUpLeg:     ['leftupleg', 'lupleg', 'leftupperleg', 'lupperleg', 'leftthigh', 'lthigh', 'upperlegl', 'thighl'],
  rightUpLeg:    ['rightupleg', 'rupleg', 'rightupperleg', 'rupperleg', 'rightthigh', 'rthigh', 'upperlegr', 'thighr'],
  leftLeg:       ['leftleg', 'lleg', 'leftlowerleg', 'llowerleg', 'leftshin', 'lshin', 'leftcalf', 'lcalf', 'lowerlegl', 'shinl'],
  rightLeg:      ['rightleg', 'rleg', 'rightlowerleg', 'rlowerleg', 'rightshin', 'rshin', 'rightcalf', 'rcalf', 'lowerlegr', 'shinr'],
  leftFoot:      ['leftfoot', 'lfoot', 'footl'],
  rightFoot:     ['rightfoot', 'rfoot', 'footr'],
  leftToeBase:   ['lefttoebase', 'ltoebase', 'lefttoe', 'ltoe', 'toebasel', 'toel'],
  rightToeBase:  ['righttoebase', 'rtoebase', 'righttoe', 'rtoe', 'toebaser', 'toer'],
};

// Ordered list of canonical keys we expose in the convenience `bones` object.
const CANONICAL_KEYS = Object.keys(CANONICAL_BONES);

// Build a reverse lookup: normalized-alias -> canonicalKey (computed once).
const ALIAS_TO_CANONICAL = (() => {
  const m = new Map();
  for (const key of CANONICAL_KEYS) {
    for (const alias of CANONICAL_BONES[key]) {
      // First alias wins if duplicated; aliases are intended to be unique.
      if (!m.has(alias)) m.set(alias, key);
    }
  }
  return m;
})();

// Normalize a raw bone/node name to the comparable form used by aliases:
//   - strip a leading "mixamorig:" or "mixamorig" prefix
//   - lowercase
//   - remove anything that isn't a-z or 0-9 (spaces, underscores, dots, etc.)
export function normalizeBoneName(rawName) {
  if (!rawName) return '';
  let n = String(rawName);
  // Strip mixamorig prefix (with or without the colon).
  n = n.replace(/^mixamorig[:_]?/i, '');
  n = n.toLowerCase();
  n = n.replace(/[^a-z0-9]/g, '');
  return n;
}

// Resolve a raw bone name to a canonical key, or null if no alias matches.
export function canonicalForBoneName(rawName) {
  const norm = normalizeBoneName(rawName);
  if (!norm) return null;
  if (ALIAS_TO_CANONICAL.has(norm)) return ALIAS_TO_CANONICAL.get(norm);
  return null;
}

/**
 * Build a model-agnostic rig descriptor from a loaded avatar scene.
 *
 * @param {THREE.Object3D} avatarScene  Root of a loaded GLB (gltf.scene).
 * @returns {{
 *   bones: Object,                       // canonicalKey -> THREE.Bone|null
 *   boneByCanonical: Map<string, THREE.Bone>,
 *   morphMeshes: THREE.Mesh[],
 *   groundOffset: number,
 *   height: number,
 *   faceAxis: '+z'|'-z'
 * }}
 */
export function buildRig(avatarScene) {
  const boneByCanonical = new Map();
  const morphMeshes = [];

  if (!avatarScene) {
    const emptyBones = {};
    for (const k of CANONICAL_KEYS) emptyBones[k] = null;
    return {
      bones: emptyBones,
      boneByCanonical,
      morphMeshes,
      groundOffset: 0,
      height: 1.7,
      faceAxis: '+z',
    };
  }

  // Traverse once: collect bones (canonical-matched, first match wins per key)
  // and any mesh exposing morph targets.
  avatarScene.traverse((obj) => {
    if (obj.isBone || obj.type === 'Bone') {
      const key = canonicalForBoneName(obj.name);
      if (key && !boneByCanonical.has(key)) {
        boneByCanonical.set(key, obj);
      }
    }
    if (obj.isMesh || obj.isSkinnedMesh) {
      if (obj.morphTargetDictionary && obj.morphTargetInfluences) {
        morphMeshes.push(obj);
      }
    }
  });

  // Some rigs store the skeleton as plain Object3D nodes (not THREE.Bone).
  // Fallback second pass: if we found few/no bones, match any named node.
  if (boneByCanonical.size < 4) {
    avatarScene.traverse((obj) => {
      if (!obj.name) return;
      const key = canonicalForBoneName(obj.name);
      if (key && !boneByCanonical.has(key)) {
        boneByCanonical.set(key, obj);
      }
    });
  }

  // Convenience object with every canonical key present (value may be null).
  const bones = {};
  for (const k of CANONICAL_KEYS) {
    bones[k] = boneByCanonical.get(k) || null;
  }

  // ---- Geometry: bounding box for ground offset + height ----
  // Ensure world matrices are current so Box3 is accurate.
  avatarScene.updateWorldMatrix(true, true);

  const box = new THREE.Box3().setFromObject(avatarScene);
  let groundOffset = 0;
  let height = 1.7;
  if (box.isEmpty() === false && isFinite(box.min.y) && isFinite(box.max.y)) {
    // groundOffset: subtract this from y so the lowest point (feet) sits at y=0.
    groundOffset = box.min.y;
    height = box.max.y - box.min.y;
    if (!(height > 0)) height = 1.7;
  }

  // ---- Forward axis heuristic ----
  // Most GLB humanoids (RPM, Avaturn, Mixamo) face +Z in their local space.
  // We default to '+z'. (A robust per-mesh detection would require face/eye
  // landmarks; '+z' is the safe canonical default for these exporters.)
  const faceAxis = '+z';

  return {
    bones,
    boneByCanonical,
    morphMeshes,
    groundOffset,
    height,
    faceAxis,
  };
}

export default buildRig;
