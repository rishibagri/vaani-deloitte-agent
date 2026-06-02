"""SyncLabs (sync.so) lip-sync — cloud fallback when MuseTalk is disabled."""
import asyncio
import io
import uuid
import wave
from pathlib import Path

import httpx

from config import (
    SYNCLABS_API_KEY, SYNCLABS_ENABLED, SYNCLABS_MODEL,
    SYNCLABS_TIMEOUT_MS, BACKEND_PUBLIC_URL, SYNCLABS_AVATAR_URL,
    SAMPLE_RATE_GEMINI_OUT,
)

_BASE = "https://api.sync.so/v2"


def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


class SyncLabsModel:
    """
    Calls the sync.so lipsync-2 API per Gemini turn.
    Audio (24kHz PCM) is saved to a temp file, served via /temp/, and submitted
    together with the avatar video URL. Result frames are returned as JPEG bytes.
    """

    def __init__(self, temp_dir: Path):
        self._temp_dir = temp_dir
        self._client: httpx.AsyncClient | None = None

    @property
    def available(self) -> bool:
        return SYNCLABS_ENABLED

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                headers={"x-api-key": SYNCLABS_API_KEY},
                timeout=SYNCLABS_TIMEOUT_MS / 1000 + 15,
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    def _avatar_url(self) -> str:
        if SYNCLABS_AVATAR_URL:
            return SYNCLABS_AVATAR_URL
        return f"{BACKEND_PUBLIC_URL}/avatar/idle.mp4"

    async def infer_turn(self, audio_pcm_24k: bytes) -> list[bytes]:
        """
        Submit a SyncLabs job for one Gemini turn.
        Returns a list of JPEG frame bytes (empty list on any failure).
        """
        if not self.available or not audio_pcm_24k:
            return []

        job_id = uuid.uuid4().hex
        audio_path = self._temp_dir / f"{job_id}.wav"
        try:
            audio_path.write_bytes(_pcm_to_wav(audio_pcm_24k, SAMPLE_RATE_GEMINI_OUT))
        except Exception as e:
            print(f"[SYNCLABS] Failed to write temp audio: {e}")
            return []

        audio_url = f"{BACKEND_PUBLIC_URL}/temp/{job_id}.wav"
        avatar_url = self._avatar_url()
        print(f"[SYNCLABS] Submitting — audio={audio_url}  video={avatar_url}")

        try:
            return await self._run_job(audio_url, avatar_url)
        finally:
            audio_path.unlink(missing_ok=True)

    async def _run_job(self, audio_url: str, video_url: str) -> list[bytes]:
        client = self._get_client()
        try:
            resp = await client.post(
                f"{_BASE}/generate",
                json={"audioUrl": audio_url, "videoUrl": video_url, "model": SYNCLABS_MODEL},
            )
            resp.raise_for_status()
            job_id = resp.json().get("id")
            if not job_id:
                print(f"[SYNCLABS] No job ID in response: {resp.text[:200]}")
                return []

            deadline = asyncio.get_event_loop().time() + SYNCLABS_TIMEOUT_MS / 1000
            interval = 1.5
            while asyncio.get_event_loop().time() < deadline:
                await asyncio.sleep(interval)
                interval = min(interval * 1.4, 4.0)

                poll = await client.get(f"{_BASE}/generate/{job_id}")
                poll.raise_for_status()
                data = poll.json()
                status = data.get("status", "PENDING")

                if status == "COMPLETED":
                    result_url = data.get("videoUrl") or data.get("url")
                    if not result_url:
                        print("[SYNCLABS] COMPLETED but no video URL in response")
                        return []
                    return await self._extract_frames(result_url)

                if status == "FAILED":
                    print(f"[SYNCLABS] Job {job_id} failed: {data.get('message')}")
                    return []

            print(f"[SYNCLABS] Job {job_id} timed out after {SYNCLABS_TIMEOUT_MS}ms")
            return []

        except httpx.HTTPStatusError as e:
            print(f"[SYNCLABS] HTTP {e.response.status_code}: {e.response.text[:200]}")
            return []
        except Exception as e:
            print(f"[SYNCLABS] API error: {e}")
            return []

    async def _extract_frames(self, video_url: str) -> list[bytes]:
        try:
            import cv2
            from audio_utils import encode_jpeg

            resp = await self._get_client().get(video_url, follow_redirects=True)
            resp.raise_for_status()

            result_path = self._temp_dir / f"{uuid.uuid4().hex}_result.mp4"
            result_path.write_bytes(resp.content)

            frames: list[bytes] = []
            cap = cv2.VideoCapture(str(result_path))
            try:
                while True:
                    ok, frame = cap.read()
                    if not ok:
                        break
                    frames.append(encode_jpeg(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
            finally:
                cap.release()
                result_path.unlink(missing_ok=True)

            print(f"[SYNCLABS] Extracted {len(frames)} frames")
            return frames

        except Exception as e:
            print(f"[SYNCLABS] Frame extraction failed: {e}")
            return []
