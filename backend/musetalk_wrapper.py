import asyncio
import math
import os
import sys
import wave
import tempfile
import numpy as np
from concurrent.futures import ThreadPoolExecutor

os.environ["MPLBACKEND"] = "Agg"

from config import (
    MUSETALK_DIR, MUSETALK_UNET_PATH, MUSETALK_UNET_CFG, MUSETALK_ENABLED, BASE_DIR,
    MUSETALK_GPU_BATCH, MOUTH_SCALE, MOUTH_DX, MOUTH_DY, MUSETALK_FP16,
)
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
        self._latent_cache   = None  # precomputed 8-ch latents per loop frame
        self._mouth_alpha    = None  # feathered mouth-region blend mask
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
            use_fp16 = MUSETALK_FP16 and torch.cuda.is_available()
            self.weight_dtype = torch.float16 if use_fp16 else torch.float32
            if not torch.cuda.is_available():
                print("[MUSETALK] No CUDA GPU - running on CPU (slow)")
            print(f"[MUSETALK] Loading models on {self.device} ({'fp16' if use_fp16 else 'fp32'})...")

            whisper_dir = str(BASE_DIR / "models" / "whisper")

            # VAE wrapper (encode/decode + 8-channel latent prep)
            self.vae = VAE(model_path=str(BASE_DIR / "models" / "sd-vae"), use_float16=use_fp16)

            # UNet V1.5 + positional encoding
            self.unet = UNet(unet_config=str(MUSETALK_UNET_CFG), model_path=str(MUSETALK_UNET_PATH))
            self.unet.model = self.unet.model.to(self.device)
            self.pe = PositionalEncoding(d_model=384).to(self.device)
            if use_fp16:
                self.unet.model = self.unet.model.half()
                self.pe = self.pe.half()
            self.unet.model = self.unet.model.eval()

            # HuggingFace Whisper encoder + mel feature extractor
            self.audio_processor = AudioProcessor(feature_extractor_path=whisper_dir)
            self.whisper = WhisperModel.from_pretrained(whisper_dir)
            self.whisper = self.whisper.to(device=self.device, dtype=self.weight_dtype).eval()

            # Mouth-region alpha mask (256x256): keep the original upper face,
            # blend only the lower (mouth/jaw) region with a soft feathered seam.
            self._mouth_alpha = self._build_mouth_alpha(256)

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

    @staticmethod
    def _build_mouth_alpha(size: int) -> np.ndarray:
        """
        Build a [size,size] float32 alpha mask: 0 in the upper face (keep original),
        ramping to 1 over the mouth/jaw region, with the left/right edges feathered
        so the composite has no visible seam.
        """
        alpha = np.zeros((size, size), dtype=np.float32)
        top  = int(size * 0.46)   # above: fully original
        full = int(size * 0.62)   # below: fully generated mouth
        for y in range(size):
            if y <= top:
                a = 0.0
            elif y >= full:
                a = 1.0
            else:
                a = (y - top) / float(full - top)
            alpha[y, :] = a
        # Horizontal edge feather (taper left/right 12%)
        edge = int(size * 0.12)
        if edge > 0:
            ramp = np.linspace(0.0, 1.0, edge, dtype=np.float32)
            alpha[:, :edge]  *= ramp[None, :]
            alpha[:, -edge:] *= ramp[::-1][None, :]
        return alpha

    def prepare_latents(self, face_crops: list):
        """
        Precompute the 8-channel [masked | ref] VAE latents for every loop-video
        face crop ONCE at startup. The avatar's face never changes, so doing this
        per-frame at inference was the biggest waste — this removes two VAE encodes
        per frame from the hot path.
        """
        if not self._loaded or not face_crops:
            return
        import torch
        _old_cwd = os.getcwd()
        os.chdir(str(MUSETALK_DIR))
        try:
            cache = []
            with torch.no_grad():
                for crop in face_crops:
                    lat = self.vae.get_latents_for_unet(crop)
                    lat = lat.to(device=self.device, dtype=self.weight_dtype)
                    cache.append(lat)
            self._latent_cache = cache
            print(f"[MUSETALK] Precomputed {len(cache)} face latents")
        except Exception as e:
            print(f"[MUSETALK] Latent precompute failed: {e}")
            self._latent_cache = None
        finally:
            os.chdir(_old_cwd)

    def _whisper_chunks_safe(self, feats, num_frames: int):
        """
        Reimplementation of AudioProcessor.get_whisper_chunk with bounds clamping
        instead of assert/exit() — safe for short streaming chunks. Returns a list
        of per-frame audio features, each shaped [50, 384].
        """
        import torch
        from einops import rearrange

        pad_left, pad_right = 2, 2
        feat_len_per_frame = 2 * (pad_left + pad_right + 1)  # 10
        fps = 25
        idx_multiplier = 50 / fps  # audio is 50 fps, video 25 fps

        # Run the Whisper encoder on each 30s mel segment, stack hidden states.
        whisper_feature = []
        for input_feature in feats:
            input_feature = input_feature.to(self.device).to(self.weight_dtype)
            hidden = self.whisper.encoder(input_feature, output_hidden_states=True).hidden_states
            hidden = torch.stack(hidden, dim=2)  # [1, seq, layers, 384]
            whisper_feature.append(hidden)
        whisper_feature = torch.cat(whisper_feature, dim=1)

        # Pad generously so every per-frame slice stays in bounds.
        padding_nums = math.ceil(idx_multiplier)
        left = padding_nums * pad_left
        right = padding_nums * pad_right + feat_len_per_frame
        whisper_feature = torch.cat([
            torch.zeros_like(whisper_feature[:, :left]),
            whisper_feature,
            torch.zeros_like(whisper_feature[:, :right]),
        ], dim=1)

        total = whisper_feature.shape[1]
        chunks = []
        for fi in range(num_frames):
            idx = int(fi * idx_multiplier)
            if idx + feat_len_per_frame > total:
                idx = total - feat_len_per_frame
            if idx < 0:
                break
            clip = whisper_feature[:, idx: idx + feat_len_per_frame]  # [1,10,layers,384]
            clip = rearrange(clip, 'b c h w -> b (c h) w')           # [1, 50, 384]
            chunks.append(clip.squeeze(0))                            # [50, 384]
        return chunks

    def _infer_sync(self, audio_bytes_16k: bytes, face_crops: list,
                    full_frames: list, bboxes: list, indices: list) -> list:
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

            # V1.5 mel feature extraction (HF feature extractor)
            feats, librosa_length = self.audio_processor.get_audio_feature(
                tmp_path, weight_dtype=self.weight_dtype
            )
            if feats is None or librosa_length == 0:
                return [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in full_frames]

            # Number of video frames this audio chunk should drive (25 fps).
            num_frames = max(1, int((librosa_length / 16000) * 25))
            whisper_chunks = self._whisper_chunks_safe(feats, num_frames)

            n_frames = min(len(face_crops), len(whisper_chunks))
            if n_frames == 0:
                return [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in full_frames]

            result_frames = []
            timesteps = torch.tensor([0], device=self.device)
            BATCH = max(1, MUSETALK_GPU_BATCH)  # frames per UNet/VAE forward pass

            with torch.no_grad():
                for start in range(0, n_frames, BATCH):
                    end = min(start + BATCH, n_frames)
                    bsz = end - start

                    # Stack 8-channel latents for this sub-batch
                    lat_list = []
                    for i in range(start, end):
                        if self._latent_cache is not None and i < len(indices):
                            lat_list.append(self._latent_cache[indices[i]])
                        else:
                            lat_list.append(self.vae.get_latents_for_unet(face_crops[i]).to(
                                device=self.device, dtype=self.weight_dtype))
                    latent_batch = torch.cat(lat_list, dim=0)  # [bsz, 8, 32, 32]

                    # Stack audio features [bsz, 50, 384] + positional encoding
                    audio_batch = torch.stack(
                        [whisper_chunks[i] for i in range(start, end)], dim=0
                    ).to(device=self.device, dtype=self.weight_dtype)
                    audio_batch = self.pe(audio_batch)

                    ts = timesteps.repeat(bsz)
                    pred_latents = self.unet.model(
                        latent_batch, ts, encoder_hidden_states=audio_batch
                    ).sample

                    # decode_latents returns BGR uint8 numpy [bsz, 256, 256, 3]
                    recon = self.vae.decode_latents(pred_latents)

                    for j in range(bsz):
                        i = start + j
                        full_frame = full_frames[i]
                        bbox       = bboxes[i]
                        generated_bgr = recon[j]

                        result_frame = full_frame.copy()
                        if bbox is not None and len(bbox) >= 4:
                            x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
                            face_h, face_w = y2 - y1, x2 - x1
                            if face_h > 0 and face_w > 0:
                                gen = cv2.resize(generated_bgr, (face_w, face_h)).astype(np.float32)

                                # Affine correction: scale about center + nudge, to
                                # align the generated mouth with the real face geometry.
                                if MOUTH_SCALE != 1.0 or MOUTH_DX != 0.0 or MOUTH_DY != 0.0:
                                    cx, cy = face_w / 2.0, face_h / 2.0
                                    s = MOUTH_SCALE
                                    tx = cx - s * cx + MOUTH_DX * face_w
                                    ty = cy - s * cy + MOUTH_DY * face_h
                                    M = np.array([[s, 0, tx], [0, s, ty]], dtype=np.float32)
                                    gen = cv2.warpAffine(
                                        gen, M, (face_w, face_h),
                                        flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE,
                                    )

                                roi = result_frame[y1:y2, x1:x2].astype(np.float32)
                                # Mouth-only feathered blend: keep original face,
                                # swap only the lower mouth/jaw region.
                                if self._mouth_alpha is not None:
                                    a = cv2.resize(self._mouth_alpha, (face_w, face_h))[:, :, None]
                                    blended = roi * (1.0 - a) + gen * a
                                else:
                                    blended = gen
                                result_frame[y1:y2, x1:x2] = blended.astype(np.uint8)

                        result_frames.append(cv2.cvtColor(result_frame, cv2.COLOR_BGR2RGB))

            return result_frames

        except (Exception, SystemExit) as e:
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
                          full_frames: list, bboxes: list, indices: list) -> list:
        if not self._loaded:
            return []
        loop   = asyncio.get_event_loop()
        frames = await loop.run_in_executor(
            self._executor, self._infer_sync,
            audio_bytes_16k, face_crops, full_frames, bboxes, indices,
        )
        return [encode_jpeg(f) for f in frames]

    @property
    def loaded(self) -> bool:
        return self._loaded
