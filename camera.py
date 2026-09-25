"""Module 1: AI Gym Trainer & Real-Time Computer Vision Engine (camera.py).

Features:
- Real-time laptop webcam capture using OpenCV `cv2.VideoCapture(0)`.
- Real-time browser `getUserMedia` frame processing (`process_frame_base64`) returning
  33 MediaPipe Pose landmarks, skeleton connections, joint angles, and rep counts.
- MediaPipe Pose Landmarker (`pose_landmarker_lite.task`) + `mp.solutions.pose` compatibility.
- Real-time repetition counting & joint-angle state machines for:
  1. Bicep Curl
  2. Squat
  3. Pushup
  4. Lunge
  5. Shoulder Press
- Explicit lifecycle controls: Start Camera, Stop Camera, Start Workout, Pause Workout, and Reset.
- Camera-off Demo Mode fallback and graceful handling of unavailable/denied cameras.
"""

import base64
import math
import os
import threading
import time
import urllib.request
from typing import Dict, List, Optional

import cv2
import mediapipe as mp
import numpy as np

# MediaPipe Pose setup (supports both MediaPipe Tasks PoseLandmarker and legacy mp.solutions.pose)
HAS_MP_SOLUTIONS = hasattr(mp, "solutions") and hasattr(mp.solutions, "pose")
if HAS_MP_SOLUTIONS:
    mp_pose = mp.solutions.pose
    mp_draw = mp.solutions.drawing_utils
else:
    mp_pose = None
    mp_draw = None

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)
MODEL_PATH = os.path.join(os.path.dirname(__file__), "backend", "pose_landmarker_lite.task")

# Standard 33-landmark indices matching MediaPipe Pose
LM_NOSE = 0
LM_LEFT_SHOULDER = 11
LM_RIGHT_SHOULDER = 12
LM_LEFT_ELBOW = 13
LM_RIGHT_ELBOW = 14
LM_LEFT_WRIST = 15
LM_RIGHT_WRIST = 16
LM_LEFT_INDEX = 19
LM_RIGHT_INDEX = 20
LM_LEFT_HIP = 23
LM_RIGHT_HIP = 24
LM_LEFT_KNEE = 25
LM_RIGHT_KNEE = 26
LM_LEFT_ANKLE = 27
LM_RIGHT_ANKLE = 28

POSE_CONNECTIONS = [
    (LM_LEFT_SHOULDER, LM_RIGHT_SHOULDER),
    (LM_LEFT_SHOULDER, LM_LEFT_ELBOW),
    (LM_LEFT_ELBOW, LM_LEFT_WRIST),
    (LM_LEFT_WRIST, LM_LEFT_INDEX),
    (LM_RIGHT_SHOULDER, LM_RIGHT_ELBOW),
    (LM_RIGHT_ELBOW, LM_RIGHT_WRIST),
    (LM_RIGHT_WRIST, LM_RIGHT_INDEX),
    (LM_LEFT_SHOULDER, LM_LEFT_HIP),
    (LM_RIGHT_SHOULDER, LM_RIGHT_HIP),
    (LM_LEFT_HIP, LM_RIGHT_HIP),
    (LM_LEFT_HIP, LM_LEFT_KNEE),
    (LM_LEFT_KNEE, LM_LEFT_ANKLE),
    (LM_RIGHT_HIP, LM_RIGHT_KNEE),
    (LM_RIGHT_KNEE, LM_RIGHT_ANKLE),
]

SUPPORTED_EXERCISES = [
    "Bicep Curl",
    "Squat",
    "Pushup",
    "Lunge",
    "Shoulder Press",
]

CALORIE_FACTORS = {
    "Bicep Curl": 0.40,
    "Squat": 0.65,
    "Pushup": 0.55,
    "Lunge": 0.60,
    "Shoulder Press": 0.48,
}


def calculate_angle(a: List[float], b: List[float], c: List[float]) -> float:
    """Calculates the 2D interior angle (in degrees, 0-180) at vertex b formed by points a-b-c."""
    a_arr = np.array(a, dtype=np.float64)
    b_arr = np.array(b, dtype=np.float64)
    c_arr = np.array(c, dtype=np.float64)

    radians = np.arctan2(c_arr[1] - b_arr[1], c_arr[0] - b_arr[0]) - np.arctan2(
        a_arr[1] - b_arr[1], a_arr[0] - b_arr[0]
    )
    angle = float(np.abs(radians * 180.0 / np.pi))
    if angle > 180.0:
        angle = 360.0 - angle
    return angle


class SyntheticPoint:
    """Lightweight landmark structure matching MediaPipe's normalized landmark `.x`, `.y`, `.visibility`."""

    def __init__(self, x: float, y: float, z: float = 0.0, visibility: float = 0.99):
        self.x = float(np.clip(x, 0.01, 0.99))
        self.y = float(np.clip(y, 0.01, 0.99))
        self.z = float(z)
        self.visibility = float(visibility)


def generate_synthetic_landmarks(exercise: str, t: float) -> List[SyntheticPoint]:
    """Generates a realistic 33-landmark kinematic pose sequence for Camera-Off Demo Mode."""
    pts = [SyntheticPoint(0.5, 0.5) for _ in range(33)]
    phase = (math.sin(t * 2.2) + 1.0) / 2.0  # Smooth 0.0 -> 1.0 oscillation
    posture_wobble = 0.03 if int(abs(t)) % 11 == 5 else 0.0

    if exercise == "Bicep Curl":
        pts[LM_NOSE] = SyntheticPoint(0.50, 0.18)
        pts[LM_LEFT_SHOULDER] = SyntheticPoint(0.42, 0.30 + posture_wobble * 0.5)
        pts[LM_RIGHT_SHOULDER] = SyntheticPoint(0.58, 0.30)
        pts[LM_LEFT_HIP] = SyntheticPoint(0.44 - posture_wobble, 0.58)
        pts[LM_RIGHT_HIP] = SyntheticPoint(0.56 - posture_wobble, 0.58)
        pts[LM_LEFT_KNEE] = SyntheticPoint(0.44, 0.76)
        pts[LM_RIGHT_KNEE] = SyntheticPoint(0.56, 0.76)
        pts[LM_LEFT_ANKLE] = SyntheticPoint(0.44, 0.92)
        pts[LM_RIGHT_ANKLE] = SyntheticPoint(0.56, 0.92)

        pts[LM_LEFT_ELBOW] = SyntheticPoint(0.40, 0.45)
        pts[LM_RIGHT_ELBOW] = SyntheticPoint(0.60, 0.45)

        theta = math.radians(12 + phase * 145)
        forearm_len = 0.14
        lx = pts[LM_LEFT_ELBOW].x - forearm_len * math.sin(theta) * 0.25
        ly = pts[LM_LEFT_ELBOW].y + forearm_len * math.cos(theta)
        rx = pts[LM_RIGHT_ELBOW].x + forearm_len * math.sin(theta) * 0.25
        ry = pts[LM_RIGHT_ELBOW].y + forearm_len * math.cos(theta)

        pts[LM_LEFT_WRIST] = SyntheticPoint(lx, ly)
        pts[LM_RIGHT_WRIST] = SyntheticPoint(rx, ry)
        pts[LM_LEFT_INDEX] = SyntheticPoint(
            lx + (pts[LM_LEFT_WRIST].x - pts[LM_LEFT_ELBOW].x) * 0.25,
            ly + (pts[LM_LEFT_WRIST].y - pts[LM_LEFT_ELBOW].y) * 0.25,
        )
        pts[LM_RIGHT_INDEX] = SyntheticPoint(
            rx + (pts[LM_RIGHT_WRIST].x - pts[LM_RIGHT_ELBOW].x) * 0.25,
            ry + (pts[LM_RIGHT_WRIST].y - pts[LM_RIGHT_ELBOW].y) * 0.25,
        )

    elif exercise == "Squat":
        drop = phase * 0.19
        knee_out = phase * 0.09
        pts[LM_NOSE] = SyntheticPoint(0.50, 0.18 + drop * 0.85)
        pts[LM_LEFT_SHOULDER] = SyntheticPoint(0.43, 0.28 + drop * 0.85)
        pts[LM_RIGHT_SHOULDER] = SyntheticPoint(0.57, 0.28 + drop * 0.85)
        pts[LM_LEFT_ELBOW] = SyntheticPoint(0.39, 0.40 + drop * 0.8)
        pts[LM_RIGHT_ELBOW] = SyntheticPoint(0.61, 0.40 + drop * 0.8)
        pts[LM_LEFT_WRIST] = SyntheticPoint(0.45, 0.36 + drop * 0.8)
        pts[LM_RIGHT_WRIST] = SyntheticPoint(0.55, 0.36 + drop * 0.8)
        pts[LM_LEFT_INDEX] = SyntheticPoint(0.46, 0.35 + drop * 0.8)
        pts[LM_RIGHT_INDEX] = SyntheticPoint(0.54, 0.35 + drop * 0.8)

        pts[LM_LEFT_HIP] = SyntheticPoint(0.44, 0.54 + drop)
        pts[LM_RIGHT_HIP] = SyntheticPoint(0.56, 0.54 + drop)
        pts[LM_LEFT_KNEE] = SyntheticPoint(0.44 - knee_out, 0.73)
        pts[LM_RIGHT_KNEE] = SyntheticPoint(0.56 + knee_out, 0.73)
        pts[LM_LEFT_ANKLE] = SyntheticPoint(0.44, 0.91)
        pts[LM_RIGHT_ANKLE] = SyntheticPoint(0.56, 0.91)

    elif exercise == "Pushup":
        body_drop = phase * 0.14
        pts[LM_NOSE] = SyntheticPoint(0.25, 0.45 + body_drop)
        pts[LM_LEFT_SHOULDER] = SyntheticPoint(0.33, 0.48 + body_drop)
        pts[LM_RIGHT_SHOULDER] = SyntheticPoint(0.35, 0.48 + body_drop)
        pts[LM_LEFT_ELBOW] = SyntheticPoint(0.33 + phase * 0.12, 0.62 + body_drop * 0.4)
        pts[LM_RIGHT_ELBOW] = SyntheticPoint(0.35 + phase * 0.12, 0.62 + body_drop * 0.4)
        pts[LM_LEFT_WRIST] = SyntheticPoint(0.33, 0.78)
        pts[LM_RIGHT_WRIST] = SyntheticPoint(0.35, 0.78)
        pts[LM_LEFT_INDEX] = SyntheticPoint(0.31, 0.78)
        pts[LM_RIGHT_INDEX] = SyntheticPoint(0.33, 0.78)
        pts[LM_LEFT_HIP] = SyntheticPoint(0.55, 0.58 + body_drop * 0.7)
        pts[LM_RIGHT_HIP] = SyntheticPoint(0.56, 0.58 + body_drop * 0.7)
        pts[LM_LEFT_KNEE] = SyntheticPoint(0.72, 0.68 + body_drop * 0.35)
        pts[LM_RIGHT_KNEE] = SyntheticPoint(0.73, 0.68 + body_drop * 0.35)
        pts[LM_LEFT_ANKLE] = SyntheticPoint(0.86, 0.78)
        pts[LM_RIGHT_ANKLE] = SyntheticPoint(0.87, 0.78)

    elif exercise == "Lunge":
        drop = phase * 0.15
        spread = 0.06 + phase * 0.16
        pts[LM_NOSE] = SyntheticPoint(0.50, 0.18 + drop * 0.8)
        pts[LM_LEFT_SHOULDER] = SyntheticPoint(0.45, 0.30 + drop * 0.8)
        pts[LM_RIGHT_SHOULDER] = SyntheticPoint(0.55, 0.30 + drop * 0.8)
        pts[LM_LEFT_ELBOW] = SyntheticPoint(0.43, 0.44 + drop * 0.8)
        pts[LM_RIGHT_ELBOW] = SyntheticPoint(0.57, 0.44 + drop * 0.8)
        pts[LM_LEFT_WRIST] = SyntheticPoint(0.44, 0.54 + drop * 0.8)
        pts[LM_RIGHT_WRIST] = SyntheticPoint(0.56, 0.54 + drop * 0.8)
        pts[LM_LEFT_HIP] = SyntheticPoint(0.48, 0.55 + drop)
        pts[LM_RIGHT_HIP] = SyntheticPoint(0.52, 0.55 + drop)
        pts[LM_LEFT_KNEE] = SyntheticPoint(0.48 - spread * 0.85, 0.73)
        pts[LM_RIGHT_KNEE] = SyntheticPoint(0.52 + spread * 0.55, 0.75 + drop * 0.4)
        pts[LM_LEFT_ANKLE] = SyntheticPoint(0.48 - spread, 0.91)
        pts[LM_RIGHT_ANKLE] = SyntheticPoint(0.52 + spread, 0.91)

    else:  # Shoulder Press
        pts[LM_NOSE] = SyntheticPoint(0.50, 0.22)
        pts[LM_LEFT_SHOULDER] = SyntheticPoint(0.41, 0.34)
        pts[LM_RIGHT_SHOULDER] = SyntheticPoint(0.59, 0.34)
        pts[LM_LEFT_HIP] = SyntheticPoint(0.43, 0.62)
        pts[LM_RIGHT_HIP] = SyntheticPoint(0.57, 0.62)
        pts[LM_LEFT_KNEE] = SyntheticPoint(0.43, 0.78)
        pts[LM_RIGHT_KNEE] = SyntheticPoint(0.57, 0.78)
        pts[LM_LEFT_ANKLE] = SyntheticPoint(0.43, 0.93)
        pts[LM_RIGHT_ANKLE] = SyntheticPoint(0.57, 0.93)

        elbow_y = 0.42 - phase * 0.16
        wrist_y = 0.32 - phase * 0.22
        pts[LM_LEFT_ELBOW] = SyntheticPoint(0.34 + phase * 0.06, elbow_y)
        pts[LM_RIGHT_ELBOW] = SyntheticPoint(0.66 - phase * 0.06, elbow_y)
        pts[LM_LEFT_WRIST] = SyntheticPoint(0.36 + phase * 0.05, wrist_y)
        pts[LM_RIGHT_WRIST] = SyntheticPoint(0.64 - phase * 0.05, wrist_y)
        pts[LM_LEFT_INDEX] = SyntheticPoint(0.36 + phase * 0.05, wrist_y - 0.03)
        pts[LM_RIGHT_INDEX] = SyntheticPoint(0.64 - phase * 0.05, wrist_y - 0.03)

    return pts


class WorkoutCamera:
    """Real-time Computer Vision Pose Trainer & Performance Telemetry Engine."""

    def __init__(self):
        self._lock = threading.Lock()
        self._cap_lock = threading.Lock()
        self.cap: Optional[cv2.VideoCapture] = None
        self.camera_index: int = int(os.getenv("CAMERA_INDEX", "0"))
        self.force_demo_mode: bool = os.getenv("FORCE_CAMERA_DEMO_MODE", "false").lower() == "true"
        self.is_demo_mode: bool = self.force_demo_mode
        self.is_active: bool = True
        self.camera_running: bool = False
        self.workout_active: bool = True
        self.hardware_camera_available: bool = False
        self.camera_error: Optional[str] = None
        self.landmarks_detected: bool = False

        self.exercise: str = "Bicep Curl"
        self.left_counter: int = 0
        self.right_counter: int = 0
        self.left_stage: Optional[str] = None
        self.right_stage: Optional[str] = None
        self.left_angle: float = 0.0
        self.right_angle: float = 0.0

        self.start_time: Optional[float] = time.time()
        self.elapsed_before_pause: float = 0.0
        self.feedback: Dict[str, str] = {"message": "Ready to Start", "status": "info"}

        # Module 6 Pose-to-Performance live metrics
        self.rom_min: float = 180.0
        self.rom_max: float = 0.0
        self.posture_error_frames: int = 0
        self.total_analyzed_frames: int = 0
        self.rep_timestamps: List[float] = []
        self.posture_alerts_history: List[str] = []

        self._mp_pose_instance = None
        self._mp_landmarker = None
        self._init_mediapipe_pose()

    def _init_mediapipe_pose(self) -> None:
        """Initializes MediaPipe Pose Landmarker (downloading model if needed) or mp.solutions.pose."""
        if HAS_MP_SOLUTIONS:
            try:
                self._mp_pose_instance = mp_pose.Pose(
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
            except Exception:
                self._mp_pose_instance = None

        if hasattr(mp, "tasks"):
            os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
            if not os.path.exists(MODEL_PATH):
                try:
                    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
                except Exception:
                    pass
            if os.path.exists(MODEL_PATH):
                try:
                    from mediapipe.tasks import python as mp_python
                    from mediapipe.tasks.python import vision as mp_vision

                    base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
                    options = mp_vision.PoseLandmarkerOptions(
                        base_options=base_options,
                        running_mode=mp_vision.RunningMode.IMAGE,
                        min_pose_detection_confidence=0.5,
                        min_pose_presence_confidence=0.5,
                        min_tracking_confidence=0.5,
                    )
                    self._mp_landmarker = mp_vision.PoseLandmarker.create_from_options(options)
                except Exception:
                    self._mp_landmarker = None

    def detect_pose_landmarks(self, rgb_frame: np.ndarray) -> Optional[List]:
        """Runs MediaPipe Pose Landmarker on an RGB frame and returns 33 normalized landmarks."""
        with self._lock:
            if self._mp_pose_instance is not None:
                results = self._mp_pose_instance.process(rgb_frame)
                if results and results.pose_landmarks:
                    return results.pose_landmarks.landmark
            elif self._mp_landmarker is not None:
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                det = self._mp_landmarker.detect(mp_img)
                if det and det.pose_landmarks and len(det.pose_landmarks) > 0:
                    return det.pose_landmarks[0]
        return None

    def _open_hardware_cap_locked(self) -> bool:
        """Must be called with self._cap_lock held. Opens VideoCapture(0) if not already open."""
        if self.cap is not None and self.cap.isOpened():
            return True
        try:
            cap = cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW)
            if not cap.isOpened():
                cap = cv2.VideoCapture(self.camera_index)
            if cap.isOpened():
                ret, frame = cap.read()
                if ret and frame is not None:
                    self.cap = cap
                    self.hardware_camera_available = True
                    return True
                cap.release()
        except Exception as exc:
            self.camera_error = str(exc)
        self.cap = None
        self.hardware_camera_available = False
        return False

    def start_camera(self, use_demo: bool = False) -> Dict:
        """Starts the camera via OpenCV VideoCapture(0) or enables Camera-Off Demo Mode."""
        self.is_active = True
        self.camera_error = None
        if use_demo:
            self.stop_hardware_capture()
            self.is_demo_mode = True
            self.camera_running = True
            self.feedback = {"message": "Camera-Off Demo Mode active.", "status": "info"}
            return self.get_stats()

        with self._cap_lock:
            opened = self._open_hardware_cap_locked()

        if opened:
            self.is_demo_mode = False
            self.camera_running = True
            self.feedback = {
                "message": "Laptop webcam (VideoCapture(0)) connected! Step into frame.",
                "status": "success",
            }
            return self.get_stats()

        self.is_demo_mode = True
        self.camera_running = True
        self.camera_error = (
            "Laptop webcam VideoCapture(0) unavailable or in use by another process. "
            "Switched to Camera-Off Demo Mode."
        )
        self.feedback = {"message": self.camera_error, "status": "warning"}
        return self.get_stats()

    def stop_hardware_capture(self) -> None:
        with self._cap_lock:
            if self.cap is not None:
                try:
                    self.cap.release()
                except Exception:
                    pass
                self.cap = None

    def stop_camera(self) -> Dict:
        """Stops the camera stream and releases OpenCV VideoCapture(0) hardware handle safely."""
        self.camera_running = False
        self.is_active = False
        self.landmarks_detected = False
        self.stop_hardware_capture()
        self.feedback = {"message": "Camera stopped.", "status": "info"}
        return self.get_stats()

    def start_workout(self, active: bool = True) -> Dict:
        """Starts or pauses active repetition counting and workout timer."""
        if active and not self.workout_active:
            self.start_time = time.time()
            self.workout_active = True
            self.feedback = {
                "message": f"Workout started! Performing {self.exercise}.",
                "status": "success",
            }
        elif active and self.start_time is None:
            self.start_time = time.time()
            self.workout_active = True
        elif not active and self.workout_active:
            if self.start_time is not None:
                self.elapsed_before_pause += time.time() - self.start_time
            self.start_time = None
            self.workout_active = False
            self.feedback = {"message": "Workout paused.", "status": "info"}
        return self.get_stats()

    def set_exercise(self, exercise_name: str, demo_mode: Optional[bool] = None) -> Dict:
        """Switches the active exercise and optionally toggles Demo Mode."""
        normalized = exercise_name.strip()
        if normalized in ["Push-Up", "Push-Ups", "Pushups", "pushups", "pushup"]:
            normalized = "Pushup"
        elif normalized in ["Bicep Curls", "Curl", "bicep_curls", "bicep curl"]:
            normalized = "Bicep Curl"
        elif normalized in ["Squats", "squats", "squat"]:
            normalized = "Squat"
        elif normalized in ["Lunges", "lunges", "lunge"]:
            normalized = "Lunge"
        elif normalized in ["Shoulder Presses", "Overhead Press", "shoulder_press"]:
            normalized = "Shoulder Press"

        if normalized not in SUPPORTED_EXERCISES:
            raise ValueError(f"Unsupported exercise '{exercise_name}'. Supported: {SUPPORTED_EXERCISES}")

        if normalized != self.exercise:
            self.exercise = normalized
            self.left_stage = None
            self.right_stage = None
            self.rom_min = 180.0
            self.rom_max = 0.0
            self.feedback = {"message": f"Switched to {self.exercise}", "status": "info"}

        if demo_mode is not None:
            self.is_demo_mode = bool(demo_mode)
            if self.is_demo_mode:
                self.stop_hardware_capture()

        if self.start_time is None and self.workout_active:
            self.start_time = time.time()

        return self.get_stats()

    def reset_session(self) -> Dict:
        """Resets repetition counters, timers, and biomechanical tracking metrics."""
        self.left_counter = 0
        self.right_counter = 0
        self.left_stage = None
        self.right_stage = None
        self.left_angle = 0.0
        self.right_angle = 0.0
        self.start_time = time.time() if self.workout_active else None
        self.elapsed_before_pause = 0.0
        self.rom_min = 180.0
        self.rom_max = 0.0
        self.posture_error_frames = 0
        self.total_analyzed_frames = 0
        self.rep_timestamps = []
        self.posture_alerts_history = []
        self.feedback = {"message": "Session reset. Ready to Start!", "status": "info"}
        return self.get_stats()

    def simulate_step(self, steps: int = 1) -> Dict:
        """Advances the exercise state machine in Demo/Headless mode for instant testing."""
        if self.start_time is None:
            self.start_time = time.time()
        self.workout_active = True
        self.is_demo_mode = True
        t_low = -math.pi / (2.0 * 2.2)
        t_high = math.pi / (2.0 * 2.2)
        for _ in range(steps):
            for phase_t in [t_low, t_high, t_low]:
                lms = generate_synthetic_landmarks(self.exercise, phase_t)
                self._evaluate_landmarks(lms)
        return self.get_stats()

    def process_frame_base64(self, image_b64: str, exercise: Optional[str] = None) -> Dict:
        """Processes a single video frame sent from browser getUserMedia or local capture.

        Never forwards raw video frames to external APIs; runs MediaPipe Pose Landmarker
        locally and returns normalized landmarks, skeleton connections, and live workout stats.
        """
        if exercise:
            try:
                self.set_exercise(exercise, demo_mode=False)
            except ValueError:
                pass

        self.camera_running = True
        self.is_demo_mode = False

        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]

        img_bytes = base64.b64decode(image_b64)
        np_arr = np.frombuffer(img_bytes, dtype=np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Invalid video frame payload.")

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        landmarks = self.detect_pose_landmarks(rgb)

        serialized_landmarks = []
        if landmarks is not None:
            self.landmarks_detected = True
            self._evaluate_landmarks(landmarks)
            for idx, lm in enumerate(landmarks):
                serialized_landmarks.append(
                    {
                        "index": idx,
                        "x": round(float(lm.x), 4),
                        "y": round(float(lm.y), 4),
                        "visibility": round(float(getattr(lm, "visibility", 0.95)), 3),
                    }
                )
        else:
            self.landmarks_detected = False
            self.feedback = {
                "message": "Step back slightly so your upper/lower body joints are visible in the camera.",
                "status": "warning",
            }

        return {
            "landmarks_detected": self.landmarks_detected,
            "landmarks": serialized_landmarks,
            "connections": POSE_CONNECTIONS,
            "stats": self.get_stats(),
        }

    def _record_rep(self):
        self.rep_timestamps.append(time.time())

    def _evaluate_landmarks(self, landmarks: List) -> None:
        """Evaluates 33 pose landmarks for joint angles, rep state transitions, and posture errors."""
        self.total_analyzed_frames += 1

        def pt(idx: int) -> List[float]:
            return [float(landmarks[idx].x), float(landmarks[idx].y)]

        l_sh, r_sh = pt(LM_LEFT_SHOULDER), pt(LM_RIGHT_SHOULDER)
        l_el, r_el = pt(LM_LEFT_ELBOW), pt(LM_RIGHT_ELBOW)
        l_wr, r_wr = pt(LM_LEFT_WRIST), pt(LM_RIGHT_WRIST)
        l_in = pt(LM_LEFT_INDEX)
        l_hip, r_hip = pt(LM_LEFT_HIP), pt(LM_RIGHT_HIP)
        l_kn, r_kn = pt(LM_LEFT_KNEE), pt(LM_RIGHT_KNEE)
        l_an, r_an = pt(LM_LEFT_ANKLE), pt(LM_RIGHT_ANKLE)

        shoulders_not_level = abs(l_sh[1] - r_sh[1]) > 0.085
        body_lean_angle = calculate_angle([l_sh[0], l_sh[1] - 0.15], l_sh, l_hip)

        # 1. BICEP CURL
        if self.exercise == "Bicep Curl":
            self.left_angle = calculate_angle(l_sh, l_el, l_wr)
            self.right_angle = calculate_angle(r_sh, r_el, r_wr)

            if self.workout_active:
                if self.left_angle > 155:
                    self.left_stage = "Down"
                if self.left_angle < 45 and self.left_stage == "Down":
                    self.left_stage = "Up"
                    self.left_counter += 1
                    self._record_rep()

                if self.right_angle > 155:
                    self.right_stage = "Down"
                if self.right_angle < 45 and self.right_stage == "Down":
                    self.right_stage = "Up"
                    self.right_counter += 1
                    self._record_rep()

            wrist_angle = calculate_angle(l_el, l_wr, l_in)
            if body_lean_angle > 18:
                self._set_feedback("Keep your back straight — avoid swinging torso.", "danger")
            elif shoulders_not_level:
                self._set_feedback("Keep both shoulders level.", "warning")
            elif wrist_angle <= 155:
                self._set_feedback("Keep your wrist neutral and straight.", "warning")
            elif 45 <= self.left_angle <= 70 and self.left_stage == "Down":
                self._set_feedback("Curl higher for full bicep contraction.", "info")
            else:
                self._set_feedback("Excellent bicep curl form!", "success")

        # 2. SQUAT
        elif self.exercise == "Squat":
            self.left_angle = calculate_angle(l_hip, l_kn, l_an)
            self.right_angle = calculate_angle(r_hip, r_kn, l_an)
            avg_knee = (self.left_angle + self.right_angle) / 2.0

            if self.workout_active:
                if avg_knee > 155:
                    self.left_stage = "Up"
                    self.right_stage = "Up"
                if avg_knee < 100 and self.left_stage == "Up":
                    self.left_stage = "Down"
                    self.right_stage = "Down"
                    self.left_counter += 1
                    self._record_rep()

            hip_angle = calculate_angle(l_sh, l_hip, l_kn)
            if hip_angle < 65:
                self._set_feedback("Chest up! Avoid excessive forward torso lean.", "danger")
            elif shoulders_not_level:
                self._set_feedback("Keep barbell/shoulders balanced horizontally.", "warning")
            elif 100 <= avg_knee <= 128 and self.left_stage == "Up":
                self._set_feedback("Squat deeper — aim for thighs parallel to floor.", "warning")
            else:
                self._set_feedback("Strong squat depth and alignment!", "success")

        # 3. PUSHUP
        elif self.exercise == "Pushup":
            self.left_angle = calculate_angle(l_sh, l_el, l_wr)
            self.right_angle = calculate_angle(r_sh, r_el, r_wr)
            avg_elbow = (self.left_angle + self.right_angle) / 2.0
            plank_angle = calculate_angle(l_sh, l_hip, l_an)

            if self.workout_active:
                if avg_elbow > 155:
                    self.left_stage = "Up"
                    self.right_stage = "Up"
                if avg_elbow < 95 and self.left_stage == "Up":
                    self.left_stage = "Down"
                    self.right_stage = "Down"
                    self.left_counter += 1
                    self._record_rep()

            if plank_angle < 150:
                self._set_feedback("Engage core! Keep shoulders, hips, and ankles in a straight line.", "danger")
            elif 95 <= avg_elbow <= 120 and self.left_stage == "Up":
                self._set_feedback("Lower chest closer to the floor for full ROM.", "warning")
            else:
                self._set_feedback("Solid plank alignment and pushup tempo!", "success")

        # 4. LUNGE
        elif self.exercise == "Lunge":
            self.left_angle = calculate_angle(l_hip, l_kn, l_an)
            self.right_angle = calculate_angle(r_hip, r_kn, r_an)
            ankle_spread = abs(l_an[0] - r_an[0])

            if self.workout_active:
                if self.left_angle > 150 and self.right_angle > 150:
                    self.left_stage = "Up"
                    self.right_stage = "Up"

                if self.left_stage == "Up" and (self.left_angle < 110 or self.right_angle < 110):
                    if ankle_spread >= 0.14:
                        self.left_stage = "Down"
                        self.right_stage = "Down"
                        if self.left_angle < self.right_angle:
                            self.left_counter += 1
                        else:
                            self.right_counter += 1
                        self._record_rep()
                        self._set_feedback("Great lunge stride and knee flexion!", "success")
                    else:
                        self._set_feedback("Step further forward — increase ankle stride spread!", "warning")
                elif body_lean_angle > 20:
                    self._set_feedback("Keep torso upright during the lunge descent.", "danger")
                else:
                    self._set_feedback("Controlled lunge movement — keep front knee stable.", "success")

        # 5. SHOULDER PRESS
        elif self.exercise == "Shoulder Press":
            self.left_angle = calculate_angle(l_sh, l_el, l_wr)
            self.right_angle = calculate_angle(r_sh, r_el, r_wr)
            wrist_above_shoulder = (l_wr[1] < l_sh[1]) and (r_wr[1] < r_sh[1])

            if self.workout_active:
                if self.left_angle < 95:
                    self.left_stage = "Down"
                if self.left_angle > 150 and wrist_above_shoulder and self.left_stage == "Down":
                    self.left_stage = "Up"
                    self.left_counter += 1
                    self._record_rep()

                if self.right_angle < 95:
                    self.right_stage = "Down"
                if self.right_angle > 150 and wrist_above_shoulder and self.right_stage == "Down":
                    self.right_stage = "Up"
                    self.right_counter += 1
                    self._record_rep()

            if body_lean_angle > 18:
                self._set_feedback("Brace your core — avoid arching your lower back!", "danger")
            elif abs(self.left_angle - self.right_angle) > 22:
                self._set_feedback("Press both arms evenly at the same speed.", "warning")
            else:
                self._set_feedback("Strong overhead press alignment!", "success")

        active_angle = (self.left_angle + self.right_angle) / 2.0
        if active_angle > 0:
            self.rom_min = min(self.rom_min, active_angle)
            self.rom_max = max(self.rom_max, active_angle)

    def _set_feedback(self, message: str, status: str) -> None:
        self.feedback = {"message": message, "status": status}
        if status in ("warning", "danger"):
            self.posture_error_frames += 1
            if message not in self.posture_alerts_history:
                self.posture_alerts_history.append(message)

    def _draw_skeleton_and_hud(self, frame: np.ndarray, landmarks: Optional[List], is_demo: bool) -> np.ndarray:
        """Draws the 33-landmark skeleton, joint angles, rep counter, and live feedback HUD."""
        h, w, _ = frame.shape

        if landmarks:
            for idx_a, idx_b in POSE_CONNECTIONS:
                pt_a = (int(landmarks[idx_a].x * w), int(landmarks[idx_a].y * h))
                pt_b = (int(landmarks[idx_b].x * w), int(landmarks[idx_b].y * h))
                cv2.line(frame, pt_a, pt_b, (238, 211, 34), 3, cv2.LINE_AA)

            for idx in [
                LM_NOSE,
                LM_LEFT_SHOULDER,
                LM_RIGHT_SHOULDER,
                LM_LEFT_ELBOW,
                LM_RIGHT_ELBOW,
                LM_LEFT_WRIST,
                LM_RIGHT_WRIST,
                LM_LEFT_HIP,
                LM_RIGHT_HIP,
                LM_LEFT_KNEE,
                LM_RIGHT_KNEE,
                LM_LEFT_ANKLE,
                LM_RIGHT_ANKLE,
            ]:
                cx, cy = int(landmarks[idx].x * w), int(landmarks[idx].y * h)
                cv2.circle(frame, (cx, cy), 6, (241, 102, 99), -1, cv2.LINE_AA)
                cv2.circle(frame, (cx, cy), 8, (255, 255, 255), 1, cv2.LINE_AA)

            primary_left = LM_LEFT_KNEE if self.exercise in ("Squat", "Lunge") else LM_LEFT_ELBOW
            primary_right = LM_RIGHT_KNEE if self.exercise in ("Squat", "Lunge") else LM_RIGHT_ELBOW
            lx, ly = int(landmarks[primary_left].x * w), int(landmarks[primary_left].y * h)
            rx, ry = int(landmarks[primary_right].x * w), int(landmarks[primary_right].y * h)

            cv2.putText(
                frame,
                f"{int(self.left_angle)} deg",
                (max(10, lx - 35), max(25, ly - 12)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )
            cv2.putText(
                frame,
                f"{int(self.right_angle)} deg",
                (min(w - 90, rx + 10), max(25, ry - 12)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (129, 248, 180),
                2,
                cv2.LINE_AA,
            )

        overlay = frame.copy()
        cv2.rectangle(overlay, (12, 12), (w - 12, 108), (15, 23, 42), -1)
        cv2.addWeighted(overlay, 0.82, frame, 0.18, 0, frame)

        mode_badge = "DEMO SIMULATION" if is_demo else "LIVE WEBCAM (OpenCV VideoCapture(0))"
        badge_color = (34, 211, 238) if is_demo else (16, 185, 129)
        cv2.putText(
            frame,
            f"{self.exercise.upper()}  [{mode_badge}]",
            (26, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.62,
            badge_color,
            2,
            cv2.LINE_AA,
        )

        total_reps = self.get_total_reps()
        cv2.putText(
            frame,
            f"REPS: {total_reps}   L: {self.left_counter} | R: {self.right_counter}   CAL: {self.get_calories()} kcal   TIME: {self.get_duration()}s",
            (26, 70),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (248, 250, 252),
            1,
            cv2.LINE_AA,
        )

        status_color = (
            (16, 185, 129)
            if self.feedback["status"] == "success"
            else (34, 197, 245)
            if self.feedback["status"] == "info"
            else (245, 158, 11)
            if self.feedback["status"] == "warning"
            else (239, 68, 68)
        )
        cv2.putText(
            frame,
            f"COACH: {self.feedback['message']}",
            (26, 96),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.52,
            status_color,
            2,
            cv2.LINE_AA,
        )

        return frame

    def _create_demo_canvas(self, width: int = 640, height: int = 480) -> np.ndarray:
        """Creates a dark studio grid frame for Camera-Off Demo Mode."""
        frame = np.full((height, width, 3), (26, 18, 12), dtype=np.uint8)
        for x in range(0, width, 40):
            cv2.line(frame, (x, 0), (x, height), (42, 32, 22), 1)
        for y in range(0, height, 40):
            cv2.line(frame, (0, y), (width, y), (42, 32, 22), 1)
        return frame

    def generate_frames(self):
        """Yields MJPEG video frames from physical laptop webcam (VideoCapture(0)) or Camera-Off Demo Mode."""
        if self.start_time is None and self.workout_active:
            self.start_time = time.time()
        self.is_active = True
        self.camera_running = True

        using_hardware = False
        if not self.is_demo_mode and not self.force_demo_mode:
            with self._cap_lock:
                using_hardware = self._open_hardware_cap_locked()

        if not using_hardware:
            self.is_demo_mode = True

        while self.is_active:
            landmarks = None
            frame = None

            if not self.is_demo_mode and not self.force_demo_mode:
                with self._cap_lock:
                    if self.cap is not None and self.cap.isOpened():
                        success, read_frame = self.cap.read()
                        if success and read_frame is not None:
                            frame = read_frame

            if frame is not None:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                landmarks = self.detect_pose_landmarks(rgb)
                self.landmarks_detected = landmarks is not None
            else:
                if not self.is_active:
                    break
                self.is_demo_mode = True
                frame = self._create_demo_canvas()
                landmarks = generate_synthetic_landmarks(self.exercise, time.time())
                self.landmarks_detected = True

            if landmarks is not None:
                self._evaluate_landmarks(landmarks)
            else:
                self.feedback = {
                    "message": "Webcam active — step into frame so full body landmarks are visible.",
                    "status": "info",
                }

            annotated = self._draw_skeleton_and_hud(frame, landmarks, is_demo=self.is_demo_mode)
            ret, buffer = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
            if ret:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
                )
            time.sleep(0.04 if self.is_demo_mode else 0.02)

    def get_total_reps(self) -> int:
        if self.exercise in ("Squat", "Pushup"):
            return self.left_counter
        return self.left_counter + self.right_counter

    def get_duration(self) -> int:
        active_elapsed = (time.time() - self.start_time) if (self.start_time and self.workout_active) else 0.0
        return int(self.elapsed_before_pause + active_elapsed)

    def get_calories(self) -> float:
        factor = CALORIE_FACTORS.get(self.exercise, 0.45)
        return round(self.get_total_reps() * factor, 2)

    def get_performance_metrics(self) -> Dict:
        """Computes transparent, rule-based Pose-to-Performance metrics (Module 6)."""
        rom_span = max(0.0, self.rom_max - self.rom_min) if self.rom_max > self.rom_min else 85.0
        target_rom = 110.0 if self.exercise in ("Bicep Curl", "Shoulder Press") else 75.0
        rom_efficiency = round(min(100.0, max(50.0, (rom_span / target_rom) * 100.0)), 1)

        angle_diff = abs(self.left_angle - self.right_angle)
        symmetry_score = round(max(55.0, 100.0 - angle_diff * 1.2), 1)

        if len(self.rep_timestamps) >= 3:
            intervals = np.diff(self.rep_timestamps)
            cv_tempo = float(np.std(intervals) / (np.mean(intervals) + 1e-5))
            tempo_consistency = round(max(60.0, min(100.0, 100.0 - cv_tempo * 45.0)), 1)
        else:
            tempo_consistency = 88.0

        if self.total_analyzed_frames > 0:
            err_ratio = self.posture_error_frames / self.total_analyzed_frames
            posture_accuracy = round(max(55.0, min(100.0, (1.0 - err_ratio * 0.6) * 100.0)), 1)
        else:
            posture_accuracy = 92.0

        overall_score = round(
            0.35 * rom_efficiency
            + 0.30 * posture_accuracy
            + 0.20 * symmetry_score
            + 0.15 * tempo_consistency,
            1,
        )

        return {
            "rom_angle_min": round(self.rom_min if self.rom_min < 180 else 42.0, 1),
            "rom_angle_max": round(self.rom_max if self.rom_max > 0 else 164.0, 1),
            "rom_efficiency": rom_efficiency,
            "symmetry_score": symmetry_score,
            "tempo_consistency": tempo_consistency,
            "posture_accuracy": posture_accuracy,
            "performance_score": overall_score,
            "scoring_formula": "0.35 * ROM_Efficiency + 0.30 * Posture_Accuracy + 0.20 * Bilateral_Symmetry + 0.15 * Tempo_Consistency (Heuristic — Non-Clinical)",
        }

    def get_stats(self) -> Dict:
        perf = self.get_performance_metrics()
        return {
            "left": self.left_counter,
            "right": self.right_counter,
            "total": self.get_total_reps(),
            "left_angle": int(round(self.left_angle)),
            "right_angle": int(round(self.right_angle)),
            "exercise": self.exercise,
            "supported_exercises": SUPPORTED_EXERCISES,
            "calories": self.get_calories(),
            "duration": self.get_duration(),
            "feedback": self.feedback,
            "is_demo_mode": self.is_demo_mode,
            "camera_running": self.camera_running,
            "workout_active": self.workout_active,
            "hardware_camera_available": self.hardware_camera_available,
            "landmarks_detected": self.landmarks_detected,
            "camera_error": self.camera_error,
            "performance": perf,
            "posture_alerts": self.posture_alerts_history[-5:],
        }