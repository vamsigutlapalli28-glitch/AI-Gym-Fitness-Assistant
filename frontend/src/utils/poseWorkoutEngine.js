/**
 * Real-time Biomechanical Pose & Exercise State Machine Engine
 * Uses 33 normalized MediaPipe Pose Landmarker keypoints to compute 2D joint angles,
 * exercise phase transitions (Up / Down), repetition counts, and posture feedback.
 * Never fabricates landmarks or rep counts when no pose is detected.
 */

export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

export const POSE_CONNECTIONS = [
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.LEFT_WRIST, LM.LEFT_INDEX],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.RIGHT_WRIST, LM.RIGHT_INDEX],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
];

export const LIVE_EXERCISES = [
  {
    name: 'Squat',
    label: 'Squat (Lower Body)',
    primaryJoints: 'Hip – Knee – Ankle',
    targetThresholds: 'Standing > 155° • Squat Depth < 100°',
    caloriesPerRep: 0.65,
  },
  {
    name: 'Pushup',
    label: 'Push-up (Upper Body & Core)',
    primaryJoints: 'Shoulder – Elbow – Wrist',
    targetThresholds: 'Plank Lockout > 155° • Chest Lowered < 95°',
    caloriesPerRep: 0.55,
  },
  {
    name: 'Bicep Curl',
    label: 'Bicep Curl (Arms)',
    primaryJoints: 'Shoulder – Elbow – Wrist',
    targetThresholds: 'Extension > 155° • Peak Contraction < 45°',
    caloriesPerRep: 0.4,
  },
  {
    name: 'Lunge',
    label: 'Forward Lunge (Legs & Balance)',
    primaryJoints: 'Hip – Knee – Ankle',
    targetThresholds: 'Standing > 150° • Lunge Depth < 100°',
    caloriesPerRep: 0.6,
  },
  {
    name: 'Shoulder Press',
    label: 'Shoulder Press (Deltoids)',
    primaryJoints: 'Shoulder – Elbow – Wrist',
    targetThresholds: 'Rack Position < 90° • Overhead Lockout > 155°',
    caloriesPerRep: 0.48,
  },
];

/**
 * Calculates the 2D interior angle in degrees [0, 180] at vertex `b` formed by points `a - b - c`.
 */
export function calculateAngle(a, b, c) {
  if (!a || !b || !c) return 0;
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) {
    angle = 360.0 - angle;
  }
  return Math.round(angle * 10) / 10;
}

export function createInitialTrackingState(exercise = 'Squat') {
  return {
    exercise,
    repCount: 0,
    leftReps: 0,
    rightReps: 0,
    stage: 'Ready',
    leftStage: null,
    rightStage: null,
    leftAngle: 0,
    rightAngle: 0,
    primaryAngle: 0,
    romMin: 180,
    romMax: 0,
    analyzedFrames: 0,
    cleanPostureFrames: 0,
    formScore: 100,
    landmarksDetected: false,
    feedback: {
      message: 'Click Start Camera and step into view to begin pose tracking.',
      status: 'info',
    },
    postureAlerts: [],
  };
}

function isVisible(lm, threshold = 0.45) {
  if (!lm) return false;
  const vis = lm.visibility !== undefined ? lm.visibility : 1.0;
  return vis >= threshold && lm.x >= 0 && lm.x <= 1 && lm.y >= 0 && lm.y <= 1;
}

function recordAlert(alerts, message) {
  if (!message) return alerts;
  if (alerts[alerts.length - 1] === message) return alerts;
  return [...alerts.slice(-9), message];
}

/**
 * Evaluates a single frame of 33 MediaPipe Pose landmarks for the selected exercise.
 * Only increments repetition counts when `isWorkoutActive === true`.
 */
export function evaluatePoseFrame(landmarks, prevState, isWorkoutActive = false) {
  if (!landmarks || !Array.isArray(landmarks) || landmarks.length < 29) {
    return {
      ...prevState,
      landmarksDetected: false,
      feedback: {
        message: 'No body pose detected. Step back so your full body is visible in the frame.',
        status: 'warning',
      },
    };
  }

  const exercise = prevState.exercise || 'Squat';
  const lSh = landmarks[LM.LEFT_SHOULDER];
  const rSh = landmarks[LM.RIGHT_SHOULDER];
  const lEl = landmarks[LM.LEFT_ELBOW];
  const rEl = landmarks[LM.RIGHT_ELBOW];
  const lWr = landmarks[LM.LEFT_WRIST];
  const rWr = landmarks[LM.RIGHT_WRIST];
  const lHip = landmarks[LM.LEFT_HIP];
  const rHip = landmarks[LM.RIGHT_HIP];
  const lKn = landmarks[LM.LEFT_KNEE];
  const rKn = landmarks[LM.RIGHT_KNEE];
  const lAn = landmarks[LM.LEFT_ANKLE];
  const rAn = landmarks[LM.RIGHT_ANKLE];

  const lowerBodyExercise = exercise === 'Squat' || exercise === 'Lunge';
  const leftSideVisible = lowerBodyExercise
    ? isVisible(lHip) && isVisible(lKn) && isVisible(lAn)
    : isVisible(lSh) && isVisible(lEl) && isVisible(lWr);
  const rightSideVisible = lowerBodyExercise
    ? isVisible(rHip) && isVisible(rKn) && isVisible(rAn)
    : isVisible(rSh) && isVisible(rEl) && isVisible(rWr);

  if (!leftSideVisible && !rightSideVisible) {
    return {
      ...prevState,
      landmarksDetected: false,
      feedback: {
        message: lowerBodyExercise
          ? 'Step back slightly so your hips, knees, and ankles are visible in the camera.'
          : 'Position yourself so your shoulders, elbows, and wrists are clearly visible.',
        status: 'warning',
      },
    };
  }

  let next = {
    ...prevState,
    landmarksDetected: true,
    analyzedFrames: prevState.analyzedFrames + 1,
  };

  const shouldersNotLevel =
    isVisible(lSh) && isVisible(rSh) && Math.abs(lSh.y - rSh.y) > 0.085;

  let postureViolation = false;

  // 1. SQUAT (Hip - Knee - Ankle angle + Shoulder - Hip - Knee torso angle)
  if (exercise === 'Squat') {
    const leftKnee = leftSideVisible ? calculateAngle(lHip, lKn, lAn) : null;
    const rightKnee = rightSideVisible ? calculateAngle(rHip, rKn, rAn) : null;
    const avgKnee =
      leftKnee !== null && rightKnee !== null
        ? Math.round(((leftKnee + rightKnee) / 2) * 10) / 10
        : leftKnee !== null
        ? leftKnee
        : rightKnee;

    next.leftAngle = leftKnee !== null ? leftKnee : avgKnee;
    next.rightAngle = rightKnee !== null ? rightKnee : avgKnee;
    next.primaryAngle = avgKnee;
    next.romMin = Math.min(next.romMin, avgKnee);
    next.romMax = Math.max(next.romMax, avgKnee);

    if (isWorkoutActive) {
      if (avgKnee > 155) {
        next.leftStage = 'Up';
        next.rightStage = 'Up';
        next.stage = 'Up';
      } else if (avgKnee < 100 && next.leftStage === 'Up') {
        next.leftStage = 'Down';
        next.rightStage = 'Down';
        next.stage = 'Down';
        next.leftReps += 1;
        next.rightReps += 1;
        next.repCount += 1;
      }
    }

    const hipAngle =
      leftSideVisible && isVisible(lSh)
        ? calculateAngle(lSh, lHip, lKn)
        : rightSideVisible && isVisible(rSh)
        ? calculateAngle(rSh, rHip, rKn)
        : 120;

    if (hipAngle < 65) {
      postureViolation = true;
      const msg = 'Chest up! Avoid excessive forward torso lean.';
      next.feedback = { message: msg, status: 'danger' };
      next.postureAlerts = recordAlert(next.postureAlerts, msg);
    } else if (shouldersNotLevel) {
      postureViolation = true;
      const msg = 'Keep your shoulders level and balanced.';
      next.feedback = { message: msg, status: 'warning' };
      next.postureAlerts = recordAlert(next.postureAlerts, msg);
    } else if (avgKnee >= 100 && avgKnee <= 130 && next.leftStage === 'Up') {
      next.feedback = {
        message: 'Squat deeper — aim for thighs parallel to the floor (< 100°).',
        status: 'warning',
      };
    } else if (avgKnee < 100) {
      next.feedback = {
        message: 'Great squat depth! Drive up through your heels.',
        status: 'success',
      };
    } else {
      next.feedback = {
        message: 'Strong squat stance and alignment!',
        status: 'success',
      };
    }
  }

  // 2. PUSH-UP (Shoulder - Elbow - Wrist angle + Shoulder - Hip - Ankle plank alignment)
  else if (exercise === 'Pushup') {
    const leftElbow = leftSideVisible ? calculateAngle(lSh, lEl, lWr) : null;
    const rightElbow = rightSideVisible ? calculateAngle(rSh, rEl, rWr) : null;
    const avgElbow =
      leftElbow !== null && rightElbow !== null
        ? Math.round(((leftElbow + rightElbow) / 2) * 10) / 10
        : leftElbow !== null
        ? leftElbow
        : rightElbow;

    next.leftAngle = leftElbow !== null ? leftElbow : avgElbow;
    next.rightAngle = rightElbow !== null ? rightElbow : avgElbow;
    next.primaryAngle = avgElbow;
    next.romMin = Math.min(next.romMin, avgElbow);
    next.romMax = Math.max(next.romMax, avgElbow);

    if (isWorkoutActive) {
      if (avgElbow > 155) {
        next.leftStage = 'Up';
        next.rightStage = 'Up';
        next.stage = 'Up';
      } else if (avgElbow < 95 && next.leftStage === 'Up') {
        next.leftStage = 'Down';
        next.rightStage = 'Down';
        next.stage = 'Down';
        next.leftReps += 1;
        next.rightReps += 1;
        next.repCount += 1;
      }
    }

    const plankAngle =
      isVisible(lSh) && isVisible(lHip) && isVisible(lAn)
        ? calculateAngle(lSh, lHip, lAn)
        : isVisible(rSh) && isVisible(rHip) && isVisible(rAn)
        ? calculateAngle(rSh, rHip, rAn)
        : 170;

    if (plankAngle < 150) {
      postureViolation = true;
      const msg = 'Engage core! Keep shoulders, hips, and ankles in a straight line.';
      next.feedback = { message: msg, status: 'danger' };
      next.postureAlerts = recordAlert(next.postureAlerts, msg);
    } else if (avgElbow >= 95 && avgElbow <= 122 && next.leftStage === 'Up') {
      next.feedback = {
        message: 'Lower chest closer to the floor for full push-up range (< 95°).',
        status: 'warning',
      };
    } else if (avgElbow < 95) {
      next.feedback = {
        message: 'Full push-up depth! Press smoothly back to plank lockout.',
        status: 'success',
      };
    } else {
      next.feedback = {
        message: 'Solid plank alignment and push-up control!',
        status: 'success',
      };
    }
  }

  // 3. BICEP CURL
  else if (exercise === 'Bicep Curl') {
    const leftElbow = leftSideVisible ? calculateAngle(lSh, lEl, lWr) : 160;
    const rightElbow = rightSideVisible ? calculateAngle(rSh, rEl, rWr) : 160;
    const avgElbow = Math.round(((leftElbow + rightElbow) / 2) * 10) / 10;

    next.leftAngle = leftElbow;
    next.rightAngle = rightElbow;
    next.primaryAngle = avgElbow;
    next.romMin = Math.min(next.romMin, avgElbow);
    next.romMax = Math.max(next.romMax, avgElbow);

    if (isWorkoutActive) {
      if (leftSideVisible) {
        if (leftElbow > 155) next.leftStage = 'Down';
        if (leftElbow < 45 && next.leftStage === 'Down') {
          next.leftStage = 'Up';
          next.leftReps += 1;
        }
      }
      if (rightSideVisible) {
        if (rightElbow > 155) next.rightStage = 'Down';
        if (rightElbow < 45 && next.rightStage === 'Down') {
          next.rightStage = 'Up';
          next.rightReps += 1;
        }
      }
      next.repCount = Math.max(next.leftReps, next.rightReps);
      next.stage = next.leftStage || next.rightStage || 'Ready';
    }

    if (shouldersNotLevel) {
      postureViolation = true;
      const msg = 'Keep both shoulders level — avoid swinging your torso.';
      next.feedback = { message: msg, status: 'warning' };
      next.postureAlerts = recordAlert(next.postureAlerts, msg);
    } else {
      next.feedback = {
        message: 'Good bicep curl control and elbow stability!',
        status: 'success',
      };
    }
  }

  // 4. LUNGE
  else if (exercise === 'Lunge') {
    const leftKnee = leftSideVisible ? calculateAngle(lHip, lKn, lAn) : 165;
    const rightKnee = rightSideVisible ? calculateAngle(rHip, rKn, rAn) : 165;
    const minKnee = Math.min(leftKnee, rightKnee);

    next.leftAngle = leftKnee;
    next.rightAngle = rightKnee;
    next.primaryAngle = minKnee;
    next.romMin = Math.min(next.romMin, minKnee);
    next.romMax = Math.max(next.romMax, Math.max(leftKnee, rightKnee));

    if (isWorkoutActive) {
      if (leftKnee > 150 && rightKnee > 150) {
        next.leftStage = 'Up';
        next.stage = 'Up';
      } else if (minKnee < 100 && next.leftStage === 'Up') {
        next.leftStage = 'Down';
        next.stage = 'Down';
        next.leftReps += 1;
        next.rightReps += 1;
        next.repCount += 1;
      }
    }

    if (shouldersNotLevel) {
      postureViolation = true;
      const msg = 'Keep your torso upright and shoulders level during the lunge.';
      next.feedback = { message: msg, status: 'warning' };
      next.postureAlerts = recordAlert(next.postureAlerts, msg);
    } else {
      next.feedback = {
        message: 'Good lunge stride and knee flexion control!',
        status: 'success',
      };
    }
  }

  // 5. SHOULDER PRESS
  else {
    const leftElbow = leftSideVisible ? calculateAngle(lSh, lEl, lWr) : 90;
    const rightElbow = rightSideVisible ? calculateAngle(rSh, rEl, rWr) : 90;
    const avgElbow = Math.round(((leftElbow + rightElbow) / 2) * 10) / 10;

    next.leftAngle = leftElbow;
    next.rightAngle = rightElbow;
    next.primaryAngle = avgElbow;
    next.romMin = Math.min(next.romMin, avgElbow);
    next.romMax = Math.max(next.romMax, avgElbow);

    if (isWorkoutActive) {
      if (avgElbow < 95) {
        next.leftStage = 'Down';
        next.stage = 'Down';
      } else if (avgElbow > 155 && next.leftStage === 'Down') {
        next.leftStage = 'Up';
        next.stage = 'Up';
        next.leftReps += 1;
        next.rightReps += 1;
        next.repCount += 1;
      }
    }

    if (shouldersNotLevel) {
      postureViolation = true;
      const msg = 'Press evenly with both arms — keep shoulders balanced.';
      next.feedback = { message: msg, status: 'warning' };
      next.postureAlerts = recordAlert(next.postureAlerts, msg);
    } else {
      next.feedback = {
        message: 'Strong overhead lockout and shoulder alignment!',
        status: 'success',
      };
    }
  }

  if (!postureViolation) {
    next.cleanPostureFrames += 1;
  }

  next.formScore =
    next.analyzedFrames > 0
      ? Math.max(
          50,
          Math.min(100, Math.round((next.cleanPostureFrames / next.analyzedFrames) * 100))
        )
      : 100;

  return next;
}

/**
 * Renders the detected 33 MediaPipe Pose landmarks, skeleton lines, and live joint angle labels
 * onto a 2D canvas overlaying the video feed.
 */
export function drawPoseOverlay(ctx, canvasWidth, canvasHeight, landmarks, trackingState) {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  if (!landmarks || !Array.isArray(landmarks) || landmarks.length < 29) {
    return;
  }

  const isDanger = trackingState?.feedback?.status === 'danger';
  const isWarning = trackingState?.feedback?.status === 'warning';
  const lineColor = isDanger ? '#f43f5e' : isWarning ? '#f59e0b' : '#10b981';

  // 1. Draw skeleton connections
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = lineColor;
  ctx.lineCap = 'round';

  for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
    const a = landmarks[startIdx];
    const b = landmarks[endIdx];
    if (isVisible(a, 0.35) && isVisible(b, 0.35)) {
      ctx.beginPath();
      ctx.moveTo(a.x * canvasWidth, a.y * canvasHeight);
      ctx.lineTo(b.x * canvasWidth, b.y * canvasHeight);
      ctx.stroke();
    }
  }

  // 2. Draw joint keypoints
  const keypointIndices = [
    LM.NOSE,
    LM.LEFT_SHOULDER,
    LM.RIGHT_SHOULDER,
    LM.LEFT_ELBOW,
    LM.RIGHT_ELBOW,
    LM.LEFT_WRIST,
    LM.RIGHT_WRIST,
    LM.LEFT_HIP,
    LM.RIGHT_HIP,
    LM.LEFT_KNEE,
    LM.RIGHT_KNEE,
    LM.LEFT_ANKLE,
    LM.RIGHT_ANKLE,
  ];

  for (const idx of keypointIndices) {
    const pt = landmarks[idx];
    if (!isVisible(pt, 0.35)) continue;
    const x = pt.x * canvasWidth;
    const y = pt.y * canvasHeight;

    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();
  }

  // 3. Draw active joint angle callout badge on the primary joint vertex
  const exercise = trackingState?.exercise || 'Squat';
  const lowerBody = exercise === 'Squat' || exercise === 'Lunge';
  const leftVertex = landmarks[lowerBody ? LM.LEFT_KNEE : LM.LEFT_ELBOW];
  const rightVertex = landmarks[lowerBody ? LM.RIGHT_KNEE : LM.RIGHT_ELBOW];

  const drawAngleBadge = (pt, angleVal, labelPrefix) => {
    if (!isVisible(pt, 0.4) || !angleVal) return;
    const x = Math.min(canvasWidth - 70, Math.max(12, pt.x * canvasWidth + 10));
    const y = Math.min(canvasHeight - 20, Math.max(24, pt.y * canvasHeight - 8));
    const text = `${labelPrefix} ${Math.round(angleVal)}°`;

    ctx.font = 'bold 12px Inter, system-ui, sans-serif';
    const textWidth = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - 6, y - 14, textWidth + 12, 20, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.fillText(text, x, y);
  };

  drawAngleBadge(leftVertex, trackingState?.leftAngle, 'L');
  drawAngleBadge(rightVertex, trackingState?.rightAngle, 'R');
}
