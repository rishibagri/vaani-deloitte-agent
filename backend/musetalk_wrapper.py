import asyncio
import os
import numpy as np
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

os.environ["MPLBACKEND"] = "Agg"

from config import (
    MUSETALK_DIR, MUSETALK_UNET_PATH, MUSETALK_UNET_CFG,
    MUSETALK_ENABLED, BASE_DIR,
)
from audio_utils import encode_jpeg


def _add_musetalk_to_path():
    musetalk_str = str(MUSETALK_DIR)
    import sys
    if musetalk_str not in sys.path:
        sys.path.insert(0, musetalk_str)


class MuseTalkModel:
    """
    Wraps MuseTalk V1.5 inference for real-time streaming use.
    All GPU/torch imports happen inside load() so the module is safe to
    import on Mac or any CPU-only machine.
    """

    def __init__(self):
        self.device        = None
        self.vae           = None
        self.unet          = None
        self.audio_processor = None
        self.pe            = None
        self._loaded       = False
        self._executor     = ThreadPoolExecutor(max_workers=1)

    def load(self):
        if not MUSETALK_ENABLED:
            print("[MUSETALK] Disabled — skipping model load")
            return

        _add_musetalk_to_path()

        try:
            import torch

            if not torch.cuda.is_available():
                print("[MUSETALK] No CUDA GPU found — running in CPU-only mode (slow)")

            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            print(f"[MUSETALK] Loading models on {self.device}...")

            import cv2
            import json
            from diffusers import AutoencoderKL
            from musetalk.models.unet import UNet, PositionalEncoding
            from musetalk.whisper.audio2feature import Audio2Feature

            vae_path = str(BASE_DIR / "models" / "sd-vae")
            self.vae = AutoencoderKL.from_pretrained(vae_path).to(self.device)
            self.vae.requires_grad_(False)

            with open(str(MUSETALK_UNET_CFG)) as f:
                unet_cfg = json.load(f)

            unet_arch = unet_cfg.get("architecture", unet_cfg)
            self.unet = UNet(**unet_arch)
            state = torch.load(str(MUSETALK_UNET_PATH), map_location=self.device)
            self.unet.load_state_dict(state)
            self.unet = self.unet.to(self.device)
            self.unet.eval()

            self.pe = PositionalEncoding(d_model=384)

            whisper_path = str(BASE_DIR / "models" / "whisper")
            self.audio_processor = Audio2Feature(model_path=whisper_path)

            self._loaded = True
            print("[MUSETALK] All models loaded and ready")

        except Exception as e:
            print(f"[MUSETALK] Failed to load models: {e}")
            print("[MUSETALK] Falling back to loop-only mode (no lip sync)")
            self._loaded = False

    def _infer_sync(self, audio_bytes_16k: bytes, face_crops: list,
                    full_frames: list, bboxes: list) -> list:
        import torch
        import cv2

        try:
            from musetalk.utils.blending import get_image_prepare_material, get_image_blending

            audio_array = np.frombuffer(audio_bytes_16k, dtype=np.int16).astype(np.float32) / 32767.0
            audio_feat  = self.audio_processor.audio2feat_from_array(audio_array, sample_rate=16000)
            audio_chunks = self.audio_processor.feature2chunks(audio_feat, fps=25)

            n_frames     = min(len(face_crops), len(audio_chunks))
            result_frames = []

            with torch.no_grad():
                for i in range(n_frames):
                    face_bgr   = face_crops[i]
                    full_frame = full_frames[i]
                    bbox       = bboxes[i]
                    audio_emb  = audio_chunks[i]

                    face_rgb    = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)
                    face_tensor = torch.from_numpy(face_rgb).permute(2, 0, 1).float()
                    face_tensor = (face_tensor / 127.5) - 1.0
                    face_tensor = face_tensor.unsqueeze(0).to(self.device)

                    latent  = self.vae.encode(face_tensor).latent_dist.sample() * 0.18215
                    audio_t = torch.from_numpy(audio_emb).float().unsqueeze(0).to(self.device)
                    ts      = torch.zeros(1, dtype=torch.long).to(self.device)

                    output_latent = self.unet(latent, ts, encoder_hidden_states=audio_t).sample
                    output_latent = output_latent / 0.18215
                    decoded = self.vae.decode(output_latent).sample
                    decoded = (decoded + 1.0) * 127.5
                    decoded = decoded.squeeze(0).permute(1, 2, 0).clamp(0, 255)
                    generated_bgr = cv2.cvtColor(
                        decoded.cpu().numpy().astype(np.uint8), cv2.COLOR_RGB2BGR
                    )
                    generated_bgr = cv2.resize(generated_bgr, (256, 256))

                    if bbox is not None and len(bbox) >= 4:
                        x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
                        face_h, face_w  = y2 - y1, x2 - x1
                        if face_h > 0 and face_w > 0:
                            blended = generated_bgr
                            try:
                                mask, mask_img = get_image_prepare_material([face_bgr], 4)
                                blended = get_image_blending(generated_bgr, face_bgr, mask[0], mask_img[0])
                            except Exception:
                                pass
                            result_frame = full_frame.copy()
                            result_frame[y1:y2, x1:x2] = cv2.resize(blended, (face_w, face_h))
                        else:
                            result_frame = full_frame.copy()
                    else:
                        result_frame = full_frame.copy()

                    result_frames.append(cv2.cvtColor(result_frame, cv2.COLOR_BGR2RGB))

            return result_frames

        except Exception as e:
            print(f"[MUSETALK] Inference error: {e}")
            return [
                __import__('cv2').cvtColor(f, __import__('cv2').COLOR_BGR2RGB)
                for f in full_frames
            ]

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
    def loaded(self):
        return self._loaded
