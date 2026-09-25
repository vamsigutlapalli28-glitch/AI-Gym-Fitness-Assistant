import React, { useState, useEffect } from 'react';
import {
  Gauge,
  Activity,
  Award,
  Sliders,
  CheckCircle2,
  CalendarCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { apiFetch } from '../api';
import HabitTrackerTab from './HabitTrackerTab';

export default function PerformanceTab({ onUpdateOverview }) {
  const [section, setSection] = useState('performance'); // 'performance' | 'habits'
  const [data, setData] = useState(null);
  const [evalForm, setEvalForm] = useState({
    exercise: 'Squat',
    rom_angle_min: 80,
    rom_angle_max: 168,
    left_right_diff_deg: 3.5,
    posture_violation_ratio: 0.05,
    reps_completed: 10,
  });
  const [customEval, setCustomEval] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');

  const loadReports = async () => {
    try {
      const res = await apiFetch('/api/performance/reports');
      setData(res);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/performance/analyze', {
        method: 'POST',
        body: JSON.stringify({
          exercise: evalForm.exercise,
          rom_angle_min: Number(evalForm.rom_angle_min),
          rom_angle_max: Number(evalForm.rom_angle_max),
          left_right_diff_deg: Number(evalForm.left_right_diff_deg),
          rep_durations_sec: [2.1, 2.2, 2.0, 2.1, 2.2],
          posture_violation_ratio: Number(evalForm.posture_violation_ratio),
          reps_completed: Number(evalForm.reps_completed),
        }),
      });
      setCustomEval(res);
      setStatusMsg(
        `Saved ${res.exercise} progress report: Overall Score ${res.overall_score}/100 (${res.grade})`
      );
      await loadReports();
      if (onUpdateOverview) onUpdateOverview();
    } catch (err) {
      setStatusMsg(err.message);
    }
  };

  if (!data) {
    return (
      <div className="p-8 text-center text-slate-400">
        Loading Progress &amp; Performance Reports...
      </div>
    );
  }

  const { weekly_summary = {}, exercise_specs = {}, reports = [] } = data;
  const hasReports = reports.length > 0 || Boolean(customEval);
  const activeMetrics = customEval || reports[0] || {
    rom_efficiency: 0,
    posture_accuracy: 0,
    symmetry_score: 0,
    tempo_consistency: 0,
    overall_score: 0,
  };

  const radarData = [
    { metric: 'Range of Motion', score: activeMetrics.rom_efficiency || 0 },
    { metric: 'Form Alignment', score: activeMetrics.posture_accuracy || 0 },
    { metric: 'L/R Balance', score: activeMetrics.symmetry_score || 0 },
    { metric: 'Tempo Control', score: activeMetrics.tempo_consistency || 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-navigation between Performance Analytics & Habit Consistency */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSection('performance')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
              section === 'performance'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Gauge className="w-4 h-4" />
            Performance &amp; Form Reports
          </button>
          <button
            type="button"
            onClick={() => setSection('habits')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
              section === 'habits'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            Habit &amp; Streak Tracker
          </button>
        </div>
        <span className="text-xs text-slate-400 px-2">
          {weekly_summary.sessions_evaluated || 0} sessions analyzed
        </span>
      </div>

      {section === 'habits' ? (
        <HabitTrackerTab onUpdateOverview={onUpdateOverview} />
      ) : (
        <>
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

          {/* Weekly Summary KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-emerald-400" /> Avg Overall Score
              </span>
              <div className="mt-1 text-2xl font-extrabold text-emerald-400">
                {weekly_summary.avg_overall_score || 0} / 100
              </div>
              <div className="text-[11px] text-slate-400">
                {weekly_summary.sessions_evaluated || 0} Sessions Evaluated
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <span className="text-xs text-slate-400">Avg Range of Motion</span>
              <div className="mt-1 text-2xl font-extrabold text-cyan-300">
                {weekly_summary.avg_rom_efficiency || 0}%
              </div>
              <div className="text-[11px] text-slate-400">Depth &amp; Extension</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <span className="text-xs text-slate-400">Avg Left/Right Balance</span>
              <div className="mt-1 text-2xl font-extrabold text-blue-400">
                {weekly_summary.avg_symmetry_score || 0}%
              </div>
              <div className="text-[11px] text-slate-400">Bilateral Symmetry</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <span className="text-xs text-slate-400">Avg Form Consistency</span>
              <div className="mt-1 text-2xl font-extrabold text-purple-300">
                {weekly_summary.avg_posture_accuracy || 0}%
              </div>
              <div className="text-[11px] text-slate-400">Technique Control</div>
            </div>
          </div>

          {/* Radar Chart + Form Quality Evaluator */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-cyan-400" /> Movement Quality Breakdown
                </h3>
                <p className="text-xs text-slate-400">
                  Evaluates Range of Motion, Form Alignment, Left/Right Balance, and Tempo Control.
                </p>
              </div>
              {hasReports ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis dataKey="metric" stroke="#cbd5e1" fontSize={11} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#64748b" fontSize={10} />
                      <Radar
                        name="Score"
                        dataKey="score"
                        stroke="#06b6d4"
                        fill="#06b6d4"
                        fillOpacity={0.35}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-8 text-center text-xs text-slate-400 my-6">
                  Log a workout or run a movement quality check on the right to see your 4-axis
                  performance chart.
                </div>
              )}
              {customEval && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 space-y-1">
                  <div className="font-bold">
                    {customEval.exercise}: {customEval.overall_score}/100 ({customEval.grade})
                  </div>
                  <div>{customEval.feedback_summary}</div>
                </div>
              )}
            </div>

            {/* Form & Range-of-Motion Assessment */}
            <form
              onSubmit={handleAnalyze}
              className="lg:col-span-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4"
            >
              <div>
                <span className="text-xs font-bold uppercase text-cyan-400">
                  Technique &amp; Range-of-Motion Check
                </span>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" /> Log Movement Quality Assessment
                </h3>
                <p className="text-xs text-slate-400">
                  Record your exercise range of motion, left/right balance, and form control to track
                  technique improvements.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-slate-300 mb-1">Exercise</label>
                  <select
                    value={evalForm.exercise}
                    onChange={(e) => setEvalForm({ ...evalForm, exercise: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  >
                    {Object.keys(exercise_specs).map((ex) => (
                      <option key={ex} value={ex}>
                        {ex}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-slate-300 mb-1">Reps Completed</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={evalForm.reps_completed}
                    onChange={(e) => setEvalForm({ ...evalForm, reps_completed: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Bottom Position Angle ({evalForm.rom_angle_min}°)
                  </label>
                  <input
                    type="range"
                    min="20"
                    max="110"
                    value={evalForm.rom_angle_min}
                    onChange={(e) => setEvalForm({ ...evalForm, rom_angle_min: e.target.value })}
                    className="w-full accent-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Top Lockout Angle ({evalForm.rom_angle_max}°)
                  </label>
                  <input
                    type="range"
                    min="115"
                    max="180"
                    value={evalForm.rom_angle_max}
                    onChange={(e) => setEvalForm({ ...evalForm, rom_angle_max: e.target.value })}
                    className="w-full accent-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Left/Right Imbalance ({evalForm.left_right_diff_deg}°)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="35"
                    step="0.5"
                    value={evalForm.left_right_diff_deg}
                    onChange={(e) =>
                      setEvalForm({ ...evalForm, left_right_diff_deg: e.target.value })
                    }
                    className="w-full accent-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Form Drift ({Math.round(evalForm.posture_violation_ratio * 100)}%)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.02"
                    value={evalForm.posture_violation_ratio}
                    onChange={(e) =>
                      setEvalForm({ ...evalForm, posture_violation_ratio: e.target.value })
                    }
                    className="w-full accent-rose-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 text-xs transition cursor-pointer"
              >
                Save Performance Assessment
              </button>
            </form>
          </div>

          {/* Historical Performance Reports Bar Chart & Table */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" /> Progress &amp; Form History
            </h3>

            {reports.length > 0 ? (
              <>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[...reports].reverse()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="exercise" stroke="#94a3b8" fontSize={11} />
                      <YAxis domain={[50, 100]} stroke="#94a3b8" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                        }}
                      />
                      <Bar dataKey="rom_efficiency" name="Range of Motion %" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="posture_accuracy" name="Form %" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="overall_score" name="Overall Score" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Exercise</th>
                        <th className="py-2 px-3">Range of Motion</th>
                        <th className="py-2 px-3">ROM Score</th>
                        <th className="py-2 px-3">Balance</th>
                        <th className="py-2 px-3">Form</th>
                        <th className="py-2 px-3">Overall Score</th>
                        <th className="py-2 px-3">Coaching Summary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {reports.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 text-xs text-slate-400">{r.date}</td>
                          <td className="py-2 px-3 font-semibold text-white">{r.exercise}</td>
                          <td className="py-2 px-3 text-xs text-slate-300">
                            {r.rom_angle_min}° – {r.rom_angle_max}°
                          </td>
                          <td className="py-2 px-3 text-emerald-400 font-semibold">{r.rom_efficiency}%</td>
                          <td className="py-2 px-3 text-blue-400 font-semibold">{r.symmetry_score}%</td>
                          <td className="py-2 px-3 text-cyan-300 font-semibold">{r.posture_accuracy}%</td>
                          <td className="py-2 px-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-extrabold text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" /> {r.overall_score}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-xs text-slate-300">{r.feedback_summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-8 text-center text-sm text-slate-400">
                No performance reports recorded yet. Log a workout in the Workouts tab or save an
                assessment above to start tracking your progress.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
