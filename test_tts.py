import asyncio
import os
import base64
from google import genai
from google.genai import types

async def main():
    client = genai.Client()
    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash-preview-tts",
            contents="Hello! I am your interactive AI voice assistant. How does my voice sound?",
            config=types.GenerateContentConfig(
                system_instruction="You are a TTS engine. Generate exactly the audio for the user's text and nothing else. Do not output text.",
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
                    )
                ),
            ),
        )
        print("Success!")
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(main())
