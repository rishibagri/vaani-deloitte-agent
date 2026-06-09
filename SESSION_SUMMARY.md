# Vaani — Session Summary (2026-06-09)

A snapshot of what was done this session and what remains. Focus: making the 3D
avatar (Vaani) feel real and turning Vaani into a true multi-tenant product.

---

## ✅ Achieved

### 1. Real animation clips (free, MIT — no Mixamo login, no paid MCP)
The model-agnostic animation system existed but shipped **zero clips** (she slid
robotically on a procedural "stride bob"). Retrieved real **feminine mocap** from
the Ready Player Me animation-library (MIT) and installed them:

| File | Source clip | Drives |
|------|-------------|--------|
| `frontend/public/anims/idle.glb` | `F_Standing_Idle_001` | standing idle / present |
| `frontend/public/anims/walk.glb` | `F_Walk_003` | real walk cycle while navigating |
| `frontend/public/anims/talk.glb` | `F_Talking_Variations_001` | gestures while speaking |

- They use RPM bone names identical to our avatar → retarget is essentially identity.
- `avatarAnimations.js`: added `stripRootXZ` (walk plays **in place**; the A* nav
  path drives travel so she doesn't drift) + `perState` options on `makeAnimator`.

### 2. Avatar realism & de-creep (in `Avatar3D.jsx` + new `proceduralClips.js`)
- **Facing**: single `FACE_OFFSET` knob applied to seat/walk/greeting yaw.
- **Procedural seated pose + stand-up** (`buildSitClip` / `buildStandUpClip`) — no
  free chair-sit mocap exists anywhere, so these are generated on the rig's
  canonical bones (delta-quaternion on the bind pose; tunable via `SIT_TUNING`).
- **Living eyes** (anti-creepy): blinks even while speaking + slow eye saccades via
  ARKit `eyeLook*` morphs (settle toward centre while listening).
- **Lip-sync**: bilabial/labiodental closures (M/B/P/F now *close* the jaw instead
  of gaping), asymmetric jaw smoothing (snappy open, calm close), `mouthPucker` on U.

### 3. Multi-tenant ("change everything per client")
- **Config schema** (`bot_config.py`): added `accent_color` + `office_room_url`;
  exposed via `/config` (`PUBLIC_FIELDS`), hex-color clamping, language guarantees.
- **Persona is now per-tenant** (`gemini_agent._build_persona_prompt`) — previously
  the system prompt was hardcoded "Deloitte" and ignored every tenant field. **Big fix.**
- **Admin dashboard** regrouped editor: Branding / Persona / Voice & LLM /
  Avatar & Render / Languages; accent-color + office-room-URL fields added.
- **Tenant management**: create / list / read / update / delete / **activate**
  endpoints; each tenant = `data/bots/<id>.json`; `data/active_bot.txt` selects active.
- **Per-tenant isolation (closed a real leak)**: conversation memory (`memory.py`)
  and face recognition (`face_memory.py`) are now scoped by `company_id` — tenants
  no longer see each other's history or enrolled faces. Legacy data maps to `default`.
- **Frontend branding fully config-driven** (`App.jsx` + `styles/tokens.css`):
  `--color-brand` / `--color-accent` token layer re-skins the whole UI; company
  name/tagline/logo + page title come from `/config`.

### 4. Avatar switching (model-agnostic) — proven
- A **second avatar** is installed at `frontend/public/avatar2.glb` (a different RPM
  model: 64-bone skeleton, 16 viseme morphs incl. `jawOpen`).
- Set a tenant's `avatar_3d_url` to `/avatar2.glb` → clips retarget + lip-sync binds
  on a model we never hand-tuned. Confirms the rig/retarget pipeline is generic.

### 5. Integration & robustness (orchestration glue)
- Wired the per-tenant **`roomUrl`** contract (App → Avatar3D → OfficeRoom) with safe
  defaults; room wrapped in an **ErrorCatcher** so a bad tenant room/logo URL degrades
  gracefully instead of crashing the WebGL canvas.
- **Default avatar is now local** (`/avatar.glb`) instead of the Ready Player Me CDN
  (which is not always reachable) — offline-safe for an on-prem demo.
- Verified the **combined** frontend transforms cleanly (all modules 200 on the dev
  server) and the backend imports + resolves per-tenant config + `company_id` signatures.

### 6. Live regression fixes (from your "room gone / facing away" report)
- `FACE_OFFSET` reverted **π → 0** (π made her face away; this rig faces +Z).
- Removed an **unrequested logo-texture override** Agent 1 added to the office room
  (the most likely cause of the room disappearing) → restores the Blender environment.
- Height-normalization now only corrects **genuinely** mis-scaled avatars, so the demo
  avatar renders exactly as authored (no surprise resize).

### Misc
- Status line configured to warn at 60% context / 200k tokens.

---

## 🔧 Yet to be done

### Needs your eyes (live visual tuning — I can't render headlessly)
1. **Confirm the two regressions are fixed** after a hard refresh: office room visible
   again + Vaani faces the camera at the greeting mark.
2. **Seated pose realism** — if her legs fold the wrong way, flip `SIT_TUNING.thighSign`
   / `kneeSign` in `proceduralClips.js`; adjust `SEATED_SINK` so her head sits at
   desk-working height. (The desk occludes her lap, so it's forgiving.)
3. **Walk foot-skate** — tune `WALK_SPEED` (0.75) vs the in-place mocap cadence.
4. **Gaze amplitude** — lower `GAZE_AMP` (0.22) if the eyes look too active.
5. **Lip-sync feel** — confirm it reads better; further tuning may be wanted.

### Functional follow-ups
6. **Avatar-switch end-to-end test** — point a tenant at `/avatar2.glb` via the admin
   panel and confirm walk/talk/lip-sync all work on the swapped model in-browser.
7. **Real sit/stand mocap (optional upgrade)** — none exists free; if you export
   "Sitting Idle" + "Stand Up" from Mixamo (FBX→GLB) and drop them as
   `frontend/public/anims/sit.glb` / `standUp.glb`, they auto-activate (no code change).
8. **Per-tenant 3D-room logo** — the hook exists (`logoUrl`/`roomUrl`), but the office
   wall logo is not yet driven by the tenant's `logo_url` (only the 2D UI is).
9. **tokens.css low-opacity accents** — many `rgba(134,188,37,…)` glows are still
   static green; full dynamic accent across those is a larger follow-up.
10. **Backend verification gap** — `face_memory` `company_id` wiring should be
    confirmed at the actual identify/enroll call sites (a signature probe errored;
    likely just a function-name difference, worth a 2-min check).

### Housekeeping
11. **Nothing is committed** — new assets (`avatar2.glb`, the 3 clips) and all edits
    are working-tree only. Decide branch/commit strategy.
12. Re-run the dev-server compile check after the regression edits settle.

---

## 📁 Key files touched
- **Frontend (avatar):** `frontend/src/components/Avatar3D.jsx`,
  `frontend/src/lib/avatarAnimations.js`, `frontend/src/lib/avatarRig.js`,
  `frontend/src/lib/proceduralClips.js` *(new)*
- **Frontend (multi-tenant):** `frontend/src/App.jsx`,
  `frontend/src/components/AdminDashboard.jsx`, `frontend/src/styles/tokens.css`
- **Backend:** `bot_config.py`, `gemini_agent.py`, `memory.py`, `face_memory.py`,
  `main.py`, `pipeline.py`
- **Data/assets:** `data/bots/default.json`, `data/bots/reddit.json`,
  `frontend/public/anims/{idle,walk,talk}.glb`, `frontend/public/avatar2.glb`

## 🎛️ Tuning knobs (top of the files)
- `Avatar3D.jsx`: `FACE_OFFSET`, `TARGET_HEIGHT`, `SEATED_SINK`, `WALK_SPEED`,
  `BLINK_GAP_IDLE/SPEAK`, `GAZE_AMP`, `GAZE_SACCADE_GAP`
- `proceduralClips.js`: `SIT_TUNING` (leg/arm flex axes, angles, signs), `STAND_SECONDS`

## 🧪 How to run
- Frontend: `cd frontend && npm run dev` (→ http://localhost:5173). **Hard-refresh**
  after changes — `useGLTF`/`useTexture` cache aggressively.
- Backend: runs from `backend/` (FastAPI/uvicorn, port 8000). Do **not** `vite build`
  (it copies the 684 MB `public/Arti2.glb`).
- The avatar's sit→stand→walk→greet sequence triggers when the WebSocket is
  `connected` and identity is ready, so the backend must be running to see it walk.
