import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dumbbell,
  CheckCircle2,
  Clock,
  Flame,
  Plus,
  Trash2,
  Sparkles,
  TrendingUp,
  ClipboardList,
  Calendar,
  Camera,
  CameraOff,
  Play,
  Pause,
  Square,
  RotateCcw,
  Save,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { apiFetch } from '../api';
import PlannerTab from './PlannerTab';
import {
  LIVE_EXERCISES,
  createInitialTrackingState,
  evaluatePoseFrame,
  drawPoseOverlay,
} from '../utils/poseWorkoutEngine';

const EXERCISE_LIBRARY = [
  {
    name: 'Squat',
    muscle: 'Quadriceps, Glutes & Core',
    defaultWeight: 60,
    defaultSets: 4,
    defaultReps: 10,
    cues: [
      'Set feet shoulder-width apart and brace your core before descending.',
      'Lower hips until thighs are parallel or slightly below parallel.',
      'Drive through mid-foot and keep knees tracking in line with toes.',
    ],
  },
  {
    name: 'Pushup',
    muscle: 'Chest, Shoulders, Triceps & Core',
    defaultWeight: 0,
    defaultSets: 3,
    defaultReps: 15,
    cues: [
      'Maintain a straight line from head to heels with glutes and core engaged.',
      'Lower chest to just above the floor with elbows at a 45° angle.',
      'Press up to full arm extension.',
    ],
  },
  {
    name: 'Bench Press',
    muscle: 'Chest, Anterior Delts & Triceps',
    defaultWeight: 50,
    defaultSets: 4,
    defaultReps: 8,
    cues: [
      'Retract shoulder blades firmly against the bench and plant feet flat.',
      'Lower the bar under control to mid-chest with ~45° elbow tuck.',
      'Press smoothly to lockout while exhaling.',
    ],
  },
  {
    name: 'Deadlift',
    muscle: 'Posterior Chain, Hamstrings & Back',
    defaultWeight: 80,
    defaultSets: 3,
    defaultReps: 6,
    cues: [
      'Keep the barbell close to mid-foot and engage lats before lifting.',
      'Maintain a neutral spine and push the floor away with your legs.',
      'Lock out hips and knees together without hyperextending your lower back.',
    ],
  },
  {
    name: 'Bicep Curl',
    muscle: 'Biceps & Forearms',
    defaultWeight: 14,
    defaultSets: 3,
    defaultReps: 12,
    cues: [
      'Keep upper arms pinned to your sides with minimal shoulder swing.',
      'Curl smoothly to full contraction and squeeze at the top.',
      'Lower with a controlled 2-second eccentric phase to full extension.',
    ],
  },
  {
    name: 'Lunge',
    muscle: 'Quads, Glutes & Balance',
    defaultWeight: 20,
    defaultSets: 3,
    defaultReps: 12,
    cues: [
      'Step forward with a stable stride and keep your torso upright.',
      'Lower until both front and back knees reach approximately 90°.',
      'Push through your front heel to return to the starting stance.',
    ],
  },
  {
    name: 'Shoulder Press',
    muscle: 'Deltoids, Triceps & Upper Chest',
    defaultWeight: 30,
    defaultSets: 4,
    defaultReps: 10,
    cues: [
      'Start weights at shoulder height with wrists stacked over elbows.',
      'Keep ribcage down and core braced as you press overhead.',
      'Lower under control back to shoulder level.',
    ],
  },
  {
    name: 'Lat Pulldown',
    muscle: 'Latissimus Dorsi & Upper Back',
    defaultWeight: 45,
    defaultSets: 4,
    defaultReps: 12,
    cues: [
      'Initiate the pull by depressing your shoulder blades.',
      'Drive elbows down toward your hips until the bar reaches upper chest.',
      'Control the return for a full lat stretch at the top.',
    ],
  },
  {
    name: 'Romanian Deadlift',
    muscle: 'Hamstrings & Glutes',
    defaultWeight: 55,
    defaultSets: 3,
    defaultReps: 10,
    cues: [
      'Keep a soft bend in the knees and hinge hips straight back.',
      'Lower the weight along your thighs/shins until you feel a hamstring stretch.',
      'Drive hips forward to return to standing.',
    ],
  },
  {
    name: 'Plank',
    muscle: 'Core & Spinal Stabilizers',
    defaultWeight: 0,
    defaultSets: 3,
    defaultReps: 1,
    cues: [
      'Stack elbows directly beneath shoulders and brace abs.',
      'Avoid letting hips sag or pike upward.',
      'Breathe steadily throughout each timed hold.',
    ],
  },
];

function formatElapsed(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(total / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export default function TrainerTab({ user, onSessionSaved }) {
  const [subView, setSubView] = useState('live'); // 'live' | 'log' | 'planner'
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [errorBanner, setErrorBanner] = useState('');
  const [aiAdvice, setAiAdvice] = useState(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  // Live Webcam Workout States
  const [liveExercise, setLiveExercise] = useState('Squat');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [workoutStatus, setWorkoutStatus] = useState('idle'); // 'idle' | 'running' | 'paused' | 'stopped'
  const [elapsedSec, setElapsedSec] = useState(0);
  const [trackingState, setTrackingState] = useState(() => createInitialTrackingState('Squat'));
  const [savingLive, setSavingLive] = useState(false);

  // Refs for real-time MediaPipe Pose loop and camera tracks
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const trackingStateRef = useRef(createInitialTrackingState('Squat'));
  const workoutStatusRef = useRef('idle');

  // Keep ref synced with workoutStatus for the requestAnimationFrame callback
  useEffect(() => {
    workoutStatusRef.current = workoutStatus;
  }, [workoutStatus]);

  // Manual Workout Form State
  const [workoutForm, setWorkoutForm] = useState({
    exercise: 'Squat',
    sets_completed: 4,
    reps_per_set: 10,
    weight_kg: 60,
    duration_min: 20,
    form_score: 92,
    notes: '',
  });

  const loadHistory = useCallback(async () => {
    try {
      const h = await apiFetch('/api/workouts/history');
      setHistory(h.sessions || []);
    } catch {
      // ignore initial load error
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /**
   * Stops all active MediaStream camera tracks, cancels animation frame loop,
   * and clears video/canvas elements.
   */
  const stopCameraTracks = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore track stop error
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    lastVideoTimeRef.current = -1;
    setCameraActive(false);
  }, []);

  // Stop all camera tracks and close PoseLandmarker when user exits TrainerTab
  useEffect(() => {
    return () => {
      stopCameraTracks();
      if (landmarkerRef.current) {
        try {
          landmarkerRef.current.close();
        } catch {
          // ignore close error
        }
        landmarkerRef.current = null;
      }
    };
  }, [stopCameraTracks]);

  // Elapsed workout timer — only ticks when workoutStatus === 'running'
  useEffect(() => {
    if (workoutStatus !== 'running') return undefined;
    const interval = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [workoutStatus]);

  /**
   * Initializes MediaPipe PoseLandmarker instance (loads local WASM/model first, with CDN fallback).
   */
  const ensurePoseLandmarker = async () => {
    if (landmarkerRef.current) {
      return landmarkerRef.current;
    }

    let vision;
    try {
      vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    } catch {
      vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
      );
    }

    const createWithModel = async (modelPath, delegate) =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate,
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

    try {
      landmarkerRef.current = await createWithModel(
        '/mediapipe/pose_landmarker_lite.task',
        'GPU'
      );
    } catch {
      try {
        landmarkerRef.current = await createWithModel(
          '/mediapipe/pose_landmarker_lite.task',
          'CPU'
        );
      } catch {
        landmarkerRef.current = await createWithModel(
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          'CPU'
        );
      }
    }

    return landmarkerRef.current;
  };

  /**
   * Real-time animation loop that runs MediaPipe PoseLandmarker on each video frame
   * and draws the skeleton overlay.
   */
  const runPoseDetectionLoop = useCallback(() => {
    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!videoEl || !canvasEl || !landmarker || !streamRef.current) {
      return;
    }

    if (videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      if (
        canvasEl.width !== videoEl.videoWidth ||
        canvasEl.height !== videoEl.videoHeight
      ) {
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
      }

      const nowMs = performance.now();
      if (videoEl.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = videoEl.currentTime;
        try {
          const result = landmarker.detectForVideo(videoEl, nowMs);
          const detectedLandmarks =
            result && result.landmarks && result.landmarks.length > 0
              ? result.landmarks[0]
              : null;

          const updatedState = evaluatePoseFrame(
            detectedLandmarks,
            trackingStateRef.current,
            workoutStatusRef.current === 'running'
          );
          trackingStateRef.current = updatedState;
          setTrackingState(updatedState);

          const ctx = canvasEl.getContext('2d');
          drawPoseOverlay(
            ctx,
            canvasEl.width,
            canvasEl.height,
            detectedLandmarks,
            updatedState
          );
        } catch {
          // frame timestamp monotonicity or transient detection error
        }
      }
    }

    rafRef.current = requestAnimationFrame(runPoseDetectionLoop);
  }, []);

  /**
   * Explicitly starts the webcam via browser getUserMedia ONLY when the user clicks Start Camera.
   */
  const handleStartCamera = async () => {
    setCameraError('');
    setErrorBanner('');
    setCameraLoading(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'Your browser does not support webcam access (navigator.mediaDevices.getUserMedia).'
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      await ensurePoseLandmarker();

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);
      setTrackingState((prev) => {
        const next = {
          ...prev,
          feedback: {
            message:
              workoutStatusRef.current === 'running'
                ? `Tracking ${liveExercise} — step into full view.`
                : 'Camera active. Click Start Workout to begin counting repetitions.',
            status: 'info',
          },
        };
        trackingStateRef.current = next;
        return next;
      });

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(runPoseDetectionLoop);
    } catch (err) {
      stopCameraTracks();
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access in your browser settings and click Start Camera again.'
          : err?.name === 'NotFoundError'
          ? 'No webcam hardware was detected on this device.'
          : err?.message || 'Unable to access webcam or initialize MediaPipe Pose Landmarker.';
      setCameraError(msg);
    } finally {
      setCameraLoading(false);
    }
  };

  /**
   * Starts a live workout session (starts camera first if not already running).
   */
  const handleStartWorkout = async () => {
    setErrorBanner('');
    if (!cameraActive) {
      await handleStartCamera();
      if (!streamRef.current) {
        return;
      }
    }
    if (workoutStatus === 'stopped' || workoutStatus === 'idle') {
      const freshState = createInitialTrackingState(liveExercise);
      freshState.feedback = {
        message: `Live ${liveExercise} workout started! Perform controlled repetitions in view.`,
        status: 'info',
      };
      trackingStateRef.current = freshState;
      setTrackingState(freshState);
      setElapsedSec(0);
    }
    workoutStatusRef.current = 'running';
    setWorkoutStatus('running');
  };

  const handlePauseWorkout = () => {
    if (workoutStatus !== 'running') return;
    workoutStatusRef.current = 'paused';
    setWorkoutStatus('paused');
    setTrackingState((prev) => {
      const next = {
        ...prev,
        feedback: {
          message: 'Workout paused. Click Resume to continue counting repetitions.',
          status: 'info',
        },
      };
      trackingStateRef.current = next;
      return next;
    });
  };

  const handleResumeWorkout = async () => {
    if (workoutStatus !== 'paused') return;
    if (!cameraActive) {
      await handleStartCamera();
      if (!streamRef.current) return;
    }
    workoutStatusRef.current = 'running';
    setWorkoutStatus('running');
    setTrackingState((prev) => {
      const next = {
        ...prev,
        feedback: {
          message: `Workout resumed — tracking ${liveExercise} repetitions.`,
          status: 'info',
        },
      };
      trackingStateRef.current = next;
      return next;
    });
  };

  /**
   * Stops the active workout and immediately releases all webcam tracks.
   */
  const handleStopWorkout = () => {
    workoutStatusRef.current = 'stopped';
    setWorkoutStatus('stopped');
    stopCameraTracks();
    setTrackingState((prev) => {
      const next = {
        ...prev,
        landmarksDetected: false,
        feedback: {
          message:
            prev.repCount > 0
              ? `Workout stopped (${prev.repCount} reps in ${formatElapsed(elapsedSec)}). Click Save Completed Workout below to record this session.`
              : 'Workout and camera stopped.',
          status: 'info',
        },
      };
      trackingStateRef.current = next;
      return next;
    });
  };

  const handleResetLiveSession = () => {
    const reset = createInitialTrackingState(liveExercise);
    reset.feedback = {
      message: cameraActive
        ? 'Counters reset. Click Start to begin a fresh set.'
        : 'Click Start Camera and step into view to begin pose tracking.',
      status: 'info',
    };
    trackingStateRef.current = reset;
    setTrackingState(reset);
    setElapsedSec(0);
    workoutStatusRef.current = 'idle';
    setWorkoutStatus('idle');
    setErrorBanner('');
  };

  const handleLiveExerciseChange = (newExercise) => {
    setLiveExercise(newExercise);
    const updated = {
      ...trackingStateRef.current,
      exercise: newExercise,
      stage: 'Ready',
      leftStage: null,
      rightStage: null,
      feedback: {
        message: `Switched live exercise to ${newExercise}.`,
        status: 'info',
      },
    };
    trackingStateRef.current = updated;
    setTrackingState(updated);
  };

  /**
   * Saves the completed live webcam workout summary to the backend API using the authenticated user token.
   * Never saves fake/fabricated repetition counts.
   */
  const handleSaveLiveWorkout = async () => {
    setErrorBanner('');
    if (trackingState.repCount <= 0) {
      setErrorBanner(
        'Cannot save an empty live workout (0 reps recorded). Perform at least 1 repetition in front of the camera or use the Manual Workout Log tab.'
      );
      return;
    }

    setSavingLive(true);
    try {
      const exSpec =
        LIVE_EXERCISES.find((e) => e.name === liveExercise) || LIVE_EXERCISES[0];
      const durationSeconds = Math.max(10, elapsedSec || 10);
      const estCalories =
        Math.round(
          Math.max(
            trackingState.repCount * exSpec.caloriesPerRep,
            (durationSeconds / 60) * 4.5
          ) * 10
        ) / 10;

      const alertSummary =
        trackingState.postureAlerts.length > 0
          ? `Alerts: ${trackingState.postureAlerts.slice(-2).join('; ')}`
          : `Live MediaPipe Pose session (${trackingState.formScore}% clean posture frames)`;

      const res = await apiFetch('/api/workouts/log', {
        method: 'POST',
        body: JSON.stringify({
          exercise: liveExercise,
          sets_completed: 1,
          reps_per_set: trackingState.repCount,
          left_reps: trackingState.leftReps,
          right_reps: trackingState.rightReps,
          total_reps: trackingState.repCount,
          weight_kg: 0,
          duration_sec: durationSeconds,
          calories_burned: estCalories,
          form_score: trackingState.formScore,
          posture_notes: alertSummary,
          notes: alertSummary,
          mode: 'live_webcam',
        }),
      });

      setToast(
        `Saved Live ${res.session.exercise} Session: ${res.session.total_reps} reps in ${formatElapsed(
          elapsedSec
        )} (${res.session.calories_burned} kcal • ${res.session.performance_score}% form)`
      );
      await loadHistory();
      if (onSessionSaved) onSessionSaved();
    } catch (err) {
      setErrorBanner(err.message || 'Failed to save completed workout summary.');
    } finally {
      setSavingLive(false);
    }
  };

  const handleSwitchSubView = (view) => {
    if (view !== 'live' && cameraActive) {
      stopCameraTracks();
      if (workoutStatus === 'running') {
        workoutStatusRef.current = 'paused';
        setWorkoutStatus('paused');
      }
    }
    setSubView(view);
  };

  const handleSelectExercise = (exName) => {
    const found = EXERCISE_LIBRARY.find((e) => e.name === exName);
    setWorkoutForm((prev) => ({
      ...prev,
      exercise: exName,
      sets_completed: found ? found.defaultSets : prev.sets_completed,
      reps_per_set: found ? found.defaultReps : prev.reps_per_set,
      weight_kg: found ? found.defaultWeight : prev.weight_kg,
    }));
  };

  const handleLogWorkout = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorBanner('');
    try {
      const setsCount = Math.max(1, Number(workoutForm.sets_completed) || 3);
      const repsPerSet = Math.max(1, Number(workoutForm.reps_per_set) || 10);
      const totalReps = setsCount * repsPerSet;
      const durationSec = Math.max(60, Math.round((Number(workoutForm.duration_min) || 15) * 60));

      const res = await apiFetch('/api/workouts/log', {
        method: 'POST',
        body: JSON.stringify({
          exercise: workoutForm.exercise,
          sets_completed: setsCount,
          reps_per_set: repsPerSet,
          total_reps: totalReps,
          weight_kg: Number(workoutForm.weight_kg) || 0,
          duration_sec: durationSec,
          form_score: Number(workoutForm.form_score) || 90,
          notes: workoutForm.notes.trim() || undefined,
          mode: 'manual',
        }),
      });

      setToast(
        `Logged ${res.session.exercise}: ${setsCount} sets × ${repsPerSet} reps (${res.session.total_reps} total reps • ${res.session.calories_burned} kcal)`
      );
      setWorkoutForm((prev) => ({ ...prev, notes: '' }));
      await loadHistory();
      if (onSessionSaved) onSessionSaved();
    } catch (err) {
      setErrorBanner(err.message || 'Could not log workout session');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorkout = async (workoutId) => {
    try {
      await apiFetch(`/api/workouts/${workoutId}`, { method: 'DELETE' });
      await loadHistory();
      if (onSessionSaved) onSessionSaved();
      setToast('Workout log entry removed.');
    } catch (err) {
      setErrorBanner(err.message || 'Could not delete workout log');
    }
  };

  const handleRequestAiFeedback = async () => {
    setLoadingAdvice(true);
    setErrorBanner('');
    try {
      const res = await apiFetch('/api/workouts/ai-feedback', { method: 'POST' });
      setAiAdvice(res);
      setToast('Generated personalized AI training feedback!');
    } catch (err) {
      setErrorBanner(err.message || 'Could not generate AI workout feedback');
    } finally {
      setLoadingAdvice(false);
    }
  };

  const selectedExerciseSpec =
    EXERCISE_LIBRARY.find((e) => e.name === workoutForm.exercise) || EXERCISE_LIBRARY[0];

  const selectedLiveSpec =
    LIVE_EXERCISES.find((e) => e.name === liveExercise) || LIVE_EXERCISES[0];

  const liveEstCalories =
    Math.round(trackingState.repCount * selectedLiveSpec.caloriesPerRep * 10) / 10;

  const chartData = [...history]
    .slice(0, 8)
    .reverse()
    .map((s) => ({
      name: s.exercise,
      reps: s.total_reps,
      calories: s.calories_burned,
    }));

  const feedbackStyle =
    trackingState.feedback.status === 'danger'
      ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
      : trackingState.feedback.status === 'warning'
      ? 'border-amber-500/50 bg-amber-500/15 text-amber-200'
      : trackingState.feedback.status === 'success'
      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
      : 'border-slate-700 bg-slate-900/90 text-slate-200';

  return (
    <div className="space-y-6">
      {/* Sub-navigation between Live Webcam Workout, Manual Workout Logger & 7-Day Split / Gym Finder */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleSwitchSubView('live')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
              subView === 'live'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            Live Workout (Webcam)
          </button>
          <button
            type="button"
            onClick={() => handleSwitchSubView('log')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
              subView === 'log'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Manual Workout Log
          </button>
          <button
            type="button"
            onClick={() => handleSwitchSubView('planner')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
              subView === 'planner'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            7-Day Split Planner &amp; Nearby Gyms
          </button>
        </div>

        <button
          type="button"
          onClick={handleRequestAiFeedback}
          disabled={loadingAdvice}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-2 text-xs font-bold text-emerald-300 transition cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {loadingAdvice ? 'Analyzing Training...' : 'Get AI Training Insights'}
        </button>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-200 flex items-center justify-between">
          <span>{toast}</span>
          <button
            onClick={() => setToast('')}
            className="text-emerald-300 hover:text-white text-xs ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-200 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            {errorBanner}
          </span>
          <button
            onClick={() => setErrorBanner('')}
            className="text-rose-300 hover:text-white text-xs ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {aiAdvice && (
        <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-5 shadow-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> AI Strength &amp; Recovery Feedback
            </span>
            <button
              onClick={() => setAiAdvice(null)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
          <div className="text-xs text-slate-200 whitespace-pre-line leading-relaxed">
            {aiAdvice.advice}
          </div>
        </div>
      )}

      {subView === 'planner' ? (
        <PlannerTab user={user} />
      ) : (
        <>
          {subView === 'live' ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left Column: Live Camera Feed + Skeleton Overlay + Controls */}
              <div className="lg:col-span-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Real-Time Pose Tracking
                    </span>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Camera className="w-5 h-5 text-emerald-400" /> Live Webcam Workout
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                        cameraActive
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                        }`}
                      />
                      {cameraActive ? 'Camera Active' : 'Camera Off'}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase ${
                        workoutStatus === 'running'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : workoutStatus === 'paused'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {workoutStatus}
                    </span>
                  </div>
                </div>

                {/* Exercise Selection & Joint Threshold Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Select Exercise
                    </label>
                    <select
                      value={liveExercise}
                      onChange={(e) => handleLiveExerciseChange(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    >
                      {LIVE_EXERCISES.map((ex) => (
                        <option key={ex.name} value={ex.name}>
                          {ex.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 flex flex-col justify-center">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Tracked Joints: {selectedLiveSpec.primaryJoints}
                    </span>
                    <span className="text-xs font-bold text-emerald-400 mt-0.5">
                      {selectedLiveSpec.targetThresholds}
                    </span>
                  </div>
                </div>

                {cameraError && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-300">Camera Error</p>
                      <p className="mt-0.5">{cameraError}</p>
                    </div>
                  </div>
                )}

                {/* Video Viewport + Pose Skeleton Canvas Overlay */}
                <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 flex items-center justify-center">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className={`h-full w-full object-cover ${
                      cameraActive ? 'block' : 'hidden'
                    }`}
                  />
                  <canvas
                    ref={canvasRef}
                    className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
                      cameraActive ? 'block' : 'hidden'
                    }`}
                  />

                  {!cameraActive && (
                    <div className="flex flex-col items-center justify-center p-6 text-center max-w-md space-y-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                        <CameraOff className="w-7 h-7" />
                      </div>
                      <h4 className="text-base font-bold text-white">
                        Webcam Is Off Until You Start Camera
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Click <strong className="text-slate-200">Start Camera</strong> below to grant
                        browser camera permission and initialize real-time MediaPipe Pose landmark
                        detection. All video frames are processed locally in your browser.
                      </p>
                      <button
                        type="button"
                        onClick={handleStartCamera}
                        disabled={cameraLoading}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 px-5 py-2.5 text-xs font-bold text-slate-950 transition cursor-pointer shadow-lg shadow-emerald-500/10"
                      >
                        <Camera className="w-4 h-4" />
                        {cameraLoading ? 'Starting Camera & Pose Model...' : 'Start Camera'}
                      </button>
                    </div>
                  )}

                  {/* Top-left live angle & pose status overlay when camera is active */}
                  {cameraActive && (
                    <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold backdrop-blur-md border ${
                          trackingState.landmarksDetected
                            ? 'bg-slate-950/80 border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-950/80 border-amber-500/40 text-amber-300'
                        }`}
                      >
                        {trackingState.landmarksDetected ? 'Pose Locked' : 'Searching for Body...'}
                      </span>
                      {trackingState.landmarksDetected && (
                        <span className="rounded-lg bg-slate-950/80 border border-slate-700 px-2.5 py-1 text-xs font-bold text-cyan-300 backdrop-blur-md">
                          Joint Angle: {trackingState.primaryAngle}°
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Live Posture Feedback Banner */}
                <div
                  className={`rounded-xl border px-4 py-3 text-xs font-semibold flex items-center justify-between gap-3 ${feedbackStyle}`}
                >
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 shrink-0" />
                    <span>{trackingState.feedback.message}</span>
                  </div>
                  <span className="shrink-0 font-bold uppercase tracking-wider text-[11px]">
                    Stage: {trackingState.stage}
                  </span>
                </div>

                {/* Start Camera + Start / Pause / Resume / Stop Controls */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {!cameraActive ? (
                    <button
                      type="button"
                      onClick={handleStartCamera}
                      disabled={cameraLoading}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 px-4 py-2.5 text-xs font-bold text-slate-950 transition cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      {cameraLoading ? 'Starting Camera...' : 'Start Camera'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopCameraTracks}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3.5 py-2.5 text-xs font-bold text-slate-200 transition cursor-pointer"
                    >
                      <CameraOff className="w-4 h-4" />
                      Turn Off Camera
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleStartWorkout}
                    disabled={workoutStatus === 'running' || cameraLoading}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 px-4 py-2.5 text-xs font-bold text-slate-950 transition cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    Start
                  </button>

                  <button
                    type="button"
                    onClick={handlePauseWorkout}
                    disabled={workoutStatus !== 'running'}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 px-4 py-2.5 text-xs font-bold text-slate-950 transition cursor-pointer"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>

                  <button
                    type="button"
                    onClick={handleResumeWorkout}
                    disabled={workoutStatus !== 'paused'}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 px-4 py-2.5 text-xs font-bold text-slate-950 transition cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    Resume
                  </button>

                  <button
                    type="button"
                    onClick={handleStopWorkout}
                    disabled={workoutStatus === 'idle' && !cameraActive}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-40 px-4 py-2.5 text-xs font-bold text-slate-950 transition cursor-pointer"
                  >
                    <Square className="w-4 h-4" />
                    Stop
                  </button>

                  <button
                    type="button"
                    onClick={handleResetLiveSession}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 hover:bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-slate-300 transition cursor-pointer ml-auto"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                </div>
              </div>

              {/* Right Column: Live Telemetry Metrics & Save Completed Workout */}
              <div className="lg:col-span-4 space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Live Session Telemetry
                    </span>
                    <span className="text-xs font-semibold text-slate-400">{liveExercise}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5">
                      <span className="text-[11px] font-semibold uppercase text-slate-400">
                        Rep Count
                      </span>
                      <div className="mt-1 text-3xl font-extrabold text-emerald-400">
                        {trackingState.repCount}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        L: {trackingState.leftReps} • R: {trackingState.rightReps}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5">
                      <span className="text-[11px] font-semibold uppercase text-slate-400">
                        Elapsed Time
                      </span>
                      <div className="mt-1 text-3xl font-extrabold text-white font-mono">
                        {formatElapsed(elapsedSec)}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {workoutStatus === 'running' ? 'Active timer' : 'Timer paused/idle'}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5">
                      <span className="text-[11px] font-semibold uppercase text-slate-400">
                        Movement Phase
                      </span>
                      <div className="mt-1 text-xl font-extrabold text-cyan-400">
                        {trackingState.stage}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        L: {Math.round(trackingState.leftAngle)}° • R:{' '}
                        {Math.round(trackingState.rightAngle)}°
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5">
                      <span className="text-[11px] font-semibold uppercase text-slate-400">
                        Form Quality
                      </span>
                      <div className="mt-1 text-xl font-extrabold text-amber-400">
                        {trackingState.formScore}%
                      </div>
                      <span className="text-[11px] text-slate-400">
                        ~{liveEstCalories} kcal est.
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveLiveWorkout}
                    disabled={savingLive || trackingState.repCount <= 0}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold py-3 text-xs transition cursor-pointer shadow-lg shadow-emerald-500/10"
                  >
                    <Save className="w-4 h-4" />
                    {savingLive
                      ? 'Saving Workout Summary...'
                      : `Save Completed Workout (${trackingState.repCount} Reps)`}
                  </button>
                </div>

                {/* Posture Alerts & Exercise Cues Card */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                    Posture &amp; Angle Checkpoints
                  </span>
                  <h4 className="text-sm font-bold text-white">{liveExercise} Coaching Cues</h4>
                  <ul className="space-y-2 text-xs text-slate-300">
                    {(
                      EXERCISE_LIBRARY.find((e) => e.name === liveExercise) || EXERCISE_LIBRARY[0]
                    ).cues.map((cue, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{cue}</span>
                      </li>
                    ))}
                  </ul>

                  {trackingState.postureAlerts.length > 0 && (
                    <div className="pt-2 border-t border-slate-800 space-y-1.5">
                      <span className="text-[11px] font-bold uppercase text-amber-400">
                        Recent Form Alerts
                      </span>
                      {trackingState.postureAlerts.slice(-3).map((alert, i) => (
                        <div
                          key={i}
                          className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5 text-[11px] text-amber-200"
                        >
                          {alert}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Manual Workout Logging Form */}
              <form
                onSubmit={handleLogWorkout}
                className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Training Log
                    </span>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Dumbbell className="w-5 h-5 text-emerald-400" /> Log Completed Workout
                    </h3>
                  </div>
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                    {Number(workoutForm.sets_completed || 0) *
                      Number(workoutForm.reps_per_set || 0)}{' '}
                    Total Reps
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Exercise
                    </label>
                    <select
                      value={workoutForm.exercise}
                      onChange={(e) => handleSelectExercise(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    >
                      {EXERCISE_LIBRARY.map((ex) => (
                        <option key={ex.name} value={ex.name}>
                          {ex.name} — {ex.muscle}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Sets Completed
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={workoutForm.sets_completed}
                      onChange={(e) =>
                        setWorkoutForm({ ...workoutForm, sets_completed: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Reps per Set
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="200"
                      value={workoutForm.reps_per_set}
                      onChange={(e) =>
                        setWorkoutForm({ ...workoutForm, reps_per_set: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Working Weight (kg)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      max="500"
                      value={workoutForm.weight_kg}
                      onChange={(e) =>
                        setWorkoutForm({ ...workoutForm, weight_kg: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Duration (minutes)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="240"
                      value={workoutForm.duration_min}
                      onChange={(e) =>
                        setWorkoutForm({ ...workoutForm, duration_min: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-300">
                        Form &amp; Execution Quality
                      </span>
                      <span className="font-bold text-emerald-400">{workoutForm.form_score}%</span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="100"
                      value={workoutForm.form_score}
                      onChange={(e) =>
                        setWorkoutForm({ ...workoutForm, form_score: Number(e.target.value) })
                      }
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Session Notes (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Controlled tempo, felt strong on final set"
                      value={workoutForm.notes}
                      onChange={(e) => setWorkoutForm({ ...workoutForm, notes: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white placeholder-slate-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold py-3 text-sm transition cursor-pointer shadow-lg shadow-emerald-500/10"
                >
                  <Plus className="w-4 h-4" />
                  {saving ? 'Saving Workout...' : 'Log Workout Session'}
                </button>
              </form>

              {/* Technique Guide & Volume Chart */}
              <div className="lg:col-span-5 space-y-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                      Technique Checkpoints
                    </span>
                    <span className="text-xs text-slate-400">{selectedExerciseSpec.muscle}</span>
                  </div>
                  <h4 className="text-base font-bold text-white">
                    {selectedExerciseSpec.name} Form Guide
                  </h4>
                  <ul className="space-y-2 pt-1">
                    {selectedExerciseSpec.cues.map((cue, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{cue}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" /> Recent Workout Volume
                    </h4>
                    <span className="text-xs text-slate-400">
                      {history.length} sessions logged
                    </span>
                  </div>

                  {chartData.length > 0 ? (
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                          <YAxis stroke="#94a3b8" fontSize={11} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '0.75rem',
                            }}
                          />
                          <Bar
                            dataKey="reps"
                            name="Total Reps"
                            fill="#10b981"
                            radius={[6, 6, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-6 text-center text-xs text-slate-400">
                      No workouts logged yet. Complete a live workout or log a manual session to
                      visualize your training volume.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Workout History Table (shared across Live Workout and Manual Workout Log) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" /> Workout History
              </h3>
              <span className="text-xs text-slate-400">
                Showing {history.length} recorded sessions
              </span>
            </div>

            {history.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-8 text-center text-sm text-slate-400">
                Your workout history is empty. Start a Live Webcam Workout or use the Manual Workout
                Log to record your training sessions.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                      <th className="py-2.5 px-3">Exercise</th>
                      <th className="py-2.5 px-3">Mode / Sets</th>
                      <th className="py-2.5 px-3">Total Reps</th>
                      <th className="py-2.5 px-3">Duration</th>
                      <th className="py-2.5 px-3">Est. Calories</th>
                      <th className="py-2.5 px-3">Form Rating</th>
                      <th className="py-2.5 px-3">Notes</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {history.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-semibold text-white">{s.exercise}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-300">
                          {s.mode === 'live_webcam' ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[11px] font-semibold text-cyan-300">
                              Live Webcam
                            </span>
                          ) : (
                            <>
                              {s.sets_completed || 3} sets
                              {s.weight_kg > 0 ? ` • ${s.weight_kg} kg` : ' • Bodyweight'}
                            </>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-emerald-400">{s.total_reps}</td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {s.duration_sec < 60
                            ? `${s.duration_sec}s`
                            : `${Math.max(1, Math.round((s.duration_sec || 60) / 60))} min`}
                        </td>
                        <td className="py-2.5 px-3 text-amber-400 font-semibold">
                          <span className="inline-flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5" />
                            {s.calories_burned} kcal
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                            {s.performance_score}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-300 max-w-xs truncate">
                          {s.posture_notes}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-400">{s.recorded_at}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteWorkout(s.id)}
                            className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer"
                            title="Delete workout log"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
