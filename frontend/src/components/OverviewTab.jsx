import React from 'react';
import {
  Activity,
  Flame,
  Dumbbell,
  Award,
  CalendarCheck,
  Utensils,
  MessageSquareHeart,
  Gauge,
  MapPin,
  UserCircle,
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
        Loading your fitness dashboard...
      </div>
    );
  }

  const { kpis, recent_workouts = [], performance_trend = [], user } = overview;

  const statCards = [
    {
      label: 'Total Workouts',
      value: kpis.total_workouts,
      sub:
        kpis.total_workouts > 0
          ? `${kpis.total_reps} Total Reps Logged`
          : 'Log your first session in Workouts',
      icon: Dumbbell,
      color: 'from-emerald-500/20 to-teal-500/5 border-emerald-500/30 text-emerald-400',
    },
    {
      label: 'Calories Burned (Est.)',
      value: `${kpis.total_calories_burned} kcal`,
      sub: `Today's Nutrition Intake: ${kpis.calories_consumed_today} kcal`,
      icon: Flame,
      color: 'from-amber-500/20 to-orange-500/5 border-amber-500/30 text-amber-400',
    },
    {
      label: 'Avg Form & Execution',
      value: kpis.total_workouts > 0 ? `${kpis.avg_performance_score} / 100` : '—',
      sub:
        kpis.total_workouts > 0
          ? 'Across recorded workouts'
          : 'No workouts recorded yet',
      icon: Award,
      color: 'from-cyan-500/20 to-blue-500/5 border-cyan-500/30 text-cyan-400',
    },
    {
      label: 'Workout Streak',
      value: `${kpis.current_streak_days} Days`,
      sub: `${kpis.habit_consistency_pct}% Consistency Rate`,
      icon: CalendarCheck,
      color: 'from-purple-500/20 to-indigo-500/5 border-purple-500/30 text-purple-400',
    },
  ];

  const featureCards = [
    {
      id: 'trainer',
      category: 'Training',
      title: 'Workouts & Training Log',
      desc: 'Log sets, reps, working weight, and duration, review exercise technique cues, and track volume.',
      icon: Dumbbell,
      accent: 'text-emerald-400 border-emerald-500/30 hover:border-emerald-400',
    },
    {
      id: 'diet',
      category: 'Nutrition',
      title: 'AI Dietician & Meal Planner',
      desc: 'Chat with your personalized AI Dietician for Indian & vegetarian meals, macro targets, food swaps, and daily logging.',
      icon: Utensils,
      accent: 'text-amber-400 border-amber-500/30 hover:border-amber-400',
    },
    {
      id: 'performance',
      category: 'Analytics',
      title: 'Progress & Habit Reports',
      desc: 'Monitor your form quality scores, range-of-motion improvements, daily workout streaks, and recovery readiness.',
      icon: Gauge,
      accent: 'text-blue-400 border-blue-500/30 hover:border-blue-400',
    },
    {
      id: 'planner',
      category: 'Planning',
      title: '7-Day Split & Gym Finder',
      desc: 'Generate a customized weekly training split and search nearby gyms directly in Google Maps.',
      icon: MapPin,
      accent: 'text-teal-400 border-teal-500/30 hover:border-teal-400',
    },
    {
      id: 'buddy',
      category: 'Coaching',
      title: 'Virtual Gym Buddy',
      desc: 'Ask questions about exercise execution, recovery strategies, plateau busting, and training motivation.',
      icon: MessageSquareHeart,
      accent: 'text-pink-400 border-pink-500/30 hover:border-pink-400',
    },
    {
      id: 'profile',
      category: 'Account',
      title: 'Profile & Fitness Goals',
      desc: 'Update your body metrics, target weight, dietary preferences, allergies, and daily calorie goals.',
      icon: UserCircle,
      accent: 'text-purple-400 border-purple-500/30 hover:border-purple-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/60 p-6 shadow-xl">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-300 mb-2">
              <Sparkles className="w-3.5 h-3.5" /> PERSONALIZED FITNESS &amp; NUTRITION HUB
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome back, {user?.name || 'Athlete'}
            </h1>
            <p className="mt-1 text-sm text-slate-300 max-w-2xl">
              Goal: <span className="font-semibold text-emerald-400">{user?.profile?.fitness_goal}</span> •{' '}
              Diet: <span className="font-semibold text-amber-400">{user?.profile?.dietary_preference}</span> •{' '}
              BMI: <span className="font-semibold text-cyan-400">{kpis.current_bmi} ({kpis.bmi_category})</span> •{' '}
              Daily Target: <span className="font-semibold text-white">{user?.profile?.daily_calorie_target} kcal</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate('trainer')}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 text-sm transition cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              <Dumbbell className="w-4 h-4" /> Log Workout
            </button>
            <button
              onClick={() => onNavigate('diet')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-100 font-semibold px-4 py-2.5 text-sm transition cursor-pointer"
            >
              <Utensils className="w-4 h-4 text-amber-400" /> Ask AI Dietician
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
                <Activity className="w-4 h-4 text-emerald-400" /> Form &amp; Execution Quality Trend
              </h3>
              <p className="text-xs text-slate-400">
                Session quality scores across your recent workouts
              </p>
            </div>
          </div>
          {performance_trend.length > 0 ? (
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
                    name="Form Rating"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fillOpacity={0}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center rounded-xl border border-slate-800/80 bg-slate-950/40 p-6 text-center text-xs text-slate-400">
              No workout trend data yet. Log your first workout to track your form and execution quality over time.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" /> Repetitions &amp; Estimated Calories per Session
              </h3>
              <p className="text-xs text-slate-400">
                Logged repetitions and estimated calorie burn per workout
              </p>
            </div>
          </div>
          {performance_trend.length > 0 ? (
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
          ) : (
            <div className="h-64 flex items-center justify-center rounded-xl border border-slate-800/80 bg-slate-950/40 p-6 text-center text-xs text-slate-400">
              No session volume recorded yet. Once you log workouts, your reps and calorie burn will appear here.
            </div>
          )}
        </div>
      </div>

      {/* Quick Navigation Grid */}
      <div>
        <h2 className="text-lg font-bold text-white mb-3">Quick Navigation</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featureCards.map((m) => {
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
                      {m.category}
                    </span>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 text-base font-bold text-white group-hover:text-emerald-300 transition">
                    {m.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{m.desc}</p>
                </div>
                <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 group-hover:translate-x-1 transition">
                  Open <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Workouts Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">Recent Workout Sessions</h3>
          <button
            onClick={() => onNavigate('trainer')}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
          >
            Go to Workouts →
          </button>
        </div>
        {recent_workouts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Exercise</th>
                  <th className="py-2.5 px-3">Total Reps</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Calories (Est.)</th>
                  <th className="py-2.5 px-3">Form Score</th>
                  <th className="py-2.5 px-3">Session Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recent_workouts.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 text-xs text-slate-400">{w.date}</td>
                    <td className="py-2.5 px-3 font-semibold text-white">{w.exercise}</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold">{w.total_reps}</td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {Math.max(1, Math.round((w.duration_sec || 60) / 60))} min
                    </td>
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
        ) : (
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-6 text-center text-xs text-slate-400">
            No workouts logged yet. Click &ldquo;Log Workout&rdquo; above to record your first training session.
          </div>
        )}
      </div>
    </div>
  );
}
