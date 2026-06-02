@echo off
echo Downloading MuseTalk model weights...
echo This will take 15-20 minutes on first run.
echo.

call backend\.venv\Scripts\activate.bat

pip install -q -U "huggingface_hub[cli]"

cd scripts
python download_models.py
cd ..

deactivate
echo.
echo Model download complete.
pause
