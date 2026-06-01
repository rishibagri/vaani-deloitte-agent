@echo off
setlocal EnableDelayedExpansion
echo ===================================================
echo  Vaani Setup — Deloitte DCIT Avatar Intelligence
echo ===================================================
echo.

REM ── Prerequisite checks ──────────────────────────

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found.
    echo         Install Python 3.10 from https://python.org
    echo         Check "Add Python to PATH" during install.
    pause & exit /b 1
)

node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo         Install Node.js 20 LTS from https://nodejs.org
    pause & exit /b 1
)

git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git not found.
    echo         Install Git for Windows from https://git-scm.com
    pause & exit /b 1
)

REM ── GPU detection ────────────────────────────────

set GPU_AVAILABLE=false
nvidia-smi >nul 2>&1
if not errorlevel 1 (
    set GPU_AVAILABLE=true
    echo [INFO] NVIDIA GPU detected. Full GPU dependencies will be installed.
) else (
    echo [INFO] No NVIDIA GPU detected. Installing CPU-only dependencies.
    echo        MuseTalk lip sync will be disabled automatically ^(MUSETALK_ENABLED=auto^).
)
echo.

REM ── Clone MuseTalk ───────────────────────────────

if "!GPU_AVAILABLE!"=="true" (
    if not exist "musetalk" (
        echo [SETUP] Cloning MuseTalk...
        git clone https://github.com/TMElyralab/MuseTalk.git musetalk
        if errorlevel 1 (
            echo [ERROR] Failed to clone MuseTalk. Check internet connection.
            pause & exit /b 1
        )
    ) else (
        echo [INFO] musetalk\ already present, skipping clone.
    )
)

REM ── Backend virtual environment ──────────────────

if not exist "backend\.venv" (
    echo [SETUP] Creating backend virtual environment...
    python -m venv backend\.venv
)

echo [SETUP] Activating virtual environment...
call backend\.venv\Scripts\activate.bat

echo [SETUP] Installing base Python dependencies...
pip install -r backend\requirements.txt

if "!GPU_AVAILABLE!"=="true" (
    echo [SETUP] Installing GPU dependencies ^(PyTorch CUDA 11.7^)...
    pip install -r backend\requirements_gpu.txt --index-url https://download.pytorch.org/whl/cu117

    echo [SETUP] Installing mmcv for CUDA 11.7...
    pip install mmcv==2.0.1 -f https://download.openmmlab.com/mmcv/dist/cu117/torch2.0/index.html

    echo [SETUP] Installing mmdet, mmpose, mmengine...
    pip install mmdet==3.1.0 mmpose==1.1.0 mmengine

    echo [SETUP] Installing chumpy...
    pip install --no-build-isolation chumpy

    echo [SETUP] Installing openai-whisper...
    pip install openai-whisper

    echo [SETUP] Installing MuseTalk Python requirements...
    pip install -r musetalk\requirements.txt
)

deactivate

REM ── Frontend ─────────────────────────────────────

echo [SETUP] Installing frontend Node dependencies...
cd frontend
npm install
cd ..

REM ── .env ─────────────────────────────────────────

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
echo  1. Add your GEMINI_API_KEY to .env
echo  2. Copy avatar_idle.mp4 to data\video\ and frontend\public\
if "!GPU_AVAILABLE!"=="true" (
    echo  3. Run scripts\download_models.bat   ^(~15-20 min, first time only^)
    echo  4. Run scripts\run.bat
) else (
    echo  3. Run scripts\run.bat
)
echo.
pause
