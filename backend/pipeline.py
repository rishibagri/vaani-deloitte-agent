import asyncio
import difflib
import json
import os
import time
from pathlib import Path
from typing import Optional, TYPE_CHECKING

import cv2

from config import (
    BATCH_MS, MUSETALK_ENABLED, PRERENDERED_DIR,
    KNOWN_RESPONSES_FILE, SAMPLE_RATE_MUSETALK, SAMPLE_RATE_GEMINI_OUT,
    GEMINI_API_KEY, GEMINI_TEXT_MODEL,
)
from audio_utils import resample_24k_to_16k
from gemini_agent import GeminiAgent
from loop_cache import LoopCache
from musetalk_wrapper import MuseTalkModel

if TYPE_CHECKING:
    from face_memory import FaceMemory


# 0x01 prefix = audio frame, 0x02 prefix = video frame
# single byte prefix lets the browser route binary messages without JSON parsing
AUDIO_PREFIX = bytes([0x01])
VIDEO_PREFIX = bytes([0x02])

# how many samples make up one batch at 16kHz
BATCH_SAMPLES = int((BATCH_MS / 1000) * SAMPLE_RATE_MUSETALK)
FRAMES_PER_BATCH = max(1, BATCH_MS // 40)  # 40ms per frame at 25fps


async def _generate_summary(transcript: list[dict]) -> str:
    """Call Gemini text API to produce a 2-3 sentence session summary."""
    if not transcript:
        return ""
    try:
        from google import genai
        turns = "\n".join(f"{t['role'].upper()}: {t['text']}" for t in transcript)
        prompt = (
            "Summarize the following conversation in 2-3 concise sentences. "
            "Focus on the main topics discussed, the user's interests, and any follow-up items. "
            "Write in third person (e.g. 'The user asked about...').\n\n" + turns
        )
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = await client.aio.models.generate_content(
            model=GEMINI_TEXT_MODEL,
            contents=prompt,
        )
        return response.text.strip()
    except Exception as e:
        print(f"[PIPELINE] Summary generation error: {e}")
        return ""


def _load_known_responses() -> dict:
    """Load pre-rendered response lookup table from disk."""
    table = {}
    if not KNOWN_RESPONSES_FILE.exists():
        return table
    for line in KNOWN_RESPONSES_FILE.read_text(encoding="utf-8").splitlines():
        text = line.strip()
        if not text:
            continue
        slug = text.lower().replace(" ", "_")[:60]
        video_path = PRERENDERED_DIR / f"{slug}.mp4"
        if video_path.exists():
            table[text.lower()] = video_path
    return table


class SessionPipeline:
    """
    One pipeline instance per browser WebSocket connection.
    Routes audio from Gemini through MuseTalk and back to the browser.
    """

    def __init__(
        self,
        session_id: str,
        loop_cache: LoopCache,
        musetalk: MuseTalkModel,
        send_bytes,
        send_json,
        user_id: Optional[int] = None,
        user_context: str = "",
        face_memory: "Optional[FaceMemory]" = None,
    ):
        self.session_id = session_id
        self.loop_cache = loop_cache
        self.musetalk = musetalk
        self.send_bytes = send_bytes
        self.send_json = send_json
        self.user_id = user_id
        self._face_memory = face_memory

        self.agent = GeminiAgent(session_id, user_context=user_context)
        self.known_responses = _load_known_responses()

        self._audio_buffer = bytearray()
        self._state = ""   # empty so _set_state("idle") always fires the initial message
        self._running = False
        self._current_language = "en"
        self._audio_sent_in_turn = False
        self._turn_epoch = 0   # bumped on barge-in to drop stale audio/video frames
        self._suppress_output = False  # True between a barge-in and the next user turn
        # MuseTalk audio coalescing: accumulate 24kHz PCM and run lip-sync once per
        # window so the (fixed-cost) Whisper encoder is amortized over many frames.
        self._mt_buf = bytearray()
        # ~640ms of 24kHz int16 audio ≈ one full GPU batch of video frames.
        self._mt_flush_bytes = int(0.64 * SAMPLE_RATE_GEMINI_OUT) * 2

    async def start(self):
        """Connect to Gemini and begin the output processing loop."""
        self._running = True
        try:
            await self.agent.start()
        except Exception as e:
            print(f"[PIPELINE] Gemini connection failed: {e}")
            await self.send_json({
                "type": "error",
                "message": f"Could not connect to Gemini: {e}"
            })
            self._running = False
            return
        await self._set_state("idle")
        asyncio.create_task(self._process_output())
        print(f"[PIPELINE] Session {self.session_id} started")

    async def handle_browser_message(self, data: bytes | str):
        """
        Route messages from the browser.
        Binary = mic audio to forward to Gemini.
        Text/JSON = control commands (start_listening, stop_listening, etc.)
        """
        if isinstance(data, bytes):
            # raw PCM from browser mic
            self._audio_sent_in_turn = True
            await self.agent.send_audio(data)
        else:
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                return

            msg_type = msg.get("type")

            if msg_type == "start_listening":
                self._audio_sent_in_turn = False
                # Barge-in: if the avatar is mid-response, suppress the rest of that
                # turn's audio/video (which keeps streaming in from Gemini), drop the
                # queued output, and tell the browser to stop playback + clear canvas.
                if self._state == "speaking":
                    self._suppress_output = True
                self._turn_epoch += 1
                self._mt_buf.clear()  # drop un-rendered audio from the interrupted turn
                self._flush_output_queue()
                await self.agent.cancel()
                await self.send_json({"type": "interrupt"})
                await self._set_state("listening")

            elif msg_type == "stop_listening":
                if not self._audio_sent_in_turn:
                    # Mic released with no audio. Keep suppressing any interrupted
                    # turn (it ends on turn_complete); just return to idle.
                    await self._set_state("idle")
                else:
                    # New user turn is going to Gemini — the next response may play.
                    self._suppress_output = False
                    await self.agent.end_user_turn()
                    await self._set_state("thinking")

            elif msg_type == "cancel":
                self._suppress_output = False
                await self.agent.cancel()
                await self._set_state("idle")

            elif msg_type == "set_language":
                self.agent.language = msg.get("code", "en")

    def _flush_output_queue(self):
        """Drop all pending items from the Gemini output queue (used on barge-in)."""
        q = self.agent.output_queue
        while not q.empty():
            try:
                q.get_nowait()
            except Exception:
                break

    async def _flush_musetalk(self):
        """Run lip-sync on the accumulated audio window and emit the video frames."""
        if not self._mt_buf:
            return
        audio_24k = bytes(self._mt_buf)
        self._mt_buf.clear()
        if self._suppress_output:
            return
        epoch = self._turn_epoch
        resampled = resample_24k_to_16k(audio_24k)
        n_samples = len(resampled) // 2
        n_frames = max(1, int((n_samples / 16000) * 25))
        crops, frames, transforms, indices = self.loop_cache.next_batch(n_frames)
        jpeg_frames = await self.musetalk.infer_batch(
            resampled, crops, frames, transforms, indices
        )
        if epoch == self._turn_epoch and not self._suppress_output:
            for jpeg in jpeg_frames:
                await self.send_bytes(VIDEO_PREFIX + jpeg)

    async def _process_output(self):
        try:
            await self._process_output_inner()
        except Exception as e:
            print(f"[PIPELINE] _process_output crashed: {e}")
            await self.send_json({"type": "error", "message": "Output pipeline error — please reload."})

    async def _process_output_inner(self):
        current_transcript = ""

        while self._running:
            try:
                item = await asyncio.wait_for(self.agent.output_queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue

            item_type = item.get("type")

            if item_type == "audio":
                audio_bytes = item["data"]

                # Suppressed after a barge-in: discard the interrupted turn's audio
                # that Gemini keeps streaming until the user starts a new turn.
                if self._suppress_output:
                    continue

                # send raw audio to browser for immediate playback (low latency)
                await self.send_bytes(AUDIO_PREFIX + audio_bytes)
                await self._set_state("speaking")

                # Accumulate for MuseTalk; only run inference once a window fills up,
                # so the fixed-cost Whisper encoder amortizes over a full GPU batch.
                if self.musetalk.loaded and self.loop_cache.loaded:
                    self._mt_buf.extend(audio_bytes)
                    if len(self._mt_buf) >= self._mt_flush_bytes:
                        await self._flush_musetalk()

            elif item_type == "transcript_agent":
                current_transcript += item.get("text", "")
                await self.send_json(item)

                # check pre-rendered lookup now that we have partial transcript
                if not item.get("streaming", True):
                    await self._try_prerendered(current_transcript)
                    current_transcript = ""

            elif item_type == "transcript_user":
                await self.send_json(item)
                lang = item.get("lang", "en")
                self._current_language = lang
                await self.send_json({"type": "language_detected", "code": lang})

            elif item_type == "turn_complete":
                current_transcript = ""
                # Flush any trailing audio shorter than a full window.
                if self.musetalk.loaded and self.loop_cache.loaded and not self._suppress_output:
                    await self._flush_musetalk()
                self._suppress_output = False  # interrupted turn is over
                await self._set_state("idle")

            elif item_type == "interrupted":
                await self._set_state("listening")

            elif item_type == "session_renewing":
                await self.send_json({"type": "session_warning", "seconds_remaining": 30})

            elif item_type == "session_renewed":
                await self.send_json({"type": "session_renewed"})

            elif item_type == "error":
                await self.send_json({"type": "error", "message": item.get("message", "Unknown error")})
                await self._set_state("idle")

    async def _try_prerendered(self, transcript: str):
        """
        Check if the full transcript closely matches a pre-rendered video.
        If so, stream that video instead of using live MuseTalk inference.
        This is near-zero latency for common responses.
        """
        normalized = transcript.strip().lower()
        for known_text, video_path in self.known_responses.items():
            ratio = difflib.SequenceMatcher(None, normalized, known_text).ratio()
            if ratio > 0.90:
                await self._stream_prerendered_video(video_path)
                return

    async def _stream_prerendered_video(self, video_path: Path):
        """Stream a pre-rendered MP4 frame by frame to the browser canvas."""
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                import numpy as np
                from audio_utils import encode_jpeg
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                jpeg = encode_jpeg(frame_rgb)
                await self.send_bytes(VIDEO_PREFIX + jpeg)
                await asyncio.sleep(1 / 25)  # maintain 25fps
        except Exception as e:
            print(f"[PIPELINE] Pre-render stream error: {e}")
        finally:
            cap.release()

    async def _set_state(self, state: str):
        if state != self._state:
            self._state = state
            await self.send_json({"type": "state", "value": state})

    async def stop(self):
        self._running = False
        await self._save_memory()
        # Background semantic memory save (Supabase or local JSON)
        if len(self.agent.transcript) > 4:
            try:
                from memory import save_conversation
                asyncio.create_task(
                    save_conversation(self.session_id, self.agent.transcript, self._current_language)
                )
            except Exception as e:
                print(f"[PIPELINE] Background memory save error: {e}")
        await self.agent.stop()

    async def _save_memory(self):
        """Generate a conversation summary and persist it to the memory DB."""
        if self._face_memory is None or not self.agent.transcript:
            return
        try:
            summary = await _generate_summary(self.agent.transcript)
            if summary:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    lambda: self._face_memory.save_session(
                        self.session_id, self.user_id, summary, self._current_language
                    ),
                )
                if self.user_id is not None and self._current_language != "en":
                    await loop.run_in_executor(
                        None,
                        lambda: self._face_memory.update_language(
                            self.user_id, self._current_language
                        ),
                    )
                print(f"[PIPELINE] Memory saved for session {self.session_id}")
        except Exception as e:
            print(f"[PIPELINE] Memory save failed: {e}")
