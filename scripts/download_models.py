"""Downloads all MuseTalk model weights from HuggingFace."""
import os
import urllib.request
from huggingface_hub import snapshot_download

os.makedirs('../models/musetalk', exist_ok=True)
os.makedirs('../models/musetalkV15', exist_ok=True)
os.makedirs('../models/sd-vae', exist_ok=True)
os.makedirs('../models/whisper', exist_ok=True)
os.makedirs('../models/dwpose', exist_ok=True)
os.makedirs('../models/syncnet', exist_ok=True)
os.makedirs('../models/face-parse-bisent', exist_ok=True)

print('Downloading MuseTalk V1.0 weights...')
snapshot_download('TMElyralab/MuseTalk', local_dir='../models', allow_patterns=['musetalk/*'])

print('Downloading MuseTalk V1.5 weights...')
snapshot_download('TMElyralab/MuseTalk', local_dir='../models', allow_patterns=['musetalkV15/*'])

print('Downloading SD VAE...')
snapshot_download('stabilityai/sd-vae-ft-mse', local_dir='../models/sd-vae', allow_patterns=['config.json', 'diffusion_pytorch_model.bin'])

print('Downloading Whisper...')
snapshot_download('openai/whisper-tiny', local_dir='../models/whisper', allow_patterns=['config.json', 'pytorch_model.bin', 'preprocessor_config.json'])

print('Downloading DWPose...')
snapshot_download('yzd-v/DWPose', local_dir='../models/dwpose', allow_patterns=['dw-ll_ucoco_384.pth'])

print('Downloading SyncNet...')
snapshot_download('ByteDance/LatentSync', local_dir='../models/syncnet', allow_patterns=['latentsync_syncnet.pt'])

print('Downloading face parse model...')
urllib.request.urlretrieve(
    'https://download.pytorch.org/models/resnet18-5c106cde.pth',
    '../models/face-parse-bisent/resnet18-5c106cde.pth'
)

print('All downloads complete.')
