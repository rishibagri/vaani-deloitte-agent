import asyncio
import difflib
import json
import os
import time
from pathlib import Path
from typing import Optional

import cv2

from config import (
    BATCH_MS, MUSETALK_ENABLED, PRERENDERED_DIR,
    KNOWN_RESPONSES_FILE, SAMPLE_RATE_MUSETALK, SAMPLE_RATE_GEMINI_OUT
)
from audio_utils import resample_24k_to_16k
from gemini_agent import GeminiAgent
from loop_cache import LoopCache
from musetalk_wrapper import MuseTalkModel


# 0x01 prefix = audio frame, 0x02 prefix = video frame
# single byte prefix lets the browser route binary messages without JSON parsing
AUDIO_PREFIX = bytes([0x01])
VIDEO_PREFIX = bytes([0x02])

# how many samples make up one batch at 16kHz
BATCH_SAMPLES = int((BATCH_MS / 1000) * SAMPLE_RATE_MUSETALK)
FRAMES_PER_BATCH = max(1, BATCH_MS // 40)  # 40ms per frame at 25fps


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

    def __init__(self, session_id: str, loop_cache: LoopCache,
                 musetalk: MuseTalkModel, send_bytes, send_json):
        self.session_id = session_id
        self.loop_cache = loop_cache
        self.musetalk = musetalk
        self.send_bytes = send_bytes   # coroutine: sends binary to browser
        self.send_json = send_json     # coroutine: sends JSON to browser

        self.agent = GeminiAgent(session_id)
        self.known_responses = _load_known_responses()

        self._audio_buffer = bytearray()
        self._state = "idle"
        self._running = False

    async def start(self):
        """Connect to Gemini and begin the output processing loop."""
        self._running = True
        await self.agent.start()
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
            await self.agent.send_audio(data)
        else:
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                return

            msg_type = msg.get("type")

            if msg_type == "start_listening":
                await self._set_state("listening")

            elif msg_type == "stop_listening":
                await self.agent.end_user_turn()
                await self._set_state("thinking")

            elif msg_type == "cancel":
                await self.agent.cancel()
                await self._set_state("idle")

            elif msg_type == "set_language":
                self.agent.language = msg.get("code", "en")

    async def _process_output(self):
        """
        Read from the Gemini agent output queue and forward to the browser.
        Audio goes through MuseTalk for lip sync, then both audio and
        frames are sent to the browser simultaneously.
        """
        current_transcript = ""

        while self._running:
            try:
                item = await asyncio.wait_for(self.agent.output_queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue

            item_type = item.get("type")

            if item_type == "audio":
                audio_bytes = item["data"]

                # send raw audio to browser for immediate playback
                await self.send_bytes(AUDIO_PREFIX + audio_bytes)

                # run lip sync if MuseTalk is loaded
                if self.musetalk.loaded and self.loop_cache.loaded:
                    resampled = resample_24k_to_16k(audio_bytes)
                    crops, frames, bboxes = self.loop_cache.next_batch(FRAMES_PER_BATCH)
                    jpeg_frames = await self.musetalk.infer_batch(
                        resampled, crops, frames, bboxes
                    )
                    for jpeg in jpeg_frames:
                        await self.send_bytes(VIDEO_PREFIX + jpeg)

                await self._set_state("speaking")

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
                await self.send_json({"type": "language_detected", "code": lang})

            elif item_type == "turn_complete":
                current_transcript = ""
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
        await self.agent.stop()
