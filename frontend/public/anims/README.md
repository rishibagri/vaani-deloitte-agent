# Avatar animation clips

Mixamo/RPM-skeleton **GLB** clips, named by presence state. Any subset works — a
missing clip falls back to the procedural stand-in for that state. Clips are
retargeted by bone name onto whatever humanoid avatar GLB is loaded
(`mixamorig:*` and RPM/Avaturn names are auto-mapped), so this is model-agnostic.

| File | When it plays | Status |
|------|---------------|--------|
| `idle.glb`    | standing idle once present (and while speaking if no `talk.glb`) | **bundled** |
| `walk.glb`    | walk cycle while she navigates to the visitor (in-place; root motion is driven by the nav path — the baked hips X/Z is stripped at load) | **bundled** |
| `talk.glb`    | conversational gestures while `appState === 'speaking'` | **bundled** |
| `sit.glb`     | seated at the desk before she's triggered | *not bundled* → procedural sink (desk occludes lower body) |
| `standUp.glb` | chair → standing transition (plays once, clamps) | *not bundled* → procedural rise |

## Bundled clip provenance

The three bundled clips come from the **Ready Player Me animation library**
(<https://github.com/readyplayerme/animation-library>, MIT-licensed, free):

| Local file | Source clip |
|------------|-------------|
| `idle.glb` | `feminine/glb/idle/F_Standing_Idle_001.glb` |
| `walk.glb` | `feminine/glb/locomotion/F_Walk_003.glb` |
| `talk.glb` | `feminine/glb/expression/F_Talking_Variations_001.glb` |

They use plain RPM bone names (`Hips`, `Spine1`, `LeftUpLeg`, …) — identical to
our Avaturn rig — so retargeting is effectively an identity map.

## Adding sit / stand-from-chair (optional upgrade)

The RPM library has no chair sit/stand, so those two states use a procedural
fallback (she's lowered into the seat with the idle clip; the desk hides her
lap). For real mocap, export **"Sitting Idle"** and **"Stand Up"** from Mixamo
(FBX → GLB) and drop them here as `sit.glb` / `standUp.glb` — they auto-activate,
no code change. `standUp.glb` should end on a neutral standing pose so the
cross-fade into `walk.glb` stays smooth.

To re-fetch or swap the bundled clips, browse the RPM library tree and copy any
`feminine/glb/<category>/*.glb` into this folder under the matching state name.
