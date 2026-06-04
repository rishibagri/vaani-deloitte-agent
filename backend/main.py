import asyncio
import base64
import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header as HTTPHeader, HTTPException, Depends, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response as FastResponse
from pydantic import BaseModel

from config import validate, CORS_ORIGINS, MUSETALK_ENABLED, BACKEND_PORT, MEMORY_ENABLED, DATABASE_URL, GEMINI_API_KEY, BASE_DIR, BASE_VIDEO_PATH
from loop_cache import LoopCache
from musetalk_wrapper import MuseTalkModel
from pipeline import SessionPipeline

loop_cache = LoopCache()
musetalk = MuseTalkModel()

active_sessions: dict[str, SessionPipeline] = {}
_session_user_map: dict[str, int] = {}

# Track which bot's avatar is currently loaded into the loop cache, plus a lock
# so two sessions never rebuild it at the same time.
_loaded_avatar_sig: Optional[str] = None
_avatar_lock = asyncio.Lock()

# Lock guarding the lazy MuseTalk model load so two sessions never load at once.
_musetalk_load_lock = asyncio.Lock()


def _active_render_mode() -> str:
    """Render mode of the currently-active bot ('musetalk' or '3d')."""
    try:
        from bot_config import get_active
        return get_active().get("render_mode") or "musetalk"
    except Exception:
        return "musetalk"


async def _ensure_musetalk_loaded():
    """
    Lazily load the MuseTalk models the first time a musetalk-mode session needs
    them. In 3d mode this is never called, so no GPU work happens at all.
    """
    if not MUSETALK_ENABLED or musetalk.loaded:
        return
    async with _musetalk_load_lock:
        if musetalk.loaded:  # re-check after acquiring the lock
            return
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, musetalk.load)
        print("[SETUP] MuseTalk models loaded (lazy).")


def _resolve_avatar_video() -> Path:
    """Return a file path for the active bot's avatar video (default if none/custom-missing)."""
    try:
        from bot_config import get_active
        bot = get_active()
        url = bot.get("avatar_video_url")
        if url and url.startswith("data:video"):
            header, b64 = url.split(",", 1)
            ext = "webm" if "webm" in header else "mp4"
            out = BASE_DIR / "data" / "video" / f"active_{bot['id']}.{ext}"
            out.parent.mkdir(parents=True, exist_ok=True)
            if not out.exists():
                out.write_bytes(base64.b64decode(b64))
            return out
    except Exception as e:
        print(f"[SETUP] Avatar video resolve failed, using default: {e}")
    return BASE_VIDEO_PATH


async def ensure_avatar_loaded():
    """Rebuild the loop cache + latents for the active bot's avatar if it changed.

    In any non-'musetalk' render mode (e.g. '3d', 'pinscreen') the browser
    renders the face, so the backend does no lip-sync: skip MuseTalk + the loop
    cache entirely. In 'musetalk' mode, make sure the (lazily-loaded) models are
    ready before building the loop cache.
    """
    global _loaded_avatar_sig
    if not MUSETALK_ENABLED:
        return
    if _active_render_mode() != "musetalk":
        return
    await _ensure_musetalk_loaded()
    if not musetalk.loaded:
        return
    try:
        from bot_config import get_active
        bot = get_active()
        sig = f"{bot.get('id')}::{hash(bot.get('avatar_video_url') or 'default')}"
    except Exception:
        sig = "default"
    if sig == _loaded_avatar_sig:
        return
    async with _avatar_lock:
        if sig == _loaded_avatar_sig:  # re-check after acquiring the lock
            return
        path = _resolve_avatar_video()
        loop = asyncio.get_event_loop()

        def _rebuild():
            loop_cache.load(path)
            if loop_cache.loaded:
                musetalk.prepare_latents(loop_cache.face_crops)

        await loop.run_in_executor(None, _rebuild)
        _loaded_avatar_sig = sig
        print(f"[SETUP] Avatar loaded for bot: {sig}")

face_memory = None
if MEMORY_ENABLED:
    from face_memory import FaceMemory
    face_memory = FaceMemory(DATABASE_URL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate()
    print("[SETUP] Starting Vaani backend...")

    if MEMORY_ENABLED and face_memory is not None:
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, face_memory.connect)
            print("[SETUP] Memory layer connected")
        except Exception as e:
            print(f"[SETUP] Memory layer failed to connect: {e}")

    if not MUSETALK_ENABLED:
        print("[SETUP] MuseTalk disabled. Avatar will show loop video only.")
    elif _active_render_mode() != "musetalk":
        # Browser render modes (3D / pin-screen): the browser renders the face
        # and the backend only streams audio — skip MuseTalk model load + loop
        # cache build for instant startup.
        print(f"[SETUP] Active bot is in '{_active_render_mode()}' render mode. Skipping MuseTalk (instant startup).")
    else:
        # MuseTalk mode: models load lazily on the first session via
        # ensure_avatar_loaded(), which also builds the loop cache + latents.
        await ensure_avatar_loaded()

    print("[SETUP] Ready. Waiting for connections.")
    yield

    print("[SETUP] Shutting down...")
    for pipeline in active_sessions.values():
        await pipeline.stop()
    active_sessions.clear()
    if face_memory is not None:
        face_memory.close()


app = FastAPI(title="Vaani Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "musetalk_loaded": musetalk.loaded,
        "loop_cache_loaded": loop_cache.loaded,
        "active_sessions": len(active_sessions),
        "gpu_available": _gpu_available()
    }


@app.post("/session")
async def create_session():
    session_id = str(uuid.uuid4())
    return {"session_id": session_id}


@app.get("/transcript/{session_id}")
async def get_transcript(session_id: str):
    return {"session_id": session_id, "transcript": []}


class FaceImageBody(BaseModel):
    image: str  # base64 data-URL or raw base64


class EnrollBody(BaseModel):
    image: str
    name: str
    role: Optional[str] = None


@app.post("/session/{session_id}/identify")
async def identify_user(session_id: str, body: FaceImageBody):
    """Try to identify the user by face. Returns known=True + profile or known=False."""
    if face_memory is None or not face_memory.available:
        return {"known": False, "reason": "face_recognition_unavailable"}
    if not face_memory.connected:
        return {"known": False, "reason": "db_unavailable"}

    try:
        loop = asyncio.get_event_loop()
        user = await loop.run_in_executor(None, face_memory.identify, body.image)
    except Exception as e:
        print(f"[MEMORY] identify error: {e}")
        return {"known": False, "reason": "db_unavailable"}

    if user is None:
        return {"known": False}

    _session_user_map[session_id] = user["id"]
    return {"known": True, **user}


@app.post("/session/{session_id}/enroll")
async def enroll_user(session_id: str, body: EnrollBody):
    """Enroll a new user by face + name. Returns their profile."""
    if face_memory is None or not face_memory.available:
        return {"enrolled": False, "reason": "face_recognition_unavailable"}
    if not face_memory.connected:
        return {"enrolled": False, "reason": "db_unavailable"}

    try:
        loop = asyncio.get_event_loop()
        user = await loop.run_in_executor(
            None,
            lambda: face_memory.enroll(body.image, body.name, body.role),
        )
    except Exception as e:
        print(f"[MEMORY] enroll error: {e}")
        return {"enrolled": False, "reason": "db_error"}

    if user is None:
        return {"enrolled": False, "reason": "no_face_detected"}

    _session_user_map[session_id] = user["id"]
    return {"enrolled": True, **user}


@app.websocket("/ws/session/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    print(f"[BROWSER] Connected: {session_id}")

    # Make sure the loop cache matches the currently-active bot's avatar
    # (rebuilds if the admin switched bots since the last session).
    await ensure_avatar_loaded()

    async def send_bytes(data: bytes):
        try:
            await websocket.send_bytes(data)
        except Exception as e:
            print(f"[BROWSER] send_bytes error: {e}")

    async def send_json(data: dict):
        try:
            await websocket.send_json(data)
        except Exception as e:
            print(f"[BROWSER] send_json error: {e}")

    user_id = _session_user_map.pop(session_id, None)
    user_context = ""
    if user_id is not None and face_memory is not None:
        loop = asyncio.get_event_loop()
        user_context = await loop.run_in_executor(
            None, face_memory.get_context_prompt, user_id
        )

    # Append semantic memory context (Supabase or local JSON)
    try:
        from memory import get_relevant_context
        mem_ctx = await get_relevant_context("general conversation", limit=3)
        if mem_ctx:
            user_context = f"{user_context}\n\n{mem_ctx}".strip() if user_context else mem_ctx
    except Exception as e:
        print(f"[MEMORY] Context fetch error: {e}")

    pipeline = SessionPipeline(
        session_id=session_id,
        loop_cache=loop_cache,
        musetalk=musetalk,
        send_bytes=send_bytes,
        send_json=send_json,
        user_id=user_id,
        user_context=user_context,
        face_memory=face_memory,
    )

    active_sessions[session_id] = pipeline

    try:
        await pipeline.start()

        while True:
            # websockets can receive bytes (audio) or text (control JSON)
            message = await websocket.receive()
            if "bytes" in message and message["bytes"]:
                await pipeline.handle_browser_message(message["bytes"])
            elif "text" in message and message["text"]:
                await pipeline.handle_browser_message(message["text"])

    except WebSocketDisconnect:
        print(f"[BROWSER] Disconnected: {session_id}")
    except Exception as e:
        print(f"[BROWSER] Unexpected error for {session_id}: {e}")
    finally:
        await pipeline.stop()
        active_sessions.pop(session_id, None)


def _gpu_available() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


# ── Admin auth ────────────────────────────────────────────────────────────────

_admin_tokens: dict[str, float] = {}
_ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin2026")
_TOKEN_TTL = 8 * 3600  # 8 hours


def _require_admin(authorization: Optional[str] = HTTPHeader(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization[7:]
    expires = _admin_tokens.get(token)
    if not expires or time.time() > expires:
        _admin_tokens.pop(token, None)
        raise HTTPException(status_code=401, detail="Token expired or invalid")
    return token


class _AdminLoginBody(BaseModel):
    password: str


@app.post("/admin/login")
async def admin_login(body: _AdminLoginBody):
    if body.password != _ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    token = str(uuid.uuid4())
    _admin_tokens[token] = time.time() + _TOKEN_TTL
    return {"token": token}


@app.get("/config")
async def get_config():
    from bot_config import public_view
    return public_view()


# ── Voice preview ─────────────────────────────────────────────────────────────

@app.get("/admin/test-voice")
async def test_voice_preview(
    voice_name: str = Query(...),
    text: str = Query("Hello! I am your interactive AI voice assistant. How does my voice sound?"),
    _token: str = Depends(_require_admin),
):
    import base64
    try:
        from google import genai as _genai
        from google.genai import types as _types
    except ImportError:
        raise HTTPException(status_code=500, detail="google-genai not installed")

    try:
        client = _genai.Client(api_key=GEMINI_API_KEY)
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash-preview-tts",
            contents=f"Please generate audio for the following text: {text}",
            config=_types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=_types.SpeechConfig(
                    voice_config=_types.VoiceConfig(
                        prebuilt_voice_config=_types.PrebuiltVoiceConfig(voice_name=voice_name)
                    )
                ),
            ),
        )
        audio_data = response.candidates[0].content.parts[0].inline_data.data
        raw_bytes = base64.b64decode(audio_data)
        return FastResponse(content=raw_bytes, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Voice preview failed: {e}")


# ── Bot CRUD ──────────────────────────────────────────────────────────────────

@app.get("/bots")
async def list_bots_route(_token: str = Depends(_require_admin)):
    from bot_config import list_bots, get_active_slug
    bots = list_bots()
    active = get_active_slug()
    for b in bots:
        b["active"] = b["id"] == active
    return bots


@app.post("/bots")
async def create_bot_route(request: Request, _token: str = Depends(_require_admin)):
    from bot_config import create_bot
    data = await request.json()
    return create_bot(data)


@app.get("/bots/{slug}")
async def get_bot_route(slug: str, _token: str = Depends(_require_admin)):
    from bot_config import get_bot
    bot = get_bot(slug)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot


@app.put("/bots/{slug}")
async def update_bot_route(slug: str, request: Request, _token: str = Depends(_require_admin)):
    from bot_config import update_bot
    updates = await request.json()
    bot = update_bot(slug, updates)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot


@app.delete("/bots/{slug}")
async def delete_bot_route(slug: str, _token: str = Depends(_require_admin)):
    from bot_config import delete_bot
    if not delete_bot(slug):
        raise HTTPException(status_code=400, detail="Cannot delete this bot")
    return {"deleted": True}


@app.post("/bots/{slug}/activate")
async def activate_bot_route(slug: str, _token: str = Depends(_require_admin)):
    from bot_config import set_active
    if not set_active(slug):
        raise HTTPException(status_code=404, detail="Bot not found")
    return {"active": slug}


# ── Admin user management ─────────────────────────────────────────────────────

class _ValidateFaceBody(BaseModel):
    image: str


class _AddUserBody(BaseModel):
    name: str
    role: Optional[str] = None
    company_id: str = "default"
    image: Optional[str] = None


@app.post("/admin/users/validate-face")
async def validate_face_route(body: _ValidateFaceBody, _token: str = Depends(_require_admin)):
    if face_memory is None or not face_memory.available:
        return {"valid": False, "reason": "face_recognition_unavailable"}
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, face_memory.validate_face, body.image)
    return result


@app.get("/admin/users")
async def list_users_route(_token: str = Depends(_require_admin)):
    if face_memory is None or not face_memory.connected:
        return []
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, face_memory.list_users)


@app.post("/admin/users")
async def add_user_route(body: _AddUserBody, _token: str = Depends(_require_admin)):
    if face_memory is None or not face_memory.connected:
        raise HTTPException(status_code=503, detail="Memory layer unavailable")
    loop = asyncio.get_event_loop()
    user = await loop.run_in_executor(
        None,
        lambda: face_memory.add_user(
            name=body.name,
            role=body.role,
            company_id=body.company_id,
            image_data=body.image,
        ),
    )
    if user is None:
        raise HTTPException(status_code=400, detail="no_face_detected" if body.image else "enrollment_failed")
    return user


@app.delete("/admin/users/{user_id}")
async def delete_user_route(user_id: int, _token: str = Depends(_require_admin)):
    if face_memory is None or not face_memory.connected:
        raise HTTPException(status_code=503, detail="Memory layer unavailable")
    loop = asyncio.get_event_loop()
    deleted = await loop.run_in_executor(None, face_memory.delete_user, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return {"deleted": True}


@app.get("/admin/users/{user_id}/sessions")
async def get_user_sessions_route(user_id: int, _token: str = Depends(_require_admin)):
    if face_memory is None or not face_memory.connected:
        return []
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, face_memory.get_user_sessions, user_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=BACKEND_PORT, reload=False)
