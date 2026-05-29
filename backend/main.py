import asyncio
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import validate, CORS_ORIGINS, MUSETALK_ENABLED, BACKEND_PORT
from loop_cache import LoopCache
from musetalk_wrapper import MuseTalkModel
from pipeline import SessionPipeline

# these are module-level singletons loaded at startup
loop_cache = LoopCache()
musetalk = MuseTalkModel()

active_sessions: dict[str, SessionPipeline] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate()
    print("[SETUP] Starting Vaani backend...")

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
    # placeholder, full transcript storage would use a db
    return {"session_id": session_id, "transcript": []}


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

    pipeline = SessionPipeline(
        session_id=session_id,
        loop_cache=loop_cache,
        musetalk=musetalk,
        send_bytes=send_bytes,
        send_json=send_json
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
