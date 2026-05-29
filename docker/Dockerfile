FROM pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git ffmpeg libgl1-mesa-glx libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
COPY backend/requirements_gpu.txt .

RUN pip install -r requirements.txt
RUN pip install torch==2.0.1+cu117 torchvision==0.15.2+cu117 \
    --index-url https://download.pytorch.org/whl/cu117
RUN pip install mmcv==2.0.1 \
    -f https://download.openmmlab.com/mmcv/dist/cu117/torch2.0/index.html
RUN pip install mmdet==3.1.0 mmpose==1.1.0 mmengine
RUN pip install --no-build-isolation chumpy openai-whisper

COPY backend/ ./backend/
COPY musetalk/ ./musetalk/
COPY models/ ./models/
COPY data/ ./data/

ENV MPLBACKEND=Agg
WORKDIR /app/backend
CMD ["python", "main.py"]
