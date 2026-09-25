import React, { useState } from 'react';
import { X, Save, LogOut, UserCheck } from 'lucide-react';
import { apiFetch } from '../api';

export default function ProfileModal({ user, onClose, onUserUpdated, onLogout }) {
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
    dietary_preference: user?.profile?.dietary_preference || 'Vegetarian',
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
        }),
      });
      setMsg('Athlete profile updated!');
      if (onUserUpdated) onUserUpdated(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-extrabold text-white">Athlete Profile Settings</h3>
              <p className="text-[11px] text-slate-400">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
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

        <form onSubmit={handleSaveProfile} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">City</label>
              <input
                type="text"
                value={profileForm.city}
                onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Height (cm)</label>
              <input
                type="number"
                value={profileForm.height_cm}
                onChange={(e) => setProfileForm({ ...profileForm, height_cm: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Weight (kg)</label>
              <input
                type="number"
                step="0.5"
                value={profileForm.weight_kg}
                onChange={(e) => setProfileForm({ ...profileForm, weight_kg: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Fitness Goal</label>
              <select
                value={profileForm.fitness_goal}
                onChange={(e) => setProfileForm({ ...profileForm, fitness_goal: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                <option value="Muscle Gain">Muscle Gain</option>
                <option value="Weight Loss">Weight Loss</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Endurance">Endurance</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Dietary Preference</label>
              <select
                value={profileForm.dietary_preference}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, dietary_preference: e.target.value })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                <option value="Vegetarian">Vegetarian</option>
                <option value="Non-Vegetarian">Non-Vegetarian</option>
              </select>
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
    </div>
  );
}
