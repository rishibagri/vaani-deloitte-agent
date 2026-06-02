import os
import sys
import cv2
import numpy as np
from pathlib import Path

os.environ["MPLBACKEND"] = "Agg"

from config import MUSETALK_DIR, BASE_VIDEO_PATH, BASE_DIR

# Canonical 5-point face template in the 256x256 crop MuseTalk operates on.
# Order matches YuNet landmarks: right eye, left eye, nose, right mouth, left mouth.
_CANON_256 = np.float32([
    [96,  92],   # right eye
    [160, 92],   # left eye
    [128, 138],  # nose tip
    [100, 184],  # right mouth corner
    [156, 184],  # left mouth corner
])


def _add_musetalk_to_path():
    musetalk_str = str(MUSETALK_DIR)
    if musetalk_str not in sys.path:
        sys.path.insert(0, musetalk_str)


class LoopCache:
    """
    Pre-loads the avatar loop video and computes, per frame, a similarity
    transform that warps the face into a canonical 256x256 crop (landmark-aligned
    via YuNet). MuseTalk runs in that canonical space; the generated mouth is
    inverse-warped back, so it tracks the moving head precisely with no per-frame
    scale/position jitter. Falls back to a box-as-affine crop if YuNet is absent.
    """

    def __init__(self, video_path: Path = BASE_VIDEO_PATH):
        self.video_path = video_path
        self.full_frames = []
        self.face_crops = []
        self.transforms = []   # per-frame 2x3 affine M: full-frame -> canonical 256
        self.frame_count = 0
        self.idx = 0
        self._loaded = False

    def load(self, video_path=None):
        if video_path is not None:
            self.video_path = video_path
        # Reset any previously-loaded avatar so a bot switch rebuilds cleanly.
        self.full_frames, self.face_crops, self.transforms = [], [], []
        self.frame_count, self.idx, self._loaded = 0, 0, False

        print(f"[SETUP] Loading loop video and computing face alignment: {self.video_path}")

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

        print(f"[SETUP] Loaded {len(raw_frames)} frames, aligning faces...")
        _add_musetalk_to_path()

        h_img, w_img = raw_frames[0].shape[:2]
        transforms = self._compute_transforms(raw_frames, w_img, h_img)

        self.full_frames = raw_frames
        self.transforms = transforms
        self.face_crops = [
            cv2.warpAffine(f, M, (256, 256), flags=cv2.INTER_LINEAR)
            for f, M in zip(raw_frames, transforms)
        ]

        self.frame_count = len(self.full_frames)
        self._loaded = True
        print(f"[SETUP] Loop cache ready with {self.frame_count} aligned frames")

    # ── face alignment ──────────────────────────────────────────────────────

    def _compute_transforms(self, frames: list, w_img: int, h_img: int) -> list:
        """Return a per-frame 2x3 affine mapping full-frame -> canonical 256 crop."""
        yunet_path = BASE_DIR / "models" / "face" / "face_detection_yunet_2023mar.onnx"
        detector = None
        if yunet_path.exists():
            try:
                detector = cv2.FaceDetectorYN.create(str(yunet_path), "", (320, 320), score_threshold=0.6)
                print("[SETUP] Using YuNet landmark alignment")
            except Exception as e:
                print(f"[SETUP] YuNet init failed ({e}); using box alignment")

        # Collect 5-point landmarks per frame (or None)
        landmarks = []
        for frame in frames:
            lm = None
            if detector is not None:
                detector.setInputSize((w_img, h_img))
                _, faces = detector.detect(frame)
                if faces is not None and len(faces) > 0:
                    r = max(faces, key=lambda f: f[2] * f[3])
                    lm = np.float32([
                        [r[4], r[5]], [r[6], r[7]], [r[8], r[9]],
                        [r[10], r[11]], [r[12], r[13]],
                    ])
            landmarks.append(lm)

        # Fill gaps with last good landmarks, then lightly smooth to kill jitter
        landmarks = self._fill_and_smooth(landmarks)

        transforms = []
        last_M = None
        for lm in landmarks:
            M = None
            if lm is not None:
                M, _ = cv2.estimateAffinePartial2D(lm, _CANON_256, method=cv2.LMEDS)
            if M is None:
                M = last_M if last_M is not None else self._box_affine(frames[0], w_img, h_img)
            transforms.append(M.astype(np.float32))
            last_M = M
        return transforms

    @staticmethod
    def _fill_and_smooth(landmarks: list, window: int = 3) -> list:
        # Forward-fill None gaps
        last = None
        filled = []
        for lm in landmarks:
            if lm is None:
                lm = last
            else:
                last = lm
            filled.append(lm)
        # Back-fill any leading Nones
        nxt = None
        for i in range(len(filled) - 1, -1, -1):
            if filled[i] is None:
                filled[i] = nxt
            else:
                nxt = filled[i]
        if any(f is None for f in filled):
            return filled  # no landmarks at all
        # Moving-average smoothing over the loop
        n = len(filled)
        smoothed = []
        for i in range(n):
            acc = np.zeros((5, 2), np.float32)
            cnt = 0
            for j in range(i - window // 2, i + window // 2 + 1):
                acc += filled[j % n]
                cnt += 1
            smoothed.append(acc / cnt)
        return smoothed

    @staticmethod
    def _box_affine(frame, w_img, h_img):
        """Fallback: center-square box -> 256 crop as an affine (scale+translate)."""
        side = int(min(w_img, h_img) * 0.6)
        cx, cy = w_img // 2, int(h_img * 0.42)
        x1 = max(0, cx - side // 2)
        y1 = max(0, cy - side // 2)
        s = 256.0 / side
        return np.float32([[s, 0, -s * x1], [0, s, -s * y1]])

    # ── batch access ────────────────────────────────────────────────────────

    def next_batch(self, n: int):
        if not self._loaded or self.frame_count == 0:
            raise RuntimeError("[SETUP] Loop cache not loaded or has no frames.")
        crops, frames, transforms, indices = [], [], [], []
        for _ in range(n):
            i = self.idx % self.frame_count
            crops.append(self.face_crops[i])
            frames.append(self.full_frames[i])
            transforms.append(self.transforms[i])
            indices.append(i)
            self.idx += 1
        return crops, frames, transforms, indices

    def get_frame(self, index: int):
        i = index % self.frame_count
        return self.full_frames[i], self.face_crops[i], self.transforms[i]

    @property
    def loaded(self):
        return self._loaded
