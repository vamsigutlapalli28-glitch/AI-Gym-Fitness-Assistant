"""PostgreSQL & SQLAlchemy Relational Database Schema for AI Gym & Fitness Assistant.

Core Required Tables & Relationships:
1. `users` (`User`) — Registered athletes with unique email, bcrypt password_hash, and created_at timestamp
2. `fitness_profiles` (`FitnessProfile`) — 1-to-1 biometric & goal profile per user
3. `workout_history` (`WorkoutSession`) — 1-to-many exercise repetition, duration, calorie & posture sessions
4. `diet_plans` (`DietPlanRecord`) — 1-to-many personalized macro meal plans & grocery lists
5. `habit_logs` (`HabitLog`) — 1-to-many daily workout adherence & lifestyle habit logs
6. `chat_history` (`ChatMessage`) — 1-to-many Virtual Gym Buddy conversation messages

Additional Module Tables:
7. `bmi_history` (`BMIRecord`)
8. `workout_plans` (`WorkoutPlan`)
9. `nutrition_logs` (`NutritionLog`)
10. `performance_analytics` (`PerformanceReport`)
11. `iot_devices` (`IoTDeviceRecord`)
12. `gym_locations` (`GymLocationRecord`)
"""

import os
import re
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship, validates
from backend.database import Base

_GEMINI_KEY_PATTERN = re.compile(r"AIza[0-9A-Za-z\-_]{20,}")


def utcnow():
    return datetime.now(timezone.utc)


def _sanitize_no_gemini_key(text_value: str) -> str:
    """Ensures a Gemini API key is never persisted in any database text column."""
    if not text_value:
        return text_value
    cleaned = _GEMINI_KEY_PATTERN.sub("[REDACTED_API_KEY]", text_value)
    env_key = os.getenv("GEMINI_API_KEY", "").strip()
    if env_key and len(env_key) > 8 and env_key.lower() not in (
        "your_actual_gemini_api_key",
        "your_gemini_api_key",
    ):
        cleaned = cleaned.replace(env_key, "[REDACTED_API_KEY]")
    return cleaned


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    age = Column(Integer, default=25)
    gender = Column(String(20), default="Male")
    created_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
        nullable=False,
    )

    profile = relationship(
        "FitnessProfile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    workout_sessions = relationship(
        "WorkoutSession",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    diet_plans = relationship(
        "DietPlanRecord",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    habit_logs = relationship(
        "HabitLog",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    chat_messages = relationship(
        "ChatMessage",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    bmi_records = relationship(
        "BMIRecord",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    workout_plans = relationship(
        "WorkoutPlan",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    nutrition_logs = relationship(
        "NutritionLog",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    performance_reports = relationship(
        "PerformanceReport",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    sessions = relationship(
        "UserSession",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @validates("password_hash")
    def _validate_bcrypt_hash(self, key, value: str) -> str:
        """Guarantees plaintext passwords are never stored in the users table."""
        if not value or not value.startswith(("$2b$", "$2a$", "$2y$", "$argon2")):
            raise ValueError(
                "Security violation: User.password_hash must be a valid bcrypt or Argon2 hash, never plaintext."
            )
        return value


class UserSession(Base):
    """Persists active and logged-out/revoked JWT sessions in the database."""

    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_jti = Column(String(100), unique=True, index=True, nullable=False)
    is_revoked = Column(Boolean, default=False, nullable=False, index=True)
    remember_me = Column(Boolean, default=False, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
        nullable=False,
    )
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="sessions")


class FitnessProfile(Base):
    __tablename__ = "fitness_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    height_cm = Column(Float, default=175.0)
    weight_kg = Column(Float, default=72.0)
    target_weight_kg = Column(Float, default=70.0)
    fitness_goal = Column(String(50), default="Muscle Gain")
    experience_level = Column(String(50), default="Intermediate")
    dietary_preference = Column(String(50), default="Vegetarian")
    activity_level = Column(String(60), default="Moderately Active")
    available_equipment = Column(String(255), default="Full Gym, Dumbbells, Bodyweight")
    workout_days_per_week = Column(Integer, default=5)
    preferred_workout_time = Column(String(40), default="18:00")
    daily_calorie_target = Column(Integer, default=2400)
    city = Column(String(100), default="Bengaluru")
    updated_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
    )

    user = relationship("User", back_populates="profile")


class WorkoutSession(Base):
    __tablename__ = "workout_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exercise = Column(String(80), nullable=False)
    left_reps = Column(Integer, default=0)
    right_reps = Column(Integer, default=0)
    total_reps = Column(Integer, nullable=False)
    duration_sec = Column(Integer, default=0)
    calories_burned = Column(Float, default=0.0)
    avg_rom_score = Column(Float, default=85.0)
    form_score = Column(Float, default=88.0)
    tempo_score = Column(Float, default=84.0)
    performance_score = Column(Float, default=86.0)
    posture_notes = Column(Text, default="Good form maintained")
    mode = Column(String(30), default="webcam")
    recorded_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )

    user = relationship("User", back_populates="workout_sessions")


class DietPlanRecord(Base):
    __tablename__ = "diet_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    goal = Column(String(50), nullable=False)
    dietary_preference = Column(String(50), nullable=False)
    target_calories = Column(Integer, nullable=False)
    protein_g = Column(Integer, nullable=False)
    carbs_g = Column(Integer, nullable=False)
    fat_g = Column(Integer, nullable=False)
    meals_json = Column(Text, nullable=False)
    grocery_list_json = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )

    user = relationship("User", back_populates="diet_plans")


class HabitLog(Base):
    __tablename__ = "habit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date_str = Column(String(20), nullable=False, index=True)
    scheduled_workout = Column(String(100), default="Strength & Conditioning")
    completed = Column(Boolean, default=True)
    sleep_hours = Column(Float, default=7.5)
    stress_level = Column(Integer, default=4)
    work_hours = Column(Float, default=8.0)
    motivation_level = Column(Integer, default=8)
    water_liters = Column(Float, default=2.5)
    adherence_prob = Column(Float, default=0.82)
    notes = Column(String(255), default="")
    created_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )

    user = relationship("User", back_populates="habit_logs")

    @validates("notes")
    def _validate_notes(self, key, value: str) -> str:
        return _sanitize_no_gemini_key(value)


class ChatMessage(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    sentiment = Column(String(30), default="positive")
    mood_tag = Column(String(50), default="Focused")
    provider = Column(String(60), default="local_fallback")
    created_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )

    user = relationship("User", back_populates="chat_messages")

    @validates("content")
    def _validate_content(self, key, value: str) -> str:
        return _sanitize_no_gemini_key(value)


class BMIRecord(Base):
    __tablename__ = "bmi_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    height_cm = Column(Float, nullable=False)
    weight_kg = Column(Float, nullable=False)
    bmi = Column(Float, nullable=False)
    category = Column(String(50), nullable=False)
    bmr = Column(Float, default=1700.0)
    tdee = Column(Float, default=2400.0)
    recorded_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )

    user = relationship("User", back_populates="bmi_records")


class WorkoutPlan(Base):
    __tablename__ = "workout_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(150), nullable=False)
    goal = Column(String(50), nullable=False)
    experience_level = Column(String(50), default="Intermediate")
    equipment = Column(String(150), default="Full Gym")
    days_per_week = Column(Integer, default=5)
    schedule_json = Column(Text, nullable=False)
    challenges_json = Column(Text, default="[]")
    created_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )

    user = relationship("User", back_populates="workout_plans")


class NutritionLog(Base):
    __tablename__ = "nutrition_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date_str = Column(String(20), nullable=False, index=True)
    meal_type = Column(String(40), nullable=False)
    food_name = Column(String(150), nullable=False)
    calories = Column(Integer, nullable=False)
    protein_g = Column(Float, default=0.0)
    carbs_g = Column(Float, default=0.0)
    fat_g = Column(Float, default=0.0)
    is_vegetarian = Column(Boolean, default=True)
    logged_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )

    user = relationship("User", back_populates="nutrition_logs")


class PerformanceReport(Base):
    __tablename__ = "performance_analytics"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exercise = Column(String(80), nullable=False)
    session_id = Column(Integer, nullable=True)
    rom_angle_min = Column(Float, default=45.0)
    rom_angle_max = Column(Float, default=165.0)
    rom_efficiency = Column(Float, default=88.0)
    symmetry_score = Column(Float, default=92.0)
    tempo_consistency = Column(Float, default=85.0)
    posture_accuracy = Column(Float, default=90.0)
    overall_score = Column(Float, default=89.0)
    reps_analyzed = Column(Integer, default=12)
    feedback_summary = Column(Text, default="")
    created_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )

    user = relationship("User", back_populates="performance_reports")


class IoTDeviceRecord(Base):
    __tablename__ = "iot_devices"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    device_id = Column(String(60), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    device_type = Column(String(60), nullable=False)
    mqtt_topic = Column(String(120), nullable=False)
    is_connected = Column(Boolean, default=True)
    is_simulated = Column(Boolean, default=True)
    resistance_kg = Column(Float, default=15.0)
    speed_kmh = Column(Float, default=0.0)
    heart_rate_bpm = Column(Integer, default=118)
    intensity_level = Column(String(40), default="Moderate")
    status = Column(String(40), default="Active (Simulated)")
    last_telemetry_json = Column(Text, default="{}")
    updated_at = Column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
    )


class GymLocationRecord(Base):
    __tablename__ = "gym_locations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    address = Column(String(255), nullable=False)
    city = Column(String(80), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    rating = Column(Float, default=4.5)
    facilities_json = Column(Text, default="[]")
    price_tier = Column(String(30), default="$$")
    opening_hours = Column(String(100), default="05:30 AM - 10:30 PM")
    distance_km = Column(Float, default=1.2)
    is_sample_data = Column(Boolean, default=True)
