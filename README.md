# Vaani - Deloitte Avatar Intelligence System

Vaani is a real-time multilingual AI avatar for Deloitte DCIT India. You speak, it listens via Gemini Live, generates a spoken response, and renders a lip-synced avatar in the browser. The interface is designed for enterprise demo settings: conference rooms, client pitches, and proof-of-concept presentations. MuseTalk lip sync activates automatically when a CUDA GPU is present.

## Pipeline

```
Mic ──► Gemini Live (STT + LLM + TTS) ──► FastAPI Backend ──► Browser
                                       │
                                       └──► MuseTalk (GPU only) ──► Canvas overlay
```

---

## Prerequisites

### Mac (M-series or Intel)

- Python 3.10 or later: `brew install python@3.10`
- Node.js 20 LTS: [nodejs.org](https://nodejs.org)
- Git: included with Xcode Command Line Tools (`xcode-select --install`)
- ffmpeg (for video conversion, if needed): `brew install ffmpeg`

> MuseTalk lip sync is disabled automatically on Mac because CUDA is not available. All Gemini Live features work normally without it.

### Windows / Alienware

- Python 3.10 from [python.org](https://python.org) — check **Add Python to PATH** during install
- Node.js 20 LTS from [nodejs.org](https://nodejs.org)
- Git for Windows from [git-scm.com](https://git-scm.com)
- NVIDIA CUDA Toolkit 11.7 from [developer.nvidia.com/cuda-toolkit-archive](https://developer.nvidia.com/cuda-toolkit-archive)

Verify CUDA installed correctly:

```
nvcc --version
```

---

## First-Time Setup

### Mac

```bash
git clone https://github.com/YOUR_USERNAME/deloitte.git
cd deloitte
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
cp .env.example .env
```

Then:

1. Open `.env` and add your `GEMINI_API_KEY`
2. Copy `avatar_idle.mp4` to `data/video/` and `frontend/public/`

### Windows

```
git clone https://github.com/YOUR_USERNAME/deloitte.git
cd deloitte
scripts\setup.bat
```

`setup.bat` handles everything: checks for Python/Node/Git/GPU, creates the virtual environment, installs all pip dependencies (GPU packages only if NVIDIA detected), runs `npm install`, and copies `.env.example` to `.env`.

After it finishes:

1. Open `.env` and add your `GEMINI_API_KEY`
2. Copy `avatar_idle.mp4` to `data\video\` and `frontend\public\`
3. Run `scripts\download_models.bat` to download MuseTalk weights (15-20 minutes, first time only)

---

## Running the App

### Mac

```bash
bash scripts/start_mac.sh
```

Open [http://localhost:5173](http://localhost:5173) in Chrome.

### Windows

```
scripts\run.bat
```

This opens two separate Command Prompt windows automatically — one for the backend, one for the frontend.

Open [http://localhost:5173](http://localhost:5173) in Chrome or Edge.

### Manual start (both platforms, if scripts do not work)

**Terminal 1 — Backend:**

```bash
# Mac
source backend/.venv/bin/activate
cd backend
python3 main.py

# Windows
backend\.venv\Scripts\activate
cd backend
python main.py
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm run dev
```

---

## Activating the Virtual Environment

> The venv activation only lasts for the current terminal session. If you close the terminal and reopen it, you must activate again.

```bash
# Mac
source backend/.venv/bin/activate

# Windows
backend\.venv\Scripts\activate
```

You will see `(.venv)` at the start of your prompt when it is active.

The frontend (`npm run dev`) does not need the venv. Only the backend needs it.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes | — | Gemini API key from Google AI Studio |
| `AGENT_NAME` | No | `Vaani` | Avatar display name |
| `AGENT_ROLE` | No | `Your AI Assistant` | Role shown to the model |
| `AGENT_VOICE` | No | `Puck` | Gemini voice: Puck, Charon, Kore, Fenrir, Aoede |
| `BACKEND_PORT` | No | `8000` | Backend server port |
| `FRONTEND_PORT` | No | `5173` | Frontend dev server port |
| `MUSETALK_ENABLED` | No | `auto` | `auto` detects CUDA; `true` forces on; `false` disables |
| `MUSETALK_BATCH_MS` | No | `200` | Audio batch size for lip sync (ms) |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Comma-separated allowed origins |
| `DATABASE_URL` | No | — | PostgreSQL URL for face-recognition memory (e.g. `postgresql://user@localhost:5432/vaani`) |
| `SUPABASE_URL` | No | — | Supabase project URL for semantic memory |
| `SUPABASE_KEY` | No | — | Supabase anon key |

---

## Coming from Mac to Windows (or any new machine)

These items are gitignored and must be set up on each machine:

| Item | What to do |
|---|---|
| `backend/.venv/` | Run `scripts\setup.bat` — it recreates the venv |
| `frontend/node_modules/` | `setup.bat` runs `npm install` automatically |
| `models/` | Run `scripts\download_models.bat` (15-20 min, GPU machines only) |
| `.env` | Copy your `.env` from the old machine, or re-add your `GEMINI_API_KEY` |
| `avatar_idle.mp4` | Copy from your Mac to `data\video\` and `frontend\public\` on Windows |

---

## Optional: Supabase Memory Layer

Vaani can store conversation summaries with semantic embeddings so Vaani recalls past interactions across sessions.

1. Create a free project at [supabase.com](https://supabase.com)
2. Open the SQL editor in your Supabase dashboard and run the schema from the top of `backend/memory.py`
3. Copy your project URL and anon key into `.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

If these variables are blank, Vaani falls back to a local `data/memory.json` file. The app works fully either way.

---

## Optional: PostgreSQL Face Recognition Memory

When a `DATABASE_URL` is set, Vaani identifies returning users by face using `face_recognition` (dlib-based). On first visit, users are asked their name. On return visits, Vaani greets them by name and uses past conversation summaries as context.

```
DATABASE_URL=postgresql://rishii3@localhost:5432/vaani
```

The schema is created automatically on first connection. To install the face recognition library:

```bash
pip install cmake dlib face_recognition
```

---

## Pre-rendering Common Responses

Add expected responses to `known_responses.txt` (one per line), then:

```bash
# Mac
source backend/.venv/bin/activate
cd backend
python3 prerender.py

# Windows
call backend\.venv\Scripts\activate.bat
cd backend
python prerender.py
```

Matching responses play instantly from disk at runtime with no Gemini round-trip.

---

## Kaggle Development (GPU via ngrok)

1. Run `kaggle/session_start.py` cells in a Kaggle notebook
2. Run `kaggle/server_start.py` to get the ngrok tunnel URL
3. Add `VITE_BACKEND_URL=https://your-ngrok-url.app` to `.env`
4. Run frontend only locally: `cd frontend && npm run dev`

---

## Troubleshooting

**Blank screen on first load**
Check that `frontend/src/main.jsx` exists and `index.html` references it. Clear the browser cache and reload.

**App shows Offline**
The backend is not running or not reachable on port 8000. Start the backend first. Check that `VITE_BACKEND_URL` is not set (leave blank for localhost). The backend terminal should show `Ready. Waiting for connections.`

**Stuck in thinking state after speaking**
Check the backend terminal for `[GEMINI] Send error` messages. Restart the backend. If it persists, confirm `GEMINI_API_KEY` is valid and the key has access to `gemini-3.1-flash-live-preview`.

**MuseTalk not loading on Windows**
Run `nvcc --version` in Command Prompt to confirm CUDA is installed. Run `scripts\download_models.bat` if the `models\` folder is empty or missing. Check the backend terminal for `[MUSETALK]` error messages on startup.

**WebSocket keeps disconnecting**
The Gemini Live session has a 15-minute limit. The backend renews it automatically. If disconnects happen immediately, check your internet connection and API key quota.

**Avatar video not showing**
Confirm `avatar_idle.mp4` exists in both `data/video/` and `frontend/public/`. If you only have a still image, convert it to a looped video:

```bash
ffmpeg -loop 1 -i your_photo.jpg -t 5 -c:v libx264 -pix_fmt yuv420p avatar_idle.mp4
```

**Boot sequence plays on every refresh**
This is expected on first load per browser tab. The boot sequence stores a `sessionStorage` flag — it will not replay within the same tab session. Open a new tab to see it again.
