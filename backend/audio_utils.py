import numpy as np


def resample_24k_to_16k(pcm_bytes: bytes) -> bytes:
    """
    Resample PCM from Gemini output to MuseTalk input format.
    Gemini Live outputs 24kHz, MuseTalk Whisper encoder expects 16kHz.
    """
    audio = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
    orig_len = len(audio)
    target_len = int(orig_len * 16000 / 24000)
    indices = np.linspace(0, orig_len - 1, target_len)
    resampled = np.interp(indices, np.arange(orig_len), audio)
    return resampled.astype(np.int16).tobytes()


def float32_audio_to_bytes(audio: np.ndarray) -> bytes:
    """Convert float32 normalized audio array to int16 PCM bytes."""
    clipped = np.clip(audio, -1.0, 1.0)
    return (clipped * 32767.0).astype(np.int16).tobytes()


def bytes_to_float32(pcm_bytes: bytes) -> np.ndarray:
    """Convert int16 PCM bytes to float32 normalized array."""
    samples = np.frombuffer(pcm_bytes, dtype=np.int16)
    return samples.astype(np.float32) / 32767.0


def encode_jpeg(frame_rgb: np.ndarray, quality: int = 85) -> bytes:
    """
    Encode a numpy RGB frame as JPEG bytes for browser transmission.
    Quality 85 is a good balance between file size and visual quality for video.
    """
    import cv2
    frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
    _, encoded = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return encoded.tobytes()


def calculate_rms(pcm_bytes: bytes) -> float:
    """Calculate the Root Mean Square (RMS) loudness of PCM bytes."""
    samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    if len(samples) == 0:
        return 0.0
    return float(np.sqrt(np.mean(samples**2)))
