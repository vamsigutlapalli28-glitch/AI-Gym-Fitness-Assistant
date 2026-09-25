# AI Gym & Fitness Assistant

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Backend: FastAPI + PostgreSQL](https://img.shields.io/badge/Backend-FastAPI%20%2B%20PostgreSQL-009688.svg)](backend/main.py)
[![AI: Google Gemini](https://img.shields.io/badge/AI-Google%20Gemini-blue.svg)](backend/services/chatbot_service.py)
[![Frontend: React + Vite + Tailwind](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Tailwind%20v4-cyan.svg)](frontend/)

A full-stack **AI Gym & Fitness Assistant** web application featuring personalized workout logging, multi-turn conversational **AI Dietician & Nutrition Coaching**, **Virtual Gym Buddy** coaching, nutrition & macro planning, habit & consistency tracking, performance analytics, 7-day split generation, and direct **Google Maps** gym search.

---

## 1. Core Features & Navigation

- **Dashboard**: Real-time overview of logged workouts, calories burned, current training streak, adherence score, macro intake, and 7-day workout volume charts.
- **Workouts**:
  - **Manual Workout Logger**: Log exercise, sets, reps, weight (`kg`), duration, form rating, and session notes with automatic calorie and performance calculation.
  - **AI Workout Feedback**: Optional AI coaching tips on logged sets and recovery.
  - **Exercise Form Guide & History**: Key coaching cues, target muscles, volume trend chart, and filterable session history with delete support.
  - **7-Day Split & Gym Finder**: Personalized 7-day training split generator and direct **Google Maps** nearby gym search (`https://www.google.com/maps/search/?api=1&query=...`).
- **AI Dietician**:
  - **Conversational AI Dietician Chatbot**: Multi-turn nutrition coach powered by Google Gemini (`backend/.env` `GEMINI_API_KEY` and `GEMINI_MODEL`), personalized with user profile data (age, gender, height, weight, goal, dietary preference, allergies, calorie target, and daily intake).
  - **BMI, BMR & TDEE Calculator**: Mifflin-St Jeor metabolic rate and daily calorie target calculator.
  - **Meal Plan & Grocery Generator**: Structured Vegetarian and Non-Vegetarian daily meal plans and weekly grocery lists.
  - **Daily Nutrition Log**: Track daily meals, calories, protein, carbs, and fats.
- **Progress**: Session performance score breakdowns (Range of Motion, Alignment, Symmetry, Tempo), radar visualization, and historical workout analytics.
- **Profile**: Manage personal biometrics, fitness goals, dietary preferences, food allergies/intolerances, equipment access, and weekly training schedule.
- **Habit Tracker, Virtual Gym Buddy & Smart Equipment**: Daily check-ins with adherence prediction, conversational workout Q&A, and smart gym equipment load/rest recommendations.

---

## 2. Security & Privacy Architecture

- **No Public API Docs in Production**: `/docs`, `/redoc`, and `/openapi.json` are disabled by default (`ENABLE_API_DOCS=false`) while keeping all `/api/*` endpoints active for the frontend.
- **No Camera / Continuous Webcam Tracking**: Runs without browser webcam permissions (`getUserMedia`) or background video capture processes.
- **Database Isolation**: Per-user JWT authentication and bcrypt password hashing backed by PostgreSQL (`fitness_db`).
- **Server-Side AI Keys**: `GEMINI_API_KEY` and database credentials are stored strictly in `backend/.env` and never exposed to the browser.

---

## 3. Setup & Running Instructions (Windows)

### Prerequisites
- **Python 3.10+** (virtual environment in `.\venv`)
- **Node.js 18+** & `npm`
- **PostgreSQL 18** running locally with database `fitness_db`

### 1. Configure Backend Environment (`backend/.env`)
Ensure `backend/.env` contains your PostgreSQL connection string and Gemini API key:
```env
DATABASE_URL=postgresql+psycopg2://postgres:YOUR_PASSWORD@localhost:5432/fitness_db
JWT_SECRET_KEY=your-secret-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
ENABLE_API_DOCS=false
```

### 2. Initialize Database & Run Migrations
```powershell
.\venv\Scripts\python.exe -m backend.init_db
```

### 3. Start the FastAPI Backend Server (Port 8000)
```powershell
.\venv\Scripts\python.exe app.py
```
- **Backend API Base**: `http://127.0.0.1:8000/api`
- **Health Check**: `http://127.0.0.1:8000/api/health`

### 4. Start the React + Vite Frontend (Port 5173)
Open a second PowerShell terminal:
```powershell
cd frontend
npm install
npm run dev
```
- **Application UI**: `http://localhost:5173`

---

## 4. Running Automated Verification Tests

```powershell
.\venv\Scripts\python.exe -m pytest tests/test_api.py -v
```
Tests verify:
1. Public `/docs`, `/redoc`, and `/openapi.json` are disabled (`404`) while `/api/health` is operational.
2. User registration, login, profile updates (including `allergies`), and per-user data isolation.
3. Manual workout logging (`POST /api/workouts/log`), workout history, performance report generation, and workout deletion.
4. Multi-turn conversational **AI Dietician** (`POST /api/diet/chat`), follow-up context retention, chat history persistence (`GET /api/diet/chat/history`), New Chat reset (`DELETE /api/diet/chat/history`), and missing/invalid API key error handling.
5. BMI/TDEE calculation, meal plan generation, daily nutrition logging, habit check-ins, 7-day split planning, and absence of webcam/developer-facing UI strings.

---

## 5. License

MIT License — see [`LICENSE`](LICENSE) for details.
