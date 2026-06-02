import os
import sys
import time
import asyncio
import numpy as np
import cv2
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import httpx
import librosa

import torch
from config import BASE_DIR, SAMPLE_RATE_MUSETALK
from audio_utils import encode_jpeg
from wav2lip_model import Wav2Lip

WAV2LIP_URL = "https://huggingface.co/Nekochu/Wav2Lip/resolve/main/wav2lip_gan.pth"
WAV2LIP_PATH = BASE_DIR / "models" / "wav2lip_gan.pth"



class Wav2LipModel:
    """
    Wraps Wav2Lip inference for real-time lip sync on macOS (CPU/MPS) and Windows (CUDA).
    Implements the same interface as MuseTalkModel.
    """

    def __init__(self):
        self.device = None
        self.model = None
        self._loaded = False
        self._executor = ThreadPoolExecutor(max_workers=1)

    def load(self):
        try:
            # Detect device: MPS on Mac, CUDA on Windows (if available), fallback to CPU
            if torch.backends.mps.is_available():
                self.device = "mps"
            elif torch.cuda.is_available():
                self.device = "cuda"
            else:
                self.device = "cpu"
            
            print(f"[WAV2LIP] Selected device: {self.device}")

            # Ensure model directory exists
            WAV2LIP_PATH.parent.mkdir(parents=True, exist_ok=True)

            # Download weights if missing
            if not WAV2LIP_PATH.exists():
                print(f"[WAV2LIP] Downloading weights from {WAV2LIP_URL}...")
                self._download_weights()

            # Load Wav2Lip model
            self.model = Wav2Lip()
            state_dict = torch.load(str(WAV2LIP_PATH), map_location=self.device)
            
            # Extract actual state dict if nested
            if "state_dict" in state_dict:
                state_dict = state_dict["state_dict"]
            
            # Clean state dict keys (strip 'module.' prefix if present)
            clean_state_dict = {}
            for k, v in state_dict.items():
                if k.startswith("module."):
                    clean_state_dict[k[7:]] = v
                else:
                    clean_state_dict[k] = v

            self.model.load_state_dict(clean_state_dict)
            self.model = self.model.to(self.device)
            self.model.eval()
            self._loaded = True
            print("[WAV2LIP] Model loaded successfully and ready.")

        except Exception as e:
            print(f"[WAV2LIP] Failed to load Wav2Lip: {e}")
            self._loaded = False

    def _download_weights(self):
        with httpx.Client(follow_redirects=True, timeout=120.0) as client:
            with client.stream("GET", WAV2LIP_URL) as r:
                r.raise_for_status()
                total = int(r.headers.get("content-length", 0))
                downloaded = 0
                last_log = 0
                with open(WAV2LIP_PATH, "wb") as f:
                    for chunk in r.iter_bytes():
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total > 0:
                            percent = int(100 * downloaded / total)
                            if percent >= last_log + 10:
                                print(f"[WAV2LIP] Downloading weights... {percent}% completed")
                                last_log = percent

    def _audio_to_mel(self, audio_bytes_16k: bytes) -> np.ndarray:
        """Convert raw PCM audio bytes to log-mel spectrogram."""
        # Parse PCM audio to float array
        y = np.frombuffer(audio_bytes_16k, dtype=np.int16).astype(np.float32) / 32767.0
        
        # Standard Wav2Lip Mel Spectrogram Extraction Parameters
        stft = librosa.stft(y, n_fft=800, hop_length=160, win_length=800)
        magnitudes = np.abs(stft) ** 2
        
        mel_basis = librosa.filters.mel(sr=16000, n_fft=800, n_mels=80, fmin=55, fmax=7600)
        mel_spec = np.dot(mel_basis, magnitudes)
        
        # Log-scaling
        log_mel = 20 * np.log10(np.maximum(1e-5, mel_spec)) - 20
        # Normalization
        log_mel = np.clip((log_mel + 100) / 100, 0.0, 1.0)
        return log_mel

    def _infer_sync(self, audio_bytes_16k: bytes, face_crops: list,
                    full_frames: list, bboxes: list) -> list:
        try:
            # 1. Process Audio to Mel Spectrogram
            log_mel = self._audio_to_mel(audio_bytes_16k)
            
            n_frames = len(face_crops)
            if n_frames == 0:
                return []
            
            # Map video frames to mel windows
            # Wav2Lip uses 16 mel frames per video frame centered at the frame timestamp (at 25 fps, 1 frame = 40ms)
            # Since hop size is 10ms, 1 video frame = 4 mel steps.
            mel_len = log_mel.shape[1]
            audio_steps_per_frame = 4
            
            mel_chunks = []
            for i in range(n_frames):
                center = int(i * audio_steps_per_frame)
                start = center - 8
                end = center + 8
                
                # Boundary padding
                if start < 0:
                    pad_left = np.zeros((80, abs(start)))
                    real_start = 0
                else:
                    pad_left = np.empty((80, 0))
                    real_start = start
                
                if end > mel_len:
                    pad_right = np.zeros((80, end - mel_len))
                    real_end = mel_len
                else:
                    pad_right = np.empty((80, 0))
                    real_end = end
                
                chunk = log_mel[:, real_start:real_end]
                chunk = np.concatenate([pad_left, chunk, pad_right], axis=1)
                mel_chunks.append(chunk)

            # Convert to PyTorch tensors
            mel_tensor = torch.FloatTensor(np.array(mel_chunks)).unsqueeze(1).to(self.device) # (B, 1, 80, 16)
            
            # 2. Process Face Crops
            face_tensors = []
            for face in face_crops:
                # Resize to Wav2Lip size 96x96
                face_resized = cv2.resize(face, (96, 96))
                face_rgb = cv2.cvtColor(face_resized, cv2.COLOR_BGR2RGB)
                
                # Mask lower half
                masked = face_rgb.copy()
                masked[48:, :] = 0
                
                # Normalize [0, 1]
                face_norm = face_rgb.astype(np.float32) / 255.0
                masked_norm = masked.astype(np.float32) / 255.0
                
                # PyTorch shape format: (C, H, W)
                face_ch = np.transpose(face_norm, (2, 0, 1))
                masked_ch = np.transpose(masked_norm, (2, 0, 1))
                
                # Concatenate along channel axis: (6, 96, 96)
                seq = np.concatenate([masked_ch, face_ch], axis=0)
                face_tensors.append(seq)
                
            face_tensor = torch.FloatTensor(np.array(face_tensors)).to(self.device) # (B, 6, 96, 96)

            # 3. Model Inference
            with torch.no_grad():
                pred = self.model(mel_tensor, face_tensor) # (B, 3, 96, 96)
                pred = pred.permute(0, 2, 3, 1).cpu().numpy() * 255.0
                pred = pred.astype(np.uint8)

            # 4. Blend output mouth back into full frames
            result_frames = []
            for i in range(n_frames):
                generated_face_rgb = pred[i]
                generated_face_bgr = cv2.cvtColor(generated_face_rgb, cv2.COLOR_RGB2BGR)
                
                bbox = bboxes[i]
                full_frame = full_frames[i]
                
                if bbox is not None and len(bbox) >= 4:
                    x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
                    face_h, face_w = y2 - y1, x2 - x1
                    if face_h > 0 and face_w > 0:
                        # Resize generated mouth crop back to original crop size
                        face_restored = cv2.resize(generated_face_bgr, (face_w, face_h))
                        
                        # Blend the mouth area only to avoid seams/artifacts
                        # Create a quick feather mask for smooth blending
                        mask = np.zeros((face_h, face_w), dtype=np.uint8)
                        # Only feather the bottom half where Wav2Lip operates
                        cv2.rectangle(mask, (0, face_h // 2), (face_w, face_h), 255, -1)
                        mask = cv2.GaussianBlur(mask, (15, 15), 0)
                        
                        mask_normalized = mask.astype(np.float32) / 255.0
                        mask_normalized = np.expand_dims(mask_normalized, axis=-1) # (H, W, 1)
                        
                        original_face = full_frame[y1:y2, x1:x2]
                        blended_face = (face_restored * mask_normalized + original_face * (1.0 - mask_normalized)).astype(np.uint8)
                        
                        result_frame = full_frame.copy()
                        result_frame[y1:y2, x1:x2] = blended_face
                    else:
                        result_frame = full_frame.copy()
                else:
                    result_frame = full_frame.copy()

                # Convert to RGB for client canvas drawing
                result_frames.append(cv2.cvtColor(result_frame, cv2.COLOR_BGR2RGB))

            return result_frames

        except Exception as e:
            print(f"[WAV2LIP] Inference error: {e}")
            return [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in full_frames]

    async def infer_batch(self, audio_bytes_16k: bytes, face_crops: list,
                          full_frames: list, bboxes: list) -> list:
        if not self._loaded:
            return []
        loop = asyncio.get_event_loop()
        frames = await loop.run_in_executor(
            self._executor, self._infer_sync,
            audio_bytes_16k, face_crops, full_frames, bboxes,
        )
        return [encode_jpeg(f) for f in frames]

    @property
    def loaded(self):
        return self._loaded
