import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Zap,
  AlertTriangle,
  Activity,
  Flame,
  Timer,
  Dumbbell,
  Sparkles,
  ShieldCheck,
  Monitor,
} from 'lucide-react';
import { apiFetch } from '../api';

const EXERCISES = ['Bicep Curl', 'Squat', 'Pushup', 'Lunge', 'Shoulder Press'];

export default function TrainerTab({ onSessionSaved }) {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState('Bicep Curl');

  // Camera source mode: 'opencv' (OpenCV VideoCapture(0) backend stream) | 'browser' (Browser getUserMedia + MediaPipe backend) | 'demo' (Camera-Off Demo Mode)
  const [cameraSource, setCameraSource] = useState('opencv');
  const [cameraRunning, setCameraRunning] = useState(true);
  const [workoutActive, setWorkoutActive] = useState(true);
  const [permissionError, setPermissionError] = useState('');
  const [streamKey, setStreamKey] = useState(1);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  // Gemini AI Workout Advice state
  const [geminiAdvice, setGeminiAdvice] = useState(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  // Refs for browser getUserMedia <video> and <canvas> skeleton overlay
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const frameLoopRef = useRef(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiFetch('/api/trainer/stats');
      setStats(data);
    } catch {
      // ignore transient poll error
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await apiFetch('/api/trainer/history');
      setHistory(data.sessions || []);
    } catch {
      // ignore
    }
  }, []);

  // Stop browser getUserMedia stream cleanly
  const stopBrowserGetUserMedia = useCallback(() => {
    if (frameLoopRef.current) {
      clearInterval(frameLoopRef.current);
      frameLoopRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Draw 33 landmarks and skeleton connections on the <canvas> overlay over browser <video>
  const drawSkeletonOverlay = useCallback(
    (landmarks, connections, currentStats) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (landmarks && landmarks.length > 0) {
        const lmMap = {};
        landmarks.forEach((lm) => {
          lmMap[lm.index] = lm;
        });

        // Draw skeleton connections
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 3;
        (connections || []).forEach(([a, b]) => {
          if (lmMap[a] && lmMap[b]) {
            ctx.beginPath();
            ctx.moveTo(lmMap[a].x * w, lmMap[a].y * h);
            ctx.lineTo(lmMap[b].x * w, lmMap[b].y * h);
            ctx.stroke();
          }
        });

        // Draw joints
        landmarks.forEach((lm) => {
          if ([0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].includes(lm.index)) {
            const cx = lm.x * w;
            const cy = lm.y * h;
            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#10b981';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
          }
        });

        // Draw live joint angle callouts
        const primaryLeft = ['Squat', 'Lunge'].includes(currentStats?.exercise) ? 25 : 13;
        const primaryRight = ['Squat', 'Lunge'].includes(currentStats?.exercise) ? 26 : 14;
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        if (lmMap[primaryLeft]) {
          ctx.fillText(
            `${currentStats?.left_angle ?? 0}°`,
            Math.max(10, lmMap[primaryLeft].x * w - 25),
            Math.max(24, lmMap[primaryLeft].y * h - 12)
          );
        }
        if (lmMap[primaryRight]) {
          ctx.fillStyle = '#6ee7b7';
          ctx.fillText(
            `${currentStats?.right_angle ?? 0}°`,
            Math.min(w - 60, lmMap[primaryRight].x * w + 10),
            Math.max(24, lmMap[primaryRight].y * h - 12)
          );
        }
      }
    },
    []
  );

  // Start Browser getUserMedia webcam + local MediaPipe backend processing loop
  const startBrowserWebcam = useCallback(async () => {
    setPermissionError('');
    stopBrowserGetUserMedia();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionError(
        'Browser getUserMedia API is not supported in this browser context. Use OpenCV VideoCapture(0) mode or Camera-Off Demo Mode.'
      );
      return;
    }

    try {
      // Release backend OpenCV handle first so the browser can claim the laptop camera
      await apiFetch('/api/trainer/stop_camera', { method: 'POST' });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraRunning(true);

      // Process frames locally at ~5 FPS via Python MediaPipe PoseLandmarker endpoint
      frameLoopRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        const capCanvas = captureCanvasRef.current;
        if (!capCanvas) return;
        const ctx = capCanvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, capCanvas.width, capCanvas.height);
        const dataUrl = capCanvas.toDataURL('image/jpeg', 0.72);

        try {
          const res = await apiFetch('/api/trainer/process_frame', {
            method: 'POST',
            body: JSON.stringify({
              image_base64: dataUrl,
              exercise: selectedExercise,
            }),
          });
          if (res.stats) setStats(res.stats);
          drawSkeletonOverlay(res.landmarks, res.connections, res.stats);
        } catch {
          // ignore transient frame error
        }
      }, 220);
    } catch (err) {
      let friendlyMsg = `Camera permission error: ${err.message || err.name}`;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        friendlyMsg =
          'Camera permission was denied by your browser. Please allow camera access in the address bar, or switch to OpenCV VideoCapture(0) / Camera-Off Demo Mode.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        friendlyMsg =
          'No webcam device was found by the browser. Switching to Camera-Off Demo Mode.';
      } else if (err.name === 'NotReadableError') {
        friendlyMsg =
          'Laptop webcam is currently in use by OpenCV VideoCapture(0) or another app. Click "OpenCV VideoCapture(0)" to view the direct hardware stream.';
      }
      setPermissionError(friendlyMsg);
    }
  }, [selectedExercise, stopBrowserGetUserMedia, drawSkeletonOverlay]);

  useEffect(() => {
    fetchStats();
    fetchHistory();
    const interval = setInterval(() => {
      if (cameraSource !== 'browser') {
        fetchStats();
      }
    }, 900);
    return () => {
      clearInterval(interval);
      stopBrowserGetUserMedia();
    };
  }, [cameraSource, fetchStats, fetchHistory, stopBrowserGetUserMedia]);

  // 1. Start Camera button handler
  const handleStartCamera = async (targetSource = cameraSource) => {
    setPermissionError('');
    setCameraSource(targetSource);

    if (targetSource === 'browser') {
      await startBrowserWebcam();
      setToast('Browser getUserMedia webcam started with real-time MediaPipe Pose overlay.');
      setTimeout(() => setToast(''), 3500);
      return;
    }

    stopBrowserGetUserMedia();
    const useDemo = targetSource === 'demo';
    try {
      const res = await apiFetch('/api/trainer/start_camera', {
        method: 'POST',
        body: JSON.stringify({ use_demo: useDemo }),
      });
      setStats(res.stats);
      setCameraRunning(true);
      setStreamKey((k) => k + 1);
      setToast(
        useDemo
          ? 'Camera-Off Demo Mode started.'
          : 'Laptop webcam started via OpenCV VideoCapture(0) + MediaPipe Pose Landmarker!'
      );
      setTimeout(() => setToast(''), 3500);
    } catch (err) {
      setPermissionError(err.message);
    }
  };

  // 2. Stop Camera button handler
  const handleStopCamera = async () => {
    stopBrowserGetUserMedia();
    try {
      const res = await apiFetch('/api/trainer/stop_camera', { method: 'POST' });
      setStats(res.stats);
      setCameraRunning(false);
      setToast('Camera stopped and hardware handle released.');
      setTimeout(() => setToast(''), 3000);
    } catch (err) {
      setToast(err.message);
    }
  };

  // 3. Start / Pause Workout button handler
  const handleToggleWorkout = async (nextActive) => {
    setWorkoutActive(nextActive);
    try {
      const res = await apiFetch('/api/trainer/start_workout', {
        method: 'POST',
        body: JSON.stringify({ active: nextActive }),
      });
      setStats(res.stats);
      setToast(
        nextActive
          ? `Workout started! Counting ${selectedExercise} repetitions.`
          : 'Workout paused.'
      );
      setTimeout(() => setToast(''), 3000);
    } catch (err) {
      setToast(err.message);
    }
  };

  // 4. Reset button handler
  const handleReset = async () => {
    try {
      const data = await apiFetch('/api/trainer/reset', { method: 'POST' });
      setStats(data);
      setGeminiAdvice(null);
      setToast('Session repetition counters, timer, and ROM telemetry reset.');
      setTimeout(() => setToast(''), 3000);
    } catch (err) {
      setToast(err.message);
    }
  };

  const handleExerciseChange = async (exName) => {
    setSelectedExercise(exName);
    try {
      const res = await apiFetch('/api/trainer/configure', {
        method: 'POST',
        body: JSON.stringify({
          exercise: exName,
          demo_mode: cameraSource === 'demo',
        }),
      });
      setStats(res.stats);
      if (cameraSource !== 'browser') {
        setStreamKey((k) => k + 1);
      }
    } catch (err) {
      setToast(err.message);
    }
  };

  const handleSimulateReps = async (steps = 3) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/trainer/simulate_reps?steps=${steps}`, {
        method: 'POST',
      });
      setStats(res.stats);
      setToast(`Simulated +${steps} ${selectedExercise} cycle(s)!`);
      setTimeout(() => setToast(''), 3500);
    } catch (err) {
      setToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleGetGeminiAdvice = async () => {
    setLoadingAdvice(true);
    try {
      const res = await apiFetch('/api/trainer/gemini-advice', { method: 'POST' });
      setGeminiAdvice(res);
    } catch (err) {
      setToast(err.message);
    } finally {
      setLoadingAdvice(false);
    }
  };

  const handleFinishWorkout = async () => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/trainer/finish', {
        method: 'POST',
        body: JSON.stringify({ exercise: selectedExercise }),
      });
      setToast(
        `Saved ${res.session.exercise}: ${res.session.total_reps} reps (${res.session.calories_burned} kcal, Score ${res.session.performance_score}/100)`
      );
      await fetchStats();
      await fetchHistory();
      if (onSessionSaved) onSessionSaved();
      setTimeout(() => setToast(''), 4500);
    } catch (err) {
      setToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const perf = stats?.performance || {};
  const fbStatus = stats?.feedback?.status || 'info';
  const feedbackBadgeClass =
    fbStatus === 'success'
      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
      : fbStatus === 'warning'
      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
      : fbStatus === 'danger'
      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
      : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300';

  const formatDuration = (sec = 0) => {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')} (${sec}s)`;
  };

  return (
    <div className="space-y-6">
      {/* Header & Camera Source Mode Switcher */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Module 1 • OpenCV VideoCapture(0) + MediaPipe Pose Landmarker + Browser getUserMedia
            </span>
            <h2 className="text-xl font-extrabold text-white mt-0.5">
              AI Gym Trainer &amp; Real-Time Webcam Rep Counter
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Real-time 33-landmark skeleton overlay and joint-angle state machines for Squats, Pushups, Bicep Curls, Lunges, and Shoulder Press.
            </p>
          </div>

          {/* 3 Camera Mode Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleStartCamera('opencv')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                cameraSource === 'opencv' && cameraRunning
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Camera className="w-3.5 h-3.5" /> OpenCV VideoCapture(0)
            </button>
            <button
              onClick={() => handleStartCamera('browser')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                cameraSource === 'browser' && cameraRunning
                  ? 'bg-blue-500 text-slate-950 shadow-md shadow-blue-500/20'
                  : 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" /> Browser getUserMedia
            </button>
            <button
              onClick={() => handleStartCamera('demo')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                cameraSource === 'demo' && cameraRunning
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Zap className="w-3.5 h-3.5" /> Camera-Off Demo Mode
            </button>
          </div>
        </div>

        {/* Primary Action Buttons Required: Start Camera, Stop Camera, Start Workout, Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleStartCamera(cameraSource)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 text-xs transition cursor-pointer shadow-md shadow-emerald-500/15"
            >
              <Camera className="w-3.5 h-3.5" /> Start Camera
            </button>
            <button
              onClick={handleStopCamera}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 font-bold px-4 py-2 text-xs transition cursor-pointer"
            >
              <CameraOff className="w-3.5 h-3.5" /> Stop Camera
            </button>
            <button
              onClick={() => handleToggleWorkout(!workoutActive)}
              className={`inline-flex items-center gap-1.5 rounded-xl font-bold px-4 py-2 text-xs transition cursor-pointer ${
                workoutActive
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                  : 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              }`}
            >
              {workoutActive ? (
                <>
                  <Pause className="w-3.5 h-3.5" /> Pause Workout
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" /> Start Workout
                </>
              )}
            </button>
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-4 py-2 text-xs transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>

          {/* Exercise Selection Pills */}
          <div className="flex flex-wrap gap-1.5">
            {EXERCISES.map((ex) => (
              <button
                key={ex}
                onClick={() => handleExerciseChange(ex)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                  selectedExercise === ex
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'border border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Camera Permission / Hardware Alert Banner */}
        {permissionError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold uppercase tracking-wider text-rose-300">
                Webcam Permission / Access Notice
              </div>
              <p className="mt-0.5">{permissionError}</p>
            </div>
          </div>
        )}

        {toast && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-200">
            {toast}
          </div>
        )}
      </div>

      {/* Main Vision Feed + Live Stats Sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Video Feed Column */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg flex flex-col justify-between space-y-4">
          <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950 aspect-video flex items-center justify-center">
            {!cameraRunning ? (
              <div className="text-center p-6 space-y-3">
                <CameraOff className="w-12 h-12 text-slate-600 mx-auto" />
                <div>
                  <p className="text-sm font-bold text-slate-300">Camera Stopped</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Click &quot;Start Camera&quot; above to launch your laptop webcam or Camera-Off Demo Mode.
                  </p>
                </div>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => handleStartCamera('opencv')}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 cursor-pointer"
                  >
                    Start Laptop Webcam (OpenCV)
                  </button>
                  <button
                    onClick={() => handleStartCamera('demo')}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 cursor-pointer"
                  >
                    Start Demo Mode
                  </button>
                </div>
              </div>
            ) : cameraSource === 'browser' ? (
              <div className="relative w-full h-full">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
                <canvas
                  ref={canvasRef}
                  width={640}
                  height={480}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
                <canvas
                  ref={captureCanvasRef}
                  width={640}
                  height={480}
                  className="hidden"
                />
              </div>
            ) : (
              <img
                key={streamKey}
                src={`/api/trainer/video_feed?exercise=${encodeURIComponent(
                  selectedExercise
                )}&demo=${cameraSource === 'demo'}&t=${streamKey}`}
                alt="AI Pose Trainer Live Feed"
                className="h-full w-full object-contain"
              />
            )}
          </div>

          {/* Bottom Controls: Simulate Reps + Ask Gemini Coach + Save Session */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleSimulateReps(3)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 font-bold px-3.5 py-2 text-xs transition cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" /> +3 Demo Reps
              </button>
              <button
                onClick={handleGetGeminiAdvice}
                disabled={loadingAdvice}
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold px-4 py-2 text-xs transition cursor-pointer shadow-md shadow-purple-500/20"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {loadingAdvice ? 'Analyzing Stats...' : 'Get Gemini AI Workout Advice'}
              </button>
            </div>

            <button
              onClick={handleFinishWorkout}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold px-5 py-2.5 text-xs transition cursor-pointer shadow-lg shadow-emerald-500/25"
            >
              <CheckCircle2 className="w-4 h-4" /> Finish &amp; Save Session
            </button>
          </div>

          {/* Gemini AI Workout Advice Panel (Strict Local Frame Processing Guarantee) */}
          {geminiAdvice && (
            <div className="rounded-2xl border border-purple-500/40 bg-purple-500/10 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> Google Gemini Workout Advice ({geminiAdvice.provider})
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                  <ShieldCheck className="w-3 h-3" /> 0 Raw Video Frames Sent
                </span>
              </div>
              <div className="text-xs text-slate-100 whitespace-pre-line leading-relaxed">
                {geminiAdvice.advice}
              </div>
              <div className="text-[10px] text-slate-400 pt-1 border-t border-purple-500/20">
                {geminiAdvice.privacy_note}
              </div>
            </div>
          )}
        </div>

        {/* Live Telemetry & Biomechanics Column */}
        <div className="lg:col-span-5 space-y-4">
          {/* Live Exercise & Posture Feedback Banner */}
          <div className={`rounded-2xl border p-4 ${feedbackBadgeClass}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider">
                Active Exercise: {stats?.exercise || selectedExercise}
              </span>
              <span className="rounded-md bg-slate-950/60 px-2.5 py-0.5 text-[11px] font-bold">
                {!cameraRunning
                  ? 'CAMERA OFF'
                  : stats?.is_demo_mode
                  ? 'DEMO MODE'
                  : 'LIVE WEBCAM'}
              </span>
            </div>
            <p className="mt-2 text-sm font-bold">
              {stats?.feedback?.message || 'Step into frame to begin pose tracking.'}
            </p>
          </div>

          {/* Required Telemetry Cards: Exercise, Rep Count, Joint Angles, Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Dumbbell className="w-3.5 h-3.5 text-emerald-400" /> Repetition Count
              </span>
              <div className="mt-1 text-3xl font-extrabold text-white">{stats?.total ?? 0}</div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Left: {stats?.left ?? 0} • Right: {stats?.right ?? 0}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Timer className="w-3.5 h-3.5 text-amber-400" /> Workout Duration
              </span>
              <div className="mt-1 text-xl font-extrabold text-amber-300">
                {formatDuration(stats?.duration ?? 0)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400 flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" /> Est. {stats?.calories ?? 0} kcal burned
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-cyan-400" /> Live Joint Angles
              </span>
              <div className="mt-1 text-xl font-extrabold text-cyan-300">
                {stats?.left_angle ?? 0}° / {stats?.right_angle ?? 0}°
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Left / Right Primary Joint</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" /> Pose Detection
              </span>
              <div className="mt-1 text-sm font-extrabold text-white">
                {stats?.landmarks_detected ? '33 Landmarks Locked' : 'Awaiting Subject'}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {workoutActive ? 'Rep Counter Active' : 'Workout Paused'}
              </div>
            </div>
          </div>

          {/* Live Module 6 Biomechanics Telemetry */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Live Pose-to-Performance Telemetry
              </h3>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-extrabold text-emerald-300">
                Score: {perf.performance_score ?? 90} / 100
              </span>
            </div>

            {[
              { label: 'Range-of-Motion (ROM) Efficiency', val: perf.rom_efficiency ?? 88, color: 'bg-emerald-500' },
              { label: 'Posture & Alignment Accuracy', val: perf.posture_accuracy ?? 92, color: 'bg-cyan-500' },
              { label: 'Bilateral Left/Right Symmetry', val: perf.symmetry_score ?? 94, color: 'bg-blue-500' },
              { label: 'Repetition Tempo Consistency', val: perf.tempo_consistency ?? 88, color: 'bg-purple-500' },
            ].map((item, idx) => (
              <div key={idx}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">{item.label}</span>
                  <span className="font-bold text-white">{item.val}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${item.color}`}
                    style={{ width: `${Math.min(100, Math.max(10, item.val))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Recent Posture Alerts */}
          {stats?.posture_alerts?.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Detected Form Corrections
              </h4>
              <ul className="mt-2 space-y-1 text-xs text-slate-300 list-disc list-inside">
                {stats.posture_alerts.map((al, i) => (
                  <li key={i}>{al}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Saved Workout Sessions History */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
        <h3 className="text-base font-bold text-white mb-3">
          Logged Workout Sessions ({history.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                <th className="py-2 px-3">Timestamp</th>
                <th className="py-2 px-3">Exercise</th>
                <th className="py-2 px-3">L / R / Total Reps</th>
                <th className="py-2 px-3">Duration</th>
                <th className="py-2 px-3">Est. Burn</th>
                <th className="py-2 px-3">Pose Score</th>
                <th className="py-2 px-3">Mode</th>
                <th className="py-2 px-3">Coach Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {history.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 text-xs text-slate-400">{s.recorded_at}</td>
                  <td className="py-2.5 px-3 font-semibold text-white">{s.exercise}</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-bold">
                    {s.left_reps} / {s.right_reps} / {s.total_reps}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">{s.duration_sec}s</td>
                  <td className="py-2.5 px-3 text-amber-400">{s.calories_burned} kcal</td>
                  <td className="py-2.5 px-3">
                    <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                      {s.performance_score}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-xs uppercase text-slate-400">{s.mode}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-300">{s.posture_notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
