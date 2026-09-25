import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Dumbbell,
  Utensils,
  Cpu,
  CalendarCheck,
  MessageSquareHeart,
  Gauge,
  MapPin,
  UserCircle,
  Menu,
  X,
  Activity,
  LogOut,
} from 'lucide-react';
import { apiFetch, clearAuthToken, setOnUnauthorized } from './api';
import AuthPage from './components/AuthPage';
import OverviewTab from './components/OverviewTab';
import TrainerTab from './components/TrainerTab';
import DieticianTab from './components/DieticianTab';
import SmartGymIoTTab from './components/SmartGymIoTTab';
import HabitTrackerTab from './components/HabitTrackerTab';
import GymBuddyTab from './components/GymBuddyTab';
import PerformanceTab from './components/PerformanceTab';
import PlannerTab from './components/PlannerTab';
import ProfileModal from './components/ProfileModal';

const PRIMARY_NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'trainer', label: 'Workouts', icon: Dumbbell },
  { id: 'diet', label: 'AI Dietician', icon: Utensils },
  { id: 'performance', label: 'Progress', icon: Gauge },
  { id: 'profile', label: 'Profile', icon: UserCircle },
];

const ADDITIONAL_NAV_ITEMS = [
  { id: 'planner', label: 'Split & Gym Finder', icon: MapPin },
  { id: 'habits', label: 'Habit Tracker', icon: CalendarCheck },
  { id: 'buddy', label: 'Virtual Gym Buddy', icon: MessageSquareHeart },
  { id: 'iot', label: 'Smart Equipment', icon: Cpu },
];

const ALL_NAV_ITEMS = [...PRIMARY_NAV_ITEMS, ...ADDITIONAL_NAV_ITEMS];

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [overviewData, setOverviewData] = useState(null);
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchOverview = useCallback(async () => {
    try {
      const data = await apiFetch('/api/dashboard/overview');
      setOverviewData(data);
      if (data.user) setUser(data.user);
    } catch {
      // handled by 401 listener if unauthenticated
    }
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      setUser(null);
      setOverviewData(null);
      setShowProfileModal(false);
    });

    const verifySession = async () => {
      try {
        const me = await apiFetch('/api/auth/me');
        if (me?.user) {
          setUser(me.user);
          const data = await apiFetch('/api/dashboard/overview');
          setOverviewData(data);
        }
      } catch {
        clearAuthToken();
        setUser(null);
      } finally {
        setAuthChecking(false);
      }
    };

    verifySession();
  }, []);

  const handleAuthenticated = async (authenticatedUser) => {
    setUser(authenticatedUser);
    setActiveTab('overview');
    await fetchOverview();
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network error during logout
    } finally {
      clearAuthToken();
      setUser(null);
      setOverviewData(null);
      setShowProfileModal(false);
      setMobileMenuOpen(false);
      setActiveTab('overview');
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-semibold">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-slate-950 animate-pulse">
            <Activity className="w-5 h-5" />
          </div>
          <span>Verifying session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  const activeNavItem = ALL_NAV_ITEMS.find((n) => n.id === activeTab) || PRIMARY_NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar (Desktop) */}
      <aside className="hidden lg:flex lg:w-68 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-800/80 bg-slate-900/95 backdrop-blur-xl z-30">
        <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-extrabold tracking-tight text-white">
              AI GYM ASSISTANT
            </div>
            <div className="text-[11px] font-semibold text-emerald-400">
              Fitness &amp; Nutrition Platform
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            {PRIMARY_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-bold transition cursor-pointer ${
                    active
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-800/80 space-y-1">
            <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Tools &amp; Coaching
            </div>
            {ADDITIONAL_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
                    active
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800/80 space-y-2.5">
          <button
            onClick={() => setActiveTab('profile')}
            className="w-full flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/80 hover:border-slate-700 p-3 text-left transition cursor-pointer"
          >
            <UserCircle className="w-8 h-8 text-emerald-400 shrink-0" />
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-white truncate">
                {user?.name || 'Athlete'}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {user?.profile?.fitness_goal || 'Muscle Gain'} •{' '}
                {user?.profile?.dietary_preference || 'Vegetarian'}
              </div>
            </div>
          </button>

          <button
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 py-2 text-xs font-bold text-rose-300 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-68 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden rounded-lg p-2 text-slate-300 hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold text-white">
                {activeNavItem.label}
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                AI Gym &amp; Fitness Assistant • Personalized Workouts, Nutrition &amp; Progress Tracking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setActiveTab('profile')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 cursor-pointer"
            >
              <UserCircle className="w-4 h-4 text-emerald-400" />
              <span>{user?.name || 'Athlete'}</span>
            </button>
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 text-xs font-bold text-rose-300 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-slate-800 bg-slate-900 p-3 space-y-1">
            {ALL_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-bold ${
                    activeTab === item.id
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Active View Content */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewTab overview={overviewData} onNavigate={setActiveTab} />
          )}
          {activeTab === 'trainer' && (
            <TrainerTab user={user} onSessionSaved={fetchOverview} />
          )}
          {activeTab === 'diet' && (
            <DieticianTab user={user} onUpdateOverview={fetchOverview} />
          )}
          {activeTab === 'performance' && (
            <PerformanceTab onUpdateOverview={fetchOverview} />
          )}
          {activeTab === 'profile' && (
            <ProfileModal
              user={user}
              inlineMode={true}
              onUserUpdated={(u) => {
                setUser(u);
                fetchOverview();
              }}
              onLogout={handleLogout}
            />
          )}
          {activeTab === 'planner' && <PlannerTab user={user} />}
          {activeTab === 'habits' && <HabitTrackerTab onUpdateOverview={fetchOverview} />}
          {activeTab === 'buddy' && <GymBuddyTab />}
          {activeTab === 'iot' && <SmartGymIoTTab />}
        </main>
      </div>

      {showProfileModal && (
        <ProfileModal
          user={user}
          onClose={() => setShowProfileModal(false)}
          onUserUpdated={(u) => {
            setUser(u);
            fetchOverview();
          }}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
