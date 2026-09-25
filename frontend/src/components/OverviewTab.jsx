import React from 'react';
import {
  Activity,
  Flame,
  Dumbbell,
  Award,
  CalendarCheck,
  Utensils,
  Cpu,
  MessageSquareHeart,
  Gauge,
  MapPin,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export default function OverviewTab({ overview, onNavigate }) {
  if (!overview) {
    return (
      <div className="p-8 text-center text-slate-400">
        Loading AI Fitness Command Center telemetry...
      </div>
    );
  }

  const { kpis, recent_workouts = [], performance_trend = [], user } = overview;

  const statCards = [
    {
      label: 'Total Workouts',
      value: kpis.total_workouts,
      sub: `${kpis.total_reps} Total Reps Tracked`,
      icon: Dumbbell,
      color: 'from-emerald-500/20 to-teal-500/5 border-emerald-500/30 text-emerald-400',
    },
    {
      label: 'Calories Burned (Est.)',
      value: `${kpis.total_calories_burned} kcal`,
      sub: `Today Intake: ${kpis.calories_consumed_today} kcal`,
      icon: Flame,
      color: 'from-amber-500/20 to-orange-500/5 border-amber-500/30 text-amber-400',
    },
    {
      label: 'Pose Performance Score',
      value: `${kpis.avg_performance_score} / 100`,
      sub: 'Heuristic Biomechanics Avg',
      icon: Award,
      color: 'from-cyan-500/20 to-blue-500/5 border-cyan-500/30 text-cyan-400',
    },
    {
      label: 'Habit Streak & Consistency',
      value: `${kpis.current_streak_days} Days`,
      sub: `${kpis.habit_consistency_pct}% 14-Day Adherence`,
      icon: CalendarCheck,
      color: 'from-purple-500/20 to-indigo-500/5 border-purple-500/30 text-purple-400',
    },
  ];

  const moduleCards = [
    {
      id: 'trainer',
      badge: 'Module 1',
      title: 'AI Gym Trainer (Vision)',
      desc: 'OpenCV + MediaPipe 33-landmark pose estimation for Bicep Curls, Squats, Pushups, Lunges & Shoulder Press.',
      icon: Dumbbell,
      accent: 'text-emerald-400 border-emerald-500/30 hover:border-emerald-400',
    },
    {
      id: 'diet',
      badge: 'Module 2',
      title: 'AI Dietician & Calorie Coach',
      desc: 'Mifflin-St Jeor BMR/TDEE, Veg & Non-Veg meal generator, macro breakdown & grocery list.',
      icon: Utensils,
      accent: 'text-amber-400 border-amber-500/30 hover:border-amber-400',
    },
    {
      id: 'iot',
      badge: 'Module 3',
      title: 'Smart Gym Assistant (IoT)',
      desc: 'MQTT broker + ESP32 simulated equipment telemetry, HR zone tracking & AI rest/load coach.',
      icon: Cpu,
      accent: 'text-cyan-400 border-cyan-500/30 hover:border-cyan-400',
    },
    {
      id: 'habits',
      badge: 'Module 4',
      title: 'AI Fitness Habit Tracker',
      desc: 'Scikit-learn RandomForest adherence predictor, workout streaks, reminders & adaptive scheduling.',
      icon: CalendarCheck,
      accent: 'text-purple-400 border-purple-500/30 hover:border-purple-400',
    },
    {
      id: 'buddy',
      badge: 'Module 5',
      title: 'Virtual Gym Buddy Chatbot',
      desc: 'Sentiment-aware conversational coach powered by Google Gemini LLM + offline exercise-science knowledge engine.',
      icon: MessageSquareHeart,
      accent: 'text-pink-400 border-pink-500/30 hover:border-pink-400',
    },
    {
      id: 'performance',
      badge: 'Module 6',
      title: 'Pose-to-Performance Analyzer',
      desc: 'Range-of-Motion efficiency, bilateral symmetry, rep tempo & posture scoring (0-100).',
      icon: Gauge,
      accent: 'text-blue-400 border-blue-500/30 hover:border-blue-400',
    },
    {
      id: 'planner',
      badge: 'Module 7',
      title: 'Gym Recommender & Planner',
      desc: 'Custom 7-day split builder, exercise catalog, fitness challenges & nearby gym finder.',
      icon: MapPin,
      accent: 'text-teal-400 border-teal-500/30 hover:border-teal-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/60 p-6 shadow-xl">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-300 mb-2">
              <Sparkles className="w-3.5 h-3.5" /> AI GYM &amp; FITNESS ASSISTANT — ALL 7 AI MODULES ACTIVE
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome back, {user?.name || 'Athlete'}
            </h1>
            <p className="mt-1 text-sm text-slate-300 max-w-2xl">
              Goal: <span className="font-semibold text-emerald-400">{user?.profile?.fitness_goal}</span> •
              Diet: <span className="font-semibold text-amber-400">{user?.profile?.dietary_preference}</span> •
              BMI: <span className="font-semibold text-cyan-400">{kpis.current_bmi} ({kpis.bmi_category})</span> •
              Daily Target: <span className="font-semibold text-white">{user?.profile?.daily_calorie_target} kcal</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate('trainer')}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 text-sm transition cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              <Dumbbell className="w-4 h-4" /> Launch AI Pose Trainer
            </button>
            <button
              onClick={() => onNavigate('buddy')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-100 font-semibold px-4 py-2.5 text-sm transition cursor-pointer"
            >
              <MessageSquareHeart className="w-4 h-4 text-pink-400" /> Ask Virtual Gym Buddy
            </button>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              className={`rounded-2xl border bg-gradient-to-br p-5 shadow-lg ${card.color}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  {card.label}
                </span>
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-3 text-2xl font-extrabold text-white">{card.value}</div>
              <div className="mt-1 text-xs text-slate-400">{card.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" /> Pose-to-Performance &amp; Form Trend
              </h3>
              <p className="text-xs text-slate-400">
                Heuristic 0–100 score across recent computer-vision sessions
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performance_trend}>
                <defs>
                  <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis domain={[50, 100]} stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    color: '#f8fafc',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="performance_score"
                  name="Overall Score"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#perfGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="form_score"
                  name="Posture Score"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fillOpacity={0}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" /> Repetitions &amp; Estimated Calories per Session
              </h3>
              <p className="text-xs text-slate-400">
                Tracked repetitions and metabolic energy expenditure estimates
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performance_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    color: '#f8fafc',
                  }}
                />
                <Bar dataKey="reps" name="Total Reps" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="calories" name="Est. kcal" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 7 Core AI Modules Quick Launcher */}
      <div>
        <h2 className="text-lg font-bold text-white mb-3">7 Integrated AI Modules</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {moduleCards.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => onNavigate(m.id)}
                className={`group text-left rounded-2xl border bg-slate-900/75 p-5 transition hover:bg-slate-900 cursor-pointer flex flex-col justify-between ${m.accent}`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300">
                      {m.badge}
                    </span>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 text-base font-bold text-white group-hover:text-emerald-300 transition">
                    {m.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{m.desc}</p>
                </div>
                <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 group-hover:translate-x-1 transition">
                  Open Module <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Workouts Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">Recent AI Trainer Sessions</h3>
          <button
            onClick={() => onNavigate('trainer')}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
          >
            View Live Trainer →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Exercise</th>
                <th className="py-2.5 px-3">Total Reps</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">Calories (Est.)</th>
                <th className="py-2.5 px-3">Pose Score</th>
                <th className="py-2.5 px-3">AI Posture Feedback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {recent_workouts.map((w) => (
                <tr key={w.id} className="hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 text-xs text-slate-400">{w.date}</td>
                  <td className="py-2.5 px-3 font-semibold text-white">{w.exercise}</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-bold">{w.total_reps}</td>
                  <td className="py-2.5 px-3 text-slate-300">{w.duration_sec}s</td>
                  <td className="py-2.5 px-3 text-amber-400">{w.calories_burned} kcal</td>
                  <td className="py-2.5 px-3">
                    <span className="rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-0.5 text-xs font-bold text-cyan-300">
                      {w.performance_score} / 100
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-300">{w.posture_notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
