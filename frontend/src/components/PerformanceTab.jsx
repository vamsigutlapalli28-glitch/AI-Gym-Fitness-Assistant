import React, { useState, useEffect } from 'react';
import {
  Gauge,
  Activity,
  Award,
  Sliders,
  Info,
  CheckCircle2,
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

export default function PerformanceTab() {
  const [data, setData] = useState(null);
  const [evalForm, setEvalForm] = useState({
    exercise: 'Bicep Curl',
    rom_angle_min: 38,
    rom_angle_max: 164,
    left_right_diff_deg: 4.5,
    posture_violation_ratio: 0.06,
    reps_completed: 12,
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
        `Evaluated ${res.exercise}: Overall Score ${res.overall_score}/100 (Grade ${res.grade})`
      );
      await loadReports();
    } catch (err) {
      setStatusMsg(err.message);
    }
  };

  if (!data) {
    return (
      <div className="p-8 text-center text-slate-400">
        Loading Pose-to-Performance Biomechanics Analyzer...
      </div>
    );
  }

  const { weekly_summary = {}, exercise_specs = {}, reports = [] } = data;
  const activeMetrics = customEval || reports[0] || {
    rom_efficiency: 89,
    posture_accuracy: 91,
    symmetry_score: 93,
    tempo_consistency: 88,
    overall_score: 90.4,
  };

  const radarData = [
    { metric: 'ROM Efficiency (35%)', score: activeMetrics.rom_efficiency || 88 },
    { metric: 'Posture Accuracy (30%)', score: activeMetrics.posture_accuracy || 90 },
    { metric: 'Bilateral Symmetry (20%)', score: activeMetrics.symmetry_score || 92 },
    { metric: 'Tempo Consistency (15%)', score: activeMetrics.tempo_consistency || 87 },
  ];

  return (
    <div className="space-y-6">
      {/* Heuristic Non-Clinical Disclaimer Banner */}
      <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-100 leading-relaxed">
          <span className="font-bold uppercase tracking-wider text-blue-300">
            Module 6 • Heuristic Biomechanics Disclaimer:{' '}
          </span>
          {weekly_summary.heuristic_disclaimer}
        </div>
      </div>

      {statusMsg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-200">
          {statusMsg}
        </div>
      )}

      {/* Weekly Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-emerald-400" /> Avg Overall Score
          </span>
          <div className="mt-1 text-2xl font-extrabold text-emerald-400">
            {weekly_summary.avg_overall_score} / 100
          </div>
          <div className="text-[11px] text-slate-400">
            {weekly_summary.sessions_evaluated} Sessions Evaluated
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <span className="text-xs text-slate-400">Avg ROM Efficiency</span>
          <div className="mt-1 text-2xl font-extrabold text-cyan-300">
            {weekly_summary.avg_rom_efficiency}%
          </div>
          <div className="text-[11px] text-slate-400">Joint Flexion / Extension</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <span className="text-xs text-slate-400">Avg Bilateral Symmetry</span>
          <div className="mt-1 text-2xl font-extrabold text-blue-400">
            {weekly_summary.avg_symmetry_score}%
          </div>
          <div className="text-[11px] text-slate-400">Left vs Right Balance</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <span className="text-xs text-slate-400">Avg Posture Alignment</span>
          <div className="mt-1 text-2xl font-extrabold text-purple-300">
            {weekly_summary.avg_posture_accuracy}%
          </div>
          <div className="text-[11px] text-slate-400">Spine &amp; Joint Stability</div>
        </div>
      </div>

      {/* Radar Chart + Interactive Biomechanics Evaluator */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" /> 4-Axis Biomechanical Radar Profile
            </h3>
            <p className="text-xs text-slate-400">
              Formula: 0.35×ROM + 0.30×Posture + 0.20×Symmetry + 0.15×Tempo
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="metric" stroke="#cbd5e1" fontSize={11} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#64748b" fontSize={10} />
                <Radar
                  name="Biomechanics"
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
          {customEval && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 space-y-1">
              <div className="font-bold">
                Evaluated {customEval.exercise}: {customEval.overall_score}/100 (Grade {customEval.grade})
              </div>
              <div>{customEval.feedback_summary}</div>
            </div>
          )}
        </div>

        {/* Interactive Pose-to-Performance Evaluator */}
        <form
          onSubmit={handleAnalyze}
          className="lg:col-span-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4"
        >
          <div>
            <span className="text-xs font-bold uppercase text-cyan-400">
              Interactive Biomechanical Simulator
            </span>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" /> Evaluate Custom Joint Telemetry
            </h3>
            <p className="text-xs text-slate-400">
              Test how Range-of-Motion angles, bilateral asymmetry, and posture faults affect the 0–100 score.
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
              <label className="block text-xs text-slate-300 mb-1">Reps Analyzed</label>
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
                Peak Contraction Angle ({evalForm.rom_angle_min}°)
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
                Peak Extension Angle ({evalForm.rom_angle_max}°)
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
                L/R Asymmetry ({evalForm.left_right_diff_deg}°)
              </label>
              <input
                type="range"
                min="0"
                max="35"
                step="0.5"
                value={evalForm.left_right_diff_deg}
                onChange={(e) => setEvalForm({ ...evalForm, left_right_diff_deg: e.target.value })}
                className="w-full accent-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Posture Violation Ratio ({Math.round(evalForm.posture_violation_ratio * 100)}%)
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
            Compute &amp; Save Pose-to-Performance Report
          </button>
        </form>
      </div>

      {/* Historical Performance Reports Bar Chart & Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" /> Session-by-Session Biomechanics Reports
        </h3>
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
              <Bar dataKey="rom_efficiency" name="ROM %" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="posture_accuracy" name="Posture %" fill="#06b6d4" radius={[4, 4, 0, 0]} />
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
                <th className="py-2 px-3">ROM Window</th>
                <th className="py-2 px-3">ROM Eff.</th>
                <th className="py-2 px-3">Symmetry</th>
                <th className="py-2 px-3">Posture</th>
                <th className="py-2 px-3">Overall Score</th>
                <th className="py-2 px-3">Biomechanical Summary</th>
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
      </div>
    </div>
  );
}
