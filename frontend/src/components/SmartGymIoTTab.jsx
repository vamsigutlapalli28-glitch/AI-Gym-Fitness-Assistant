import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Wifi,
  HeartPulse,
  Gauge,
  RefreshCw,
  Sliders,
  Terminal,
  ShieldAlert,
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
    return <div className="p-8 text-center text-slate-400">Connecting to Smart Gym IoT Telemetry Engine...</div>;
  }

  const {
    simulation_mode,
    simulation_banner,
    mqtt_broker,
    devices = [],
    ai_recommendation = {},
    telemetry_stream = [],
    esp32_integration_spec = {},
  } = iotState;

  return (
    <div className="space-y-6">
      {/* Simulation Mode Banner */}
      <div className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-cyan-300">
              {simulation_mode ? 'SIMULATION MODE ACTIVE (SOFTWARE EMULATION)' : 'LIVE MQTT HARDWARE CONNECTED'}
            </div>
            <p className="text-xs text-cyan-100 mt-0.5">{simulation_banner}</p>
          </div>
        </div>
        <button
          onClick={fetchIoT}
          className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-3.5 py-2 text-xs shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Poll Telemetry Step
        </button>
      </div>

      {/* Top Row: MQTT Broker Status + AI Load & Rest Coach */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
              Module 3 • IoT Broker Interface
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-bold text-amber-300">
              <Wifi className="w-3 h-3" /> {mqtt_broker?.connected ? 'Broker Online' : 'Simulated Broker'}
            </span>
          </div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" /> MQTT Equipment Gateway
          </h3>
          <div className="grid grid-cols-2 gap-2.5 text-xs pt-1">
            <div className="rounded-xl bg-slate-950 p-3 border border-slate-800">
              <div className="text-slate-400">Broker Endpoint</div>
              <div className="font-mono font-bold text-white mt-0.5">
                {mqtt_broker?.host}:{mqtt_broker?.port}
              </div>
            </div>
            <div className="rounded-xl bg-slate-950 p-3 border border-slate-800">
              <div className="text-slate-400">Topic Prefix</div>
              <div className="font-mono font-bold text-cyan-300 mt-0.5">
                {mqtt_broker?.topic_prefix}/#
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Protocol: {mqtt_broker?.protocol}. Supports bidirectional ESP32 telemetry ingestion and digital resistance control payloads.
          </p>
        </div>

        <div className="lg:col-span-7 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Real-Time AI Equipment &amp; Recovery Coach
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
                <HeartPulse className="w-3.5 h-3.5 text-rose-400" /> Physiological State
              </div>
              <div className="text-sm font-extrabold text-white mt-1 uppercase">
                {(ai_recommendation.status || 'steady').replace(/_/g, ' ')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connected / Simulated Smart Gym Equipment Grid */}
      <div>
        <h3 className="text-base font-bold text-white mb-3">
          Smart Gym Equipment Nodes (Interactive Simulation Controls)
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {devices.map((dev) => (
            <div
              key={dev.device_id}
              className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-[11px] text-cyan-400">{dev.mqtt_topic}</span>
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
                  {dev.is_connected ? 'Simulated Active' : 'Disconnected'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Resistance</div>
                  <div className="text-base font-extrabold text-white">{dev.resistance_kg} kg</div>
                </div>
                <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Heart Rate</div>
                  <div className="text-base font-extrabold text-rose-400">
                    {dev.heart_rate_bpm} BPM
                  </div>
                </div>
                <div className="rounded-xl bg-slate-950 p-2.5 border border-slate-800">
                  <div className="text-[11px] text-slate-400">Rep Velocity</div>
                  <div className="text-base font-extrabold text-cyan-300">
                    {dev.rep_velocity_ms} m/s
                  </div>
                </div>
              </div>

              {/* Interactive Sliders */}
              <div className="space-y-2.5 pt-1">
                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Digital Resistance / Load (kg)</span>
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
                    <span>Simulated Athlete Heart Rate (BPM)</span>
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

      {/* Telemetry Stream Chart + ESP32 Specification */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
          <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-cyan-400" /> Live Telemetry Stream (Heart Rate vs Resistance)
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Real-time simulated MQTT packet stream updated as you adjust equipment controls
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

        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" /> ESP32 Hardware MQTT Interface Spec
          </h3>
          <p className="text-xs text-slate-400">
            Physical ESP32 nodes can connect to the configured MQTT broker and publish JSON frames to this topic structure:
          </p>
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-xs text-slate-300 space-y-1">
            <div>
              <span className="text-emerald-400">PUB:</span> {esp32_integration_spec.publish_topic_pattern}
            </div>
            <div>
              <span className="text-cyan-400">SUB:</span> {esp32_integration_spec.subscribe_topic_pattern}
            </div>
          </div>
          <pre className="rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-[11px] text-emerald-300 overflow-x-auto">
            {JSON.stringify(esp32_integration_spec.sample_esp32_payload, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
