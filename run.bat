@echo off
title AI Gym & Fitness Assistant — Full-Stack Launcher (UNLOX v2.0)
echo ============================================================================
echo   AI GYM ^& FITNESS ASSISTANT (UNLOX MAJOR PROJECT)
echo   Starting FastAPI Backend (Port 8000) ^& React Vite Frontend (Port 5173)
echo ============================================================================

cd /d "%~dp0"

if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Creating default .env from .env.example...
        copy /Y ".env.example" ".env" >nul
    )
)

REM Stop any stale backend process already holding port 8000 to prevent Errno 10048
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000.*LISTENING"') do (
    echo [INFO] Restarting existing backend process on port 8000 (PID %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

echo [1/2] Starting FastAPI Backend Server on http://127.0.0.1:8000 ...
start "AI Gym Backend (FastAPI)" cmd /k ".\venv\Scripts\python.exe app.py"

echo [2/2] Starting React + Vite Frontend on http://localhost:5173 ...
start "AI Gym Frontend (Vite)" cmd /k "cd frontend && npm run dev"

echo.
echo ============================================================================
echo   - Frontend Dashboard : http://localhost:5173
echo   - Backend API ^& UI   : http://127.0.0.1:8000
echo   - Swagger API Docs   : http://127.0.0.1:8000/docs
echo ============================================================================
pause
