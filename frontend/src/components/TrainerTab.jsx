import React, { useState, useEffect } from 'react';
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
import { apiFetch } from '../api';
import PlannerTab from './PlannerTab';

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

export default function TrainerTab({ user, onSessionSaved }) {
  const [subView, setSubView] = useState('log'); // 'log' | 'planner'
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [aiAdvice, setAiAdvice] = useState(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  const [workoutForm, setWorkoutForm] = useState({
    exercise: 'Squat',
    sets_completed: 4,
    reps_per_set: 10,
    weight_kg: 60,
    duration_min: 20,
    form_score: 92,
    notes: '',
  });

  const loadHistory = async () => {
    try {
      const h = await apiFetch('/api/workouts/history');
      setHistory(h.sessions || []);
    } catch {
      // ignore initial load error
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

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
      setToast(err.message || 'Could not log workout session');
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
      setToast(err.message || 'Could not delete workout log');
    }
  };

  const handleRequestAiFeedback = async () => {
    setLoadingAdvice(true);
    try {
      const res = await apiFetch('/api/workouts/ai-feedback', { method: 'POST' });
      setAiAdvice(res);
      setToast('Generated personalized AI training feedback!');
    } catch (err) {
      setToast(err.message || 'Could not generate AI workout feedback');
    } finally {
      setLoadingAdvice(false);
    }
  };

  const selectedExerciseSpec =
    EXERCISE_LIBRARY.find((e) => e.name === workoutForm.exercise) || EXERCISE_LIBRARY[0];

  const chartData = [...history]
    .slice(0, 8)
    .reverse()
    .map((s) => ({
      name: s.exercise,
      reps: s.total_reps,
      calories: s.calories_burned,
    }));

  return (
    <div className="space-y-6">
      {/* Sub-navigation between Workout Logger & 7-Day Split / Gym Finder */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubView('log')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
              subView === 'log'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Workout Logger &amp; History
          </button>
          <button
            type="button"
            onClick={() => setSubView('planner')}
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
                  {Number(workoutForm.sets_completed || 0) * Number(workoutForm.reps_per_set || 0)}{' '}
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
                    <span className="font-semibold text-slate-300">Form &amp; Execution Quality</span>
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
                  <span className="text-xs text-slate-400">{history.length} sessions logged</span>
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
                        <Bar dataKey="reps" name="Total Reps" fill="#10b981" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-6 text-center text-xs text-slate-400">
                    No workouts logged yet. Log your first workout on the left to visualize your
                    training volume.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Workout History Table */}
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
                Your workout history is empty. Use the form above to record your sets, reps, and
                working weights.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                      <th className="py-2.5 px-3">Exercise</th>
                      <th className="py-2.5 px-3">Sets &amp; Load</th>
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
                          {s.sets_completed || 3} sets
                          {s.weight_kg > 0 ? ` • ${s.weight_kg} kg` : ' • Bodyweight'}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-emerald-400">{s.total_reps}</td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {Math.max(1, Math.round((s.duration_sec || 60) / 60))} min
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
