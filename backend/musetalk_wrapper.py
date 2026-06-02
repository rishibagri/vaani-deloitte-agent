import asyncio
import os
import sys
import wave
import tempfile
import numpy as np
from concurrent.futures import ThreadPoolExecutor

os.environ["MPLBACKEND"] = "Agg"

from config import MUSETALK_DIR, MUSETALK_UNET_PATH, MUSETALK_UNET_CFG, MUSETALK_ENABLED, BASE_DIR
from audio_utils import encode_jpeg


def _setup_path():
    s = str(MUSETALK_DIR)
    if s not in sys.path:
        sys.path.insert(0, s)


class MuseTalkModel:
    """
    Wraps MuseTalk V1.5 inference for real-time streaming.

    V1.5 pipeline (matches scripts/realtime_inference.py):
      - HuggingFace transformers.WhisperModel encoder for audio features
      - AudioProcessor (mel feature extractor + per-frame whisper chunking)
      - VAE wrapper: 8-channel [masked | ref] latent input
      - UNet2DConditionModel + PositionalEncoding

    All heavy imports happen inside load() so the module is safe to import
    on machines without CUDA or before GPU packages are installed.
    """

    def __init__(self):
        self.device          = None
        self.weight_dtype    = None
        self.vae             = None  # MuseTalk VAE wrapper
        self.unet            = None  # MuseTalk UNet wrapper; real model at self.unet.model
        self.pe              = None  # PositionalEncoding
        self.whisper         = None  # transformers WhisperModel
        self.audio_processor = None  # AudioProcessor
        self._loaded         = False
        self._executor       = ThreadPoolExecutor(max_workers=1)

    def load(self):
        if not MUSETALK_ENABLED:
            print("[MUSETALK] Disabled - skipping model load")
            return

        _setup_path()
        _old_cwd = os.getcwd()
        os.chdir(str(MUSETALK_DIR))  # MuseTalk uses ./musetalk/... paths relative to its clone dir

        try:
            import torch
            from transformers import WhisperModel
            from musetalk.models.vae import VAE
            from musetalk.models.unet import UNet, PositionalEncoding
            from musetalk.utils.audio_processor import AudioProcessor

            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            # Use float32 throughout to avoid half/float device-dtype mismatches.
            self.weight_dtype = torch.float32
            if not torch.cuda.is_available():
                print("[MUSETALK] No CUDA GPU - running on CPU (slow)")
            print(f"[MUSETALK] Loading models on {self.device}...")

            whisper_dir = str(BASE_DIR / "models" / "whisper")

            # VAE wrapper (encode/decode + 8-channel latent prep)
            self.vae = VAE(model_path=str(BASE_DIR / "models" / "sd-vae"), use_float16=False)

            # UNet V1.5 + positional encoding
            self.unet = UNet(unet_config=str(MUSETALK_UNET_CFG), model_path=str(MUSETALK_UNET_PATH))
            self.unet.model = self.unet.model.to(self.device).eval()
            self.pe = PositionalEncoding(d_model=384).to(self.device)

            # HuggingFace Whisper encoder + mel feature extractor
            self.audio_processor = AudioProcessor(feature_extractor_path=whisper_dir)
            self.whisper = WhisperModel.from_pretrained(whisper_dir)
            self.whisper = self.whisper.to(device=self.device, dtype=self.weight_dtype).eval()

            self._loaded = True
            print("[MUSETALK] All V1.5 models loaded and ready")

        except Exception as e:
            import traceback
            print(f"[MUSETALK] Failed to load models: {e}")
            traceback.print_exc()
            print("[MUSETALK] Falling back to loop-only mode (no lip sync)")
            self._loaded = False
        finally:
            os.chdir(_old_cwd)

    def _infer_sync(self, audio_bytes_16k: bytes, face_crops: list,
                    full_frames: list, bboxes: list) -> list:
        import torch
        import cv2

        _old_cwd = os.getcwd()
        os.chdir(str(MUSETALK_DIR))

        tmp_path = None
        try:
            # Write PCM to a temp WAV — librosa reads WAV via soundfile (no ffmpeg needed)
            tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            tmp_path = tmp.name
            tmp.close()
            with wave.open(tmp_path, 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)   # int16
                wf.setframerate(16000)
                wf.writeframes(audio_bytes_16k)

            # V1.5 audio feature extraction
            feats, librosa_length = self.audio_processor.get_audio_feature(
                tmp_path, weight_dtype=self.weight_dtype
            )
            if feats is None or librosa_length == 0:
                return [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in full_frames]

            whisper_chunks = self.audio_processor.get_whisper_chunk(
                feats, self.device, self.weight_dtype, self.whisper, librosa_length, fps=25,
            )

            n_frames = min(len(face_crops), len(whisper_chunks))
            if n_frames == 0:
                return [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in full_frames]

            result_frames = []
            timesteps = torch.tensor([0], device=self.device)

            with torch.no_grad():
                for i in range(n_frames):
                    face_bgr   = face_crops[i]   # 256x256 BGR
                    full_frame = full_frames[i]
                    bbox       = bboxes[i]

                    # 8-channel [masked | ref] latent via MuseTalk VAE wrapper
                    latent_input = self.vae.get_latents_for_unet(face_bgr)
                    latent_input = latent_input.to(device=self.device, dtype=self.weight_dtype)

                    # Per-frame audio feature [50, 384] -> [1, 50, 384] -> positional encoding
                    audio_t = whisper_chunks[i].unsqueeze(0).to(device=self.device, dtype=self.weight_dtype)
                    audio_t = self.pe(audio_t)

                    pred_latents = self.unet.model(
                        latent_input, timesteps, encoder_hidden_states=audio_t
                    ).sample

                    # decode_latents returns BGR uint8 numpy [B, 256, 256, 3]
                    recon = self.vae.decode_latents(pred_latents)
                    generated_bgr = recon[0]
                    generated_bgr = cv2.resize(generated_bgr, (256, 256))

                    # Paste generated face back into the full frame at the face bbox
                    result_frame = full_frame.copy()
                    if bbox is not None and len(bbox) >= 4:
                        x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
                        face_h, face_w = y2 - y1, x2 - x1
                        if face_h > 0 and face_w > 0:
                            result_frame[y1:y2, x1:x2] = cv2.resize(generated_bgr, (face_w, face_h))

                    result_frames.append(cv2.cvtColor(result_frame, cv2.COLOR_BGR2RGB))

            return result_frames

        except Exception as e:
            print(f"[MUSETALK] Inference error: {e}")
            return [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in full_frames]
        finally:
            os.chdir(_old_cwd)
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass

    async def infer_batch(self, audio_bytes_16k: bytes, face_crops: list,
                          full_frames: list, bboxes: list) -> list:
        if not self._loaded:
            return []
        loop   = asyncio.get_event_loop()
        frames = await loop.run_in_executor(
            self._executor, self._infer_sync,
            audio_bytes_16k, face_crops, full_frames, bboxes,
        )
        return [encode_jpeg(f) for f in frames]

    @property
    def loaded(self) -> bool:
        return self._loaded
