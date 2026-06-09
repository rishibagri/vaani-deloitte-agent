# Vaani - Deloitte Avatar Intelligence System

Vaani is a real-time, Deloitte-themed AI avatar interface for enterprise intelligence. It features a high-fidelity **3D office environment** powered by Three.js and React Three Fiber, providing an immersive experience for client pitches, conference rooms, and internal demos. The system leverages **Gemini Live** for ultra-low latency voice interaction and **MuseTalk** for high-quality lip-syncing.

---

## Key Features

- **3D Office Environment**: A fully realized 3D scene authored in real-world meters, featuring dynamic lighting, soft shadows, and furniture-aware navigation.
- **Dynamic Deloitte Branding**: Dynamic application of Deloitte brand identity, including logo application to the 3D scene (LogoCircle) and a white-label CSS token system.
- **Gemini Live Integration**: Real-time multilingual voice interaction (STT + LLM + TTS) with sub-second response times.
- **Advanced Lip-Sync**: State-of-the-art MuseTalk inference for synchronized video/3D avatar movement.
- **Presence State Machine**: The avatar intelligently transitions between seated, standing, and walking phases based on user detection.
- **Multi-Tenant Architecture**: Config-driven branding for different Deloitte teams or clients.

---

## Pipeline

```
Mic ──► Gemini Live (STT + LLM + TTS) ──► FastAPI Backend ──► Browser (3D Office)
                                       │                       │
                                       └──► MuseTalk (GPU) ────┴──► Avatar / Lip-sync
```

---

## Technical Stack

- **Frontend**: React 18, Vite, Three.js, React Three Fiber, Drei, Tailwind CSS (optional).
- **Backend**: Python 3.10, FastAPI, Uvicorn.
- **AI/ML**: Gemini Live API, MuseTalk (NVIDIA GPU), OpenCV (Face Recognition).
- **Infrastructure**: Docker-ready, Modal-optimized, Supabase/PostgreSQL for memory.

---

## Prerequisites

### Mac (M-series or Intel)

- Python 3.10 or later: `brew install python@3.10`
- Node.js 20 LTS: [nodejs.org](https://nodejs.org)
- ffmpeg (for video conversion): `brew install ffmpeg`

> MuseTalk lip-sync is disabled automatically on Mac (No CUDA). Gemini Live features work normally with video fallback.

### Windows (CUDA GPU)

- **Python 3.10** exactly.
- **Node.js 20 LTS**.
- **NVIDIA driver** (up to date).
- **Visual Studio C++ Build Tools** (Select "Desktop development with C++").

Verify your GPU is visible:
```bash
nvidia-smi
```

---

## Setup & Installation

### 1. Repository Setup
```bash
git clone https://github.com/YOUR_USERNAME/deloitte.git
cd deloitte
cp .env.example .env
```
Edit `.env` and add your `GEMINI_API_KEY`.

### 2. Backend Setup
**Mac:**
```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
```

**Windows:**
Run `scripts\setup.bat`. This handles venv creation, MuseTalk cloning, and GPU-specific dependencies.

### 3. Frontend Setup
```bash
cd frontend && npm install
```

### 4. Weights & Assets
**GPU Machines Only:** Run `scripts\download_models.bat` to fetch MuseTalk weights (~2GB).
**Face Recognition:** Run `scripts\install_face_recognition.bat` to fetch YuNet/SFace models.

---

## Running the App

### Mac
```bash
bash scripts/start_mac.sh
```

### Windows
```
scripts\run.bat
```

Access the interface at [http://localhost:5173](http://localhost:5173).

---

## 3D Environment & Customization

The 3D office is loaded from `frontend/public/office_room.glb`. 

### Dynamic Logo
The 3D scene includes a `LogoCircle` mesh. The system can dynamically swap textures on this mesh to match tenant branding. Ensure your logos are square PNGs for optimal fit.

### Custom Avatars
Vaani supports RPM (Ready Player Me) and Avaturn GLB models.
1. Place your `.glb` in `frontend/public/`.
2. Update `avatar_3d_url` in the bot configuration or via the Admin Dashboard.

---

## Configuration (Environment Variables)

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | **Required**. API key from Google AI Studio. |
| `RENDER_MODE` | `musetalk` | `musetalk`, `3d`, or `pinscreen`. |
| `AGENT_NAME` | `Vaani` | Name of the AI avatar. |
| `AGENT_VOICE` | `Puck` | Puck, Charon, Kore, Fenrir, Aoede. |
| `OFFICE_ROOM_URL` | `/office_room.glb` | URL to the environment GLB. |
| `AVATAR_3D_URL` | `/avatar.glb` | URL to the avatar GLB. |
| `ADMIN_PASSWORD` | `admin2026` | Password for the admin panel (`/#admin`). |

*See `.env.example` for the full list of overrides.*

---

## Persistent Memory & Face ID

Vaani can identify returning users and recall past conversations.
- **PostgreSQL**: Set `DATABASE_URL` for face-recognition storage.
- **Supabase**: Set `SUPABASE_URL` and `SUPABASE_KEY` for semantic conversation memory.

---

## Troubleshooting

- **MuseTalk Error**: Ensure you have Python 3.10 and `nvidia-smi` works.
- **Blank 3D Screen**: Verify `office_room.glb` exists in `frontend/public/`.
- **Audio Feedback**: Use headphones to prevent the avatar from hearing its own voice.
- **Admin Access**: Navigate to `http://localhost:5173/#admin` to manage bot personas and branding.

---

© 2024 Deloitte DCIT. All rights reserved.
