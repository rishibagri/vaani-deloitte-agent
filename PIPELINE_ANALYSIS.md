# Vaani — Pipeline Analysis
**Date:** 2026-06-03 | **Prepared for:** Rishi Bagri

---

## 1. System Overview

Vaani is a real-time AI avatar system for Deloitte DCIT India. It connects a browser client to a Python backend that brokers between the user's microphone, Google Gemini Live (LLM + TTS), and an avatar rendering pipeline. Three separate avatar render modes exist; only one is active at a time, selected via the admin panel.

```
Browser (React/Vite)
    │
    ├── Mic audio (PCM 16kHz) ──────────────► Backend WebSocket
    │                                               │
    │                                     GeminiAgent.send_audio()
    │                                               │
    │                                    Gemini Live API (bidirectional)
    │                                               │
    │                                     ┌─────────┴──────────┐
    │                               Audio PCM 24kHz         Transcripts
    │                                     │                      │
    │                            ┌────────┴────────┐             │
    │                       [musetalk]         [pinscreen/3d]     │
    │                       GPU lip-sync       Audio only         │
    │                       → video frames     → no video         │
    │                            └────────┬────────┘             │
    │                                     │                      │
    │◄── Audio (0x01 prefix) ─────────────┘                      │
    │◄── Video frames (0x02) ─────────────┘ (musetalk only)      │
    │◄── JSON (state/transcript) ─────────────────────────────────┘
    │
    ├── useAudioPlayback: decode PCM → Web Audio API → speaker
    ├── AvatarDisplay: display MJPEG frames (musetalk mode)
    └── PinScreenAvatar / Avatar3D: browser-rendered avatar
```

---

## 2. Backend Components

### 2.1 `gemini_agent.py` — Gemini Live Bridge

| Property | Value |
|---|---|
| Model | `gemini-3.1-flash-live-preview` (configurable per bot) |
| Voice | `Puck` (configurable) |
| Input | PCM 16kHz int16, streamed chunk-by-chunk |
| Output | PCM 24kHz int16 (audio) + transcripts |
| Transcription | Both input and output, with language detection |
| Session renewal | Auto-renews at 14 minutes (Gemini Live limit) |
| Barge-in | `ActivityStart`/`ActivityEnd` signals, queue flush on interrupt |
| Language | Detected from Gemini ASR output; clamped to supported set (anti-Spanish-drift fix applied) |

**Audio flow:**
```
Browser mic chunks → audio_input_queue → _send_loop → Gemini
Gemini response → _receive_loop → output_queue → SessionPipeline
```

**Reconnection:** The receive loop auto-reconnects on stream closure with exponential backoff (0.2s–5s).

---

### 2.2 `pipeline.py` — SessionPipeline

One instance per WebSocket connection. Orchestrates all output routing.

**State machine:**
```
idle ──► listening ──► thinking ──► speaking ──► idle
              ▲                          │
              └──────── barge-in ◄───────┘
```

**Binary message routing:**
- `0x01` prefix → PCM audio chunk → browser `useAudioPlayback`
- `0x02` prefix → JPEG video frame → browser `AvatarDisplay` (MuseTalk mode only)

**MuseTalk gating (as of today):**
```python
if musetalk.loaded and loop_cache.loaded and _musetalk_active():
    accumulate → flush GPU inference
```
`_musetalk_active()` re-reads `bot_config` on every chunk — mode switches take effect immediately without restart.

**Known responses:** Pre-rendered video clips for common phrases (fuzzy-matched at >90% sequence ratio). Near-zero latency for matched responses.

---

### 2.3 `musetalk_wrapper.py` — MuseTalk V1.5 Lip Sync

| Property | Value |
|---|---|
| Architecture | UNet (diffusion-based) + VAE encoder/decoder |
| Whisper | Per-chunk audio encoding for lip feature extraction |
| Input audio | 16kHz mono int16 (resampled from 24kHz Gemini output) |
| Output | JPEG video frames at 25fps |
| Batch size | 16 frames per UNet forward pass (configurable) |
| Precision | FP16 by default (2× faster on GPU) |
| Mouth cache | Cosine-similarity cache for repeated visemes (512-slot LRU, 0.96 threshold) |
| Coalescing | 640ms audio windows (amortizes fixed Whisper cost over a full GPU batch) |
| GPU requirement | CUDA GPU required; auto-disabled on CPU-only machines |

**Bottleneck:** Whisper encoder runs once per 640ms window. Each window produces ~16 video frames. On an RTX 5000 Ada this should run well under real-time.

---

### 2.4 `main.py` — FastAPI Server

**Endpoints:**
| Method | Path | Purpose |
|---|---|---|
| POST | `/session` | Create session ID, return to browser |
| POST | `/session/{id}/identify` | Face recognition (webcam frame) |
| POST | `/session/{id}/enroll` | Enroll new face + name |
| GET | `/config` | Bot config for current browser session |
| WS | `/ws/session/{id}` | Main bidirectional channel |
| GET/POST | `/admin/*` | Bot config CRUD, LLM/voice/render settings |

**MuseTalk lazy-load:** Models load on first musetalk-mode session, not at startup. Pinscreen/3D modes skip model loading entirely — instant startup.

---

### 2.5 `bot_config.py` — Multi-Bot Configuration

Bots are stored as JSON files in `data/bots/`. The active bot is set via the admin panel.

**Current default bot config:**
```json
{
  "render_mode":        "pinscreen",
  "agent_name":         "Vaani",
  "agent_voice":        "Puck",
  "llm_model":          "gemini-3.1-flash-live-preview",
  "avatar_3d_url":      "/avatar.glb",
  "pinscreen_image_url": "",
  "primary_color":      "#86BC25"
}
```

**Available render modes:**
| Mode | What renders | GPU needed |
|---|---|---|
| `pinscreen` | Browser R3F pin wall (current) | No |
| `3d` | Browser Three.js holographic GLB (Zordon style) | No |
| (default/musetalk) | Backend MuseTalk JPEG frames | Yes (CUDA) |

---

### 2.6 `face_memory.py` — Face Recognition + Memory

- PostgreSQL-backed (Supabase or local)
- DeepFace for face recognition (SFace model)
- Stores: user name, role, preferred language, conversation summaries
- On session start: identify → welcome returning users, prompt new users for name
- Memory context injected into Gemini system prompt

---

## 3. Frontend Components

### 3.1 `useWebSocket.js` — WebSocket Hook
- Auto-reconnects with exponential backoff
- Routes binary: `0x01` → `useAudioPlayback`, `0x02` → `AvatarDisplay`
- Routes JSON: state updates, transcripts, suggestions, session events

### 3.2 `useAudioPlayback.js` — Audio Playback
- `AudioContext` at 24kHz (matches Gemini output sample rate)
- PCM int16 → Float32 → `AudioBufferSourceNode` → `AnalyserNode` → speaker
- `getLevel()` — RMS amplitude 0..1, polled every frame for lip sync
- `getFrequencies()` — Uint8Array FFT bins (512 bins, ~46.9 Hz each) — **added today**

### 3.3 `useMicrophone.js` — Mic Capture
- `getUserMedia` → `ScriptProcessorNode` → PCM 16kHz chunks → WebSocket binary

### 3.4 `PinScreenAvatar.jsx` — Pin Wall Renderer (current active mode)

**Grid:** 190 columns × 105 rows = 19,950 instanced cylinder pins  
**Geometry:** `CylinderGeometry` (8-sided), Z-axis aligned, depth-scaled per pin  
**Material:** `MeshStandardMaterial`, metalness 0.72, roughness 0.30, vertex colors  

**Depth map pipeline (runs once at GLB load):**
```
1. Find face mesh (most morph targets = head mesh)
2. Transform all vertices: local → worldMatrix → center + scale to fit field
3. Create temp mesh with identity matrix (no matrixWorld manipulation)
4. Probe direction: try ±Z from center pins, pick direction with most hits
5. Raycast 19,950 pins → rawZ depths → normalize → baseH[]
6. Blend procedural lip anatomy into mouth zone (closed GLB = flat mouth)
7. For each viseme morph (jawOpen, mouthFunnel, mouthStretch):
   → Apply morph delta to LOCAL vertices → transform to face space
   → Raycast mouth band → normalize → store as jawOpenH[], funnelH[], mouthSpreadH[]
```

**Per-frame lip sync (60fps):**
```
getFrequencies() → FFT formant analysis → viseme weights {jaw, funnel, spread}
    smoothed at ~70ms (delta * 14 lerp)
    
pin_height = baseH[i]
    + (jawOpenH[i]     - baseH[i]) * jaw_weight     ← AH/AA sounds
    + (funnelH[i]      - baseH[i]) * funnel_weight  ← OOH/UH sounds
    + (mouthSpreadH[i] - baseH[i]) * spread_weight  ← EEE/IH sounds
```

**Animation modes:**
- **Wave mode** (`showFace=false`): Organic layered-sine noise across all pins
- **Face mode** (`showFace=true`): GLB depth map + viseme lip sync + residual wave (12%)
- **Transition:** lerp over ~0.4s when appState switches from idle

**Lighting (fill mode):**
- Ambient: 0.10, color `#1A2030`
- Main directional: `[-2.8, 3.5, 5.5]`, intensity 3.2 (raking light for pin shadows)
- Fill: `[2.5, -2.0, 3.0]`, intensity 0.55, warm

### 3.5 `PinWallStage.jsx` — Cinematic Shell
- Fullscreen layout wrapping `PinScreenAvatar`
- Hover-reveal macOS-style dock (brand, language, timer, status, admin)
- `showFace` state: true when appState ≠ idle (2.2s debounce before returning to wave)
- Corner HUD readouts (decorative)
- Bottom strip: transcript + mic button
- Radial vignette

### 3.6 `Avatar3D.jsx` — Zordon 3D Mode (inactive)
- Three.js holographic head with energy bloom
- Voice-driven glow surge + materialize flicker animation
- Uses same `avatar.glb`

### 3.7 `AvatarDisplay.jsx` — MuseTalk Video Mode (inactive)
- Renders MJPEG frames from backend as a talking head video
- Canvas-based, 25fps

---

## 4. Current Lip Sync Approaches

### Mode A: MuseTalk (GPU backend, video frames)
```
Gemini audio (24kHz) → resample 16kHz → Whisper encoder → UNet → VAE → JPEG frames
                                                                    ↓
                                                          Browser canvas @ 25fps
```
- **Accuracy:** High — generates actual mouth video from audio
- **Latency:** ~640ms window + GPU inference time
- **Requirement:** CUDA GPU, MuseTalk V1.5 weights (~2GB)
- **Status:** Working, tested on RTX hardware

### Mode B: Pin Wall FFT Viseme (browser, current)
```
Gemini audio (24kHz) → Web Audio AnalyserNode → FFT 512 bins
    → formant analysis (80–500Hz, 450–1400Hz, 1400–3500Hz, 3500–8000Hz)
    → {jaw, funnel, spread} viseme weights
    → blend pre-computed 3D depth maps
    → 19,950 pin heights updated @ 60fps
```
- **Accuracy:** Phoneme-class level (open/round/spread — not phoneme-exact)
- **Latency:** <1 frame (~16ms)
- **Requirement:** None (pure browser JS)
- **Status:** Implemented today — needs testing/tuning

### Mode C: 3D Holographic (browser, Zordon)
- No lip sync — energy animations only
- Face is a 3D GLB rendered normally, not as a depth map

---

## 5. Known Issues / Gaps

| Issue | Severity | Status |
|---|---|---|
| Mouth region flat in GLB (closed-mouth T-pose) | High | Partially fixed — procedural blend applied |
| Viseme depth maps may be empty if Avaturn exports morph names differently | High | Code searches multiple name variants; needs test |
| FFT formant analysis gives phoneme-class not phoneme-exact | Medium | By design; acceptable for demo |
| Canvas right-side gap on Chrome with sidebar | Fixed | `position:fixed; width:100vw` |
| Spanish-drift on noisy audio | Fixed | `normalize_language()` in backend |
| MuseTalk keeps running after mode switch | Fixed | `_musetalk_active()` checks per-chunk |
| Pin wall shows fallback orb when R3F crashes | Low | ErrorCatcher → FallbackOrb |
| No auth on WebSocket or admin panel | Medium | Not yet addressed |

---

## 6. Alternative Pipeline Options

The following are possible paths you could choose for the lip sync layer. Each has different tradeoffs:

### Option 1: Current (FFT Formant → Pre-computed Depth Maps)
- **How:** Web Audio FFT → estimate vowel class → blend between 3D geometry depth maps
- **Pros:** Zero dependencies, <1 frame latency, cross-platform
- **Cons:** Not phoneme-exact; relies on Avaturn having named morph targets

### Option 2: OVRLipSync (Meta, WebAssembly, free)
- **How:** Load `ovrlipsync.wasm` in a WebWorker → pipe PCM 16kHz → get 15 viseme weights @ 30fps → drive GLB morphs → re-sample depth maps
- **Pros:** Industry-standard accuracy used in Oculus/Meta avatars; 15 distinct viseme shapes
- **Cons:** Needs WASM download (~3MB); ~33ms viseme latency; must be piped from the audio source
- **Link:** github.com/facebookresearch/OVRLipSync-Web

### Option 3: Rhubarb Lip Sync (server-side, local CLI)
- **How:** Buffer each Gemini response audio → run `rhubarb -f json audio.wav` → get timed phoneme list → send to browser as a JSON event → play back with frame-accurate timing
- **Pros:** Most accurate phoneme timing; deterministic; works offline
- **Cons:** Not real-time (processes full utterance); adds ~200–500ms delay after speech ends before animation starts
- **Link:** github.com/DanielSWolf/rhubarb-lip-sync

### Option 4: MuseTalk driving the Pin Wall
- **How:** Run MuseTalk as today (JPEG frames) but instead of displaying the video, extract per-frame mouth-region depth via a lightweight face-mesh model, send as a `depth_frame` WebSocket event, use it to drive pin heights
- **Pros:** Uses the already-built, GPU-accelerated MuseTalk pipeline; photorealistic accuracy
- **Cons:** Complex to extract depth from JPEG; doubles the render work; adds MuseTalk's existing latency (~640ms)

### Option 5: MediaPipe FaceLandmarker (browser, webcam mirror)
- **How:** Run MediaPipe on the user's webcam feed → track 478 face landmarks in real-time → extract jaw/lip positions → map to GLB morph targets → depth-map pipeline
- **Pros:** Real-time (30fps), very accurate, no audio analysis needed
- **Cons:** Mirrors the USER's face movements onto the avatar (wrong for a bot talking) — only works if the bot is pre-recorded or if you want user-mirroring
- **Link:** developers.google.com/mediapipe/solutions/vision/face_landmarker

### Option 6: Azure Cognitive Services — Speech Viseme Events
- **How:** Replace Gemini's TTS with Azure Neural Voice → Azure fires `viseme` events (21 IETF viseme IDs + blend shapes) synchronized to the audio stream → drive GLB morphs in real-time
- **Pros:** Frame-accurate viseme sync; 21 shapes; works across all avatars
- **Cons:** Requires Azure subscription; replaces Gemini TTS entirely; adds Azure dependency

### Option 7: ElevenLabs TTS + WebSocket Alignment
- **How:** Replace Gemini TTS with ElevenLabs Streaming API → ElevenLabs can stream audio with word-level timestamps → combine with phoneme lookup table → approximate viseme timing
- **Pros:** Very natural voice; existing streaming API
- **Cons:** Replaces Gemini voice; no native viseme output (would need phoneme approximation)

---

## 7. Data Flow Diagram (Current State)

```
USER SPEAKS
     │
     ▼
useMicrophone (PCM 16kHz)
     │ WebSocket binary
     ▼
SessionPipeline.handle_browser_message()
     │
     ▼
GeminiAgent.send_audio() → [ActivityStart/audio chunks/ActivityEnd]
                                        │
                              Gemini Live API
                                        │
                    ┌───────────────────┤
                    │                   │
              Audio (PCM 24kHz)    Transcripts + lang
                    │                   │
                    ▼                   ▼
         SessionPipeline._process_output()
                    │
          ┌─────────┴──────────┐
          │                    │
    send(0x01 + audio)    send_json(state/transcript)
          │                    │
          ▼                    ▼
   useAudioPlayback      useConversation
          │                    │
    AnalyserNode         agentText, userText
          │                    │
    getLevel()           TranscriptOverlay
    getFrequencies()           │
          │            PinWallStage bottom strip
          ▼
    PinScreenAvatar.useFrame()
          │
    estimateVisemes(FFT)
          │
    blend(baseH, jawOpenH, funnelH, spreadH)
          │
    19,950 pin heights → InstancedMesh → WebGL
```

---

## 8. File Map

```
vaani-deloitte-agent/
├── backend/
│   ├── main.py              FastAPI app, WebSocket endpoint, session lifecycle
│   ├── pipeline.py          Per-session audio/video routing, state machine
│   ├── gemini_agent.py      Gemini Live client, reconnection, transcription
│   ├── musetalk_wrapper.py  MuseTalk V1.5 GPU inference wrapper
│   ├── loop_cache.py        Avatar video loop cache (idle animation frames)
│   ├── bot_config.py        Multi-bot JSON config, admin CRUD
│   ├── config.py            Environment vars, system prompt, language guard
│   ├── face_memory.py       DeepFace recognition + PostgreSQL memory
│   ├── memory.py            Supabase/local semantic conversation memory
│   ├── audio_utils.py       Resampling (24kHz→16kHz), JPEG encoding
│   └── prerender.py         Pre-rendered response video generation
│
├── frontend/src/
│   ├── App.jsx              Router, all hooks wired, boot/connect overlays
│   ├── hooks/
│   │   ├── useWebSocket.js  WS connection, binary routing
│   │   ├── useAudioPlayback.js  PCM playback, AnalyserNode, getLevel/getFrequencies
│   │   ├── useMicrophone.js PCM capture → WS
│   │   ├── useConversation.js  Message history, word streaming
│   │   └── useFaceCapture.js   Webcam capture for face ID
│   ├── components/
│   │   ├── PinScreenAvatar.jsx  Pin wall renderer, GLB raycasting, viseme lip sync
│   │   ├── PinWallStage.jsx     Cinematic layout shell, dock, transcript
│   │   ├── Avatar3D.jsx         Zordon holographic mode
│   │   ├── AvatarDisplay.jsx    MuseTalk video mode
│   │   ├── AdminDashboard.jsx   Bot config UI, render mode selector
│   │   └── [misc UI components]
│   └── styles/
│       ├── tokens.css       Design tokens (colors, spacing, z-index, easing)
│       └── animations.css   Keyframe library
│
└── data/
    └── bots/
        └── default.json     Active bot config
```

---

## 9. Questions for You

Please edit this document and mark your preferred options. Specifically:

1. **Lip sync method:** Which pipeline from Section 6 do you want? (Current FFT / OVRLipSync / Rhubarb / MuseTalk depth / Azure / other?)

2. **Avatar rendering:** Keep the pin wall as primary? Or switch to a different approach entirely for the demo?

3. **Voice:** Keep Gemini's voice (Puck)? Or replace TTS with ElevenLabs/Azure for better viseme support?

4. **Face model:** The Avaturn GLB is used for face shape. Are you happy with it, or do you want a different model?

5. **Demo priority:** What needs to work perfectly for the Deloitte demo — focus on the visual (pin wall looks great) or the accuracy (lip sync is precise)?

6. **Windows RTX 5000 Ada:** Do you want MuseTalk re-enabled on the Windows machine for the demo? (It would run well on that GPU.)

---

*Generated by Claude Code — 2026-06-03*
