import cv2
import mediapipe as mp
import numpy as np
import time
# Initialize MediaPipe Pose
mp_pose = mp.solutions.pose
pose = mp_pose.Pose()

# Drawing utility
mp_draw = mp.solutions.drawing_utils

def calculate_angle(a, b, c):

    a = np.array(a)
    b = np.array(b)
    c = np.array(c)

    radians = np.arctan2(
        c[1] - b[1],
        c[0] - b[0]
    ) - np.arctan2(
        a[1] - b[1],
        a[0] - b[0]
    )

    angle = np.abs(radians * 180.0 / np.pi)

    if angle > 180:
        angle = 360 - angle

    return angle

class WorkoutCamera:

    def __init__(self):

        self.cap = None

        self.left_counter = 0
        self.right_counter = 0

        self.left_stage = None
        self.right_stage = None

        self.left_angle = 0
        self.right_angle = 0
        self.exercise = "Bicep Curl"
        self.start_time = None
        self.feedback = {"message": "Ready to Start", "status": "info"}

    def generate_frames(self):

        if self.start_time is None:
            self.start_time = time.time()

        self.cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)

        try:
            while True:

                success, frame = self.cap.read()

                if not success:
                    break

                # Convert BGR → RGB
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                # Detect Pose
                results = pose.process(rgb)

                # Draw Landmarks
                if results.pose_landmarks:
                    mp_draw.draw_landmarks(
                    frame,
                    results.pose_landmarks,
                    mp_pose.POSE_CONNECTIONS
                )

                landmarks = results.pose_landmarks.landmark

                shoulder = [
                    landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].x,
                    landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].y
                ]

                elbow = [
                    landmarks[mp_pose.PoseLandmark.LEFT_ELBOW.value].x,
                    landmarks[mp_pose.PoseLandmark.LEFT_ELBOW.value].y
                ]

                wrist = [
                    landmarks[mp_pose.PoseLandmark.LEFT_WRIST.value].x,
                    landmarks[mp_pose.PoseLandmark.LEFT_WRIST.value].y
                ]

                left_angle = calculate_angle(
                    shoulder,
                    elbow,
                    wrist
                )
                self.left_angle = left_angle

                if left_angle > 160:
                    self.left_stage = "Down"

                if left_angle < 40 and self.left_stage == "Down":
                    self.left_stage = "Up"
                    self.left_counter += 1

                h, w, _ = frame.shape

                cv2.putText(
                    frame,
                    str(int(left_angle)),
                    tuple(np.multiply(elbow, [w, h]).astype(int)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1,
                    (255, 255, 255),
                    2,
                    cv2.LINE_AA
                )

                right_shoulder = [
                    landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value].x,
                    landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value].y
                ]

                right_elbow = [
                    landmarks[mp_pose.PoseLandmark.RIGHT_ELBOW.value].x,
                    landmarks[mp_pose.PoseLandmark.RIGHT_ELBOW.value].y
                ]

                right_wrist = [
                    landmarks[mp_pose.PoseLandmark.RIGHT_WRIST.value].x,
                    landmarks[mp_pose.PoseLandmark.RIGHT_WRIST.value].y
                ]

                right_angle = calculate_angle(
                    right_shoulder,
                    right_elbow,
                    right_wrist
                )
                self.right_angle = right_angle

                if right_angle > 160:
                    self.right_stage = "Down"

                if right_angle < 40 and self.right_stage == "Down":
                    self.right_stage = "Up"
                    self.right_counter += 1

                cv2.putText(
                    frame,
                    str(int(right_angle)),
                    tuple(np.multiply(right_elbow, [w, h]).astype(int)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1,
                    (0, 255, 0),
                    2,
                    cv2.LINE_AA
                )

                # ── Posture landmarks ────────────────────────────
                left_hip = [
                    landmarks[mp_pose.PoseLandmark.LEFT_HIP.value].x,
                    landmarks[mp_pose.PoseLandmark.LEFT_HIP.value].y
                ]

                left_index = [
                    landmarks[mp_pose.PoseLandmark.LEFT_INDEX.value].x,
                    landmarks[mp_pose.PoseLandmark.LEFT_INDEX.value].y
                ]

                ls_y = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].y
                rs_y = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value].y

                # Body lean angle (shoulder vs hip vertical)
                body_angle = calculate_angle(
                    [shoulder[0], shoulder[1] - 0.1],  # point above shoulder
                    shoulder,
                    left_hip
                )

                # Wrist angle (elbow → wrist → index finger)
                wrist_angle = calculate_angle(elbow, wrist, left_index)

                # ── Priority rule engine ─────────────────────────
                back_not_straight   = body_angle > 15
                shoulders_not_level = abs(ls_y - rs_y) > 0.08
                wrist_not_straight  = wrist_angle <= 170
                incomplete_rep      = 40 < left_angle <= 70
                over_flexed         = left_angle < 20

                if back_not_straight:
                    self.feedback = {"message": "Keep your back straight.", "status": "danger"}
                elif shoulders_not_level:
                    self.feedback = {"message": "Keep both shoulders level.", "status": "warning"}
                elif wrist_not_straight:
                    self.feedback = {"message": "Keep your wrist straight.", "status": "warning"}
                elif incomplete_rep:
                    self.feedback = {"message": "Lift the dumbbell higher.", "status": "warning"}
                elif over_flexed:
                    self.feedback = {"message": "Avoid over-flexing your elbow.", "status": "warning"}
                else:
                    self.feedback = {"message": "Excellent form!", "status": "success"}

                cv2.rectangle(frame, (0, 0), (380, 90), (245, 117, 16), -1)

                cv2.putText(frame, "LEFT", (10, 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                        (255,255,255),2)

                cv2.putText(frame, str(self.left_counter), (10,65),
                        cv2.FONT_HERSHEY_SIMPLEX,1.5,
                        (255,255,255),2)

                cv2.putText(frame, "RIGHT", (170,20),
                        cv2.FONT_HERSHEY_SIMPLEX,0.6,
                        (255,255,255),2)

                cv2.putText(frame, str(self.right_counter), (170,65),
                        cv2.FONT_HERSHEY_SIMPLEX,1.5,
                        (255,255,255),2)

                total_reps = self.left_counter + self.right_counter

                cv2.putText(
                frame,
                f"TOTAL : {total_reps}",
                (10,120),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0,255,255),
                2
                )

                ret, buffer = cv2.imencode(".jpg", frame)

                frame = buffer.tobytes()

                yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n'
                + frame +
                b'\r\n'
                )
        finally:
            if self.cap is not None:
                self.cap.release()
                self.cap = None

    def get_duration(self):
        if self.start_time is None:
            return 0
        return int(time.time() - self.start_time)

    def get_stats(self):
        return {
            "left": self.left_counter,
            "right": self.right_counter,
            "total": self.left_counter + self.right_counter,
            "left_angle": int(self.left_angle),
            "right_angle": int(self.right_angle),
            "exercise": self.exercise,
            "calories": round(
                (self.left_counter + self.right_counter) * 0.4,
                2
            ),
            "duration": self.get_duration(),
            "feedback": self.feedback
        }