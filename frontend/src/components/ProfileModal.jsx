import React, { useState } from 'react';
import { X, Save, LogOut, UserCheck } from 'lucide-react';
import { apiFetch } from '../api';

export default function ProfileModal({
  user,
  onClose,
  onUserUpdated,
  onLogout,
  inlineMode = false,
}) {
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    age: user?.age || 25,
    gender: user?.gender || 'Male',
    height_cm: user?.profile?.height_cm || 175,
    weight_kg: user?.profile?.weight_kg || 72,
    target_weight_kg: user?.profile?.target_weight_kg || 70,
    fitness_goal: user?.profile?.fitness_goal || 'Muscle Gain',
    experience_level: user?.profile?.experience_level || 'Intermediate',
    dietary_preference: user?.profile?.dietary_preference || 'Vegetarian',
    allergies: user?.profile?.allergies || '',
    activity_level: user?.profile?.activity_level || 'Moderately Active',
    daily_calorie_target: user?.profile?.daily_calorie_target || 2400,
    workout_days_per_week: user?.profile?.workout_days_per_week || 5,
    city: user?.profile?.city || 'Bengaluru',
  });

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    setSaving(true);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...profileForm,
          age: Number(profileForm.age),
          height_cm: Number(profileForm.height_cm),
          weight_kg: Number(profileForm.weight_kg),
          target_weight_kg: Number(profileForm.target_weight_kg),
          daily_calorie_target: Number(profileForm.daily_calorie_target),
          workout_days_per_week: Number(profileForm.workout_days_per_week),
        }),
      });
      setMsg('Profile and nutrition personalization settings saved!');
      if (onUserUpdated) onUserUpdated(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const cardContent = (
    <div
      className={
        inlineMode
          ? 'rounded-2xl border border-slate-800 bg-slate-900/85 p-6 shadow-xl space-y-5 max-w-3xl'
          : 'w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto'
      }
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white">
              Profile &amp; Personalization Settings
            </h3>
            <p className="text-xs text-slate-400">
              {user?.email} • Used to personalize your AI Dietician and workout plans
            </p>
          </div>
        </div>
        {!inlineMode && onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {msg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-200">
          {msg}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs font-semibold text-rose-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={profileForm.name}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">City</label>
            <input
              type="text"
              value={profileForm.city}
              onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Age</label>
            <input
              type="number"
              min="12"
              max="100"
              value={profileForm.age}
              onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Gender</label>
            <select
              value={profileForm.gender}
              onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Height (cm)</label>
            <input
              type="number"
              step="0.5"
              value={profileForm.height_cm}
              onChange={(e) => setProfileForm({ ...profileForm, height_cm: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Current Weight (kg)
            </label>
            <input
              type="number"
              step="0.5"
              value={profileForm.weight_kg}
              onChange={(e) => setProfileForm({ ...profileForm, weight_kg: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Target Weight (kg)
            </label>
            <input
              type="number"
              step="0.5"
              value={profileForm.target_weight_kg}
              onChange={(e) => setProfileForm({ ...profileForm, target_weight_kg: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Daily Calorie Target (kcal)
            </label>
            <input
              type="number"
              step="50"
              min="1000"
              max="6000"
              value={profileForm.daily_calorie_target}
              onChange={(e) =>
                setProfileForm({ ...profileForm, daily_calorie_target: e.target.value })
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Fitness Goal</label>
            <select
              value={profileForm.fitness_goal}
              onChange={(e) => setProfileForm({ ...profileForm, fitness_goal: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            >
              <option value="Muscle Gain">Muscle Gain</option>
              <option value="Weight Loss">Weight Loss</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Endurance">Endurance</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Dietary Preference
            </label>
            <select
              value={profileForm.dietary_preference}
              onChange={(e) =>
                setProfileForm({ ...profileForm, dietary_preference: e.target.value })
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            >
              <option value="Vegetarian">Vegetarian</option>
              <option value="Non-Vegetarian">Non-Vegetarian</option>
              <option value="Vegan">Vegan</option>
              <option value="Eggetarian">Eggetarian</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Activity Level
            </label>
            <select
              value={profileForm.activity_level}
              onChange={(e) => setProfileForm({ ...profileForm, activity_level: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            >
              <option value="Sedentary">Sedentary</option>
              <option value="Lightly Active">Lightly Active</option>
              <option value="Moderately Active">Moderately Active</option>
              <option value="Very Active">Very Active</option>
              <option value="Extra Active">Extra Active</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Workout Days per Week
            </label>
            <input
              type="number"
              min="1"
              max="7"
              value={profileForm.workout_days_per_week}
              onChange={(e) =>
                setProfileForm({ ...profileForm, workout_days_per_week: e.target.value })
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Food Allergies or Intolerances (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g., Peanuts, Lactose intolerance, Gluten (leave blank if none)"
              value={profileForm.allergies}
              onChange={(e) => setProfileForm({ ...profileForm, allergies: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 text-xs cursor-pointer"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Profile Settings'}
          </button>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-bold px-4 py-2.5 text-xs cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          )}
        </div>
      </form>
    </div>
  );

  if (inlineMode) {
    return cardContent;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      {cardContent}
    </div>
  );
}
