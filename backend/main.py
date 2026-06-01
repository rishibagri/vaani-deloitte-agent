import asyncio
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import validate, CORS_ORIGINS, MUSETALK_ENABLED, BACKEND_PORT, MEMORY_ENABLED, DATABASE_URL
from loop_cache import LoopCache
from musetalk_wrapper import MuseTalkModel
from pipeline import SessionPipeline

loop_cache = LoopCache()
musetalk = MuseTalkModel()

active_sessions: dict[str, SessionPipeline] = {}
# maps session_id → user_id before the WebSocket connects
_session_user_map: dict[str, int] = {}

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

    if MUSETALK_ENABLED:
        musetalk.load()
        loop_cache.load()
    else:
        print("[SETUP] MuseTalk disabled. Avatar will show loop video only.")

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=BACKEND_PORT, reload=False)
