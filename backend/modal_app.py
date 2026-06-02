"""
Vaani backend — Modal cloud deployment (GPU: A10G, Python 3.10, CUDA 11.7)

Setup order (do this once):
  1.  pip install modal
  2.  modal setup                               # opens browser to log in
  3.  modal secret create vaani-secrets \\
        GEMINI_API_KEY=<your_key> \\
        AGENT_NAME=Vaani \\
        AGENT_ROLE="Your AI Assistant" \\
        AGENT_VOICE=Puck \\
        MUSETALK_ENABLED=true \\
        MUSETALK_BATCH_MS=200 \\
        CORS_ORIGINS="*" \\
        SYNCLABS_API_KEY=<your_key> \\
        SYNCLABS_ENABLED=true \\
        BACKEND_PUBLIC_URL=https://<your-username>--vaani-backend-web.modal.run
  4.  modal run backend/modal_app.py::download_models   # ~15 min, once only
  5.  modal deploy backend/modal_app.py                 # prints your live URL
  6.  Put that URL into frontend/.env.local as VITE_BACKEND_URL

Re-deploy after code changes:
  modal deploy backend/modal_app.py
"""
import modal
from pathlib import Path

LOCAL_ROOT = Path(__file__).parent.parent  # deloitte/

# ── persistent model storage (survives redeployments) ────────────────
model_vol = modal.Volume.from_name("vaani-models", create_if_missing=True)

# ── container image ──────────────────────────────────────────────────
# Base: official NVIDIA CUDA 11.7 image (matches torch==2.0.1+cu117)
image = (
    modal.Image.from_registry(
        "nvidia/cuda:11.7.1-cudnn8-runtime-ubuntu20.04",
        add_python="3.10",
    )
    .apt_install(
        "git",
        "ffmpeg",
        "libsm6",
        "libxext6",
        "libglib2.0-0",
        "libgl1-mesa-glx",
        "libgomp1",
    )
    # Core FastAPI / Gemini / audio deps
    .pip_install(
        "fastapi==0.111.0",
        "uvicorn[standard]==0.29.0",
        "websockets==12.0",
        "python-dotenv==1.0.1",
        "google-genai>=0.8.0",
        "numpy==1.23.5",
        "librosa==0.10.1",
        "httpx==0.27.0",
        "pyyaml>=6.0",
        "psycopg2-binary>=2.9.0",
        "supabase>=2.0.0",
    )
    # PyTorch with CUDA 11.7
    .pip_install(
        "torch==2.0.1+cu117",
        "torchvision==0.15.2+cu117",
        extra_index_url="https://download.pytorch.org/whl/cu117",
    )
    # Vision / MuseTalk inference deps
    .pip_install(
        "opencv-python-headless==4.9.0.80",
        "diffusers==0.30.2",
        "accelerate==0.28.0",
        "omegaconf>=2.3.0",
        "transformers>=4.36.0",
        "huggingface-hub>=0.20.0",
        "timm",
        "einops",
        "onnxruntime-gpu",   # DWPose landmark detection
        "face-alignment",    # fallback face landmark detection
    )
    # Clone MuseTalk source into the image; symlink /models so MuseTalk's
    # own internal model lookups resolve against the persistent volume.
    .run_commands(
        "git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git /musetalk",
        "rm -rf /musetalk/models && ln -sf /models /musetalk/models",
    )
)

app = modal.App("vaani-backend", image=image)

# ── local file mounts (uploaded to Modal at deploy/run time) ─────────
# Backend source lands at /backend — config.py's BASE_DIR = /backend/../ = /
# so all relative model/data paths resolve to the right locations.
backend_mount = modal.Mount.from_local_dir(
    LOCAL_ROOT / "backend",
    remote_path="/backend",
    condition=lambda p: ".venv" not in p and "__pycache__" not in p and ".env" not in p,
)
data_mount = modal.Mount.from_local_dir(
    LOCAL_ROOT / "data",
    remote_path="/data",
)
prerendered_mount = modal.Mount.from_local_dir(
    LOCAL_ROOT / "prerendered",
    remote_path="/prerendered",
)
known_responses_mount = modal.Mount.from_local_file(
    str(LOCAL_ROOT / "known_responses.txt"),
    remote_path="/known_responses.txt",
)


# ── one-time model download ───────────────────────────────────────────
@app.function(
    gpu="A10G",
    volumes={"/models": model_vol},
    timeout=3600,
)
def download_models():
    """
    Download all MuseTalk model weights into the persistent Modal volume.

    Run this ONCE before the first deploy:
        modal run backend/modal_app.py::download_models

    Downloads (~5 GB total):
      • MuseTalk V1.5 UNet + config      (/models/musetalkV15/)
      • Stable Diffusion VAE             (/models/sd-vae/)
      • Whisper tiny audio encoder       (/models/whisper/)
      • DWPose ONNX landmark models      (/models/dwpose/)
    """
    import os
    import shutil
    from pathlib import Path
    from huggingface_hub import snapshot_download, hf_hub_download

    def mkdir(p):
        os.makedirs(p, exist_ok=True)

    # ── 1. Pull the full MuseTalk HF repo ────────────────────────────
    print("[1/4] Downloading MuseTalk repo from HuggingFace (this is the largest step)...")
    snapshot_download(
        repo_id="TMElyralab/MuseTalk",
        local_dir="/tmp/musetalk-hf",
        ignore_patterns=["*.git*", "*.gitattributes"],
    )

    # Copy musetalkV15 UNet weights
    mkdir("/models/musetalkV15")
    src_v15 = Path("/tmp/musetalk-hf/models/musetalkV15")
    if src_v15.exists():
        for f in src_v15.iterdir():
            dst = Path("/models/musetalkV15") / f.name
            if not dst.exists():
                shutil.copy2(f, dst)
        print("  ✓ musetalkV15 weights copied")
    else:
        print("  ! musetalkV15 dir not found in HF repo — check TMElyralab/MuseTalk structure")

    # ── 2. SD-VAE (needed by diffusers AutoencoderKL.from_pretrained) ─
    print("[2/4] Setting up SD-VAE...")
    mkdir("/models/sd-vae")
    # MuseTalk HF repo may have it as 'sd-vae-ft-mse' or 'sd-vae'
    vae_copied = False
    for candidate in ["sd-vae-ft-mse", "sd-vae"]:
        src = Path(f"/tmp/musetalk-hf/models/{candidate}")
        if src.exists():
            for f in src.iterdir():
                shutil.copy2(f, f"/models/sd-vae/{f.name}")
            vae_copied = True
            break
    if not vae_copied:
        print("  VAE not in MuseTalk HF bundle — downloading stabilityai/sd-vae-ft-mse directly...")
        snapshot_download("stabilityai/sd-vae-ft-mse", local_dir="/models/sd-vae")
    print("  ✓ SD-VAE ready")

    # ── 3. Whisper tiny (audio feature extraction) ───────────────────
    print("[3/4] Setting up Whisper...")
    mkdir("/models/whisper")
    whisper_src = Path("/tmp/musetalk-hf/models/whisper")
    if whisper_src.exists():
        for f in whisper_src.iterdir():
            shutil.copy2(f, f"/models/whisper/{f.name}")
        print("  ✓ Whisper copied from MuseTalk bundle")
    else:
        print("  Whisper not in bundle — downloading openai/whisper-tiny directly...")
        snapshot_download("openai/whisper-tiny", local_dir="/models/whisper")
        print("  ✓ Whisper ready")

    # ── 4. DWPose ONNX models (face landmark detection in LoopCache) ──
    print("[4/4] Setting up DWPose...")
    mkdir("/models/dwpose")
    dwpose_src = Path("/tmp/musetalk-hf/models/dwpose")
    if dwpose_src.exists():
        for f in dwpose_src.glob("*.onnx"):
            shutil.copy2(f, f"/models/dwpose/{f.name}")
        print("  ✓ DWPose copied from MuseTalk bundle")
    else:
        print("  DWPose not in bundle — downloading from yzd-v/DWPose...")
        for fname in ["dw-ll_ucoco_384.onnx", "yolox_l.onnx"]:
            try:
                hf_hub_download(
                    repo_id="yzd-v/DWPose",
                    filename=fname,
                    local_dir="/models/dwpose",
                )
            except Exception as e:
                print(f"  ! Could not download {fname}: {e}")
        print("  ✓ DWPose ready")

    # Commit all changes to the volume so they persist across containers
    model_vol.commit()

    print("\n" + "=" * 60)
    print("All models downloaded. Volume committed.")
    print("Contents of /models:")
    for p in sorted(Path("/models").rglob("*")):
        if p.is_file():
            size_mb = p.stat().st_size / 1_000_000
            print(f"  {p}  ({size_mb:.1f} MB)")
    print("=" * 60)
    print("\nNext step: modal deploy backend/modal_app.py")


# ── web server (the live endpoint) ───────────────────────────────────
@app.function(
    gpu="A10G",
    volumes={"/models": model_vol},
    mounts=[backend_mount, data_mount, prerendered_mount, known_responses_mount],
    secrets=[modal.Secret.from_name("vaani-secrets")],
    timeout=3600,           # max 1 hour per WebSocket session
    allow_concurrent_inputs=20,  # concurrent WebSocket connections per container
    keep_warm=1,            # keep one GPU container hot to avoid cold-start (~30s model load)
)
@modal.asgi_app()
def web():
    """
    The live FastAPI server.
    /backend/config.py resolves BASE_DIR = /backend/../ = /
    so all paths (models, data, musetalk, prerendered) hit the right mounts.
    """
    import sys
    import os

    # Backend source and MuseTalk both on Python path
    sys.path.insert(0, "/backend")
    sys.path.insert(0, "/musetalk")

    # These only apply if not already set by the Modal secret
    os.environ.setdefault("MUSETALK_ENABLED", "true")
    os.environ.setdefault("CORS_ORIGINS", "*")

    from main import app as fastapi_app
    return fastapi_app
