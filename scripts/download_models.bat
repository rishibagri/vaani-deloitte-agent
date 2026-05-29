@echo off
echo Downloading MuseTalk model weights...

call backend\.venv\Scripts\activate.bat

cd musetalk

REM Clear broken mirror if set
set HF_ENDPOINT=

pip install -U "huggingface_hub[cli]==0.30.2" gdown

REM Download all weights using the MuseTalk script
python -c "
import subprocess, sys
result = subprocess.run(['bash', 'download_weights.sh'], capture_output=False)
sys.exit(result.returncode)
" 2>nul

REM Windows alternative if bash is not available
if errorlevel 1 (
    echo Bash not found, downloading manually...
    python -c "
from huggingface_hub import snapshot_download
import os, urllib.request, subprocess

os.makedirs('../models/musetalk', exist_ok=True)
os.makedirs('../models/musetalkV15', exist_ok=True)
os.makedirs('../models/sd-vae', exist_ok=True)
os.makedirs('../models/whisper', exist_ok=True)
os.makedirs('../models/dwpose', exist_ok=True)
os.makedirs('../models/syncnet', exist_ok=True)
os.makedirs('../models/face-parse-bisent', exist_ok=True)

print('Downloading MuseTalk V1.0 weights...')
snapshot_download('TMElyralab/MuseTalk', local_dir='../models', include=['musetalk/*'])
print('Downloading MuseTalk V1.5 weights...')
snapshot_download('TMElyralab/MuseTalk', local_dir='../models', include=['musetalkV15/*'])
print('Downloading SD VAE...')
snapshot_download('stabilityai/sd-vae-ft-mse', local_dir='../models/sd-vae', include=['config.json','diffusion_pytorch_model.bin'])
print('Downloading Whisper...')
snapshot_download('openai/whisper-tiny', local_dir='../models/whisper', include=['config.json','pytorch_model.bin','preprocessor_config.json'])
print('Downloading DWPose...')
snapshot_download('yzd-v/DWPose', local_dir='../models/dwpose', include=['dw-ll_ucoco_384.pth'])
print('Downloading SyncNet...')
snapshot_download('ByteDance/LatentSync', local_dir='../models/syncnet', include=['latentsync_syncnet.pt'])
print('Downloading face parse...')
urllib.request.urlretrieve('https://download.pytorch.org/models/resnet18-5c106cde.pth', '../models/face-parse-bisent/resnet18-5c106cde.pth')
print('All downloads complete.')
"
)

cd ..
deactivate
echo Model download complete.
pause
