import asyncio
import os
import sys
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
    All heavy imports happen inside load() so the module is safe to import
    on machines without CUDA or before GPU packages are installed.
    """

    def __init__(self):
        self.device          = None
        self.vae             = None
        self.unet            = None
        self.audio_processor = None
        self.pe              = None
        self._loaded         = False
        self._executor       = ThreadPoolExecutor(max_workers=1)

    def load(self):
        if not MUSETALK_ENABLED:
            print("[MUSETALK] Disabled - skipping model load")
            return

        _setup_path()
        _old_cwd = os.getcwd()
        os.chdir(str(BASE_DIR))

        try:
            import torch
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            if not torch.cuda.is_available():
                print("[MUSETALK] No CUDA GPU - running on CPU (slow)")
            print(f"[MUSETALK] Loading models on {self.device}...")

            from diffusers import AutoencoderKL
            from musetalk.models.unet import UNet, PositionalEncoding
            from musetalk.whisper.audio2feature import Audio2Feature

            # SD VAE — encodes/decodes face images to/from latent space
            self.vae = AutoencoderKL.from_pretrained(str(BASE_DIR / "models" / "sd-vae"))
            self.vae = self.vae.to(self.device)
            self.vae.requires_grad_(False)
            self.vae.eval()

            # MuseTalk UNet V1.5 — takes file paths, handles device internally
            self.unet = UNet(
                unet_config=str(MUSETALK_UNET_CFG),
                model_path=str(MUSETALK_UNET_PATH),
            )

            # Positional encoding for audio feature sequences
            self.pe = PositionalEncoding(d_model=384)

            # Whisper-based audio feature extractor
            # openai-whisper expects a model name ('tiny') or path to a .pt file,
            # not a HuggingFace directory. It auto-downloads to ~/.cache/whisper/.
            whisper_pt = BASE_DIR / "models" / "whisper" / "tiny.pt"
            whisper_arg = str(whisper_pt) if whisper_pt.exists() else "tiny"
            self.audio_processor = Audio2Feature(model_path=whisper_arg)

            self._loaded = True
            print("[MUSETALK] All models loaded and ready")

        except Exception as e:
            print(f"[MUSETALK] Failed to load models: {e}")
            print("[MUSETALK] Falling back to loop-only mode (no lip sync)")
            self._loaded = False
        finally:
            os.chdir(_old_cwd)

    def _infer_sync(self, audio_bytes_16k: bytes, face_crops: list,
                    full_frames: list, bboxes: list) -> list:
        import torch
        import cv2

        _old_cwd = os.getcwd()
        os.chdir(str(BASE_DIR))

        try:
            from musetalk.utils.blending import get_image_prepare_material, get_image_blending

            # Extract audio features via Whisper encoder
            audio_array = np.frombuffer(audio_bytes_16k, dtype=np.int16).astype(np.float32) / 32767.0
            audio_feat  = self.audio_processor.audio2feat_from_array(audio_array, sample_rate=16000)
            audio_chunks = self.audio_processor.feature2chunks(audio_feat, fps=25)

            n_frames = min(len(face_crops), len(audio_chunks))
            if n_frames == 0:
                return [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in full_frames]

            result_frames = []

            with torch.no_grad():
                for i in range(n_frames):
                    face_bgr   = face_crops[i]
                    full_frame = full_frames[i]
                    bbox       = bboxes[i]
                    audio_emb  = audio_chunks[i]

                    # Encode face to VAE latent
                    face_rgb    = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)
                    face_tensor = torch.from_numpy(face_rgb).permute(2, 0, 1).float()
                    face_tensor = (face_tensor / 127.5 - 1.0).unsqueeze(0).to(self.device)
                    latent      = self.vae.encode(face_tensor).latent_dist.sample() * 0.18215

                    # Build UNet inputs
                    audio_t = torch.from_numpy(audio_emb).float().unsqueeze(0).to(self.device)
                    ts      = torch.zeros(1, dtype=torch.long).to(self.device)

                    # UNet forward pass — V1.5 may return tensor or object with .sample
                    unet_out      = self.unet(latent, ts, encoder_hidden_states=audio_t)
                    output_latent = unet_out.sample if hasattr(unet_out, "sample") else unet_out
                    output_latent = output_latent / 0.18215

                    # Decode latent back to pixel space
                    decoded = self.vae.decode(output_latent).sample
                    decoded = (decoded + 1.0) * 127.5
                    decoded = decoded.squeeze(0).permute(1, 2, 0).clamp(0, 255)
                    generated_bgr = cv2.cvtColor(
                        decoded.cpu().numpy().astype(np.uint8), cv2.COLOR_RGB2BGR
                    )
                    generated_bgr = cv2.resize(generated_bgr, (256, 256))

                    # Blend generated face back into the full frame
                    result_frame = full_frame.copy()
                    if bbox is not None and len(bbox) >= 4:
                        x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
                        face_h, face_w = y2 - y1, x2 - x1
                        if face_h > 0 and face_w > 0:
                            try:
                                mask, mask_img = get_image_prepare_material([face_bgr], 4)
                                blended = get_image_blending(
                                    generated_bgr, face_bgr, mask[0], mask_img[0]
                                )
                            except Exception:
                                blended = generated_bgr
                            result_frame[y1:y2, x1:x2] = cv2.resize(blended, (face_w, face_h))

                    result_frames.append(cv2.cvtColor(result_frame, cv2.COLOR_BGR2RGB))

            return result_frames

        except Exception as e:
            print(f"[MUSETALK] Inference error: {e}")
            return [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in full_frames]
        finally:
            os.chdir(_old_cwd)

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
