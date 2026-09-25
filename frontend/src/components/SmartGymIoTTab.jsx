import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Wifi,
  HeartPulse,
  Gauge,
  RefreshCw,
  Sliders,
  Timer,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { apiFetch } from '../api';

export default function SmartGymIoTTab() {
  const [iotState, setIotState] = useState(null);
  const [busyId, setBusyId] = useState('');

  const fetchIoT = async () => {
    try {
      const data = await apiFetch('/api/iot/status');
      setIotState(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchIoT();
    const interval = setInterval(fetchIoT, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateDevice = async (device_id, patch) => {
    setBusyId(device_id);
    try {
      const res = await apiFetch('/api/iot/device/control', {
        method: 'POST',
        body: JSON.stringify({ device_id, ...patch }),
      });
      setIotState(res.iot_state);
    } catch {
      // ignore
    } finally {
      setBusyId('');
    }
  };

  if (!iotState) {
    return (
      <div className="p-8 text-center text-slate-400">
        Loading Smart Gym Equipment &amp; Recovery Pacing...
      </div>
    );
  }

  const {
    devices = [],
    ai_recommendation = {},
    telemetry_stream = [],
  } = iotState;

  return (
    <div className="space-y-6">
      {/* Top Row: Equipment Pacing + AI Load & Rest Coach */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                Smart Gym Equipment
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                <Wifi className="w-3 h-3" /> Active
              </span>
            </div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mt-1">
              <Cpu className="w-5 h-5 text-cyan-400" /> Load &amp; Heart-Rate Pacing
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Adjust your working resistance and heart-rate zone below to receive real-time rest
              intervals and progressive load targets.
            </p>
          </div>
          <button
            onClick={fetchIoT}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-3.5 py-2.5 text-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Pacing Metrics
          </button>
        </div>

        <div className="lg:col-span-7 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                AI Equipment &amp; Recovery Coach
              </span>
              <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3 py-0.5 text-xs font-bold text-emerald-300">
                {ai_recommendation.intensity_classification}
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold text-white leading-relaxed">
              {ai_recommendation.ai_coaching_note}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <Timer className="w-3.5 h-3.5 text-emerald-400" /> Recommended Rest
              </div>
              <div className="text-xl font-extrabold text-emerald-400 mt-0.5">
                {ai_recommendation.recommended_rest_seconds} sec
              </div>
            </div>
            <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" /> Next Set Load Delta
              </div>
              <div className="text-xl font-extrabold text-cyan-300 mt-0.5">
                {ai_recommendation.recommended_resistance_delta_kg >= 0
                  ? `+${ai_recommendation.recommended_resistance_delta_kg}`
                  : ai_recommendation.recommended_resistance_delta_kg}{' '}
                kg
              </div>
            </div>
            <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 col-span-2 sm:col-span-1">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <HeartPulse className="w-3.5 h-3.5 text-rose-400" /> Effort Zone
              </div>
              <div className="text-sm font-extrabold text-white mt-1 uppercase">
                {(ai_recommendation.status || 'steady').replace(/_/g, ' ')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Smart Gym Equipment Grid */}
      <div>
        <h3 className="text-base font-bold text-white mb-3">
          Equipment Stations
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {devices.map((dev) => (
            <div
              key={dev.device_id}
              className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
                    {dev.device_type}
                  </span>
                  <h4 className="text-base font-bold text-white">{dev.name}</h4>
                </div>
                <button
                  onClick={() =>
                    handleUpdateDevice(dev.device_id, { is_connected: !dev.is_connected })
                  }
                  disabled={busyId === dev.device_id}
                  className={`rounded-lg px-3 py-1 text-xs font-bold cursor-pointer transition ${
                    dev.is_connected
                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-800 border border-slate-700 text-slate-400'
                  }`}
                >
                  {dev.is_connected ? 'Active' : 'Standby'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Working Load</div>
                  <div className="text-base font-extrabold text-white">{dev.resistance_kg} kg</div>
                </div>
                <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Heart Rate</div>
                  <div className="text-base font-extrabold text-rose-400">
                    {dev.heart_rate_bpm} BPM
                  </div>
                </div>
                <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Rep Pace</div>
                  <div className="text-base font-extrabold text-cyan-300">
                    {dev.rep_velocity_ms} m/s
                  </div>
                </div>
              </div>

              {/* Interactive Sliders */}
              <div className="space-y-2.5 pt-1">
                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Working Resistance (kg)</span>
                    <span className="font-bold text-emerald-400">{dev.resistance_kg} kg</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="2.5"
                    value={dev.resistance_kg || 0}
                    onChange={(e) =>
                      handleUpdateDevice(dev.device_id, {
                        resistance_kg: Number(e.target.value),
                      })
                    }
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Heart Rate (BPM)</span>
                    <span className="font-bold text-rose-400">{dev.heart_rate_bpm} BPM</span>
                  </div>
                  <input
                    type="range"
                    min="65"
                    max="190"
                    step="2"
                    value={dev.heart_rate_bpm || 120}
                    onChange={(e) =>
                      handleUpdateDevice(dev.device_id, {
                        heart_rate_bpm: Number(e.target.value),
                      })
                    }
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Heart Rate & Load Trend Chart */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
        <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-cyan-400" /> Heart Rate &amp; Load Trend
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Tracks how your heart rate responds to resistance adjustments across sets
        </p>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={telemetry_stream}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.75rem',
                }}
              />
              <Line
                type="monotone"
                dataKey="heart_rate_bpm"
                name="Heart Rate (BPM)"
                stroke="#f43f5e"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="resistance_kg"
                name="Resistance (kg)"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
