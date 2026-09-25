import React, { useState, useEffect, useRef } from 'react';
import {
  Utensils,
  Calculator,
  ShoppingCart,
  Plus,
  Trash2,
  Info,
  Leaf,
  Drumstick,
  Flame,
  Sparkles,
  CheckCircle2,
  Send,
  RotateCcw,
  Bot,
  User,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { apiFetch } from '../api';

const MACRO_COLORS = ['#10b981', '#3b82f6', '#f59e0b'];

const DIETICIAN_STARTER_PROMPTS = [
  'What should I eat before or after a workout?',
  'Give me a 2200 calorie vegetarian muscle gain plan.',
  'How much protein do I need per day?',
  'Suggest high-protein Indian vegetarian meals.',
  'Can I replace paneer with tofu or soya chunks?',
  'Create a budget-friendly diet plan.',
  'Adjust my plan if I missed breakfast.',
];

export default function DieticianTab({ user, onUpdateOverview }) {
  // Multi-turn AI Dietician Chatbot State
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatEndRef = useRef(null);

  const [bmiForm, setBmiForm] = useState({
    height_cm: user?.profile?.height_cm || 175,
    weight_kg: user?.profile?.weight_kg || 72,
    age: user?.age || 25,
    gender: user?.gender || 'Male',
    activity_level: user?.profile?.activity_level || 'Moderately Active',
    goal: user?.profile?.fitness_goal || 'Muscle Gain',
  });
  const [bmiResult, setBmiResult] = useState(null);

  const [planForm, setPlanForm] = useState({
    goal: user?.profile?.fitness_goal || 'Muscle Gain',
    dietary_preference: user?.profile?.dietary_preference || 'Vegetarian',
    target_calories: user?.profile?.daily_calorie_target || 2400,
  });
  const [mealPlan, setMealPlan] = useState(null);
  const [nutritionData, setNutritionData] = useState(null);

  const [logForm, setLogForm] = useState({
    meal_type: 'Breakfast',
    food_name: '',
    calories: 420,
    protein_g: 28,
    carbs_g: 45,
    fat_g: 12,
    is_vegetarian: true,
  });
  const [checkedGroceries, setCheckedGroceries] = useState({});
  const [statusMsg, setStatusMsg] = useState('');

  const formatTimeNow = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const loadDietChatHistory = async () => {
    try {
      const data = await apiFetch('/api/diet/chat/history');
      setChatMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      // Keep empty chat history if not yet initialized
    }
  };

  const loadNutritionLogs = async () => {
    try {
      const data = await apiFetch('/api/diet/nutrition-logs');
      setNutritionData(data);
      if (data.saved_plan) {
        setMealPlan((prev) => prev || data.saved_plan);
      }
    } catch (err) {
      setStatusMsg(err.message || 'Could not load nutrition logs');
    }
  };

  useEffect(() => {
    loadDietChatHistory();
    loadNutritionLogs();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [chatMessages, chatLoading]);

  const sendDietQuestion = async (textToSend) => {
    const q = (textToSend ?? chatInput).trim();
    if (!q || chatLoading) return;

    setChatError('');
    const priorHistory = chatMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-16)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    const timestamp = formatTimeNow();
    const tempUserMsg = {
      id: Date.now(),
      role: 'user',
      content: q,
      created_at: timestamp,
    };

    setChatMessages((prev) => [...prev, tempUserMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await apiFetch('/api/diet/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: q,
          history: priorHistory,
        }),
      });
      const replyText = res.answer || res.reply;
      if (!replyText) {
        throw new Error(
          res.gemini_error ||
            res.detail ||
            'AI Dietician is temporarily unavailable. Please try again shortly.'
        );
      }
      setChatMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: replyText,
          mood_tag: res.mood_tag,
          created_at: res.created_at || formatTimeNow(),
        },
      ]);
    } catch (err) {
      setChatError(
        err.message || 'Unable to reach the AI Dietician right now. Please try again.'
      );
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatSubmit = (e) => {
    e.preventDefault();
    sendDietQuestion(chatInput);
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendDietQuestion(chatInput);
    }
  };

  const handleNewChat = async () => {
    setChatError('');
    try {
      await apiFetch('/api/diet/chat/history', { method: 'DELETE' });
      setChatMessages([]);
      setStatusMsg('Started a new AI Dietician conversation.');
    } catch (err) {
      setChatError(err.message || 'Could not reset conversation history.');
    }
  };

  const handleCalculateBmi = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/diet/calculate-bmi-calories', {
        method: 'POST',
        body: JSON.stringify({
          height_cm: Number(bmiForm.height_cm),
          weight_kg: Number(bmiForm.weight_kg),
          age: Number(bmiForm.age),
          gender: bmiForm.gender,
          activity_level: bmiForm.activity_level,
          goal: bmiForm.goal,
        }),
      });
      setBmiResult(res);
      setPlanForm((prev) => ({
        ...prev,
        goal: bmiForm.goal,
        target_calories: res.target_daily_calories_kcal,
      }));
      setStatusMsg(
        `BMI calculated: ${res.bmi} (${res.category}) • Target: ${res.target_daily_calories_kcal} kcal/day`
      );
      if (onUpdateOverview) onUpdateOverview();
    } catch (err) {
      setStatusMsg(err.message);
    }
  };

  const handleGeneratePlan = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/diet/meal-plan', {
        method: 'POST',
        body: JSON.stringify({
          goal: planForm.goal,
          dietary_preference: planForm.dietary_preference,
          target_calories: Number(planForm.target_calories),
        }),
      });
      setMealPlan(res);
      setStatusMsg(
        `Generated ${res.dietary_preference} ${res.goal} meal plan (${res.target_calories} kcal/day) & grocery list!`
      );
    } catch (err) {
      setStatusMsg(err.message);
    }
  };

  const handleAddFoodLog = async (e) => {
    e.preventDefault();
    if (!logForm.food_name.trim()) return;
    try {
      await apiFetch('/api/diet/nutrition-logs', {
        method: 'POST',
        body: JSON.stringify({
          ...logForm,
          calories: Number(logForm.calories),
          protein_g: Number(logForm.protein_g),
          carbs_g: Number(logForm.carbs_g),
          fat_g: Number(logForm.fat_g),
        }),
      });
      setLogForm((f) => ({ ...f, food_name: '' }));
      await loadNutritionLogs();
      if (onUpdateOverview) onUpdateOverview();
      setStatusMsg('Meal logged to daily nutrition tracker!');
    } catch (err) {
      setStatusMsg(err.message);
    }
  };

  const handleQuickLogPlannedMeal = async (meal) => {
    try {
      const cleanType = (meal.meal_type || 'Meal').split('(')[0].trim();
      await apiFetch('/api/diet/nutrition-logs', {
        method: 'POST',
        body: JSON.stringify({
          meal_type: cleanType,
          food_name: meal.title || meal.dish_name || meal.name || 'Planned Meal',
          calories: Number(meal.estimated_calories ?? meal.calories ?? 400),
          protein_g: Number(meal.protein_g ?? 25),
          carbs_g: Number(meal.carbs_g ?? 45),
          fat_g: Number(meal.fat_g ?? 12),
          is_vegetarian: meal.is_vegetarian ?? planForm.dietary_preference === 'Vegetarian',
        }),
      });
      await loadNutritionLogs();
      if (onUpdateOverview) onUpdateOverview();
      setStatusMsg(`Logged "${meal.title || meal.dish_name || 'Meal'}" to today's tracker!`);
    } catch (err) {
      setStatusMsg(err.message);
    }
  };

  const handleDeleteLog = async (id) => {
    try {
      await apiFetch(`/api/diet/nutrition-logs/${id}`, { method: 'DELETE' });
      await loadNutritionLogs();
      if (onUpdateOverview) onUpdateOverview();
    } catch (err) {
      setStatusMsg(err.message);
    }
  };

  const macros = mealPlan?.macros ||
    bmiResult?.macros || { protein_g: 165, carbs_g: 245, fat_g: 68 };
  const macroChartData = [
    { name: 'Protein (g)', value: Number(macros.protein_g) || 160 },
    { name: 'Carbs (g)', value: Number(macros.carbs_g) || 250 },
    { name: 'Fats (g)', value: Number(macros.fat_g) || 70 },
  ];

  const totals = nutritionData?.totals || {
    calories_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  };
  const dailyTarget =
    nutritionData?.daily_target_calories_kcal || Number(planForm.target_calories) || 2400;
  const calPct = Math.min(100, Math.round((totals.calories_kcal / Math.max(1, dailyTarget)) * 100));

  const normalizedGroceryCategories = React.useMemo(() => {
    const raw = mealPlan?.grocery_list;
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map((entry, idx) => ({
        category: entry?.category || `Category ${idx + 1}`,
        items: Array.isArray(entry?.items) ? entry.items : [],
      }));
    }
    if (typeof raw === 'object') {
      return Object.entries(raw).map(([category, items]) => ({
        category,
        items: Array.isArray(items)
          ? items
          : Array.isArray(items?.items)
          ? items.items
          : [],
      }));
    }
    return [];
  }, [mealPlan]);

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

      {/* Conversational AI Dietician Chatbot */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden flex flex-col">
        {/* Chat Header */}
        <div className="border-b border-slate-800 bg-slate-950/80 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">AI Dietician &amp; Nutrition Coach</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                  Personalized
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tailored to your profile: {user?.profile?.fitness_goal || 'Muscle Gain'} •{' '}
                {user?.profile?.dietary_preference || 'Vegetarian'} •{' '}
                {user?.profile?.daily_calorie_target || 2400} kcal/day
                {user?.profile?.allergies ? ` • Allergies: ${user.profile.allergies}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-900 hover:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 transition cursor-pointer self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
            New Chat
          </button>
        </div>

        {/* Starter Prompts Bar */}
        <div className="border-b border-slate-800/80 bg-slate-950/40 px-5 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Ask about meals, macros, Indian vegetarian recipes, or substitutions:
          </div>
          <div className="flex flex-wrap gap-2">
            {DIETICIAN_STARTER_PROMPTS.map((promptText, idx) => (
              <button
                key={idx}
                type="button"
                disabled={chatLoading}
                onClick={() => sendDietQuestion(promptText)}
                className="rounded-xl border border-slate-800 hover:border-emerald-500/40 bg-slate-900/90 hover:bg-emerald-500/10 px-3 py-1.5 text-xs text-slate-300 hover:text-emerald-200 transition cursor-pointer disabled:opacity-50 text-left"
              >
                {promptText}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation Messages */}
        <div className="p-5 space-y-4 max-h-[460px] min-h-[280px] overflow-y-auto bg-slate-950/30">
          {chatMessages.length === 0 && !chatLoading && (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 text-center space-y-2 my-6 max-w-xl mx-auto">
              <Bot className="w-8 h-8 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">
                Start a Multi-Turn Nutrition Conversation
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ask any question about pre/post-workout nutrition, daily protein requirements,
                high-protein Indian vegetarian meals, ingredient swaps (like paneer vs. tofu or soya
                chunks), budget meal planning, or adjusting your macros when you miss a meal.
              </p>
            </div>
          )}

          {chatMessages.map((m, i) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id || i}
                className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isUser
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 border border-slate-700 text-emerald-400'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-emerald-500 text-slate-950 font-medium'
                      : 'bg-slate-900 border border-slate-800 text-slate-100'
                  }`}
                >
                  <div className="whitespace-pre-line">{m.content}</div>
                  {m.created_at && (
                    <div
                      className={`mt-1.5 flex items-center gap-1 text-[10px] ${
                        isUser ? 'text-slate-900/75 justify-end' : 'text-slate-500'
                      }`}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      <span>{m.created_at}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {chatLoading && (
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shrink-0">
                <Bot className="w-4 h-4 animate-pulse" />
              </div>
              <div className="rounded-2xl bg-slate-900 border border-slate-800 px-4 py-3 text-xs text-slate-300 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                AI Dietician is preparing your personalized nutrition response...
              </div>
            </div>
          )}

          {chatError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-rose-300">AI Dietician Service Notice</div>
                <div>{chatError}</div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Form (Enter to send, Shift+Enter for newline) */}
        <form
          onSubmit={handleChatSubmit}
          className="border-t border-slate-800 bg-slate-950 p-4 flex flex-col gap-2"
        >
          <div className="flex items-end gap-2.5">
            <textarea
              rows={2}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder="Ask your AI Dietician anything (e.g., 'Suggest high-protein Indian vegetarian meals' or 'Can I replace paneer with tofu?')..."
              className="flex-1 resize-none rounded-xl border border-slate-700 focus:border-emerald-500 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-3 text-xs transition cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
            <span>Press Enter to send • Shift+Enter for a new line</span>
            <span>Nutritional values are estimates for fitness guidance</span>
          </div>
        </form>
      </div>

      {/* Row 1: BMI/BMR Calculator + Meal Plan Configurator */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* BMI & TDEE Calculator */}
        <form
          onSubmit={handleCalculateBmi}
          className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase text-emerald-400">
                Body Metrics &amp; Daily Calorie Target
              </span>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Calculator className="w-4 h-4 text-emerald-400" /> BMI, BMR &amp; TDEE Calculator
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Height (cm)</label>
              <input
                type="number"
                step="0.5"
                value={bmiForm.height_cm}
                onChange={(e) => setBmiForm({ ...bmiForm, height_cm: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Weight (kg)</label>
              <input
                type="number"
                step="0.5"
                value={bmiForm.weight_kg}
                onChange={(e) => setBmiForm({ ...bmiForm, weight_kg: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Age</label>
              <input
                type="number"
                value={bmiForm.age}
                onChange={(e) => setBmiForm({ ...bmiForm, age: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Gender</label>
              <select
                value={bmiForm.gender}
                onChange={(e) => setBmiForm({ ...bmiForm, gender: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option>Male</option>
                <option>Female</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Activity Level</label>
              <select
                value={bmiForm.activity_level}
                onChange={(e) => setBmiForm({ ...bmiForm, activity_level: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option>Sedentary</option>
                <option>Lightly Active</option>
                <option>Moderately Active</option>
                <option>Very Active</option>
                <option>Extra Active</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Fitness Goal</label>
              <select
                value={bmiForm.goal}
                onChange={(e) => setBmiForm({ ...bmiForm, goal: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="Weight Loss">Weight Loss</option>
                <option value="Muscle Gain">Muscle Gain</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Endurance">Endurance</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 text-xs transition cursor-pointer"
          >
            Calculate BMI, BMR &amp; Daily Calorie Target
          </button>

          {bmiResult && (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-center">
                  <div className="text-[11px] text-slate-400">BMI ({bmiResult.category})</div>
                  <div className="text-lg font-extrabold text-emerald-400">{bmiResult.bmi}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-center">
                  <div className="text-[11px] text-slate-400">Est. BMR / TDEE</div>
                  <div className="text-sm font-extrabold text-cyan-300">
                    {bmiResult.estimated_bmr_kcal} / {bmiResult.estimated_tdee_kcal}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-center">
                  <div className="text-[11px] text-slate-400">Goal Target</div>
                  <div className="text-lg font-extrabold text-amber-400">
                    {bmiResult.target_daily_calories_kcal} kcal
                  </div>
                </div>
              </div>
              {bmiResult.advice && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
                  <span className="font-bold">Recommendation: </span>
                  {bmiResult.advice}
                </div>
              )}
            </div>
          )}
        </form>

        {/* Meal Plan Generator + Macro Pie */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg flex flex-col justify-between space-y-4">
          <form onSubmit={handleGeneratePlan} className="space-y-4">
            <div>
              <span className="text-xs font-bold uppercase text-amber-400">
                Daily Meal &amp; Grocery Planner
              </span>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Utensils className="w-4 h-4 text-amber-400" /> Personalized Meal Plan Generator
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Dietary Preference</label>
                <select
                  value={planForm.dietary_preference}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, dietary_preference: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="Vegetarian">Vegetarian</option>
                  <option value="Non-Vegetarian">Non-Vegetarian</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Fitness Goal</label>
                <select
                  value={planForm.goal}
                  onChange={(e) => setPlanForm({ ...planForm, goal: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="Muscle Gain">Muscle Gain</option>
                  <option value="Weight Loss">Weight Loss</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Endurance">Endurance</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Target Calories</label>
                <input
                  type="number"
                  step="50"
                  min="1100"
                  max="5500"
                  value={planForm.target_calories}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, target_calories: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 text-xs transition cursor-pointer"
            >
              Generate Meal Plan &amp; Grocery List
            </button>
          </form>

          {/* Macro Split Chart */}
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-4 pt-2 border-t border-slate-800">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={macroChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={62}
                    paddingAngle={4}
                  >
                    {macroChartData.map((_, index) => (
                      <Cell key={index} fill={MACRO_COLORS[index % MACRO_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 text-xs">
              <div className="font-bold text-slate-200">
                Daily Macro Breakdown ({mealPlan?.target_calories || planForm.target_calories} kcal)
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-1.5">
                <span className="text-emerald-400 font-semibold">Protein</span>
                <span className="font-bold text-white">{macros.protein_g} g</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-1.5">
                <span className="text-blue-400 font-semibold">Carbohydrates</span>
                <span className="font-bold text-white">{macros.carbs_g} g</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-1.5">
                <span className="text-amber-400 font-semibold">Healthy Fats</span>
                <span className="font-bold text-white">{macros.fat_g} g</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Generated Meal Plan Cards & Categorized Grocery List */}
      {mealPlan && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {mealPlan.dietary_preference === 'Vegetarian' ? (
                  <Leaf className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Drumstick className="w-4 h-4 text-amber-400" />
                )}
                {mealPlan.dietary_preference} Daily Meal Schedule ({mealPlan.goal})
              </h3>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-0.5 text-xs font-bold text-emerald-300">
                {mealPlan.target_calories} kcal Est.
              </span>
            </div>

            <div className="space-y-3">
              {(Array.isArray(mealPlan.meals) ? mealPlan.meals : []).map((m, idx) => {
                const mealTitle = m.title || m.dish_name || m.name || `Meal ${idx + 1}`;
                const mealCalories = m.estimated_calories ?? m.calories ?? 0;
                const mealItems = Array.isArray(m.items) ? m.items : [];
                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                        {m.meal_type || 'Scheduled Meal'}
                      </span>
                      <h4 className="text-sm font-bold text-white">{mealTitle}</h4>
                      <p className="text-xs text-slate-400">
                        Items: {mealItems.join(' • ')}
                      </p>
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-extrabold text-amber-400">
                          {mealCalories} kcal
                        </div>
                        <div className="text-[11px] text-slate-400">
                          P: {m.protein_g}g • C: {m.carbs_g}g • F: {m.fat_g}g
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleQuickLogPlannedMeal(m)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold text-emerald-300 transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Log Meal
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grocery List */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-cyan-400" /> Weekly Categorized Grocery List
            </h3>
            <p className="text-xs text-slate-400">
              Click items to check them off during your weekly grocery run.
            </p>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {normalizedGroceryCategories.map(({ category, items }) => (
                <div
                  key={category}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5"
                >
                  <div className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">
                    {String(category).replace(/_/g, ' ')}
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {items.map((item, i) => {
                      const itemLabel = typeof item === 'string' ? item : item?.name || String(item);
                      const key = `${category}-${itemLabel}`;
                      const checked = !!checkedGroceries[key];
                      return (
                        <label
                          key={i}
                          className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setCheckedGroceries((p) => ({ ...p, [key]: !checked }))
                            }
                            className="rounded border-slate-700 accent-emerald-500"
                          />
                          <span className={checked ? 'line-through text-slate-500' : ''}>
                            {itemLabel}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Row 3: Daily Nutrition Tracker & Food Logger */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-400" /> Today&apos;s Nutrition Log &amp; Calorie Tracker
            </h3>
            <p className="text-xs text-slate-400">
              Consumed: {totals.calories_kcal} / {dailyTarget} kcal ({calPct}%) • Protein:{' '}
              {totals.protein_g}g • Carbs: {totals.carbs_g}g • Fat: {totals.fat_g}g
            </p>
          </div>
          <div className="w-full sm:w-56 h-2.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all"
              style={{ width: `${calPct}%` }}
            />
          </div>
        </div>

        <form onSubmit={handleAddFoodLog} className="grid grid-cols-2 sm:grid-cols-8 gap-2.5">
          <select
            value={logForm.meal_type}
            onChange={(e) => setLogForm({ ...logForm, meal_type: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          >
            <option>Breakfast</option>
            <option>Lunch</option>
            <option>Pre-Workout</option>
            <option>Post-Workout</option>
            <option>Dinner</option>
            <option>Snack</option>
          </select>
          <input
            type="text"
            placeholder="Food item (e.g., Paneer Tikka / Oats & Whey)"
            value={logForm.food_name}
            onChange={(e) => setLogForm({ ...logForm, food_name: e.target.value })}
            className="col-span-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          />
          <input
            type="number"
            placeholder="kcal"
            title="Calories (kcal)"
            value={logForm.calories}
            onChange={(e) => setLogForm({ ...logForm, calories: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          />
          <input
            type="number"
            placeholder="Protein (g)"
            title="Protein (g)"
            value={logForm.protein_g}
            onChange={(e) => setLogForm({ ...logForm, protein_g: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          />
          <input
            type="number"
            placeholder="Carbs (g)"
            title="Carbohydrates (g)"
            value={logForm.carbs_g}
            onChange={(e) => setLogForm({ ...logForm, carbs_g: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          />
          <input
            type="number"
            placeholder="Fat (g)"
            title="Fat (g)"
            value={logForm.fat_g}
            onChange={(e) => setLogForm({ ...logForm, fat_g: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-2 text-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Log Meal
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                <th className="py-2 px-3">Meal</th>
                <th className="py-2 px-3">Food Item</th>
                <th className="py-2 px-3">Calories (Est.)</th>
                <th className="py-2 px-3">Protein</th>
                <th className="py-2 px-3">Carbs</th>
                <th className="py-2 px-3">Fat</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(nutritionData?.logs || []).map((l) => (
                <tr key={l.id} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3 text-xs font-semibold text-emerald-400">{l.meal_type}</td>
                  <td className="py-2 px-3 font-medium text-white">{l.food_name}</td>
                  <td className="py-2 px-3 text-amber-400 font-bold">{l.calories} kcal</td>
                  <td className="py-2 px-3 text-slate-300">{l.protein_g}g</td>
                  <td className="py-2 px-3 text-slate-300">{l.carbs_g}g</td>
                  <td className="py-2 px-3 text-slate-300">{l.fat_g}g</td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => handleDeleteLog(l.id)}
                      className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer"
                      title="Delete log"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subtle Nutritional Estimate Note */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 px-4 py-3 flex items-center gap-2.5 text-xs text-slate-400">
        <Info className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>
          {nutritionData?.disclaimer ||
            'All BMR, TDEE, calorie, and macronutrient values are nutritional estimates designed for fitness self-tracking and healthy meal planning.'}
        </span>
      </div>
    </div>
  );
}
