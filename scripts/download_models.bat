@echo off
echo Downloading MuseTalk model weights...
echo This will take 15-20 minutes on first run.
echo.

call backend\.venv\Scripts\activate.bat

pip install -q "huggingface_hub[cli]>=0.10.3,<1.0"

echo Updating MuseTalk repo to get latest config files...
git -C musetalk pull

cd scripts
python download_models.py
cd ..

deactivate
echo.
echo Model download complete.
pause
