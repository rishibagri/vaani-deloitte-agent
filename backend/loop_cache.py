import os
import sys
import cv2
import numpy as np
from pathlib import Path

os.environ["MPLBACKEND"] = "Agg"

from config import MUSETALK_DIR, BASE_VIDEO_PATH, BASE_DIR


def _add_musetalk_to_path():
    musetalk_str = str(MUSETALK_DIR)
    if musetalk_str not in sys.path:
        sys.path.insert(0, musetalk_str)


class LoopCache:
    """
    Pre-loads all frames from the avatar loop video and runs face detection once at startup.
    This avoids running detection on every inference call, which would add ~20ms per batch.
    """

    def __init__(self, video_path: Path = BASE_VIDEO_PATH):
        self.video_path = video_path
        self.full_frames = []
        self.face_crops = []
        self.bboxes = []
        self.frame_count = 0
        self.idx = 0
        self._loaded = False

    def load(self):
        """
        Read every frame from the loop video and run face detection.
        Stores face crops and bounding boxes so inference only needs to run the UNet.
        """
        print("[SETUP] Loading loop video and precomputing face crops...")

        cap = cv2.VideoCapture(str(self.video_path))
        if not cap.isOpened():
            raise RuntimeError(f"[SETUP] Cannot open video: {self.video_path}")

        raw_frames = []
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            raw_frames.append(frame)
        cap.release()

        if not raw_frames:
            raise RuntimeError("[SETUP] Video has no frames")

        print(f"[SETUP] Loaded {len(raw_frames)} frames, running face detection...")

        _add_musetalk_to_path()

        try:
            import os
            from musetalk.utils.preprocessing import get_landmark_and_bbox, read_imgs
            _old_cwd = os.getcwd()
            os.chdir(str(BASE_DIR))
            try:
                coords, frame_list = get_landmark_and_bbox(raw_frames, bbox_shift=0)
            finally:
                os.chdir(_old_cwd)
            self.full_frames = frame_list
            self.bboxes = coords
            self.face_crops = self._crop_faces(frame_list, coords)
            print(f"[SETUP] Face detection complete. {len(self.face_crops)} crops cached.")
        except Exception as e:
            print(f"[SETUP] Face detection failed: {e}")
            print("[SETUP] Falling back to full-frame mode (lower quality)")
            self.full_frames = raw_frames
            h, w = raw_frames[0].shape[:2]
            self.bboxes = [(0, 0, w, h)] * len(raw_frames)
            self.face_crops = [cv2.resize(f, (256, 256)) for f in raw_frames]

        self.frame_count = len(self.full_frames)
        self._loaded = True
        print(f"[SETUP] Loop cache ready with {self.frame_count} frames")

    def _crop_faces(self, frames, coords):
        crops = []
        for frame, coord in zip(frames, coords):
            if coord is None or len(coord) < 4:
                crops.append(np.zeros((256, 256, 3), dtype=np.uint8))
                continue
            x1, y1, x2, y2 = int(coord[0]), int(coord[1]), int(coord[2]), int(coord[3])
            x1, y1 = max(0, x1), max(0, y1)
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                crops.append(np.zeros((256, 256, 3), dtype=np.uint8))
                continue
            crops.append(cv2.resize(crop, (256, 256)))
        return crops

    def next_batch(self, n: int):
        """
        Pull n frames from the circular buffer.
        Returns face_crops, full_frames, bboxes for inference.
        """
        if not self._loaded:
            raise RuntimeError("[SETUP] Loop cache not loaded. Call load() first.")
        crops, frames, boxes = [], [], []
        for _ in range(n):
            i = self.idx % self.frame_count
            crops.append(self.face_crops[i])
            frames.append(self.full_frames[i])
            boxes.append(self.bboxes[i])
            self.idx += 1
        return crops, frames, boxes

    def get_frame(self, index: int):
        """Get a single frame by absolute index for pre-render use."""
        i = index % self.frame_count
        return self.full_frames[i], self.face_crops[i], self.bboxes[i]

    @property
    def loaded(self):
        return self._loaded
