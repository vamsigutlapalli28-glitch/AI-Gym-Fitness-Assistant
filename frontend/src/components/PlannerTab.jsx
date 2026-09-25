import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Calendar,
  Dumbbell,
  Trophy,
  Search,
  Sparkles,
  Navigation,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch } from '../api';

const FACILITY_OPTIONS = [
  {
    value: 'All',
    label: 'All Facilities',
    description: 'All nearby gyms, fitness centers, and strength clubs',
  },
  {
    value: 'Free Weights',
    label: 'Free Weights',
    description: 'Dumbbells, barbells, squat racks, and bench press stations',
  },
  {
    value: 'Olympic Lifting',
    label: 'Olympic Lifting',
    description: 'Lifting platforms, bumper plates, powerlifting, and CrossFit',
  },
  {
    value: 'Cardio Zone',
    label: 'Cardio Zone',
    description: 'Treadmills, rowers, spin bikes, ellipticals, and HIIT zones',
  },
  {
    value: 'Recovery & Sauna',
    label: 'Recovery & Sauna',
    description: 'Sauna, steam room, mobility, and recovery amenities',
  },
  {
    value: 'Smart IoT Equipment',
    label: 'Smart IoT Equipment',
    description: 'Connected strength machines and digital fitness tracking',
  },
];

export function buildGymSearchQuery(rawInput, facilityFilter = 'All') {
  const trimmed = (rawInput || '').trim();
  const fac = (facilityFilter || 'All').trim();
  const hasFacility = Boolean(fac) && fac !== 'All';

  if (!trimmed) {
    return hasFacility ? `${fac} gyms near me` : 'gyms near me';
  }

  const lower = trimmed.toLowerCase();
  const containsGymKeyword = lower.includes('gym') || lower.includes('fitness');

  if (containsGymKeyword) {
    if (hasFacility && !lower.includes(fac.toLowerCase())) {
      return `${trimmed} ${fac}`;
    }
    return trimmed;
  }

  if (hasFacility) {
    return `${fac} gyms in ${trimmed}`;
  }
  return `gyms in ${trimmed}`;
}

export function buildGoogleMapsSearchUrl(searchText) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchText)}`;
}

export function buildGoogleMapsDirectionsUrl(destinationText) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationText)}`;
}

export function openInGoogleMapsTab(url) {
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (win) {
      win.opener = null;
    }
  }
}

export default function PlannerTab({ user }) {
  const [planData, setPlanData] = useState(null);
  const [genForm, setGenForm] = useState({
    goal: user?.profile?.fitness_goal || 'Muscle Gain',
    experience_level: user?.profile?.experience_level || 'Intermediate',
    equipment: 'Full Gym',
    days_per_week: user?.profile?.workout_days_per_week || 5,
  });

  const defaultCity = user?.profile?.city || 'Vijayawada';
  const [locationInput, setLocationInput] = useState(`gyms in ${defaultCity}`);
  const [facilityFilter, setFacilityFilter] = useState('All');
  const [recentSearches, setRecentSearches] = useState([
    {
      label: `gyms in ${defaultCity}`,
      facility: 'All',
      searchText: buildGymSearchQuery(`gyms in ${defaultCity}`, 'All'),
    },
  ]);

  const [exerciseSearch, setExerciseSearch] = useState('');
  const [joinedChallenges, setJoinedChallenges] = useState({ chal_posture_14: true });
  const [statusMsg, setStatusMsg] = useState('');
  const [aiSplitGuidance, setAiSplitGuidance] = useState(null);
  const [loadingGeminiPlan, setLoadingGeminiPlan] = useState(false);

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const p = await apiFetch('/api/planner/current');
        setPlanData(p);
      } catch {
        // ignore
      }
    };
    loadInitial();
  }, []);

  const currentSearchText = buildGymSearchQuery(locationInput, facilityFilter);
  const currentSearchUrl = buildGoogleMapsSearchUrl(currentSearchText);
  const currentDirectionsText = (locationInput || '').trim() || currentSearchText;
  const currentDirectionsUrl = buildGoogleMapsDirectionsUrl(currentDirectionsText);

  const recordRecentSearch = (searchText, fac) => {
    setRecentSearches((prev) => {
      const filtered = prev.filter(
        (item) => item.searchText.toLowerCase() !== searchText.toLowerCase()
      );
      return [
        {
          label: (locationInput || '').trim() || searchText,
          facility: fac,
          searchText,
        },
        ...filtered,
      ].slice(0, 6);
    });
  };

  const handleSearchNearbyGyms = (e) => {
    if (e) e.preventDefault();
    const searchText = buildGymSearchQuery(locationInput, facilityFilter);
    const searchUrl = buildGoogleMapsSearchUrl(searchText);
    recordRecentSearch(searchText, facilityFilter);
    openInGoogleMapsTab(searchUrl);
  };

  const handleOpenInGoogleMaps = (customSearchText, customFacility = facilityFilter) => {
    const searchText = customSearchText || buildGymSearchQuery(locationInput, customFacility);
    const searchUrl = buildGoogleMapsSearchUrl(searchText);
    recordRecentSearch(searchText, customFacility);
    openInGoogleMapsTab(searchUrl);
  };

  const handleGetDirections = (customDestinationText) => {
    const dest =
      (customDestinationText || '').trim() ||
      (locationInput || '').trim() ||
      buildGymSearchQuery(locationInput, facilityFilter);
    const directionsUrl = buildGoogleMapsDirectionsUrl(dest);
    openInGoogleMapsTab(directionsUrl);
  };

  const handleGenerateSplit = async (e) => {
    e.preventDefault();
    try {
      const newPlan = await apiFetch('/api/planner/generate', {
        method: 'POST',
        body: JSON.stringify({
          ...genForm,
          days_per_week: Number(genForm.days_per_week),
        }),
      });
      setPlanData((prev) => ({ ...(prev || {}), plan: newPlan }));
      if (newPlan.ai_guidance) {
        setAiSplitGuidance(newPlan.ai_guidance);
      }
      setStatusMsg(
        `Generated new 7-day ${newPlan.title} (${newPlan.days_per_week} training days/week)!`
      );
    } catch (err) {
      setStatusMsg(err.message);
    }
  };

  const handleAskGeminiSplitCoach = async () => {
    setLoadingGeminiPlan(true);
    try {
      const res = await apiFetch('/api/planner/gemini-plan', {
        method: 'POST',
        body: JSON.stringify({
          ...genForm,
          days_per_week: Number(genForm.days_per_week),
        }),
      });
      setAiSplitGuidance(res.ai_guidance);
      if (res.plan) {
        setPlanData((prev) => ({ ...(prev || {}), plan: res.plan }));
      }
      setStatusMsg(
        `Received personalized workout plan strategy from ${res.ai_guidance?.provider || 'Gemini'}!`
      );
    } catch (err) {
      setStatusMsg(err.message);
    } finally {
      setLoadingGeminiPlan(false);
    }
  };

  const activePlan = planData?.plan || {};
  const catalog = planData?.exercise_catalog || [];
  const challenges = Array.isArray(planData?.challenges) ? planData.challenges : [];

  const flattenedExercises = React.useMemo(() => {
    if (Array.isArray(catalog)) {
      return catalog.map((item) => ({
        ...item,
        group: item.muscle || item.group || 'Full Body',
      }));
    }
    if (catalog && typeof catalog === 'object') {
      return Object.entries(catalog).flatMap(([group, items]) =>
        (Array.isArray(items) ? items : []).map((item) => ({ ...item, group }))
      );
    }
    return [];
  }, [catalog]);

  const filteredExercises = flattenedExercises.filter(
    (ex) =>
      !exerciseSearch.trim() ||
      (ex.name || '').toLowerCase().includes(exerciseSearch.toLowerCase()) ||
      (ex.group || '').toLowerCase().includes(exerciseSearch.toLowerCase()) ||
      (ex.equipment || '').toLowerCase().includes(exerciseSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
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

      {aiSplitGuidance && (
        <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/40 p-4 shadow-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Gemini Personalized Split Strategy ({aiSplitGuidance.provider})
            </span>
            <button
              onClick={() => setAiSplitGuidance(null)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
          {aiSplitGuidance.gemini_error && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200">
              {aiSplitGuidance.gemini_error}
            </div>
          )}
          <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed">
            {aiSplitGuidance.ai_program_notes || aiSplitGuidance.answer}
          </p>
        </div>
      )}

      {/* Custom 7-Day Workout Split Generator */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-400">
              Personalized Split &amp; Gym Recommender
            </span>
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2 mt-0.5">
              <Calendar className="w-5 h-5 text-teal-400" /> {activePlan.title || '7-Day AI Workout Split'}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAskGeminiSplitCoach}
              disabled={loadingGeminiPlan}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-3.5 py-1.5 text-xs cursor-pointer shadow-md"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {loadingGeminiPlan ? 'Consulting Gemini...' : 'Ask Gemini Split Coach'}
            </button>
            <span className="rounded-full bg-teal-500/15 border border-teal-500/30 px-3 py-1 text-xs font-bold text-teal-300">
              {activePlan.experience_level} • {activePlan.equipment} • {activePlan.days_per_week} Days/Wk
            </span>
          </div>
        </div>

        <form onSubmit={handleGenerateSplit} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Fitness Goal</label>
            <select
              value={genForm.goal}
              onChange={(e) => setGenForm({ ...genForm, goal: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            >
              <option>Muscle Gain</option>
              <option>Weight Loss</option>
              <option>Strength &amp; Conditioning</option>
              <option>Endurance &amp; Toning</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Experience Level</label>
            <select
              value={genForm.experience_level}
              onChange={(e) => setGenForm({ ...genForm, experience_level: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            >
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Advanced</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Available Equipment</label>
            <select
              value={genForm.equipment}
              onChange={(e) => setGenForm({ ...genForm, equipment: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            >
              <option>Full Gym</option>
              <option>Dumbbells Only</option>
              <option>Bodyweight / Home</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Training Days / Week</label>
            <select
              value={genForm.days_per_week}
              onChange={(e) => setGenForm({ ...genForm, days_per_week: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            >
              <option value={3}>3 Days / Week</option>
              <option value={4}>4 Days / Week</option>
              <option value={5}>5 Days / Week</option>
              <option value={6}>6 Days / Week</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold py-2 text-xs transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Generate 7-Day Split
            </button>
          </div>
        </form>

        {/* 7-Day Cards */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 pt-2">
          {(Array.isArray(activePlan.schedule) ? activePlan.schedule : []).map((dayObj, idx) => (
            <div
              key={idx}
              className={`rounded-xl border p-4 flex flex-col justify-between ${
                dayObj.is_rest_day
                  ? 'border-slate-800/80 bg-slate-950/40'
                  : 'border-slate-800 bg-slate-950/90'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase text-teal-400">
                    {dayObj.day}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {dayObj.duration_min} min • {dayObj.est_calories || 300} kcal
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white mt-1">{dayObj.focus}</h4>
                <ul className="mt-2.5 space-y-1.5 text-xs text-slate-300">
                  {(Array.isArray(dayObj.exercises) ? dayObj.exercises : []).map((ex, i) => {
                    if (typeof ex === 'string') {
                      return (
                        <li key={i} className="leading-snug">
                          • {ex}
                        </li>
                      );
                    }
                    return (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span className="truncate">• {ex.name}</span>
                        <span className="font-mono text-[11px] text-emerald-400 shrink-0">
                          {ex.sets}×{ex.reps}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gamified Fitness Challenges + Exercise Catalog */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" /> Active Fitness Challenges
          </h3>
          <div className="space-y-3">
            {challenges.map((c) => {
              const joined = !!joinedChallenges[c.id];
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                        {c.goal || c.difficulty || 'All Levels'} • {c.duration_days} Days •{' '}
                        {c.reward_badge || `${c.reward_points || 500} XP`}
                      </span>
                      <h4 className="text-sm font-bold text-white">{c.title}</h4>
                    </div>
                    <button
                      onClick={() =>
                        setJoinedChallenges((p) => ({ ...p, [c.id]: !joined }))
                      }
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer ${
                        joined
                          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                          : 'bg-amber-500 text-slate-950'
                      }`}
                    >
                      {joined ? 'Enrolled' : 'Join'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">{c.target_metric || c.target}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Exercise Library */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-emerald-400" /> AI Exercise Recommendation Library
            </h3>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={exerciseSearch}
                onChange={(e) => setExerciseSearch(e.target.value)}
                placeholder="Filter muscle or equipment..."
                className="rounded-xl border border-slate-700 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
            {filteredExercises.map((ex, i) => (
              <div
                key={ex.id || i}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex items-center justify-between gap-2"
              >
                <div>
                  <div className="text-xs font-bold text-white">{ex.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {String(ex.group || ex.muscle || '').replace(/_/g, ' ')} • {ex.equipment}
                  </div>
                </div>
                <span className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-mono text-emerald-300 shrink-0">
                  {ex.sets_reps || `${ex.sets || 3}×${ex.reps || 10}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Direct Google Maps Gym Recommender */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Google Maps Gym Recommender
            </span>
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2 mt-0.5">
              <MapPin className="w-5 h-5 text-emerald-400" /> Nearby Gym &amp; Fitness Center Search
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter a city, neighborhood, or gym name to open live search results or turn-by-turn directions directly in Google Maps.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={currentSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                handleOpenInGoogleMaps(currentSearchText, facilityFilter);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-3.5 py-2 text-xs font-bold text-emerald-300 transition cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open in Google Maps
            </a>
            <a
              href={currentDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                handleGetDirections(currentDirectionsText);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 px-3.5 py-2 text-xs font-bold text-cyan-300 transition cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5" /> Get Directions
            </a>
          </div>
        </div>

        {/* Search Input, Facility Filter & Search Nearby Gyms Button */}
        <form onSubmit={handleSearchNearbyGyms} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-5">
            <label className="block text-xs text-slate-400 mb-1">
              City, Neighborhood, or Gym Name
            </label>
            <input
              type="text"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              placeholder="e.g., gyms in Vijayawada, Indiranagar Bengaluru..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block text-xs text-slate-400 mb-1">
              Facility Filter
            </label>
            <select
              value={facilityFilter}
              onChange={(e) => setFacilityFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              {FACILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3 flex items-end">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 text-xs transition cursor-pointer shadow-md"
            >
              <Search className="w-3.5 h-3.5" /> Search Nearby Gyms
            </button>
          </div>
        </form>

        {/* Active Search Query Action Bar */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                Active Google Maps Query
              </span>
              <span className="rounded-md bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 text-[10px] font-bold text-teal-300">
                Facility: {facilityFilter}
              </span>
            </div>
            <div className="text-sm font-bold text-white">{currentSearchText}</div>
            <div className="text-[11px] font-mono text-slate-400 break-all">
              {currentSearchUrl}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenInGoogleMaps(currentSearchText, facilityFilter)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3.5 py-2 text-xs transition cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open in Google Maps
            </button>
            <button
              type="button"
              onClick={() => handleGetDirections(currentDirectionsText)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 font-bold px-3.5 py-2 text-xs transition cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5" /> Get Directions
            </button>
          </div>
        </div>

        {/* Facility Filter Quick-Launch Cards */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Search by Facility Filter in Google Maps
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {FACILITY_OPTIONS.filter((f) => f.value !== 'All').map((fac) => {
              const facQuery = buildGymSearchQuery(locationInput, fac.value);
              const isSelected = facilityFilter === fac.value;
              return (
                <div
                  key={fac.value}
                  className={`rounded-xl border p-4 flex flex-col justify-between gap-3 transition ${
                    isSelected
                      ? 'border-emerald-500/60 bg-slate-900 shadow-lg shadow-emerald-500/5'
                      : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        {fac.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFacilityFilter(fac.value)}
                        className="text-[10px] font-semibold text-teal-400 hover:text-teal-300 cursor-pointer"
                      >
                        {isSelected ? 'Selected' : 'Apply Filter'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">{fac.description}</p>
                    <div className="text-[11px] text-emerald-300 font-medium pt-0.5">
                      Query: &ldquo;{facQuery}&rdquo;
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFacilityFilter(fac.value);
                        handleOpenInGoogleMaps(facQuery, fac.value);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-300 transition cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open in Google Maps
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGetDirections(facQuery)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 px-3 py-1.5 text-xs font-bold text-cyan-300 transition cursor-pointer"
                    >
                      <Navigation className="w-3.5 h-3.5" /> Get Directions
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Searches */}
        {recentSearches.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Recent Gym &amp; Location Searches
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {recentSearches.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-800 bg-slate-950/75 p-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-bold text-white">{item.searchText}</div>
                    <div className="text-[11px] text-slate-400">
                      Facility Filter: {item.facility}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenInGoogleMaps(item.searchText, item.facility)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold text-emerald-300 transition cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" /> Open in Google Maps
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGetDirections(item.searchText)}
                      className="inline-flex items-center gap-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 px-2.5 py-1 text-[11px] font-bold text-cyan-300 transition cursor-pointer"
                    >
                      <Navigation className="w-3 h-3" /> Get Directions
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
