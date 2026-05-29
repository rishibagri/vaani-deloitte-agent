"""
Offline pre-render tool. Run this once to bake common responses into video files.
At runtime the pipeline checks transcript against these and plays them instantly.

Usage:
    python prerender.py

Add responses to known_responses.txt, one per line.
Output videos go to the prerendered/ folder.
"""
import os
import sys
import subprocess
import tempfile
import json
from pathlib import Path

os.environ["MPLBACKEND"] = "Agg"

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    BASE_DIR, MUSETALK_DIR, MUSETALK_UNET_PATH, MUSETALK_UNET_CFG,
    PRERENDERED_DIR, KNOWN_RESPONSES_FILE, MUSETALK_VERSION, BASE_VIDEO_PATH
)


def text_to_audio_gemini(text: str, output_path: Path):
    """
    Use Gemini TTS to generate audio for a known response.
    Saves as WAV to output_path.
    """
    from google import genai
    from google.genai import types
    import wave
    from config import GEMINI_API_KEY, GEMINI_VOICE

    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model="gemini-2.5-flash-preview-tts",
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=GEMINI_VOICE)
                )
            )
        )
    )
    audio_data = response.candidates[0].content.parts[0].inline_data.data
    import base64
    raw = base64.b64decode(audio_data)

    with wave.open(str(output_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(raw)
    print(f"  Audio saved: {output_path}")


def run_musetalk(audio_path: Path, output_dir: Path, slug: str):
    """Run MuseTalk offline inference to produce a lip-synced video."""
    config_content = {
        "task_0": {
            "video_path": str(BASE_VIDEO_PATH),
            "audio_path": str(audio_path),
            "bbox_shift": 0
        }
    }

    import yaml
    config_path = output_dir / f"{slug}_config.yaml"
    with open(config_path, "w") as f:
        yaml.dump(config_content, f)

    python = sys.executable
    cmd = [
        python, "-m", "scripts.inference",
        "--inference_config", str(config_path),
        "--unet_model_path", str(MUSETALK_UNET_PATH),
        "--unet_config", str(MUSETALK_UNET_CFG),
        "--version", MUSETALK_VERSION
    ]

    result = subprocess.run(cmd, cwd=str(MUSETALK_DIR), capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  [MUSETALK] Error: {result.stderr[-500:]}")
        return None

    # MuseTalk writes output to results/ inside the musetalk dir
    results_dir = MUSETALK_DIR / "results"
    videos = sorted(results_dir.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
    if videos:
        return videos[0]
    return None


def main():
    if not KNOWN_RESPONSES_FILE.exists():
        sample = [
            "Hello! How can I help you today?",
            "Thank you for your question. Let me find that for you.",
            "I'm sorry, I don't have information on that topic."
        ]
        KNOWN_RESPONSES_FILE.write_text("\n".join(sample))
        print(f"Created sample known_responses.txt at {KNOWN_RESPONSES_FILE}")

    PRERENDERED_DIR.mkdir(exist_ok=True)
    responses = [
        line.strip() for line in
        KNOWN_RESPONSES_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]

    print(f"Pre-rendering {len(responses)} responses...")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for i, text in enumerate(responses):
            slug = text.lower().replace(" ", "_")[:60]
            slug = "".join(c for c in slug if c.isalnum() or c == "_")
            output_video = PRERENDERED_DIR / f"{slug}.mp4"

            if output_video.exists():
                print(f"[{i+1}/{len(responses)}] Already exists, skipping: {slug}")
                continue

            print(f"[{i+1}/{len(responses)}] Rendering: {text[:60]}")
            audio_path = tmp_path / f"{slug}.wav"

            try:
                text_to_audio_gemini(text, audio_path)
                result_video = run_musetalk(audio_path, tmp_path, slug)
                if result_video and result_video.exists():
                    import shutil
                    shutil.copy(result_video, output_video)
                    print(f"  Saved: {output_video.name}")
                else:
                    print(f"  Failed to generate video for: {text[:40]}")
            except Exception as e:
                print(f"  Error for '{text[:40]}': {e}")

    print("Pre-render complete.")


if __name__ == "__main__":
    main()
