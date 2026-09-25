import React, { useState, useEffect } from 'react';
import {
  CalendarCheck,
  BrainCircuit,
  Bell,
  Flame,
  CheckCircle2,
  XCircle,
  Clock,
  Info,
  Sparkles,
} from 'lucide-react';
import { apiFetch } from '../api';

export default function HabitTrackerTab({ onUpdateOverview }) {
  const [dashboard, setDashboard] = useState(null);
  const [predForm, setPredForm] = useState({
    age: 26,
    sleep_hours: 7.5,
    stress_level: 4,
    work_hours: 8.0,
    motivation_level: 8,
    prev_days_active: 4,
    water_liters: 2.5,
  });
  const [prediction, setPrediction] = useState(null);
  const [logForm, setLogForm] = useState({
    scheduled_workout: 'Upper Body Hypertrophy',
    completed: true,
    sleep_hours: 7.5,
    stress_level: 4,
    work_hours: 8.0,
    motivation_level: 8,
    water_liters: 2.5,
    notes: 'Completed all compound sets on schedule',
  });
  const [scheduleForm, setScheduleForm] = useState({
    workout_days_per_week: 5,
    preferred_workout_time: '18:00',
  });
  const [statusMsg, setStatusMsg] = useState('');
  const [geminiMotivation, setGeminiMotivation] = useState(null);
  const [loadingMotivation, setLoadingMotivation] = useState(false);

  const loadHabitDashboard = async () => {
    try {
      const data = await apiFetch('/api/habits/dashboard');
      setDashboard(data);
      setPrediction(data.latest_prediction);
      if (data.schedule_settings) {
        setScheduleForm({
          workout_days_per_week: data.schedule_settings.workout_days_per_week,
          preferred_workout_time: data.schedule_settings.preferred_workout_time,
        });
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadHabitDashboard();
  }, []);

  const handlePredict = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/habits/predict', {
        method: 'POST',
        body: JSON.stringify({
          age: Number(predForm.age),
          sleep_hours: Number(predForm.sleep_hours),
          stress_level: Number(predForm.stress_level),
          work_hours: Number(predForm.work_hours),
          motivation_level: Number(predForm.motivation_level),
          prev_days_active: Number(predForm.prev_days_active),
          water_liters: Number(predForm.water_liters),
        }),
      });
      setPrediction(res);
      const pct = res.adherence_percentage ?? res.adherence_probability_pct ?? Math.round((res.adherence_probability || 0.85) * 100);
      setStatusMsg(
        `ML Adherence Prediction: ${pct}% (${res.risk_level || res.risk_category || 'Evaluated'})`
      );
    } catch (err) {
      setStatusMsg(err.message);
    }
  };

  const handleAskGeminiMotivation = async () => {
    setLoadingMotivation(true);
    try {
      const res = await apiFetch('/api/habits/gemini-motivation', {
        method: 'POST',
      });
      setGeminiMotivation(res);
      setStatusMsg(`Received Gemini Fitness Motivation & Habit Guidance (${res.provider})!`);
    } catch (err) {
      setStatusMsg(err.message);
    } finally {
      setLoadingMotivation(false);
    }
  };

  const handleLogHabit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/habits/log', {
        method: 'POST',
        body: JSON.stringify({
          ...logForm,
          sleep_hours: Number(logForm.sleep_hours),
          stress_level: Number(logForm.stress_level),
          work_hours: Number(logForm.work_hours),
          motivation_level: Number(logForm.motivation_level),
          water_liters: Number(logForm.water_liters),
        }),
      });
      setPrediction(res.prediction);
      setStatusMsg('Daily workout habit logged and streak recalculated!');
      await loadHabitDashboard();
      if (onUpdateOverview) onUpdateOverview();
    } catch (err) {
      setStatusMsg(err.message);
    }
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/api/habits/schedule', {
        method: 'PUT',
        body: JSON.stringify({
          workout_days_per_week: Number(scheduleForm.workout_days_per_week),
          preferred_workout_time: scheduleForm.preferred_workout_time,
        }),
      });
      setStatusMsg('Workout schedule and smart reminder time updated!');
      await loadHabitDashboard();
    } catch (err) {
      setStatusMsg(err.message);
    }
  };

  const summary = dashboard?.summary || {
    current_streak: 0,
    longest_streak: 0,
    completed_workouts: 0,
    missed_workouts: 0,
    consistency_pct: 0,
  };

  const completedCount = summary.completed_workouts ?? summary.completed_days ?? 0;
  const missedCount = summary.missed_workouts ?? summary.missed_days ?? 0;

  const probPct =
    prediction?.adherence_percentage ??
    prediction?.adherence_probability_pct ??
    Math.round((prediction?.adherence_probability || 0.85) * 100);

  const featureImportances =
    prediction?.model_metadata?.feature_importances ||
    prediction?.feature_importances ||
    {};

  return (
    <div className="space-y-6">
      {/* Synthetic Dataset Disclosure Banner */}
      <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
          <div className="text-xs text-purple-100">
            <span className="font-bold uppercase tracking-wider text-purple-300">
              Scikit-Learn ML Model Note:{' '}
            </span>
            {prediction?.model_metadata?.data_source_label ||
              prediction?.dataset_disclosure ||
              'Trained using scikit-learn RandomForestClassifier on a synthetic behavioral fitness adherence dataset combined with your personal habit logs.'}
          </div>
        </div>
        <button
          type="button"
          onClick={handleAskGeminiMotivation}
          disabled={loadingMotivation}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-500 to-emerald-500 hover:from-purple-400 hover:to-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-3.5 py-2 text-xs shrink-0 cursor-pointer shadow-md"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {loadingMotivation ? 'Consulting Gemini...' : 'Ask Gemini Habit Coach'}
        </button>
      </div>

      {statusMsg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-200 flex items-center justify-between">
          <span>{statusMsg}</span>
          <button
            onClick={() => setStatusMsg('')}
            className="text-emerald-300 hover:text-white text-xs ml-3 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {geminiMotivation && (
        <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950/40 p-4 shadow-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Gemini Fitness Motivation &amp; Habit Guidance ({geminiMotivation.provider})
            </span>
            <button
              onClick={() => setGeminiMotivation(null)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
          {geminiMotivation.gemini_error && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200">
              {geminiMotivation.gemini_error}
            </div>
          )}
          <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed">
            {geminiMotivation.answer}
          </p>
        </div>
      )}

      {/* Streak & Consistency KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-amber-400" /> Current Streak
          </span>
          <div className="mt-1 text-2xl font-extrabold text-white">
            {summary.current_streak} Days
          </div>
          <div className="text-[11px] text-slate-400">Longest: {summary.longest_streak} Days</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <CalendarCheck className="w-4 h-4 text-emerald-400" /> Consistency Rate
          </span>
          <div className="mt-1 text-2xl font-extrabold text-emerald-400">
            {summary.consistency_pct}%
          </div>
          <div className="text-[11px] text-slate-400">
            {completedCount} Completed / {missedCount} Missed
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <BrainCircuit className="w-4 h-4 text-purple-400" /> ML Adherence Prob.
          </span>
          <div className="mt-1 text-2xl font-extrabold text-purple-300">{probPct}%</div>
          <div className="text-[11px] text-slate-400">
            {prediction?.risk_level || prediction?.risk_category || 'High Adherence'}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-cyan-400" /> Smart Reminder
          </span>
          <div className="mt-1 text-lg font-extrabold text-cyan-300">
            {scheduleForm.preferred_workout_time} ({scheduleForm.workout_days_per_week}d/wk)
          </div>
          <div className="text-[11px] text-slate-400">Adaptive Schedule Active</div>
        </div>
      </div>

      {/* ML Predictor Form + Feature Importance & Adaptive Recommendation */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          onSubmit={handlePredict}
          className="lg:col-span-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4"
        >
          <div>
            <span className="text-xs font-bold uppercase text-purple-400">
              Scikit-Learn RandomForestClassifier
            </span>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-purple-400" /> Workout Adherence Predictor
            </h3>
            <p className="text-xs text-slate-400">
              Simulate sleep, stress, work hours, and motivation to predict workout completion probability.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Sleep Hours ({predForm.sleep_hours}h)
              </label>
              <input
                type="range"
                min="3"
                max="11"
                step="0.5"
                value={predForm.sleep_hours}
                onChange={(e) => setPredForm({ ...predForm, sleep_hours: e.target.value })}
                className="w-full accent-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Stress Level ({predForm.stress_level}/10)
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={predForm.stress_level}
                onChange={(e) => setPredForm({ ...predForm, stress_level: e.target.value })}
                className="w-full accent-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Work Hours ({predForm.work_hours}h)
              </label>
              <input
                type="range"
                min="2"
                max="14"
                step="0.5"
                value={predForm.work_hours}
                onChange={(e) => setPredForm({ ...predForm, work_hours: e.target.value })}
                className="w-full accent-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Motivation ({predForm.motivation_level}/10)
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={predForm.motivation_level}
                onChange={(e) => setPredForm({ ...predForm, motivation_level: e.target.value })}
                className="w-full accent-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Active Days (Past Week: {predForm.prev_days_active})
              </label>
              <input
                type="range"
                min="0"
                max="7"
                value={predForm.prev_days_active}
                onChange={(e) => setPredForm({ ...predForm, prev_days_active: e.target.value })}
                className="w-full accent-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Hydration ({predForm.water_liters} L)
              </label>
              <input
                type="range"
                min="1"
                max="5"
                step="0.2"
                value={predForm.water_liters}
                onChange={(e) => setPredForm({ ...predForm, water_liters: e.target.value })}
                className="w-full accent-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold py-2.5 text-xs transition cursor-pointer"
          >
            Run Scikit-Learn Adherence Prediction
          </button>
        </form>

        {/* Prediction Insights & Feature Importance */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-emerald-400">
                AI Schedule Adjustment &amp; Feature Importance
              </span>
              <span className="rounded-full bg-purple-500/20 border border-purple-500/40 px-3 py-0.5 text-xs font-extrabold text-purple-300">
                {probPct}% Adherence Likelihood
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-white">
              {prediction?.recommended_schedule_adjustment}
            </p>
            {prediction?.motivational_nudge && (
              <p className="mt-1 text-xs text-slate-300">{prediction.motivational_nudge}</p>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="text-xs font-bold uppercase text-slate-400">
              RandomForest Feature Importance Weights
            </div>
            {Object.entries(featureImportances).map(([feat, imp]) => {
              const pct = Math.round(imp * 100);
              return (
                <div key={feat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 capitalize">{feat.replace(/_/g, ' ')}</span>
                    <span className="font-bold text-purple-300">{pct}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-cyan-400"
                      style={{ width: `${Math.max(8, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Schedule Editor */}
          <form
            onSubmit={handleSaveSchedule}
            className="pt-3 border-t border-slate-800 flex flex-wrap items-end gap-3"
          >
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[11px] text-slate-400 mb-1">Target Days / Week</label>
              <input
                type="number"
                min="1"
                max="7"
                value={scheduleForm.workout_days_per_week}
                onChange={(e) =>
                  setScheduleForm({ ...scheduleForm, workout_days_per_week: e.target.value })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[11px] text-slate-400 mb-1">Preferred Time</label>
              <input
                type="time"
                value={scheduleForm.preferred_workout_time}
                onChange={(e) =>
                  setScheduleForm({ ...scheduleForm, preferred_workout_time: e.target.value })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 text-xs cursor-pointer"
            >
              Save Reminder
            </button>
          </form>
        </div>
      </div>

      {/* Daily Check-In Logger + 14-Day Habit History */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-400" /> Log Today&apos;s Workout Habit Check-In
        </h3>
        <form onSubmit={handleLogHabit} className="grid grid-cols-1 sm:grid-cols-6 gap-2.5">
          <input
            type="text"
            value={logForm.scheduled_workout}
            onChange={(e) => setLogForm({ ...logForm, scheduled_workout: e.target.value })}
            placeholder="Workout Name"
            className="sm:col-span-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          />
          <select
            value={logForm.completed ? 'yes' : 'no'}
            onChange={(e) => setLogForm({ ...logForm, completed: e.target.value === 'yes' })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          >
            <option value="yes">Completed Workout</option>
            <option value="no">Missed / Rest</option>
          </select>
          <input
            type="text"
            value={logForm.notes}
            onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
            placeholder="Notes"
            className="sm:col-span-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          />
          <button
            type="submit"
            className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 text-xs cursor-pointer"
          >
            Save Check-In
          </button>
        </form>

        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Scheduled Workout</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Sleep / Stress</th>
                <th className="py-2 px-3">ML Adherence</th>
                <th className="py-2 px-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(dashboard?.logs || []).map((l) => (
                <tr key={l.id} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3 text-xs text-slate-400">{l.date_str}</td>
                  <td className="py-2 px-3 font-semibold text-white">{l.scheduled_workout}</td>
                  <td className="py-2 px-3">
                    {l.completed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-400">
                        <XCircle className="w-3.5 h-3.5" /> Missed
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-300">
                    {l.sleep_hours}h • Stress {l.stress_level}/10
                  </td>
                  <td className="py-2 px-3 text-xs font-bold text-purple-300">
                    {Math.round((l.adherence_prob || 0.8) * 100)}%
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-400">{l.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
