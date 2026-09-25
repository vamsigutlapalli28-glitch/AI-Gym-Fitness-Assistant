import React, { useState } from 'react';
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Dumbbell,
} from 'lucide-react';
import { apiFetch, setAuthToken } from '../api';

export default function AuthPage({ onAuthenticated }) {
  // 'login' | 'register' | 'forgot'
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Show/hide password states
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Login form state
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
    rememberMe: true,
  });

  // Registration form state
  const [regForm, setRegForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm_password: '',
    age: 25,
    gender: 'Male',
    height_cm: 175,
    weight_kg: 70,
    fitness_goal: 'Muscle Gain',
    dietary_preference: 'Vegetarian',
  });

  // Forgot / Reset password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetTokenInfo, setResetTokenInfo] = useState(null);
  const [resetForm, setResetForm] = useState({
    reset_token: '',
    new_password: '',
    confirm_password: '',
  });

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setSuccessMsg('');
    if (newMode !== 'forgot') {
      setResetTokenInfo(null);
    }
  };

  const validateEmail = (email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!validateEmail(loginForm.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!loginForm.password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: loginForm.email.trim(),
          password: loginForm.password,
          remember_me: loginForm.rememberMe,
        }),
      });
      setAuthToken(res.access_token, loginForm.rememberMe);
      if (onAuthenticated) {
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (regForm.name.trim().length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!validateEmail(regForm.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (regForm.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (regForm.password !== regForm.confirm_password) {
      setError('Passwords do not match. Please confirm your password.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: regForm.name.trim(),
          email: regForm.email.trim(),
          password: regForm.password,
          confirm_password: regForm.confirm_password,
          age: Number(regForm.age) || 25,
          gender: regForm.gender,
          height_cm: Number(regForm.height_cm) || 175,
          weight_kg: Number(regForm.weight_kg) || 70,
          fitness_goal: regForm.fitness_goal,
          dietary_preference: regForm.dietary_preference,
        }),
      });
      setAuthToken(res.access_token, true);
      if (onAuthenticated) {
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your details.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPasswordReset = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!validateEmail(forgotEmail)) {
      setError('Please enter the email address associated with your account.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      setResetTokenInfo(res);
      if (res.reset_token) {
        setResetForm((prev) => ({ ...prev, reset_token: res.reset_token }));
      }
      setSuccessMsg(res.message);
    } catch (err) {
      setError(err.message || 'Could not initiate password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!resetForm.reset_token.trim()) {
      setError('Please enter your password reset verification token.');
      return;
    }
    if (resetForm.new_password.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    if (resetForm.new_password !== resetForm.confirm_password) {
      setError('New password and confirm password do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: forgotEmail.trim(),
          reset_token: resetForm.reset_token.trim(),
          new_password: resetForm.new_password,
          confirm_password: resetForm.confirm_password,
        }),
      });
      setResetTokenInfo(null);
      setLoginForm((prev) => ({ ...prev, email: forgotEmail.trim(), password: '' }));
      setMode('login');
      setSuccessMsg(res.message || 'Password reset successful! Please sign in with your new password.');
    } catch (err) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div
        className={`w-full ${
          mode === 'register' ? 'max-w-xl' : 'max-w-md'
        } rounded-2xl border border-slate-800 bg-slate-900/95 p-6 sm:p-8 shadow-2xl`}
      >
        {/* 1. Small Branding / Title */}
        <div className="text-center mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">
            AI Gym &amp; Fitness Assistant
          </p>
          {mode === 'login' && (
            <h1 className="text-2xl font-extrabold text-white mt-1.5">Login</h1>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-200"
          >
            {error}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-semibold text-emerald-200"
          >
            {successMsg}
          </div>
        )}

        {/* ==================== LOGIN VIEW ==================== */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-3.5 pr-16 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((v) => !v)}
                  aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-emerald-400 cursor-pointer"
                >
                  {showLoginPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={loginForm.rememberMe}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, rememberMe: e.target.checked })
                  }
                  className="rounded border-slate-700 accent-emerald-500"
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  setForgotEmail(loginForm.email);
                  switchMode('forgot');
                }}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 text-slate-950 font-extrabold py-2.5 text-sm shadow-lg shadow-emerald-500/20 transition cursor-pointer"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>

            <div className="pt-3 border-t border-slate-800/80 text-center text-xs text-slate-400">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                Create Account / Register
              </button>
            </div>
          </form>
        )}

          {/* ==================== REGISTRATION VIEW ==================== */}
          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5" noValidate>
              <div>
                <h2 className="text-xl font-extrabold text-white">Create Your Athlete Account</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Register with your own credentials for isolated workout logs, nutrition tracking, and AI coaching.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder="Enter your full name"
                      value={regForm.name}
                      onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
                    <input
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Password (min 6 chars)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      placeholder="Create password"
                      value={regForm.password}
                      onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-10 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((v) => !v)}
                      aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                    >
                      {showRegPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
                    <input
                      type={showRegConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="Confirm password"
                      value={regForm.confirm_password}
                      onChange={(e) =>
                        setRegForm({ ...regForm, confirm_password: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-10 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegConfirmPassword((v) => !v)}
                      aria-label={showRegConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      className="absolute right-3 top-2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                    >
                      {showRegConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Height (cm)</label>
                  <input
                    type="number"
                    min="100"
                    max="250"
                    value={regForm.height_cm}
                    onChange={(e) => setRegForm({ ...regForm, height_cm: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    min="30"
                    max="250"
                    step="0.5"
                    value={regForm.weight_kg}
                    onChange={(e) => setRegForm({ ...regForm, weight_kg: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Fitness Goal</label>
                  <select
                    value={regForm.fitness_goal}
                    onChange={(e) => setRegForm({ ...regForm, fitness_goal: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="Muscle Gain">Muscle Gain</option>
                    <option value="Weight Loss">Weight Loss</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Endurance">Endurance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Diet Preference</label>
                  <select
                    value={regForm.dietary_preference}
                    onChange={(e) =>
                      setRegForm({ ...regForm, dietary_preference: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="Vegetarian">Vegetarian</option>
                    <option value="Non-Vegetarian">Non-Vegetarian</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 text-slate-950 font-extrabold py-3 text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition cursor-pointer"
              >
                <Dumbbell className="w-4 h-4" />
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>

              <div className="pt-2 border-t border-slate-800/80 text-center text-xs text-slate-400">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  Return to login
                </button>
              </div>
            </form>
          )}

          {/* ==================== FORGOT / RESET PASSWORD VIEW ==================== */}
          {mode === 'forgot' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-cyan-400" /> Reset Your Password
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Enter your account email to receive a verified password reset token.
                </p>
              </div>

              {!resetTokenInfo ? (
                <form onSubmit={handleRequestPasswordReset} className="space-y-4" noValidate>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Account Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                      <input
                        type="email"
                        required
                        placeholder="you@example.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-extrabold py-2.5 text-xs uppercase tracking-wider transition cursor-pointer"
                  >
                    {loading ? 'Generating Reset Token...' : 'Send Password Reset Token'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5" noValidate>
                  {!resetTokenInfo.email_configured && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200 leading-relaxed">
                      <span className="font-bold text-amber-300 uppercase">
                        Email Configuration Notice:{' '}
                      </span>
                      SMTP settings (<code>SMTP_HOST</code> / <code>SMTP_USER</code>) are not configured in{' '}
                      <code>backend/.env</code>. Your signed verification reset token has been pre-filled below so you can complete the password reset.
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Verification Reset Token
                    </label>
                    <input
                      type="text"
                      required
                      value={resetForm.reset_token}
                      onChange={(e) =>
                        setResetForm({ ...resetForm, reset_token: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-emerald-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      New Password (min 6 chars)
                    </label>
                    <div className="relative">
                      <input
                        type={showResetPassword ? 'text' : 'password'}
                        required
                        placeholder="Enter new password"
                        value={resetForm.new_password}
                        onChange={(e) =>
                          setResetForm({ ...resetForm, new_password: e.target.value })
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 pr-10 py-2 text-sm text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword((v) => !v)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-white cursor-pointer"
                      >
                        {showResetPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      required
                      placeholder="Confirm new password"
                      value={resetForm.confirm_password}
                      onChange={(e) =>
                        setResetForm({ ...resetForm, confirm_password: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold py-2.5 text-xs uppercase tracking-wider transition cursor-pointer"
                  >
                    {loading ? 'Updating Password...' : 'Confirm & Reset Password'}
                  </button>
                </form>
              )}

              <div className="pt-2 border-t border-slate-800/80 text-center text-xs text-slate-400">
                Remembered your password?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  Return to login
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
