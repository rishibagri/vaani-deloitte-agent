@echo off
echo ===================================================
echo  Installing face recognition (optional feature)
echo ===================================================
echo.
echo Uses dlib-bin (precompiled) so no Visual C++ build is needed.
echo.

call backend\.venv\Scripts\activate.bat

echo [1/4] Installing precompiled dlib...
pip install dlib-bin
if errorlevel 1 (
    echo [ERROR] dlib-bin install failed.
    echo         Your Python version may not have a prebuilt wheel.
    echo         dlib-bin supports Python 3.7-3.12 on Windows x64.
    pause & exit /b 1
)

echo [2/4] Installing face_recognition_models...
pip install git+https://github.com/ageitgey/face_recognition_models

echo [3/4] Installing face_recognition (without deps, dlib already provided)...
pip install face_recognition --no-deps

echo [4/4] Ensuring Pillow and Click are present...
pip install Pillow Click

echo.
echo Verifying...
python -c "import face_recognition; print('[OK] face_recognition imported successfully')"
if errorlevel 1 (
    echo [ERROR] face_recognition import failed. See errors above.
    pause & exit /b 1
)

deactivate
echo.
echo ===================================================
echo  Face recognition installed!
echo ===================================================
echo  Set DATABASE_URL in .env to enable the memory layer.
echo.
pause
