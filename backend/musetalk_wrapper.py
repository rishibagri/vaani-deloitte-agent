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
        self.unet            = None  # MuseTalk UNet wrapper; real model at self.unet.model
        self.audio_processor = None
        self.scaling_factor  = 0.18215
        self._mask_tensor    = None
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
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            if not torch.cuda.is_available():
                print("[MUSETALK] No CUDA GPU - running on CPU (slow)")
            print(f"[MUSETALK] Loading models on {self.device}...")

            from diffusers import AutoencoderKL
            from musetalk.models.unet import UNet
            from musetalk.whisper.audio2feature import Audio2Feature

            # SD VAE — encodes/decodes face images to/from latent space
            self.vae = AutoencoderKL.from_pretrained(str(BASE_DIR / "models" / "sd-vae"))
            self.vae = self.vae.to(self.device)
            self.vae.requires_grad_(False)
            self.vae.eval()
            self.scaling_factor = self.vae.config.scaling_factor  # 0.18215 for sd-vae-ft-mse

            # Lower-half mask: keep upper half (eyes/nose), zero mouth/chin.
            # MuseTalk learns to regenerate the masked mouth region from audio.
            mask = torch.zeros((256, 256), dtype=torch.float32)
            mask[:128, :] = 1.0
            self._mask_tensor = mask.unsqueeze(0).to(self.device)  # [1, 256, 256]

            # MuseTalk UNet V1.5 wrapper — real nn.Module lives at self.unet.model
            # UNet also contains its own PositionalEncoding at self.unet.pe
            self.unet = UNet(
                unet_config=str(MUSETALK_UNET_CFG),
                model_path=str(MUSETALK_UNET_PATH),
            )
            self.unet.model.eval()  # UNet wrapper doesn't call eval() internally

            # Whisper-based audio feature extractor (MuseTalk's bundled whisper fork)
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

    def _img_to_tensor(self, img_bgr, half_mask: bool):
        """
        Match MuseTalk VAE.preprocess_img: resize 256, optional lower-half mask,
        normalize to [-1, 1], return [1, 3, 256, 256] tensor on device.
        """
        import torch
        import cv2
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        img_rgb = cv2.resize(img_rgb, (256, 256), interpolation=cv2.INTER_LANCZOS4)
        x = img_rgb.astype(np.float32) / 255.0
        x = torch.from_numpy(x).permute(2, 0, 1)  # [3, 256, 256]
        if half_mask:
            x = x * self._mask_tensor  # zero the lower half (mouth region)
        x = (x - 0.5) / 0.5            # normalize to [-1, 1]
        return x.unsqueeze(0).to(self.device)

    def _infer_sync(self, audio_bytes_16k: bytes, face_crops: list,
                    full_frames: list, bboxes: list) -> list:
        import torch
        import cv2

        _old_cwd = os.getcwd()
        os.chdir(str(MUSETALK_DIR))  # MuseTalk uses ./musetalk/... paths relative to its clone dir

        try:
            # Convert PCM bytes to float32 and pass directly to whisper transcribe.
            # whisper.transcribe() accepts a numpy float32 array, bypassing ffmpeg entirely.
            audio_float = np.frombuffer(audio_bytes_16k, dtype=np.int16).astype(np.float32) / 32768.0
            result = self.audio_processor.model.transcribe(audio_float, verbose=False)

            embed_list = []
            for emb in result.get('segments', []):
                enc = emb['encoder_embeddings']
                enc = enc.transpose(0, 2, 1, 3).squeeze(0)
                end_idx = int(emb['end'])
                start_idx = int(emb['start'])
                emb_end_idx = int((end_idx - start_idx) / 2)
                embed_list.append(enc[:emb_end_idx])

            if not embed_list:
                return [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in full_frames]

            audio_feat   = np.concatenate(embed_list, axis=0)
            audio_chunks = self.audio_processor.feature2chunks(audio_feat, fps=25)

            if not audio_chunks:
                return [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in full_frames]

            n_frames = min(len(face_crops), len(audio_chunks))
            if n_frames == 0:
                return [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in full_frames]

            result_frames = []
            sf = self.scaling_factor

            with torch.no_grad():
                for i in range(n_frames):
                    face_bgr   = face_crops[i]   # 256x256 BGR
                    full_frame = full_frames[i]
                    bbox       = bboxes[i]
                    audio_emb  = audio_chunks[i]

                    # Build 8-channel UNet input: [masked_latent | ref_latent]
                    # ref = full face; masked = lower half (mouth) zeroed out.
                    ref_tensor    = self._img_to_tensor(face_bgr, half_mask=False)
                    masked_tensor = self._img_to_tensor(face_bgr, half_mask=True)
                    ref_latents    = self.vae.encode(ref_tensor).latent_dist.sample() * sf
                    masked_latents = self.vae.encode(masked_tensor).latent_dist.sample() * sf
                    latent_input   = torch.cat([masked_latents, ref_latents], dim=1)  # [1,8,32,32]

                    # Audio embedding + positional encoding (via UNet's built-in PE)
                    audio_t = torch.from_numpy(audio_emb).float().unsqueeze(0).to(self.device)
                    audio_t = self.unet.pe(audio_t)
                    ts      = torch.zeros(1, dtype=torch.long).to(self.device)

                    # UNet forward — outputs 4-channel latent
                    pred_latents = self.unet.model(
                        latent_input, ts, encoder_hidden_states=audio_t
                    ).sample

                    # Decode latent back to pixel space (MuseTalk decode_latents)
                    pred_latents = (1.0 / sf) * pred_latents
                    decoded = self.vae.decode(pred_latents).sample
                    decoded = (decoded / 2 + 0.5).clamp(0, 1)
                    decoded = decoded.squeeze(0).permute(1, 2, 0).cpu().numpy()
                    generated_rgb = (decoded * 255).round().astype(np.uint8)
                    generated_bgr = cv2.cvtColor(generated_rgb, cv2.COLOR_RGB2BGR)

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
