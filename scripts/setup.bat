@echo off
setlocal EnableDelayedExpansion
echo ===================================================
echo  Vaani Setup - Deloitte DCIT Avatar Intelligence
echo ===================================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found.
    echo         Install Python 3.10 from https://python.org
    echo         Check "Add Python to PATH" during install.
    pause & exit /b 1
)

for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VERSION=%%v
for /f "tokens=2 delims=." %%b in ("!PY_VERSION!") do set PY_MINOR=%%b
if !PY_MINOR! LSS 10 (
    echo [ERROR] Python 3.10+ required. Got Python !PY_VERSION!
    echo         MuseTalk requires Python 3.10. Install from https://python.org
    pause & exit /b 1
)
echo [OK] Python !PY_VERSION!

node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause & exit /b 1
)
for /f %%v in ('node --version') do echo [OK] Node.js %%v

git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git not found. Install from https://git-scm.com
    pause & exit /b 1
)
echo [OK] Git found

set GPU_AVAILABLE=false
set TORCH_CHANNEL=cpu
set TORCH_VER=2.0.1
set TORCHVISION_VER=0.15.2
set MMCV_VER=2.0.1
set MMCV_TORCH_TAG=torch2.0

nvidia-smi >nul 2>&1
if not errorlevel 1 (
    set GPU_AVAILABLE=true

    python -c "import subprocess,re; o=subprocess.check_output('nvidia-smi',text=True,stderr=subprocess.DEVNULL); m=re.search(r'CUDA Version: (\d+)', o); print(m.group(1) if m else '0')" > "%TEMP%\vaani_cuda_major.txt" 2>nul
    set /p CUDA_MAJOR=<"%TEMP%\vaani_cuda_major.txt"
    del "%TEMP%\vaani_cuda_major.txt" >nul 2>&1

    python -c "import subprocess,re; o=subprocess.check_output('nvidia-smi',text=True,stderr=subprocess.DEVNULL); m=re.search(r'CUDA Version: \d+\.(\d+)', o); print(m.group(1) if m else '0')" > "%TEMP%\vaani_cuda_minor.txt" 2>nul
    set /p CUDA_MINOR=<"%TEMP%\vaani_cuda_minor.txt"
    del "%TEMP%\vaani_cuda_minor.txt" >nul 2>&1

    if not defined CUDA_MAJOR set CUDA_MAJOR=0
    if not defined CUDA_MINOR set CUDA_MINOR=0

    if !CUDA_MAJOR! GEQ 12 (
        set TORCH_CHANNEL=cu121
        set TORCH_VER=2.1.0
        set TORCHVISION_VER=0.16.0
        set MMCV_VER=2.1.0
        set MMCV_TORCH_TAG=torch2.1
        echo [INFO] NVIDIA GPU detected - CUDA !CUDA_MAJOR!.!CUDA_MINOR! ^(>=12^)
        echo        Using PyTorch 2.1.0 + cu121
    ) else if !CUDA_MAJOR! EQU 11 (
        if !CUDA_MINOR! GEQ 8 (
            set TORCH_CHANNEL=cu118
            echo [INFO] NVIDIA GPU detected - CUDA !CUDA_MAJOR!.!CUDA_MINOR!
            echo        Using PyTorch 2.0.1 + cu118
        ) else (
            set TORCH_CHANNEL=cu117
            echo [INFO] NVIDIA GPU detected - CUDA !CUDA_MAJOR!.!CUDA_MINOR!
            echo        Using PyTorch 2.0.1 + cu117
            echo [WARN] CUDA 11.7 is outdated. Consider updating your NVIDIA driver.
        )
    ) else (
        echo [WARN] Could not determine CUDA version - defaulting to cu118.
        set TORCH_CHANNEL=cu118
    )
) else (
    echo [INFO] No NVIDIA GPU detected. Installing CPU-only dependencies.
    echo        MuseTalk lip sync will be disabled automatically.
)
echo.

if "!GPU_AVAILABLE!"=="true" (
    if not exist "musetalk" (
        echo [SETUP] Cloning MuseTalk...
        git clone https://github.com/TMElyralab/MuseTalk.git musetalk
        if errorlevel 1 (
            echo [ERROR] Failed to clone MuseTalk. Check internet connection.
            pause & exit /b 1
        )
    ) else (
        echo [INFO] musetalk\ already present - skipping clone.
    )
)

if not exist "backend\.venv" (
    echo [SETUP] Creating Python virtual environment...
    python -m venv backend\.venv
)

echo [SETUP] Activating virtual environment...
call backend\.venv\Scripts\activate.bat

echo [SETUP] Upgrading pip...
python -m pip install --upgrade pip --quiet

echo [SETUP] Installing base Python dependencies...
pip install -r backend\requirements.txt

if "!GPU_AVAILABLE!"=="true" (
    echo.
    echo [SETUP] Installing PyTorch !TORCH_VER! ^(!TORCH_CHANNEL!^)...
    pip install torch==!TORCH_VER! torchvision==!TORCHVISION_VER! --index-url https://download.pytorch.org/whl/!TORCH_CHANNEL!

    echo [SETUP] Installing GPU utility packages...
    pip install -r backend\requirements_gpu.txt

    echo [SETUP] Installing mmcv !MMCV_VER! ^(!TORCH_CHANNEL! / !MMCV_TORCH_TAG!^)...
    pip install mmcv==!MMCV_VER! -f https://download.openmmlab.com/mmcv/dist/!TORCH_CHANNEL!/!MMCV_TORCH_TAG!/index.html

    echo [SETUP] Installing mmdet, mmpose, mmengine...
    pip install mmdet==3.1.0 mmpose==1.1.0 mmengine

    echo.
    echo [SETUP] Installing chumpy...
    echo [NOTE] chumpy requires Visual C++ Build Tools. If this fails, install from:
    echo        https://visualstudio.microsoft.com/visual-cpp-build-tools/
    echo        Select "Desktop development with C++" then re-run setup.bat.
    echo.
    pip install --no-build-isolation chumpy
    if errorlevel 1 (
        echo [WARN] chumpy install failed. MuseTalk blending will be limited.
        echo        Install Visual Studio C++ Build Tools and re-run setup.bat to fix.
    )

    echo [SETUP] Installing openai-whisper...
    pip install openai-whisper

    echo [SETUP] Installing MuseTalk Python requirements...
    pip install -r musetalk\requirements.txt
) else (
    echo [INFO] Skipping GPU packages ^(no NVIDIA GPU detected^).
)

deactivate

echo.
echo [SETUP] Installing frontend Node.js dependencies...
cd frontend
npm install
cd ..

if not exist ".env" (
    copy .env.example .env >nul
    echo [SETUP] Created .env from .env.example.
)

echo.
echo ===================================================
echo  Setup complete!
echo ===================================================
echo.
echo  Next steps:
echo  1. Open .env and add your GEMINI_API_KEY
echo  2. Copy avatar_idle.mp4 to data\video\ and frontend\public\
if "!GPU_AVAILABLE!"=="true" (
    echo  3. Run scripts\download_models.bat   ^(~15-20 min, first time only^)
    echo  4. Run scripts\run.bat
) else (
    echo  3. Run scripts\run.bat
)
echo.
pause
