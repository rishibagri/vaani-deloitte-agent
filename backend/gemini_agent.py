import asyncio
import base64
from google import genai
from google.genai import types

from config import GEMINI_API_KEY, GEMINI_MODEL, GEMINI_VOICE, SYSTEM_PROMPT


class GeminiAgent:
    SESSION_RENEWAL_SECONDS = 14 * 60

    def __init__(self, session_id: str, language: str = "en", user_context: str = ""):
        self.session_id = session_id
        self.language = language
        self.user_context = user_context
        self.session = None
        self.client = None
        self.audio_input_queue = asyncio.Queue()
        self.output_queue = asyncio.Queue()
        self._running = False
        self._ctx = None
        self._send_task = None
        self._recv_task = None
        self._renewal_task = None
        # accumulated transcript for summary generation at session end / renewal
        self.transcript: list[dict] = []

    def _build_system_instruction(self) -> str:
        if self.user_context:
            return f"{self.user_context}\n\n{SYSTEM_PROMPT}"
        return SYSTEM_PROMPT

    def _build_config(self):
        return types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            output_audio_transcription=types.AudioTranscriptionConfig(),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(disabled=True)
            ),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=GEMINI_VOICE)
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part(text=self._build_system_instruction())]
            ),
        )

    async def start(self):
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        self._running = True
        await self._open_session()

    async def _open_session(self):
        self._ctx = self.client.aio.live.connect(
            model=GEMINI_MODEL,
            config=self._build_config(),
        )
        self.session = await self._ctx.__aenter__()
        self._send_task = asyncio.create_task(self._send_loop())
        self._recv_task = asyncio.create_task(self._receive_loop())
        self._renewal_task = asyncio.create_task(self._renewal_loop())
        print(f"[GEMINI] Session opened for {self.session_id}")

    async def _send_loop(self):
        # outer loop restarts the inner logic if it crashes mid-turn
        # without this, any send error kills the whole loop permanently
        # and every subsequent user turn silently goes nowhere
        while self._running:
            await self._send_loop_inner()
            if self._running:
                print("[GEMINI] Send loop restarting after error...")
                await asyncio.sleep(0.5)

    async def _send_loop_inner(self):
        in_activity = False
        chunks_sent = 0

        try:
            while self._running:
                try:
                    item = await asyncio.wait_for(
                        self.audio_input_queue.get(), timeout=1.0
                    )

                    if item is None:
                        if in_activity:
                            print(f"[GEMINI] Ending turn ({chunks_sent} chunks sent)")
                            await self.session.send_realtime_input(
                                activity_end=types.ActivityEnd()
                            )
                            in_activity = False
                            chunks_sent = 0
                    else:
                        if not in_activity:
                            await self.session.send_realtime_input(
                                activity_start=types.ActivityStart()
                            )
                            in_activity = True
                            print("[GEMINI] Activity started, streaming audio...")

                        await self.session.send_realtime_input(
                            audio=types.Blob(data=item, mime_type="audio/pcm;rate=16000")
                        )
                        chunks_sent += 1

                except asyncio.TimeoutError:
                    continue
                except Exception as e:
                    print(f"[GEMINI] Send error: {e}")
                    # reset activity state so the next turn starts clean
                    in_activity = False
                    chunks_sent = 0
                    return

        except Exception as e:
            print(f"[GEMINI] Send loop fatal error: {e}")

    async def _receive_loop(self):
        print("[GEMINI] Receive loop listening...")
        try:
            async for response in self.session.receive():
                if not self._running:
                    return

                sc = getattr(response, "server_content", None)
                if sc is None:
                    continue

                model_turn = getattr(sc, "model_turn", None)
                if model_turn:
                    for part in getattr(model_turn, "parts", []):
                        inline = getattr(part, "inline_data", None)
                        if inline and getattr(inline, "data", None):
                            raw = inline.data
                            if isinstance(raw, str):
                                raw = base64.b64decode(raw)
                            await self.output_queue.put({"type": "audio", "data": raw})

                out_t = getattr(sc, "output_transcription", None)
                if out_t and getattr(out_t, "text", None):
                    finished = not getattr(out_t, "streaming", True)
                    if finished:
                        self.transcript.append({"role": "agent", "text": out_t.text})
                    await self.output_queue.put({
                        "type": "transcript_agent",
                        "text": out_t.text,
                        "streaming": not getattr(out_t, "finished", False)
                    })

                in_t = getattr(sc, "input_transcription", None)
                if in_t and getattr(in_t, "text", None):
                    lang = getattr(in_t, "language_code", self.language)
                    self.transcript.append({"role": "user", "text": in_t.text})
                    await self.output_queue.put({
                        "type": "transcript_user",
                        "text": in_t.text,
                        "lang": lang,
                        "final": True
                    })

                if getattr(sc, "interrupted", False):
                    await self.output_queue.put({"type": "interrupted"})

                if getattr(sc, "turn_complete", False):
                    print("[GEMINI] Turn complete, ready for next input")
                    await self.output_queue.put({"type": "turn_complete"})

        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"[GEMINI] Receive error: {e}")
            await self.output_queue.put({"type": "error", "message": str(e)})

        # Stream ended (normally or via error) — reconnect if still running
        if self._running:
            print(f"[GEMINI] Receive stream closed, reconnecting...")
            asyncio.create_task(self._reconnect())

    async def _reconnect(self):
        """Reopen the Gemini session after the receive stream closes unexpectedly."""
        if not self._running:
            return
        for task in [self._send_task, self._renewal_task]:
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
        try:
            await self._ctx.__aexit__(None, None, None)
        except Exception:
            pass
        await asyncio.sleep(0.2)
        await self._open_session()
        print(f"[GEMINI] Session reconnected for {self.session_id}")

    async def _renewal_loop(self):
        await asyncio.sleep(self.SESSION_RENEWAL_SECONDS)
        if self._running:
            print(f"[GEMINI] Renewing session for {self.session_id}")
            await self.output_queue.put({"type": "session_renewing"})
            await self._close_tasks()
            await self._open_session()
            await self.output_queue.put({"type": "session_renewed"})

    async def send_audio(self, pcm_bytes: bytes):
        await self.audio_input_queue.put(pcm_bytes)

    async def end_user_turn(self):
        await self.audio_input_queue.put(None)

    async def cancel(self):
        while not self.audio_input_queue.empty():
            try:
                self.audio_input_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    async def _close_tasks(self):
        for task in [self._send_task, self._recv_task, self._renewal_task]:
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
        try:
            await self._ctx.__aexit__(None, None, None)
        except Exception:
            pass

    async def stop(self):
        self._running = False
        await self._close_tasks()
        print(f"[GEMINI] Session closed for {self.session_id}")