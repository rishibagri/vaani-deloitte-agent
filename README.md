# Vaani - Deloitte AI Avatar

Real-time multilingual AI avatar. Speak. It listens. It responds as a lip-synced avatar.

## Pipeline

Mic -> Gemini Live (STT + LLM + TTS) -> MuseTalk (lip sync) -> Browser

## Requirements

- Windows 10/11 with NVIDIA GPU (CUDA 11.7+)
- Python 3.10 (python.org)
- Node.js 20 LTS (nodejs.org)
- Git for Windows
- NVIDIA CUDA Toolkit 11.7

## Setup

1. Clone this repo
2. Put your `avatar_idle.mp4` in `data/video/` AND `frontend/public/`
3. Run `scripts/setup.bat`
4. Add your `GEMINI_API_KEY` to `.env`
5. Run `scripts/download_models.bat`
6. Run `scripts/run.bat`
7. Open `http://localhost:5173`

## Without a GPU

Set `MUSETALK_ENABLED=false` in `.env`. The app works fully but shows the
looped video without lip sync. All Gemini Live features still work.

## Kaggle development (GPU via ngrok)

1. Run `kaggle/session_start.py` cells in Kaggle
2. Run `kaggle/server_start.py` to get the ngrok URL
3. Add `VITE_BACKEND_URL=https://your-ngrok-url.app` to `.env`
4. Run frontend only: `cd frontend && npm run dev`

## Pre-rendering common responses

Add responses to `known_responses.txt` (one per line), then:

```
call backend\.venv\Scripts\activate.bat
cd backend
python prerender.py
```

Matching responses play instantly from disk at runtime.

## Language support

Auto-detected. Supports English, Hindi, Tamil, Telugu, Kannada, Malayalam,
Bengali, Gujarati, Marathi, Punjabi, Urdu, and Hinglish code-switching.

## Voice options

Change `AGENT_VOICE` in `.env`. Options: Puck, Charon, Kore, Fenrir, Aoede.
Test voices at aistudio.google.com before committing.
