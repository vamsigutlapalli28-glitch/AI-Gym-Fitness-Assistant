"""FastAPI Backend Server for AI Gym & Fitness Assistant.

Provides RESTful API endpoints with Pydantic validation, JWT + Bcrypt authentication,
and SQLAlchemy PostgreSQL ORM persistence. Public API documentation (/docs, /redoc, /openapi.json)
is disabled in production by default.
"""

import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth import (
    SESSION_COOKIE_NAME,
    create_access_token,
    create_password_reset_token,
    extract_token_from_request,
    get_current_user,
    hash_password,
    revoke_token,
    security_scheme,
    verify_password,
    verify_password_reset_token,
)
from backend.database import get_database_status, get_db
from backend.models import (
    BMIRecord,
    ChatMessage,
    DietPlanRecord,
    FitnessProfile,
    GymLocationRecord,
    HabitLog,
    IoTDeviceRecord,
    NutritionLog,
    PerformanceReport,
    User,
    WorkoutPlan,
    WorkoutSession,
)
from backend.seed import init_and_seed_db
from backend.services.chatbot_service import (
    generate_buddy_reply,
    generate_diet_gemini_coaching,
    generate_dietician_chat_reply,
    generate_habit_gemini_motivation,
    generate_planner_gemini_guidance,
    generate_workout_gemini_advice,
    get_gemini_status,
)
from backend.services.diet_service import (
    ESTIMATE_DISCLAIMER,
    calculate_bmi_and_calories,
    generate_personalized_diet_plan,
)
from backend.services.habit_service import habit_service
from backend.services.iot_mqtt_service import iot_manager
from backend.services.performance_service import (
    EXERCISE_BIOMECHANICS_SPECS,
    HEURISTIC_DISCLAIMER,
    evaluate_pose_performance,
)
from backend.services.planner_service import (
    EXERCISE_CATALOG,
    FITNESS_CHALLENGES,
    generate_weekly_workout_plan,
    get_google_maps_status,
    search_nearby_gyms,
)

SUPPORTED_EXERCISES = [
    "Bicep Curl",
    "Squat",
    "Pushup",
    "Lunge",
    "Shoulder Press",
    "Bench Press",
    "Deadlift",
    "Lat Pulldown",
    "Plank",
    "Romanian Deadlift",
]

CALORIE_FACTORS = {
    "Bicep Curl": 0.35,
    "Squat": 0.65,
    "Pushup": 0.50,
    "Lunge": 0.60,
    "Shoulder Press": 0.45,
    "Bench Press": 0.55,
    "Deadlift": 0.75,
    "Lat Pulldown": 0.50,
    "Plank": 0.40,
    "Romanian Deadlift": 0.65,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_and_seed_db()
    yield


_ENABLE_API_DOCS = os.getenv("ENABLE_API_DOCS", "false").strip().lower() == "true"

app = FastAPI(
    title="AI Gym & Fitness Assistant API",
    description="AI Gym & Fitness Assistant backend service.",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs" if _ENABLE_API_DOCS else None,
    redoc_url="/redoc" if _ENABLE_API_DOCS else None,
    openapi_url="/openapi.json" if _ENABLE_API_DOCS else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# PYDANTIC SCHEMAS (VALIDATION)
# ==============================================================================

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(..., min_length=6, max_length=100)
    confirm_password: Optional[str] = Field(default=None)
    age: int = Field(default=25, ge=12, le=100)
    gender: str = Field(default="Male")
    height_cm: float = Field(default=175.0, ge=80.0, le=260.0)
    weight_kg: float = Field(default=70.0, ge=20.0, le=300.0)
    fitness_goal: str = Field(default="Muscle Gain")
    dietary_preference: str = Field(default="Vegetarian")
    allergies: Optional[str] = Field(default="")


class LoginRequest(BaseModel):
    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str
    remember_me: bool = Field(default=False)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ResetPasswordRequest(BaseModel):
    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    reset_token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=6, max_length=100)
    confirm_password: str = Field(..., min_length=6, max_length=100)


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=12, le=100)
    gender: Optional[str] = None
    height_cm: Optional[float] = Field(default=None, ge=80.0, le=260.0)
    weight_kg: Optional[float] = Field(default=None, ge=20.0, le=300.0)
    target_weight_kg: Optional[float] = Field(default=None, ge=20.0, le=300.0)
    fitness_goal: Optional[str] = None
    experience_level: Optional[str] = None
    dietary_preference: Optional[str] = None
    allergies: Optional[str] = None
    activity_level: Optional[str] = None
    available_equipment: Optional[str] = None
    workout_days_per_week: Optional[int] = Field(default=None, ge=1, le=7)
    preferred_workout_time: Optional[str] = None
    daily_calorie_target: Optional[int] = Field(default=None, ge=1000, le=6000)
    city: Optional[str] = None


class FinishWorkoutRequest(BaseModel):
    exercise: str = Field(default="Squat", min_length=2, max_length=80)
    sets_completed: int = Field(default=3, ge=1, le=30)
    reps_per_set: Optional[int] = Field(default=None, ge=1, le=200)
    left_reps: Optional[int] = Field(default=None, ge=0, le=500)
    right_reps: Optional[int] = Field(default=None, ge=0, le=500)
    total_reps: Optional[int] = Field(default=None, ge=1, le=1000)
    weight_kg: float = Field(default=0.0, ge=0.0, le=500.0)
    duration_sec: int = Field(default=900, ge=10, le=14400)
    calories_burned: Optional[float] = Field(default=None, ge=0.0, le=5000.0)
    form_score: float = Field(default=90.0, ge=40.0, le=100.0)
    posture_notes: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=500)
    mode: Optional[str] = Field(default="manual")


class BMICalculateRequest(BaseModel):
    height_cm: float = Field(..., ge=80.0, le=260.0)
    weight_kg: float = Field(..., ge=20.0, le=300.0)
    age: int = Field(default=25, ge=10, le=100)
    gender: str = Field(default="Male")
    activity_level: str = Field(default="Moderately Active")
    goal: str = Field(default="Muscle Gain")


class DietPlanRequest(BaseModel):
    goal: str = Field(default="Muscle Gain")
    dietary_preference: str = Field(default="Vegetarian")
    target_calories: int = Field(default=2200, ge=1100, le=5500)


class GeminiCustomQueryRequest(BaseModel):
    query: Optional[str] = None


class NutritionLogCreateRequest(BaseModel):
    meal_type: str = Field(default="Lunch")
    food_name: str = Field(..., min_length=2, max_length=150)
    calories: int = Field(..., ge=10, le=3500)
    protein_g: float = Field(default=0.0, ge=0.0, le=300.0)
    carbs_g: float = Field(default=0.0, ge=0.0, le=500.0)
    fat_g: float = Field(default=0.0, ge=0.0, le=250.0)
    is_vegetarian: bool = Field(default=True)
    date_str: Optional[str] = None


class IoTDeviceUpdateRequest(BaseModel):
    device_id: str
    is_connected: Optional[bool] = None
    resistance_kg: Optional[float] = Field(default=None, ge=0.0, le=200.0)
    speed_kmh: Optional[float] = Field(default=None, ge=0.0, le=25.0)
    heart_rate_bpm: Optional[int] = Field(default=None, ge=50, le=220)
    intensity_level: Optional[str] = None


class HabitPredictionRequest(BaseModel):
    age: int = Field(default=26, ge=12, le=100)
    sleep_hours: float = Field(default=7.5, ge=2.0, le=14.0)
    stress_level: int = Field(default=4, ge=1, le=10)
    work_hours: float = Field(default=8.0, ge=0.0, le=18.0)
    motivation_level: int = Field(default=8, ge=1, le=10)
    prev_days_active: int = Field(default=4, ge=0, le=7)
    water_liters: float = Field(default=2.5, ge=0.5, le=8.0)


class HabitLogCreateRequest(BaseModel):
    date_str: Optional[str] = None
    scheduled_workout: str = Field(default="Strength & Conditioning")
    completed: bool = Field(default=True)
    sleep_hours: float = Field(default=7.5, ge=2.0, le=14.0)
    stress_level: int = Field(default=4, ge=1, le=10)
    work_hours: float = Field(default=8.0, ge=0.0, le=18.0)
    motivation_level: int = Field(default=8, ge=1, le=10)
    water_liters: float = Field(default=2.5, ge=0.5, le=8.0)
    notes: str = Field(default="")


class ScheduleUpdateRequest(BaseModel):
    workout_days_per_week: int = Field(..., ge=1, le=7)
    preferred_workout_time: str = Field(default="18:00")


class ChatHistoryItem(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: Optional[str] = Field(default=None, max_length=4000)
    message: Optional[str] = Field(default=None, max_length=4000)
    history: Optional[List[ChatHistoryItem]] = Field(default=None)


class PerformanceAnalyzeRequest(BaseModel):
    exercise: str = Field(default="Bicep Curl")
    rom_angle_min: float = Field(default=40.0, ge=0.0, le=180.0)
    rom_angle_max: float = Field(default=165.0, ge=0.0, le=180.0)
    left_right_diff_deg: float = Field(default=4.0, ge=0.0, le=90.0)
    rep_durations_sec: List[float] = Field(default=[2.1, 2.2, 2.0, 2.3, 2.1])
    posture_violation_ratio: float = Field(default=0.08, ge=0.0, le=1.0)
    reps_completed: int = Field(default=12, ge=1, le=200)


class WorkoutPlanCreateRequest(BaseModel):
    goal: str = Field(default="Muscle Gain")
    experience_level: str = Field(default="Intermediate")
    equipment: str = Field(default="Full Gym")
    days_per_week: int = Field(default=5, ge=2, le=6)


# ==============================================================================
# HEALTH & SYSTEM STATUS
# ==============================================================================

@app.get("/api/health", tags=["System"])
def health_check():
    gemini_info = get_gemini_status()
    return {
        "status": "ok",
        "service": "AI Gym & Fitness Assistant API",
        "version": "2.0.0",
        "database": get_database_status(),
        "gemini": gemini_info,
        "features": [
            "Dashboard",
            "Workouts & Split Planner",
            "AI Dietician & Nutrition Coach",
            "Progress, Habits & Analytics",
            "Profile Management",
        ],
    }


@app.get("/api/database/status", tags=["System"])
def api_database_status():
    """Returns non-sensitive PostgreSQL / SQLAlchemy configuration and table metadata."""
    return get_database_status()


@app.get("/api/gemini/status", tags=["System"])
def api_gemini_status():
    """Returns Google Gemini configuration status without exposing any API keys."""
    return get_gemini_status()


# ==============================================================================
# AUTHENTICATION & PROFILE ENDPOINTS
# ==============================================================================

def _serialize_user(user: User) -> Dict:
    prof = user.profile
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "age": user.age,
        "gender": user.gender,
        "profile": {
            "height_cm": prof.height_cm if prof else 175.0,
            "weight_kg": prof.weight_kg if prof else 72.0,
            "target_weight_kg": prof.target_weight_kg if prof else 70.0,
            "fitness_goal": prof.fitness_goal if prof else "Muscle Gain",
            "experience_level": prof.experience_level if prof else "Intermediate",
            "dietary_preference": prof.dietary_preference if prof else "Vegetarian",
            "allergies": (getattr(prof, "allergies", "") or "") if prof else "",
            "activity_level": prof.activity_level if prof else "Moderately Active",
            "available_equipment": prof.available_equipment if prof else "Full Gym, Dumbbells",
            "workout_days_per_week": prof.workout_days_per_week if prof else 5,
            "preferred_workout_time": prof.preferred_workout_time if prof else "18:00",
            "daily_calorie_target": prof.daily_calorie_target if prof else 2400,
            "city": prof.city if prof else "Bengaluru",
        },
    }


@app.post("/api/auth/register", tags=["Authentication & Profile"], status_code=status.HTTP_201_CREATED)
def register_user(req: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    if req.confirm_password is not None and req.password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")

    clean_email = req.email.lower().strip()
    existing = db.query(User).filter(User.email == clean_email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    new_user = User(
        name=req.name.strip(),
        email=clean_email,
        password_hash=hash_password(req.password),
        age=req.age,
        gender=req.gender,
    )
    db.add(new_user)
    db.flush()

    calc = calculate_bmi_and_calories(
        req.height_cm, req.weight_kg, req.age, req.gender, "Moderately Active", req.fitness_goal
    )
    target_cal = calc["target_daily_calories_kcal"]
    profile = FitnessProfile(
        user_id=new_user.id,
        height_cm=req.height_cm,
        weight_kg=req.weight_kg,
        target_weight_kg=req.weight_kg,
        fitness_goal=req.fitness_goal,
        dietary_preference=req.dietary_preference,
        allergies=(req.allergies or "").strip(),
        daily_calorie_target=target_cal,
    )
    db.add(profile)

    # Seed initial personal BMI record, Diet Plan, Workout Plan, and Welcome Chat message for this user
    db.add(
        BMIRecord(
            user_id=new_user.id,
            height_cm=req.height_cm,
            weight_kg=req.weight_kg,
            bmi=calc["bmi"],
            category=calc["category"],
            bmr=calc["estimated_bmr_kcal"],
            tdee=calc["estimated_tdee_kcal"],
        )
    )

    diet_data = generate_personalized_diet_plan(req.fitness_goal, req.dietary_preference, target_cal)
    db.add(
        DietPlanRecord(
            user_id=new_user.id,
            goal=req.fitness_goal,
            dietary_preference=req.dietary_preference,
            target_calories=target_cal,
            protein_g=diet_data["macros"]["protein_g"],
            carbs_g=diet_data["macros"]["carbs_g"],
            fat_g=diet_data["macros"]["fat_g"],
            meals_json=json.dumps(diet_data["meals"]),
            grocery_list_json=json.dumps(diet_data["grocery_list"]),
        )
    )

    plan_data = generate_weekly_workout_plan(req.fitness_goal, "Intermediate", "Full Gym", 5)
    db.add(
        WorkoutPlan(
            user_id=new_user.id,
            title=plan_data["title"],
            goal=plan_data["goal"],
            experience_level=plan_data["experience_level"],
            equipment=plan_data["equipment"],
            days_per_week=plan_data["days_per_week"],
            schedule_json=json.dumps(plan_data["schedule"]),
            challenges_json=json.dumps(plan_data["challenges"]),
        )
    )

    db.add(
        ChatMessage(
            user_id=new_user.id,
            role="assistant",
            content=(
                f"Welcome to **AI Gym & Fitness Assistant**, **{new_user.name}**! "
                f"Your personal profile is set for **{req.fitness_goal}** "
                f"({req.dietary_preference}, ~{target_cal} kcal/day). Ask me anything about workouts, nutrition, or recovery!"
            ),
            sentiment="positive",
            mood_tag="Welcoming",
            provider="system",
        )
    )

    db.commit()
    db.refresh(new_user)

    token = create_access_token(
        new_user.id, new_user.email, new_user.name, remember_me=True, db=db
    )
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=72 * 3600,
    )
    return {
        "message": "Registration successful",
        "access_token": token,
        "token_type": "bearer",
        "user": _serialize_user(new_user),
    }


@app.post("/api/auth/login", tags=["Authentication & Profile"])
def login_user(req: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower().strip()).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(
        user.id, user.email, user.name, remember_me=req.remember_me, db=db
    )
    max_age = (72 * 4 * 3600) if req.remember_me else (72 * 3600)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=max_age,
    )
    return {
        "message": "Login successful",
        "access_token": token,
        "token_type": "bearer",
        "remember_me": req.remember_me,
        "user": _serialize_user(user),
    }


@app.post("/api/auth/logout", tags=["Authentication & Profile"])
def logout_user(
    request: Request,
    response: Response,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
):
    token = extract_token_from_request(request, credentials, session_cookie)
    revoke_token(token, db=db)
    response.delete_cookie(key=SESSION_COOKIE_NAME)
    return {"message": "Logged out successfully."}


@app.get("/api/auth/me", tags=["Authentication & Profile"])
def get_authenticated_user(user: User = Depends(get_current_user)):
    return {
        "authenticated": True,
        "user": _serialize_user(user),
    }


@app.post("/api/auth/forgot-password", tags=["Authentication & Profile"])
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Generates a verified password reset token and sends via SMTP if configured."""
    import os as _os
    import smtplib
    from email.message import EmailMessage

    clean_email = req.email.lower().strip()
    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="No registered account found with that email address.")

    reset_token = create_password_reset_token(user.id, user.email)
    smtp_host = _os.getenv("SMTP_HOST", "").strip()
    smtp_port = int(_os.getenv("SMTP_PORT", "587") or 587)
    smtp_user = _os.getenv("SMTP_USER", "").strip()
    smtp_pass = _os.getenv("SMTP_PASSWORD", "").strip()
    smtp_from = _os.getenv("SMTP_FROM_EMAIL", smtp_user or "noreply@aigymassistant.local")

    if smtp_host and smtp_user and smtp_pass:
        try:
            msg = EmailMessage()
            msg["Subject"] = "AI Gym & Fitness Assistant — Password Reset Token"
            msg["From"] = smtp_from
            msg["To"] = user.email
            msg.set_content(
                f"Hello {user.name},\n\n"
                f"Use the following verification token to reset your password (valid for 30 minutes):\n\n"
                f"{reset_token}\n\n"
                "If you did not request this reset, you can safely ignore this email."
            )
            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
            return {
                "email_configured": True,
                "message": f"Password reset token has been emailed to {user.email}.",
            }
        except Exception as exc:
            return {
                "email_configured": False,
                "message": f"Email delivery failed ({exc}). Use the verification token below to reset your password.",
                "reset_token": reset_token,
            }

    return {
        "email_configured": False,
        "message": "Use the verified reset token below to complete your password reset immediately.",
        "reset_token": reset_token,
    }


@app.post("/api/auth/reset-password", tags=["Authentication & Profile"])
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="New password and confirm password do not match.")

    clean_email = req.email.lower().strip()
    payload = verify_password_reset_token(req.reset_token.strip(), clean_email)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired password reset token. Please request a new reset token.",
        )

    user = db.query(User).filter(User.id == int(payload["sub"]), User.email == clean_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    user.password_hash = hash_password(req.new_password)
    revoke_token(req.reset_token.strip())
    db.commit()
    return {
        "message": "Password has been reset successfully. You can now log in with your new password."
    }


@app.get("/api/profile", tags=["Authentication & Profile"])
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bmi_records = (
        db.query(BMIRecord)
        .filter(BMIRecord.user_id == user.id)
        .order_by(BMIRecord.recorded_at.desc())
        .limit(10)
        .all()
    )
    return {
        "user": _serialize_user(user),
        "bmi_history": [
            {
                "id": b.id,
                "height_cm": b.height_cm,
                "weight_kg": b.weight_kg,
                "bmi": b.bmi,
                "category": b.category,
                "bmr": b.bmr,
                "tdee": b.tdee,
                "recorded_at": b.recorded_at.strftime("%Y-%m-%d") if b.recorded_at else "",
            }
            for b in bmi_records
        ],
    }


@app.get("/api/users/{target_user_id}/records", tags=["Authentication & Profile"])
def get_user_records(
    target_user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns all fitness records for the authenticated user; strictly blocks access to other users' records."""
    if target_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You are not authorized to access another user's records.",
        )

    return {
        "user": _serialize_user(user),
        "workout_history_count": db.query(WorkoutSession).filter(WorkoutSession.user_id == user.id).count(),
        "diet_plans_count": db.query(DietPlanRecord).filter(DietPlanRecord.user_id == user.id).count(),
        "habit_logs_count": db.query(HabitLog).filter(HabitLog.user_id == user.id).count(),
        "chat_history_count": db.query(ChatMessage).filter(ChatMessage.user_id == user.id).count(),
    }


@app.put("/api/profile", tags=["Authentication & Profile"])
def update_profile(
    req: ProfileUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.name is not None:
        user.name = req.name.strip()
    if req.age is not None:
        user.age = req.age
    if req.gender is not None:
        user.gender = req.gender

    prof = user.profile
    if not prof:
        prof = FitnessProfile(user_id=user.id)
        db.add(prof)

    for field in [
        "height_cm",
        "weight_kg",
        "target_weight_kg",
        "fitness_goal",
        "experience_level",
        "dietary_preference",
        "allergies",
        "activity_level",
        "available_equipment",
        "workout_days_per_week",
        "preferred_workout_time",
        "daily_calorie_target",
        "city",
    ]:
        val = getattr(req, field, None)
        if val is not None:
            setattr(prof, field, val)

    db.commit()
    db.refresh(user)
    return {"message": "Profile updated successfully", "user": _serialize_user(user)}


# ==============================================================================
# DASHBOARD OVERVIEW ENDPOINT
# ==============================================================================

@app.get("/api/dashboard/overview", tags=["Dashboard Overview"])
def get_dashboard_overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    workouts = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user.id)
        .order_by(WorkoutSession.recorded_at.desc())
        .all()
    )
    habits = (
        db.query(HabitLog)
        .filter(HabitLog.user_id == user.id)
        .order_by(HabitLog.date_str.asc())
        .all()
    )
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_nutrition = (
        db.query(NutritionLog)
        .filter(NutritionLog.user_id == user.id, NutritionLog.date_str == today_str)
        .all()
    )
    latest_bmi = (
        db.query(BMIRecord)
        .filter(BMIRecord.user_id == user.id)
        .order_by(BMIRecord.recorded_at.desc())
        .first()
    )

    total_workouts = len(workouts)
    total_reps = sum(w.total_reps for w in workouts)
    total_calories_burned = round(sum(w.calories_burned for w in workouts), 1)
    avg_perf_score = (
        round(sum(w.performance_score for w in workouts) / len(workouts), 1)
        if workouts
        else 0.0
    )

    streak_stats = habit_service.compute_streak_and_consistency(habits)
    calories_consumed_today = sum(n.calories for n in today_nutrition)
    protein_today = round(sum(n.protein_g for n in today_nutrition), 1)

    return {
        "user": _serialize_user(user),
        "kpis": {
            "total_workouts": total_workouts,
            "total_reps": total_reps,
            "total_calories_burned": total_calories_burned,
            "avg_performance_score": avg_perf_score,
            "current_streak_days": streak_stats["current_streak"],
            "habit_consistency_pct": streak_stats["consistency_pct"],
            "calories_consumed_today": calories_consumed_today,
            "protein_consumed_today_g": protein_today,
            "current_bmi": latest_bmi.bmi if latest_bmi else 23.5,
            "bmi_category": latest_bmi.category if latest_bmi else "Normal",
        },
        "recent_workouts": [
            {
                "id": w.id,
                "exercise": w.exercise,
                "sets_completed": getattr(w, "sets_completed", None) or 3,
                "weight_kg": getattr(w, "weight_kg", None) or 0.0,
                "total_reps": w.total_reps,
                "duration_sec": w.duration_sec,
                "calories_burned": w.calories_burned,
                "performance_score": w.performance_score,
                "posture_notes": w.posture_notes,
                "date": w.recorded_at.strftime("%Y-%m-%d %H:%M") if w.recorded_at else "",
            }
            for w in workouts[:7]
        ],
        "performance_trend": [
            {
                "date": w.recorded_at.strftime("%b %d") if w.recorded_at else f"Session {w.id}",
                "exercise": w.exercise,
                "reps": w.total_reps,
                "calories": w.calories_burned,
                "performance_score": w.performance_score,
                "rom_score": w.avg_rom_score,
                "form_score": w.form_score,
            }
            for w in reversed(workouts[:10])
        ],
    }


# ==============================================================================
# WORKOUT LOGGING & HISTORY ENDPOINTS (MANUAL LOGGING)
# ==============================================================================

@app.post("/api/workouts/log", tags=["Workouts"], status_code=status.HTTP_201_CREATED)
@app.post("/api/trainer/finish", tags=["Workouts"])
def finish_workout_session(
    req: Optional[FinishWorkoutRequest] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Logs a completed workout session manually and records progress metrics."""
    exercise_name = (req.exercise.strip() if req and req.exercise else "Squat")
    sets_c = max(1, (req.sets_completed if req and req.sets_completed is not None else 3))
    weight_val = max(0.0, (req.weight_kg if req and req.weight_kg is not None else 0.0))

    if req and req.total_reps is not None:
        total_r = max(1, req.total_reps)
    elif req and req.reps_per_set is not None:
        total_r = max(1, sets_c * req.reps_per_set)
    elif req and (req.left_reps is not None or req.right_reps is not None):
        total_r = max(1, (req.left_reps or 0) + (req.right_reps or 0))
    else:
        total_r = sets_c * 10

    left_r = req.left_reps if req and req.left_reps is not None else (total_r // 2)
    right_r = req.right_reps if req and req.right_reps is not None else (total_r - left_r)
    dur_s = max(10, (req.duration_sec if req and req.duration_sec is not None else 900))
    form_s = round(min(100.0, max(40.0, (req.form_score if req and req.form_score is not None else 90.0))), 1)

    if req and req.calories_burned is not None and req.calories_burned > 0:
        cals = round(req.calories_burned, 1)
    else:
        factor = CALORIE_FACTORS.get(exercise_name, 0.50)
        load_multiplier = 1.0 + min(0.6, weight_val / 100.0)
        cals = round(max(total_r * factor * load_multiplier, (dur_s / 60.0) * 5.5), 1)

    notes_text = (
        (req.notes or req.posture_notes or "").strip()
        if req
        else ""
    ) or f"{sets_c} sets × {max(1, round(total_r / sets_c))} reps logged ({weight_val:g} kg)"

    ws = WorkoutSession(
        user_id=user.id,
        exercise=exercise_name,
        sets_completed=sets_c,
        weight_kg=weight_val,
        left_reps=left_r,
        right_reps=right_r,
        total_reps=total_r,
        duration_sec=dur_s,
        calories_burned=cals,
        avg_rom_score=form_s,
        form_score=form_s,
        tempo_score=form_s,
        performance_score=form_s,
        posture_notes=notes_text,
        mode="manual",
    )
    db.add(ws)
    db.flush()

    spec = EXERCISE_BIOMECHANICS_SPECS.get(exercise_name, EXERCISE_BIOMECHANICS_SPECS["Squat"])
    report = PerformanceReport(
        user_id=user.id,
        exercise=exercise_name,
        session_id=ws.id,
        rom_angle_min=spec["ideal_min_angle"],
        rom_angle_max=spec["ideal_max_angle"],
        rom_efficiency=form_s,
        symmetry_score=min(100.0, round(form_s + 1.0, 1)),
        tempo_consistency=form_s,
        posture_accuracy=form_s,
        overall_score=form_s,
        reps_analyzed=total_r,
        feedback_summary=notes_text,
    )
    db.add(report)
    db.commit()
    db.refresh(ws)

    return {
        "message": "Workout logged successfully!",
        "session": {
            "id": ws.id,
            "exercise": ws.exercise,
            "sets_completed": ws.sets_completed,
            "weight_kg": ws.weight_kg,
            "left_reps": ws.left_reps,
            "right_reps": ws.right_reps,
            "total_reps": ws.total_reps,
            "duration_sec": ws.duration_sec,
            "calories_burned": ws.calories_burned,
            "form_score": ws.form_score,
            "performance_score": ws.performance_score,
            "posture_notes": ws.posture_notes,
            "mode": ws.mode,
            "recorded_at": ws.recorded_at.strftime("%Y-%m-%d %H:%M") if ws.recorded_at else "",
        },
    }


@app.get("/api/workouts/history", tags=["Workouts"])
@app.get("/api/trainer/history", tags=["Workouts"])
def get_workout_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sessions = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user.id)
        .order_by(WorkoutSession.recorded_at.desc())
        .limit(50)
        .all()
    )
    return {
        "supported_exercises": SUPPORTED_EXERCISES,
        "sessions": [
            {
                "id": s.id,
                "exercise": s.exercise,
                "sets_completed": getattr(s, "sets_completed", None) or 3,
                "weight_kg": getattr(s, "weight_kg", None) or 0.0,
                "left_reps": s.left_reps,
                "right_reps": s.right_reps,
                "total_reps": s.total_reps,
                "duration_sec": s.duration_sec,
                "calories_burned": s.calories_burned,
                "form_score": s.form_score,
                "performance_score": s.performance_score,
                "posture_notes": s.posture_notes,
                "mode": s.mode,
                "recorded_at": s.recorded_at.strftime("%Y-%m-%d %H:%M") if s.recorded_at else "",
            }
            for s in sessions
        ],
    }


@app.delete("/api/workouts/{workout_id}", tags=["Workouts"])
def delete_workout_session(
    workout_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(WorkoutSession).filter(WorkoutSession.id == workout_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Workout session not found.")
    if item.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You are not authorized to delete another user's workout session.",
        )
    db.query(PerformanceReport).filter(PerformanceReport.session_id == workout_id).delete()
    db.delete(item)
    db.commit()
    return {"message": "Workout session removed."}


@app.post("/api/workouts/ai-feedback", tags=["Workouts"])
@app.post("/api/trainer/gemini-advice", tags=["Workouts"])
def api_get_gemini_workout_advice(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generates personalized workout coaching advice from the user's latest logged workout."""
    latest = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == user.id)
        .order_by(WorkoutSession.recorded_at.desc())
        .first()
    )
    stats = {
        "exercise": latest.exercise if latest else "Squat",
        "total": latest.total_reps if latest else 30,
        "left": latest.left_reps if latest else 15,
        "right": latest.right_reps if latest else 15,
        "duration": latest.duration_sec if latest else 900,
        "calories": latest.calories_burned if latest else 120.0,
        "left_angle": 90,
        "right_angle": 90,
        "feedback": {"message": latest.posture_notes if latest else "Consistent form maintained"},
        "performance": {
            "rom_angle_min": 80,
            "rom_angle_max": 165,
            "rom_efficiency": latest.avg_rom_score if latest else 90.0,
            "posture_accuracy": latest.form_score if latest else 90.0,
            "symmetry_score": 94.0,
            "performance_score": latest.performance_score if latest else 90.0,
        },
        "posture_alerts": [],
    }
    prof = user.profile
    user_ctx = {
        "name": user.name,
        "goal": prof.fitness_goal if prof else "Muscle Gain",
        "dietary_preference": prof.dietary_preference if prof else "Vegetarian",
    }
    return generate_workout_gemini_advice(stats, user_ctx)


# ==============================================================================
# AI DIETICIAN & NUTRITION COACH (MULTI-TURN CHAT + MEAL PLANNER + LOGS)
# ==============================================================================

def _build_dietician_user_context(user: User, db: Session) -> Dict[str, Any]:
    prof = user.profile
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_logs = (
        db.query(NutritionLog)
        .filter(NutritionLog.user_id == user.id, NutritionLog.date_str == today_str)
        .all()
    )
    logged_cal = sum(l.calories for l in today_logs)
    logged_pro = round(sum(l.protein_g for l in today_logs), 1)

    return {
        "name": user.name,
        "age": user.age,
        "gender": user.gender,
        "height_cm": prof.height_cm if prof else None,
        "weight_kg": prof.weight_kg if prof else None,
        "target_weight_kg": prof.target_weight_kg if prof else None,
        "fitness_goal": prof.fitness_goal if prof else "Muscle Gain",
        "goal": prof.fitness_goal if prof else "Muscle Gain",
        "dietary_preference": prof.dietary_preference if prof else "Vegetarian",
        "allergies": (getattr(prof, "allergies", "") or "") if prof else "",
        "activity_level": prof.activity_level if prof else "Moderately Active",
        "daily_calorie_target": prof.daily_calorie_target if prof else 2200,
        "logged_calories_today": logged_cal,
        "logged_protein_today": logged_pro,
    }


@app.get("/api/diet/chat/history", tags=["AI Dietician"])
def get_diet_chat_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Returns the user's multi-turn AI Dietician conversation history."""
    messages = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.user_id == user.id,
            ChatMessage.mood_tag.like("Dietician%"),
        )
        .order_by(ChatMessage.id.asc())
        .limit(60)
        .all()
    )
    user_ctx = _build_dietician_user_context(user, db)
    return {
        "gemini_status": get_gemini_status(),
        "profile_context": user_ctx,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "sentiment": m.sentiment,
                "mood_tag": (m.mood_tag or "").replace("Dietician • ", ""),
                "provider": m.provider,
                "created_at": m.created_at.strftime("%H:%M") if m.created_at else "",
            }
            for m in messages
        ],
    }


@app.post("/api/diet/chat", tags=["AI Dietician"])
def send_diet_chat_message(
    req: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Multi-turn conversational AI Dietician endpoint personalized with the user's profile."""
    user_question = (req.message or req.question or "").strip()
    if not user_question:
        raise HTTPException(status_code=422, detail="Please enter a nutrition or diet question.")

    prior_msgs = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.user_id == user.id,
            ChatMessage.mood_tag.like("Dietician%"),
        )
        .order_by(ChatMessage.id.asc())
        .all()
    )
    db_history = [
        {"role": m.role, "content": m.content, "provider": m.provider or ""}
        for m in prior_msgs
        if m.provider != "system"
        and not (m.provider or "").startswith("local_fallback")
    ]

    if req.history is not None:
        history_payload = [
            {"role": item.role, "content": item.content, "provider": ""}
            for item in req.history
            if item.content
        ][-16:]
    else:
        history_payload = db_history[-16:]

    user_ctx = _build_dietician_user_context(user, db)
    reply = generate_dietician_chat_reply(user_question, history_payload, user_ctx)

    gemini_status = reply.get("gemini_status")
    if gemini_status != "success" or not reply.get("answer"):
        error_msg = (
            reply.get("gemini_error")
            or "AI Dietician is temporarily unavailable. Please check your connection and try again."
        )
        if gemini_status == "missing_api_key":
            http_status = status.HTTP_503_SERVICE_UNAVAILABLE
        elif gemini_status == "quota_exceeded":
            http_status = status.HTTP_429_TOO_MANY_REQUESTS
        else:
            http_status = status.HTTP_502_BAD_GATEWAY

        return JSONResponse(
            status_code=http_status,
            content={
                "detail": error_msg,
                "question": user_question,
                "answer": None,
                "sentiment": reply["sentiment"],
                "mood_tag": reply["mood_tag"],
                "provider": reply["provider"],
                "gemini_status": gemini_status,
                "gemini_error_code": gemini_status,
                "gemini_error": error_msg,
                "fallback_used": False,
            },
        )

    now_str = datetime.now(timezone.utc).strftime("%H:%M")
    user_msg = ChatMessage(
        user_id=user.id,
        role="user",
        content=user_question,
        sentiment=reply["sentiment"],
        mood_tag=f"Dietician • {reply['mood_tag']}",
        provider="user",
    )
    bot_msg = ChatMessage(
        user_id=user.id,
        role="assistant",
        content=reply["answer"],
        sentiment=reply["sentiment"],
        mood_tag=f"Dietician • {reply['mood_tag']}",
        provider=reply["provider"],
    )
    db.add_all([user_msg, bot_msg])
    db.commit()

    return {
        "question": user_question,
        "answer": reply["answer"],
        "reply": reply["answer"],
        "sentiment": reply["sentiment"],
        "mood_tag": reply["mood_tag"],
        "provider": reply["provider"],
        "created_at": now_str,
        "gemini_status": "success",
        "gemini_error_code": None,
        "gemini_error": None,
        "fallback_used": False,
    }


@app.delete("/api/diet/chat/history", tags=["AI Dietician"])
def clear_diet_chat_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Clears the user's AI Dietician conversation history when starting a New Chat."""
    db.query(ChatMessage).filter(
        ChatMessage.user_id == user.id,
        ChatMessage.mood_tag.like("Dietician%"),
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": "Started a new AI Dietician chat."}


@app.post("/api/diet/calculate-bmi-calories", tags=["AI Dietician"])
def api_calculate_bmi_and_calories(
    req: BMICalculateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = calculate_bmi_and_calories(
            height_cm=req.height_cm,
            weight_kg=req.weight_kg,
            age=req.age,
            gender=req.gender,
            activity_level=req.activity_level,
            goal=req.goal,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    record = BMIRecord(
        user_id=user.id,
        height_cm=req.height_cm,
        weight_kg=req.weight_kg,
        bmi=result["bmi"],
        category=result["category"],
        bmr=result["estimated_bmr_kcal"],
        tdee=result["estimated_tdee_kcal"],
    )
    db.add(record)
    if user.profile:
        user.profile.height_cm = req.height_cm
        user.profile.weight_kg = req.weight_kg
        user.profile.daily_calorie_target = result["target_daily_calories_kcal"]
    db.commit()
    return result


@app.post("/api/diet/meal-plan", tags=["AI Dietician"])
def api_generate_diet_plan(
    req: DietPlanRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = generate_personalized_diet_plan(
        goal=req.goal,
        dietary_preference=req.dietary_preference,
        target_calories=req.target_calories,
    )
    db_plan = DietPlanRecord(
        user_id=user.id,
        goal=plan["goal"],
        dietary_preference=plan["dietary_preference"],
        target_calories=plan["target_calories"],
        protein_g=plan["macros"]["protein_g"],
        carbs_g=plan["macros"]["carbs_g"],
        fat_g=plan["macros"]["fat_g"],
        meals_json=json.dumps(plan["meals"]),
        grocery_list_json=json.dumps(plan["grocery_list"]),
    )
    db.add(db_plan)
    db.commit()

    user_ctx = _build_dietician_user_context(user, db)
    user_ctx["goal"] = plan["goal"]
    user_ctx["dietary_preference"] = plan["dietary_preference"]
    user_ctx["daily_calorie_target"] = plan["target_calories"]
    plan["ai_coaching"] = generate_diet_gemini_coaching(plan, user_ctx)
    return plan


@app.post("/api/diet/gemini-coach", tags=["AI Dietician"])
def api_diet_gemini_coach(
    req: Optional[GeminiCustomQueryRequest] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generates personalized nutrition & meal-timing coaching from Google Gemini (google-genai)."""
    latest_plan = (
        db.query(DietPlanRecord)
        .filter(DietPlanRecord.user_id == user.id)
        .order_by(DietPlanRecord.created_at.desc())
        .first()
    )
    prof = user.profile
    plan_ctx = {
        "goal": latest_plan.goal if latest_plan else (prof.fitness_goal if prof else "Muscle Gain"),
        "dietary_preference": latest_plan.dietary_preference if latest_plan else (prof.dietary_preference if prof else "Vegetarian"),
        "target_calories": latest_plan.target_calories if latest_plan else (prof.daily_calorie_target if prof else 2400),
        "macros": {
            "protein_g": latest_plan.protein_g if latest_plan else 165,
            "carbs_g": latest_plan.carbs_g if latest_plan else 250,
            "fat_g": latest_plan.fat_g if latest_plan else 70,
        },
    }
    user_ctx = _build_dietician_user_context(user, db)
    return generate_diet_gemini_coaching(
        diet_plan=plan_ctx,
        user_context=user_ctx,
        custom_query=req.query if req else None,
    )


@app.get("/api/diet/nutrition-logs", tags=["Module 2: AI Dietician & Calorie Coach"])
def get_nutrition_logs(
    date_str: Optional[str] = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_date = date_str or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    logs = (
        db.query(NutritionLog)
        .filter(NutritionLog.user_id == user.id, NutritionLog.date_str == target_date)
        .order_by(NutritionLog.id.asc())
        .all()
    )
    latest_plan = (
        db.query(DietPlanRecord)
        .filter(DietPlanRecord.user_id == user.id)
        .order_by(DietPlanRecord.created_at.desc())
        .first()
    )

    tot_cal = sum(l.calories for l in logs)
    tot_p = round(sum(l.protein_g for l in logs), 1)
    tot_c = round(sum(l.carbs_g for l in logs), 1)
    tot_f = round(sum(l.fat_g for l in logs), 1)
    goal_cal = user.profile.daily_calorie_target if user.profile else 2400

    return {
        "date_str": target_date,
        "daily_target_calories_kcal": goal_cal,
        "totals": {
            "calories_kcal": tot_cal,
            "protein_g": tot_p,
            "carbs_g": tot_c,
            "fat_g": tot_f,
        },
        "logs": [
            {
                "id": l.id,
                "meal_type": l.meal_type,
                "food_name": l.food_name,
                "calories": l.calories,
                "protein_g": l.protein_g,
                "carbs_g": l.carbs_g,
                "fat_g": l.fat_g,
                "is_vegetarian": l.is_vegetarian,
            }
            for l in logs
        ],
        "saved_plan": {
            "goal": latest_plan.goal,
            "dietary_preference": latest_plan.dietary_preference,
            "target_calories": latest_plan.target_calories,
            "macros": {
                "protein_g": latest_plan.protein_g,
                "carbs_g": latest_plan.carbs_g,
                "fat_g": latest_plan.fat_g,
            },
            "meals": json.loads(latest_plan.meals_json),
            "grocery_list": json.loads(latest_plan.grocery_list_json),
        }
        if latest_plan
        else None,
        "is_estimate": True,
        "disclaimer": ESTIMATE_DISCLAIMER,
    }


@app.post("/api/diet/nutrition-logs", tags=["Module 2: AI Dietician & Calorie Coach"], status_code=status.HTTP_201_CREATED)
def add_nutrition_log(
    req: NutritionLogCreateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_date = req.date_str or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    new_log = NutritionLog(
        user_id=user.id,
        date_str=target_date,
        meal_type=req.meal_type,
        food_name=req.food_name.strip(),
        calories=req.calories,
        protein_g=req.protein_g,
        carbs_g=req.carbs_g,
        fat_g=req.fat_g,
        is_vegetarian=req.is_vegetarian,
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    return {
        "message": "Meal logged successfully (Estimated values)",
        "log": {
            "id": new_log.id,
            "date_str": new_log.date_str,
            "meal_type": new_log.meal_type,
            "food_name": new_log.food_name,
            "calories": new_log.calories,
            "protein_g": new_log.protein_g,
            "carbs_g": new_log.carbs_g,
            "fat_g": new_log.fat_g,
            "is_vegetarian": new_log.is_vegetarian,
        },
    }


@app.delete("/api/diet/nutrition-logs/{log_id}", tags=["Module 2: AI Dietician & Calorie Coach"])
def delete_nutrition_log(
    log_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(NutritionLog).filter(NutritionLog.id == log_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Nutrition log not found.")
    if item.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You are not authorized to delete another user's nutrition log.",
        )
    db.delete(item)
    db.commit()
    return {"message": "Nutrition log removed"}


# ==============================================================================
# MODULE 3: SMART GYM ASSISTANT (AI + IOT MQTT)
# ==============================================================================

@app.get("/api/iot/status", tags=["Module 3: Smart Gym Assistant (IoT + MQTT)"])
def get_iot_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    devices = db.query(IoTDeviceRecord).all()
    snapshot = iot_manager.simulate_telemetry_step(devices)
    db.commit()
    return snapshot


@app.post("/api/iot/device/control", tags=["Module 3: Smart Gym Assistant (IoT + MQTT)"])
def control_iot_device(
    req: IoTDeviceUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dev = db.query(IoTDeviceRecord).filter(IoTDeviceRecord.device_id == req.device_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail=f"IoT device '{req.device_id}' not found.")

    if req.is_connected is not None:
        dev.is_connected = req.is_connected
    if req.resistance_kg is not None:
        dev.resistance_kg = req.resistance_kg
    if req.speed_kmh is not None:
        dev.speed_kmh = req.speed_kmh
    if req.heart_rate_bpm is not None:
        dev.heart_rate_bpm = req.heart_rate_bpm
    if req.intensity_level is not None:
        dev.intensity_level = req.intensity_level

    dev.status = "Simulated Active" if dev.is_connected else "Standby (Disconnected)"
    db.commit()

    devices = db.query(IoTDeviceRecord).all()
    snapshot = iot_manager.simulate_telemetry_step(devices)
    db.commit()
    return {
        "message": f"Updated simulated telemetry/control state for {dev.name}",
        "iot_state": snapshot,
    }


# ==============================================================================
# MODULE 4: AI FITNESS HABIT TRACKER (SCIKIT-LEARN)
# ==============================================================================

@app.get("/api/habits/dashboard", tags=["Module 4: AI Fitness Habit Tracker"])
def get_habit_dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    logs = (
        db.query(HabitLog)
        .filter(HabitLog.user_id == user.id)
        .order_by(HabitLog.date_str.desc())
        .limit(30)
        .all()
    )
    stats = habit_service.compute_streak_and_consistency(logs)
    latest = logs[0] if logs else None

    pred = habit_service.predict_adherence(
        age=user.age or 26,
        sleep_hours=latest.sleep_hours if latest else 7.5,
        stress_level=latest.stress_level if latest else 4,
        work_hours=latest.work_hours if latest else 8.0,
        motivation_level=latest.motivation_level if latest else 8,
        prev_days_active=min(7, stats["current_streak"]),
        water_liters=latest.water_liters if latest else 2.6,
    )

    prof = user.profile
    return {
        "summary": stats,
        "schedule_settings": {
            "workout_days_per_week": prof.workout_days_per_week if prof else 5,
            "preferred_workout_time": prof.preferred_workout_time if prof else "18:00",
            "upcoming_reminder": (
                f"Next scheduled workout today at {prof.preferred_workout_time if prof else '18:00'} — "
                f"{pred['recommended_schedule_adjustment']}"
            ),
        },
        "latest_prediction": pred,
        "logs": [
            {
                "id": l.id,
                "date_str": l.date_str,
                "scheduled_workout": l.scheduled_workout,
                "completed": l.completed,
                "sleep_hours": l.sleep_hours,
                "stress_level": l.stress_level,
                "work_hours": l.work_hours,
                "motivation_level": l.motivation_level,
                "water_liters": l.water_liters,
                "adherence_prob": l.adherence_prob,
                "notes": l.notes,
            }
            for l in logs
        ],
    }


@app.post("/api/habits/predict", tags=["Module 4: AI Fitness Habit Tracker"])
def predict_habit_adherence(
    req: HabitPredictionRequest,
    user: User = Depends(get_current_user),
):
    return habit_service.predict_adherence(
        age=req.age,
        sleep_hours=req.sleep_hours,
        stress_level=req.stress_level,
        work_hours=req.work_hours,
        motivation_level=req.motivation_level,
        prev_days_active=req.prev_days_active,
        water_liters=req.water_liters,
    )


@app.post("/api/habits/gemini-motivation", tags=["Module 4: AI Fitness Habit Tracker"])
def api_habit_gemini_motivation(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generates personalized fitness motivation and habit-stacking guidance via Google Gemini."""
    logs = (
        db.query(HabitLog)
        .filter(HabitLog.user_id == user.id)
        .order_by(HabitLog.date_str.desc())
        .limit(30)
        .all()
    )
    stats = habit_service.compute_streak_and_consistency(logs)
    latest = logs[0] if logs else None
    pred = habit_service.predict_adherence(
        age=user.age or 26,
        sleep_hours=latest.sleep_hours if latest else 7.5,
        stress_level=latest.stress_level if latest else 4,
        work_hours=latest.work_hours if latest else 8.0,
        motivation_level=latest.motivation_level if latest else 8,
        prev_days_active=min(7, stats["current_streak"]),
        water_liters=latest.water_liters if latest else 2.6,
    )
    prof = user.profile
    user_ctx = {
        "name": user.name,
        "goal": prof.fitness_goal if prof else "Muscle Gain",
    }
    return generate_habit_gemini_motivation(stats, pred, user_ctx)


@app.post("/api/habits/log", tags=["Module 4: AI Fitness Habit Tracker"], status_code=status.HTTP_201_CREATED)
def log_daily_habit(
    req: HabitLogCreateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_date = req.date_str or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pred = habit_service.predict_adherence(
        age=user.age or 26,
        sleep_hours=req.sleep_hours,
        stress_level=req.stress_level,
        work_hours=req.work_hours,
        motivation_level=req.motivation_level,
        prev_days_active=4,
        water_liters=req.water_liters,
    )

    existing = (
        db.query(HabitLog)
        .filter(HabitLog.user_id == user.id, HabitLog.date_str == target_date)
        .first()
    )
    if existing:
        existing.scheduled_workout = req.scheduled_workout
        existing.completed = req.completed
        existing.sleep_hours = req.sleep_hours
        existing.stress_level = req.stress_level
        existing.work_hours = req.work_hours
        existing.motivation_level = req.motivation_level
        existing.water_liters = req.water_liters
        existing.adherence_prob = pred["adherence_probability"]
        existing.notes = req.notes
        record = existing
    else:
        record = HabitLog(
            user_id=user.id,
            date_str=target_date,
            scheduled_workout=req.scheduled_workout,
            completed=req.completed,
            sleep_hours=req.sleep_hours,
            stress_level=req.stress_level,
            work_hours=req.work_hours,
            motivation_level=req.motivation_level,
            water_liters=req.water_liters,
            adherence_prob=pred["adherence_probability"],
            notes=req.notes,
        )
        db.add(record)

    db.commit()
    db.refresh(record)
    return {
        "message": "Daily habit activity logged!",
        "prediction": pred,
        "log": {
            "id": record.id,
            "date_str": record.date_str,
            "scheduled_workout": record.scheduled_workout,
            "completed": record.completed,
            "adherence_prob": record.adherence_prob,
        },
    }


@app.put("/api/habits/schedule", tags=["Module 4: AI Fitness Habit Tracker"])
def update_workout_schedule(
    req: ScheduleUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.profile:
        user.profile.workout_days_per_week = req.workout_days_per_week
        user.profile.preferred_workout_time = req.preferred_workout_time
        db.commit()
    return {
        "message": "Workout schedule updated",
        "workout_days_per_week": req.workout_days_per_week,
        "preferred_workout_time": req.preferred_workout_time,
    }


# ==============================================================================
# MODULE 5: VIRTUAL GYM BUDDY (CHATBOT)
# ==============================================================================

@app.get("/api/chat/history", tags=["Module 5: Virtual Gym Buddy"])
def get_chat_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == user.id)
        .order_by(ChatMessage.id.asc())
        .limit(50)
        .all()
    )
    clean_messages = [
        m
        for m in messages
        if not (m.provider or "").startswith("local_fallback")
        and not (m.content or "").startswith("### Coach Response for ")
    ]
    return {
        "gemini_status": get_gemini_status(),
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "sentiment": m.sentiment,
                "mood_tag": m.mood_tag,
                "provider": m.provider,
                "created_at": m.created_at.strftime("%H:%M") if m.created_at else "",
            }
            for m in clean_messages
        ],
    }


@app.post("/api/chat/message", tags=["Module 5: Virtual Gym Buddy"])
def send_chat_message(
    req: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_question = (req.message or req.question or "").strip()
    if not user_question:
        raise HTTPException(status_code=422, detail="Chat message cannot be empty.")

    prior_msgs = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == user.id)
        .order_by(ChatMessage.id.asc())
        .all()
    )
    db_history = [
        {"role": m.role, "content": m.content, "provider": m.provider or ""}
        for m in prior_msgs
        if m.provider != "system"
        and not (m.provider or "").startswith("local_fallback")
        and not (m.content or "").startswith("### Coach Response for ")
    ]

    if req.history is not None:
        history_payload = [
            {"role": item.role, "content": item.content, "provider": ""}
            for item in req.history
            if item.content and not item.content.startswith("### Coach Response for ")
        ][-12:]
    else:
        history_payload = db_history[-12:]

    prof = user.profile
    user_ctx = {
        "name": user.name,
        "goal": prof.fitness_goal if prof else "Muscle Gain",
        "dietary_preference": prof.dietary_preference if prof else "Vegetarian",
        "daily_calorie_target": prof.daily_calorie_target if prof else 2400,
    }

    reply = generate_buddy_reply(user_question, history_payload, user_ctx)

    gemini_status = reply.get("gemini_status")
    if gemini_status != "success" or not reply.get("answer"):
        error_msg = reply.get("gemini_error") or "Failed to generate response from Google Gemini."
        if gemini_status == "missing_api_key":
            http_status = status.HTTP_503_SERVICE_UNAVAILABLE
        elif gemini_status == "quota_exceeded":
            http_status = status.HTTP_429_TOO_MANY_REQUESTS
        else:
            http_status = status.HTTP_502_BAD_GATEWAY

        return JSONResponse(
            status_code=http_status,
            content={
                "detail": error_msg,
                "question": user_question,
                "answer": None,
                "sentiment": reply["sentiment"],
                "mood_tag": reply["mood_tag"],
                "provider": reply["provider"],
                "gemini_status": gemini_status,
                "gemini_error_code": gemini_status,
                "gemini_error": error_msg,
                "fallback_used": False,
            },
        )

    user_msg = ChatMessage(
        user_id=user.id,
        role="user",
        content=user_question,
        sentiment=reply["sentiment"],
        mood_tag=reply["mood_tag"],
        provider="user",
    )
    bot_msg = ChatMessage(
        user_id=user.id,
        role="assistant",
        content=reply["answer"],
        sentiment=reply["sentiment"],
        mood_tag=reply["mood_tag"],
        provider=reply["provider"],
    )
    db.add_all([user_msg, bot_msg])
    db.commit()

    return {
        "question": user_question,
        "answer": reply["answer"],
        "reply": reply["answer"],
        "sentiment": reply["sentiment"],
        "mood_tag": reply["mood_tag"],
        "provider": reply["provider"],
        "gemini_status": "success",
        "gemini_error_code": None,
        "gemini_error": None,
        "fallback_used": False,
    }


@app.delete("/api/chat/history", tags=["Module 5: Virtual Gym Buddy"])
def clear_chat_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(ChatMessage).filter(ChatMessage.user_id == user.id).delete()
    db.add(
        ChatMessage(
            user_id=user.id,
            role="assistant",
            content="Chat history cleared! Ready for your next workout or nutrition question.",
            sentiment="positive",
            mood_tag="Ready",
            provider="system",
        )
    )
    db.commit()
    return {"message": "Conversation history cleared"}


# ==============================================================================
# MODULE 6: POSE-TO-PERFORMANCE ANALYZER
# ==============================================================================

@app.get("/api/performance/reports", tags=["Module 6: Pose-to-Performance Analyzer"])
def get_performance_reports(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    reports = (
        db.query(PerformanceReport)
        .filter(PerformanceReport.user_id == user.id)
        .order_by(PerformanceReport.created_at.desc())
        .limit(20)
        .all()
    )

    avg_overall = round(sum(r.overall_score for r in reports) / len(reports), 1) if reports else 0.0
    avg_rom = round(sum(r.rom_efficiency for r in reports) / len(reports), 1) if reports else 0.0
    avg_sym = round(sum(r.symmetry_score for r in reports) / len(reports), 1) if reports else 0.0
    avg_posture = round(sum(r.posture_accuracy for r in reports) / len(reports), 1) if reports else 0.0

    return {
        "weekly_summary": {
            "sessions_evaluated": len(reports),
            "avg_overall_score": avg_overall,
            "avg_rom_efficiency": avg_rom,
            "avg_symmetry_score": avg_sym,
            "avg_posture_accuracy": avg_posture,
            "summary_note": HEURISTIC_DISCLAIMER,
        },
        "exercise_specs": EXERCISE_BIOMECHANICS_SPECS,
        "reports": [
            {
                "id": r.id,
                "exercise": r.exercise,
                "rom_angle_min": r.rom_angle_min,
                "rom_angle_max": r.rom_angle_max,
                "rom_efficiency": r.rom_efficiency,
                "symmetry_score": r.symmetry_score,
                "tempo_consistency": r.tempo_consistency,
                "posture_accuracy": r.posture_accuracy,
                "overall_score": r.overall_score,
                "reps_analyzed": r.reps_analyzed,
                "feedback_summary": r.feedback_summary,
                "date": r.created_at.strftime("%b %d") if r.created_at else "",
            }
            for r in reports
        ],
    }


@app.post("/api/performance/analyze", tags=["Module 6: Pose-to-Performance Analyzer"])
def analyze_exercise_performance(
    req: PerformanceAnalyzeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    eval_res = evaluate_pose_performance(
        exercise=req.exercise,
        rom_angle_min=req.rom_angle_min,
        rom_angle_max=req.rom_angle_max,
        left_right_diff_deg=req.left_right_diff_deg,
        rep_durations_sec=req.rep_durations_sec,
        posture_violation_ratio=req.posture_violation_ratio,
        reps_completed=req.reps_completed,
    )

    rep = PerformanceReport(
        user_id=user.id,
        exercise=req.exercise,
        rom_angle_min=req.rom_angle_min,
        rom_angle_max=req.rom_angle_max,
        rom_efficiency=eval_res["rom_efficiency"],
        symmetry_score=eval_res["symmetry_score"],
        tempo_consistency=eval_res["tempo_consistency"],
        posture_accuracy=eval_res["posture_accuracy"],
        overall_score=eval_res["overall_score"],
        reps_analyzed=req.reps_completed,
        feedback_summary=eval_res["feedback_summary"],
    )
    db.add(rep)
    db.commit()
    return eval_res


# ==============================================================================
# MODULE 7: GYM RECOMMENDER & WORKOUT PLANNER
# ==============================================================================

@app.get("/api/planner/current", tags=["Module 7: Gym Recommender & Planner"])
def get_current_workout_plan(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    latest = (
        db.query(WorkoutPlan)
        .filter(WorkoutPlan.user_id == user.id)
        .order_by(WorkoutPlan.created_at.desc())
        .first()
    )
    if latest:
        plan_obj = {
            "id": latest.id,
            "title": latest.title,
            "goal": latest.goal,
            "experience_level": latest.experience_level,
            "equipment": latest.equipment,
            "days_per_week": latest.days_per_week,
            "schedule": json.loads(latest.schedule_json),
            "challenges": json.loads(latest.challenges_json) if latest.challenges_json else FITNESS_CHALLENGES,
        }
    else:
        plan_obj = generate_weekly_workout_plan()

    return {
        "plan": plan_obj,
        "exercise_catalog": EXERCISE_CATALOG,
        "challenges": FITNESS_CHALLENGES,
    }


@app.post("/api/planner/generate", tags=["Module 7: Gym Recommender & Planner"])
def generate_custom_workout_plan(
    req: WorkoutPlanCreateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = generate_weekly_workout_plan(
        goal=req.goal,
        experience_level=req.experience_level,
        equipment=req.equipment,
        days_per_week=req.days_per_week,
    )
    db_plan = WorkoutPlan(
        user_id=user.id,
        title=plan["title"],
        goal=plan["goal"],
        experience_level=plan["experience_level"],
        equipment=plan["equipment"],
        days_per_week=plan["days_per_week"],
        schedule_json=json.dumps(plan["schedule"]),
        challenges_json=json.dumps(plan["challenges"]),
    )
    db.add(db_plan)
    db.commit()

    user_ctx = {"name": user.name}
    plan["ai_guidance"] = generate_planner_gemini_guidance(plan, user_ctx)
    return plan


@app.post("/api/planner/gemini-plan", tags=["Module 7: Gym Recommender & Planner"])
def api_planner_gemini_guidance(
    req: Optional[GeminiCustomQueryRequest] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generates personalized workout split progression & periodization advice via Google Gemini."""
    latest = (
        db.query(WorkoutPlan)
        .filter(WorkoutPlan.user_id == user.id)
        .order_by(WorkoutPlan.created_at.desc())
        .first()
    )
    plan_ctx = (
        {
            "title": latest.title,
            "goal": latest.goal,
            "experience_level": latest.experience_level,
            "equipment": latest.equipment,
            "days_per_week": latest.days_per_week,
        }
        if latest
        else generate_weekly_workout_plan()
    )
    guidance = generate_planner_gemini_guidance(
        workout_plan=plan_ctx,
        user_context={"name": user.name},
        custom_query=req.query if req else None,
    )
    return {**guidance, "ai_guidance": guidance}


@app.get("/api/maps/status", tags=["Module 7: Gym Recommender & Planner"])
def api_google_maps_status():
    """Returns safe configuration status for Google Places API (New) without exposing keys."""
    return get_google_maps_status()


@app.get("/api/planner/gyms", tags=["Module 7: Gym Recommender & Planner"])
def get_nearby_gyms(
    city: Optional[str] = Query(default=None),
    location: Optional[str] = Query(default=None),
    facility: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    lat: Optional[float] = Query(default=None, ge=-90.0, le=90.0),
    lng: Optional[float] = Query(default=None, ge=-180.0, le=180.0),
    radius_m: int = Query(default=5000, ge=500, le=50000),
    user: User = Depends(get_current_user),
):
    resolved_location = (location or city or "").strip()
    if not resolved_location and lat is None and lng is None:
        resolved_location = (user.profile.city if user.profile and user.profile.city else "Bengaluru")

    return search_nearby_gyms(
        city=resolved_location,
        facility_filter=facility,
        search_query=search,
        lat=lat,
        lng=lng,
        radius_m=radius_m,
    )


# Serve built React frontend at `/` when `frontend/dist` is available
import os as _os
from fastapi.staticfiles import StaticFiles as _StaticFiles

_FRONTEND_DIST = _os.path.abspath(
    _os.path.join(_os.path.dirname(__file__), "..", "frontend", "dist")
)
if _os.path.isdir(_FRONTEND_DIST):
    app.mount("/", _StaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")

