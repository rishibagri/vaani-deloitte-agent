@echo off
echo ===================================================
echo  Installing face recognition (OpenCV - no dlib!)
echo ===================================================
echo.
echo Downloads two small ONNX models (~5 MB). No compilation,
echo no Visual C++, no dlib. Uses OpenCV's built-in YuNet + SFace.
echo.

if not exist "models\face" mkdir "models\face"

call backend\.venv\Scripts\activate.bat

echo [1/2] Downloading YuNet face detector...
python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx', 'models/face/face_detection_yunet_2023mar.onnx'); print('  done')"

echo [2/2] Downloading SFace recognizer...
python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx', 'models/face/face_recognition_sface_2021dec.onnx'); print('  done')"

echo.
echo Verifying OpenCV face modules...
python -c "import cv2; cv2.FaceDetectorYN.create('models/face/face_detection_yunet_2023mar.onnx','',(320,320)); cv2.FaceRecognizerSF.create('models/face/face_recognition_sface_2021dec.onnx',''); print('[OK] OpenCV face recognition ready')"
if errorlevel 1 (
    echo [ERROR] OpenCV face modules failed to load. See errors above.
    pause & exit /b 1
)

deactivate
echo.
echo ===================================================
echo  Face recognition ready!
echo ===================================================
echo  Set DATABASE_URL in .env to enable the memory layer.
echo.
pause
