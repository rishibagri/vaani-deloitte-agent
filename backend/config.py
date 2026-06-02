import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent.parent

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = "gemini-3.1-flash-live-preview"
GEMINI_VOICE   = os.getenv("AGENT_VOICE", "Puck")

AGENT_NAME = os.getenv("AGENT_NAME", "Vaani")
AGENT_ROLE = os.getenv("AGENT_ROLE", "Your AI Assistant")

SYSTEM_PROMPT = (
    f"You are {os.getenv('AGENT_NAME', 'Vaani')}, a multilingual AI assistant for Deloitte. "
    "You MUST respond in English by default. Only switch to another language if the user explicitly speaks to you in that language first. "
    "Speak in no more than 3 sentences unless a detailed answer is explicitly requested. "
    "Do not use bullet points, lists, or markdown. Speak in natural sentences only. "
    "If the user speaks in Hindi, Tamil, or another language, respond in that same language. "
    "If the user switches back to English, switch back immediately. "
    "If the user code-switches between Hindi and English, match that register naturally."
)

BACKEND_PORT  = int(os.getenv("BACKEND_PORT", 8000))
FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", 5173))

MUSETALK_DIR      = BASE_DIR / "musetalk"
MUSETALK_UNET_PATH = BASE_DIR / "models" / "musetalkV15" / "unet.pth"
MUSETALK_UNET_CFG  = BASE_DIR / "models" / "musetalkV15" / "musetalk.json"
MUSETALK_VERSION   = os.getenv("MUSETALK_VERSION", "v15")

BATCH_MS              = int(os.getenv("MUSETALK_BATCH_MS", 200))
SAMPLE_RATE_IN        = 16000
SAMPLE_RATE_GEMINI_OUT = 24000
SAMPLE_RATE_MUSETALK  = 16000

BASE_VIDEO_PATH      = BASE_DIR / "data" / "video" / "avatar_idle.mp4"
PRERENDERED_DIR      = BASE_DIR / "prerendered"
KNOWN_RESPONSES_FILE = BASE_DIR / "known_responses.txt"

CORS_ORIGINS = os.getenv("CORS_ORIGINS", f"http://localhost:{FRONTEND_PORT}").split(",")

DATABASE_URL   = os.getenv("DATABASE_URL", "")
MEMORY_ENABLED = bool(DATABASE_URL)

GEMINI_TEXT_MODEL = "gemini-2.0-flash"


def detect_musetalk_capable() -> bool:
    """Return True only when a CUDA GPU is present and model weights exist."""
    try:
        import torch
        if not torch.cuda.is_available():
            return False
        if not MUSETALK_UNET_PATH.exists():
            return False
        return True
    except ImportError:
        return False


_env_flag = os.getenv("MUSETALK_ENABLED", "auto").strip().lower()
if _env_flag == "auto":
    MUSETALK_ENABLED = detect_musetalk_capable()
    if not MUSETALK_ENABLED:
        print("[SETUP] MUSETALK_ENABLED=auto: no CUDA GPU or weights not found — disabling MuseTalk.")
elif _env_flag == "true":
    MUSETALK_ENABLED = True
else:
    MUSETALK_ENABLED = False


def validate():
    if not GEMINI_API_KEY:
        print("[SETUP] GEMINI_API_KEY is not set in .env")
        sys.exit(1)
    if MUSETALK_ENABLED and not MUSETALK_UNET_PATH.exists():
        print(f"[SETUP] MuseTalk weights not found at {MUSETALK_UNET_PATH}")
        print("[SETUP] Run scripts/download_models.bat or set MUSETALK_ENABLED=false in .env")
        sys.exit(1)
