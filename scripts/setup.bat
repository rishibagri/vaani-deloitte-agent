@echo off
echo Setting up Vaani...

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install Python 3.10 from python.org
    pause
    exit /b 1
)

REM Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Install from nodejs.org
    pause
    exit /b 1
)

REM Clone MuseTalk if not present
if not exist "musetalk" (
    echo Cloning MuseTalk...
    git clone https://github.com/TMElyralab/MuseTalk.git musetalk
    if errorlevel 1 (
        echo ERROR: Failed to clone MuseTalk. Check internet connection.
        pause
        exit /b 1
    )
)

REM Backend virtual env
if not exist "backend\.venv" (
    echo Creating backend virtual environment...
    python -m venv backend\.venv
)

echo Installing backend dependencies...
call backend\.venv\Scripts\activate.bat
pip install -r backend\requirements.txt
pip install -r backend\requirements_gpu.txt --index-url https://download.pytorch.org/whl/cu117
pip install mmcv==2.0.1 -f https://download.openmmlab.com/mmcv/dist/cu117/torch2.0/index.html
pip install mmdet==3.1.0 mmpose==1.1.0 mmengine
pip install --no-build-isolation chumpy
pip install openai-whisper
deactivate

REM Install MuseTalk requirements in same venv
call backend\.venv\Scripts\activate.bat
pip install -r musetalk\requirements.txt
deactivate

REM Frontend
echo Installing frontend dependencies...
cd frontend
npm install
cd ..

REM Copy .env if not present
if not exist ".env" (
    copy .env.example .env
    echo Created .env from example. Add your GEMINI_API_KEY.
)

echo.
echo Setup complete. 
echo 1. Add your GEMINI_API_KEY to .env
echo 2. Put your avatar_idle.mp4 in data\video\ and frontend\public\
echo 3. Run scripts\download_models.bat
echo 4. Run scripts\run.bat
pause
