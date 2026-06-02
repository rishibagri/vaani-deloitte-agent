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
echo.

set GPU_AVAILABLE=false
nvidia-smi >nul 2>&1
if not errorlevel 1 set GPU_AVAILABLE=true

if "!GPU_AVAILABLE!"=="true" (
    echo [INFO] NVIDIA GPU detected. Using PyTorch cu118 ^(compatible with CUDA 11.8 and 12.x^).
) else (
    echo [INFO] No NVIDIA GPU detected. CPU-only mode - MuseTalk will be disabled.
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
        echo [INFO] musetalk already present - skipping clone.
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
    echo [SETUP] Installing PyTorch 2.0.1 + cu118...
    pip install torch==2.0.1 torchvision==0.15.2 --index-url https://download.pytorch.org/whl/cu118

    echo [SETUP] Installing GPU utility packages...
    pip install -r backend\requirements_gpu.txt

    echo [SETUP] Installing mmcv...
    pip install mmcv==2.0.1 -f https://download.openmmlab.com/mmcv/dist/cu118/torch2.0/index.html

    echo [SETUP] Installing mmdet, mmpose, mmengine...
    pip install mmdet==3.1.0 mmpose==1.1.0 mmengine

    echo.
    echo [SETUP] Installing chumpy...
    echo [NOTE] chumpy needs Visual C++ Build Tools. If this fails get them from:
    echo        https://visualstudio.microsoft.com/visual-cpp-build-tools/
    echo        Choose "Desktop development with C++" then re-run setup.bat.
    echo.
    pip install --no-build-isolation chumpy
    if errorlevel 1 (
        echo [WARN] chumpy failed - MuseTalk blending limited. Install VS C++ Build Tools to fix.
    )

    echo [SETUP] Installing openai-whisper...
    pip install openai-whisper

    echo [SETUP] Installing MuseTalk requirements...
    pip install -r musetalk\requirements.txt
) else (
    echo [INFO] Skipping GPU packages.
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
    echo  3. Run scripts\download_models.bat  (15-20 min, first time only)
    echo  4. Run scripts\run.bat
) else (
    echo  3. Run scripts\run.bat
)
echo.
pause
