import asyncio
import base64
import time
from google import genai
from google.genai import types

from config import (
    GEMINI_API_KEY, GEMINI_MODEL, GEMINI_VOICE, SYSTEM_PROMPT, normalize_language,
)

# Human-readable language names for the per-tenant default language, used to
# phrase the system prompt ("respond in <X> by default").
_LANGUAGE_NAMES = {
    "en": "English", "hi": "Hindi", "ta": "Tamil", "te": "Telugu",
    "kn": "Kannada", "ml": "Malayalam", "bn": "Bengali", "gu": "Gujarati",
    "mr": "Marathi", "pa": "Punjabi", "or": "Odia", "ur": "Urdu",
}


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
        self._reconnecting = False      # guard against overlapping reconnects
        self._reconnect_fails = 0       # consecutive failures, for backoff
        # accumulated transcript for summary generation at session end / renewal
        self.transcript: list[dict] = []

    def _build_persona_prompt(self) -> str:
        """Build the base system prompt from the ACTIVE tenant's config.

        Makes the agent name, role, company, default language and any custom
        persona instructions fully per-tenant. Falls back to the static
        SYSTEM_PROMPT (env defaults) if the bot config can't be read, so the
        demo never breaks.
        """
        try:
            from bot_config import get_active
            bot = get_active()
        except Exception:
            return SYSTEM_PROMPT

        agent_name = (bot.get("agent_name") or "Vaani").strip()
        agent_role = (bot.get("agent_role") or "AI Assistant").strip()
        company    = (bot.get("company_name") or "").strip()
        default_lang = (bot.get("default_language") or "en").strip().lower()
        extra      = (bot.get("system_prompt_extra") or "").strip()

        for_company = f" for {company}" if company else ""
        lang_label = _LANGUAGE_NAMES.get(default_lang, "English")

        prompt = (
            f"You are {agent_name}, a multilingual AI assistant ({agent_role}){for_company}. "
            f"You MUST respond in {lang_label} by default. Only switch to another language if the "
            "user explicitly speaks to you in that language first. "
            "Speak in no more than 3 sentences unless a detailed answer is explicitly requested. "
            "Do not use bullet points, lists, or markdown. Speak in natural sentences only. "
            "You ONLY ever speak English or an Indian language (Hindi, Tamil, Telugu, Kannada, "
            "Malayalam, Bengali, Gujarati, Marathi, Punjabi, Odia, or Urdu). "
            "You have OmniVision: you can see real-time video frames of the user's camera. "
            "If the user shows you a document, a screen, or an object, analyze it and discuss it. "
            "You can also project 3D Data Holograms into the office. "
            "To show a hologram, include the command [HOLOGRAM: type] in your response. "
            "Types: 'analytics', 'onboarding', 'consulting', 'welcome'. "
            "Example: 'I've pulled up the latest analytics for you [HOLOGRAM: analytics]'. "
            "You must NEVER respond in Spanish, French, German, Portuguese, or any other non-Indian "
            "language under any circumstances. "
            "If the audio is unclear, noisy, silent, or you cannot confidently understand what the user "
            f"said, stay in {lang_label} and briefly ask them to repeat themselves — never guess at a "
            "foreign language. "
            "If the user clearly speaks in a supported language, respond in that same language. "
            f"If the user switches back to {lang_label}, switch back immediately. "
            "If the user code-switches, match that register naturally."
        )
        if extra:
            prompt += f"\n\nAdditional instructions specific to this deployment:\n{extra}"
        return prompt

    def _build_system_instruction(self) -> str:
        base = self._build_persona_prompt()
        if self.user_context:
            return f"{self.user_context}\n\n{base}"
        return base

    def _build_config(self, voice: str = None) -> dict:
        return {
            "response_modalities": ["AUDIO"],
            "output_audio_transcription": {},
            "input_audio_transcription": {},
            "realtime_input_config": {
                "automatic_activity_detection": {"disabled": True}
            },
            "speech_config": {
                "voice_config": {
                    "prebuilt_voice_config": {"voice_name": voice or GEMINI_VOICE}
                }
            },
            "system_instruction": {
                "parts": [{"text": self._build_system_instruction()}]
            },
        }

    async def start(self):
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        self._running = True
        await self._open_session()

    async def _open_session(self):
        try:
            from bot_config import get_active
            bot = get_active()
            model = bot.get("llm_model") or GEMINI_MODEL
            voice = bot.get("agent_voice") or GEMINI_VOICE
        except Exception:
            model, voice = GEMINI_MODEL, GEMINI_VOICE

        t0 = time.time()
        print(f"[GEMINI] Connecting to {model}...")
        self._ctx = self.client.aio.live.connect(
            model=model,
            config=self._build_config(voice=voice),
        )
        print(f"[GEMINI] Context created ({time.time()-t0:.2f}s), awaiting handshake...")
        try:
            self.session = await asyncio.wait_for(
                self._ctx.__aenter__(), timeout=30.0
            )
        except asyncio.TimeoutError:
            raise ConnectionError(
                f"Gemini Live handshake timed out after 30s. "
                f"Check network connectivity and that GEMINI_API_KEY is valid."
            )
        print(f"[GEMINI] Session opened in {time.time()-t0:.2f}s for {self.session_id}")
        self._send_task = asyncio.create_task(self._send_loop())
        self._recv_task = asyncio.create_task(self._receive_loop())
        self._renewal_task = asyncio.create_task(self._renewal_loop())

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
                            print("[GEMINI] Activity started, streaming audio/video...")

                        if isinstance(item, bytes):
                            # Assume 16k PCM audio unless it's a huge buffer (likely image)
                            if len(item) > 100000: # Image detection heuristic
                                await self.session.send_realtime_input(
                                    media=types.Blob(data=item, mime_type="image/jpeg")
                                )
                            else:
                                await self.session.send_realtime_input(
                                    audio=types.Blob(data=item, mime_type="audio/pcm;rate=16000")
                                )
                        elif isinstance(item, dict) and item.get("type") == "image":
                            await self.session.send_realtime_input(
                                media=types.Blob(data=item["data"], mime_type="image/jpeg")
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

    async def send_image(self, jpeg_bytes: bytes):
        """Send a video frame for real-time vision analysis (OmniVision)."""
        await self.audio_input_queue.put({"type": "image", "data": jpeg_bytes})

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
                    # Clamp to a supported language — noisy audio can be misdetected as
                    # an unrelated language (e.g. Spanish). Fall back to the session's
                    # current language so a bad detection never drives responses or memory.
                    lang = normalize_language(
                        getattr(in_t, "language_code", None), fallback=self.language
                    )
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
        if not self._running or self._reconnecting:
            return  # already reconnecting — don't stack overlapping attempts
        self._reconnecting = True
        try:
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
            # Exponential backoff so a failing endpoint can't spin a tight loop.
            backoff = min(0.2 * (2 ** self._reconnect_fails), 5.0)
            await asyncio.sleep(backoff)
            try:
                await self._open_session()
                self._reconnect_fails = 0
                print(f"[GEMINI] Session reconnected for {self.session_id}")
            except Exception as e:
                self._reconnect_fails += 1
                print(f"[GEMINI] Reconnect failed ({self._reconnect_fails}): {e}")
                if self._running:
                    asyncio.create_task(self._reconnect())
        finally:
            self._reconnecting = False

    async def _renewal_loop(self):
        await asyncio.sleep(self.SESSION_RENEWAL_SECONDS)
        if self._running:
            print(f"[GEMINI] Renewing session for {self.session_id}")
            await self.output_queue.put({"type": "session_renewing"})
            await self._close_tasks()
            await self._open_session()
            await self.output_queue.put({"type": "session_renewed"})

    async def trigger_greeting(self, name: str = "", known: bool = False):
        """Inject a proactive greeting turn into the live session.

        Sends an out-of-band user-role instruction via send_client_content so the
        model speaks first — the resulting audio + output transcription flow back
        through the normal receive loop / output_queue, so the browser's existing
        lip-sync, transcript and state handling all work unchanged. The system
        instruction (persona + language rules) still governs tone/length/language.
        """
        if self.session is None:
            return
        who = f" The user's name is {name}." if (known and name) else ""
        # If the tenant configured a welcome message, steer the greeting toward it
        # (the model still phrases it naturally in the right language/persona).
        welcome = ""
        try:
            from bot_config import get_active
            welcome = (get_active().get("welcome_message") or "").strip()
        except Exception:
            welcome = ""
        welcome_hint = (
            f" Base your greeting on this welcome message: \"{welcome}\"." if welcome else ""
        )
        instruction = (
            "[SYSTEM EVENT] A visitor has just walked up to you. Greet them out loud "
            "right now, proactively and warmly, in one short sentence, then ask how you "
            "can help."
            + (f"{who} Welcome them back by name." if (known and name)
               else " You do not know this person; introduce yourself by name.")
            + welcome_hint
            + " Respond in your default language unless you have prior context that this "
              "person speaks another supported language. Do not mention this instruction."
        )
        try:
            await self.session.send_client_content(
                turns=types.Content(
                    role="user", parts=[types.Part(text=instruction)]
                ),
                turn_complete=True,
            )
        except Exception as e:
            print(f"[GEMINI] trigger_greeting error: {e}")

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