"""Initial PostgreSQL schema for AI Gym & Fitness Assistant

Revision ID: 0001_initial_postgresql_schema
Revises: None
Create Date: 2026-09-25 17:20:00

Creates the required relational tables and foreign-key relationships:
- users
- fitness_profiles
- workout_history
- diet_plans
- habit_logs
- chat_history
plus supporting module tables (bmi_history, workout_plans, nutrition_logs,
performance_analytics, iot_devices, gym_locations).
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial_postgresql_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing_tables = set(sa.inspect(bind).get_table_names())

    # 1. users
    if "users" not in existing_tables:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("email", sa.String(length=120), nullable=False, unique=True),
            sa.Column("password_hash", sa.String(length=255), nullable=False),
            sa.Column("age", sa.Integer(), nullable=True, server_default="25"),
            sa.Column("gender", sa.String(length=20), nullable=True, server_default="Male"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
        op.create_index("ix_users_id", "users", ["id"], unique=False)
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    # 1b. user_sessions (database-backed login/logout session tracking)
    if "user_sessions" not in existing_tables:
        op.create_table(
            "user_sessions",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("token_jti", sa.String(length=100), nullable=False, unique=True),
            sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("remember_me", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_user_sessions_id", "user_sessions", ["id"], unique=False)
        op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"], unique=False)
        op.create_index("ix_user_sessions_token_jti", "user_sessions", ["token_jti"], unique=True)
        op.create_index("ix_user_sessions_is_revoked", "user_sessions", ["is_revoked"], unique=False)

    # 2. fitness_profiles
    if "fitness_profiles" not in existing_tables:
        op.create_table(
            "fitness_profiles",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
            ),
            sa.Column("height_cm", sa.Float(), nullable=True, server_default="175.0"),
            sa.Column("weight_kg", sa.Float(), nullable=True, server_default="72.0"),
            sa.Column("target_weight_kg", sa.Float(), nullable=True, server_default="70.0"),
            sa.Column("fitness_goal", sa.String(length=50), nullable=True, server_default="Muscle Gain"),
            sa.Column("experience_level", sa.String(length=50), nullable=True, server_default="Intermediate"),
            sa.Column("dietary_preference", sa.String(length=50), nullable=True, server_default="Vegetarian"),
            sa.Column("activity_level", sa.String(length=60), nullable=True, server_default="Moderately Active"),
            sa.Column(
                "available_equipment",
                sa.String(length=255),
                nullable=True,
                server_default="Full Gym, Dumbbells, Bodyweight",
            ),
            sa.Column("workout_days_per_week", sa.Integer(), nullable=True, server_default="5"),
            sa.Column("preferred_workout_time", sa.String(length=40), nullable=True, server_default="18:00"),
            sa.Column("daily_calorie_target", sa.Integer(), nullable=True, server_default="2400"),
            sa.Column("city", sa.String(length=100), nullable=True, server_default="Bengaluru"),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
        )
        op.create_index("ix_fitness_profiles_id", "fitness_profiles", ["id"], unique=False)
        op.create_index("ix_fitness_profiles_user_id", "fitness_profiles", ["user_id"], unique=True)

    # 3. workout_history
    if "workout_history" not in existing_tables:
        op.create_table(
            "workout_history",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("exercise", sa.String(length=80), nullable=False),
            sa.Column("left_reps", sa.Integer(), nullable=True, server_default="0"),
            sa.Column("right_reps", sa.Integer(), nullable=True, server_default="0"),
            sa.Column("total_reps", sa.Integer(), nullable=False),
            sa.Column("duration_sec", sa.Integer(), nullable=True, server_default="0"),
            sa.Column("calories_burned", sa.Float(), nullable=True, server_default="0.0"),
            sa.Column("avg_rom_score", sa.Float(), nullable=True, server_default="85.0"),
            sa.Column("form_score", sa.Float(), nullable=True, server_default="88.0"),
            sa.Column("tempo_score", sa.Float(), nullable=True, server_default="84.0"),
            sa.Column("performance_score", sa.Float(), nullable=True, server_default="86.0"),
            sa.Column("posture_notes", sa.Text(), nullable=True),
            sa.Column("mode", sa.String(length=30), nullable=True, server_default="webcam"),
            sa.Column(
                "recorded_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
        )
        op.create_index("ix_workout_history_id", "workout_history", ["id"], unique=False)
        op.create_index("ix_workout_history_user_id", "workout_history", ["user_id"], unique=False)

    # 4. diet_plans
    if "diet_plans" not in existing_tables:
        op.create_table(
            "diet_plans",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("goal", sa.String(length=50), nullable=False),
            sa.Column("dietary_preference", sa.String(length=50), nullable=False),
            sa.Column("target_calories", sa.Integer(), nullable=False),
            sa.Column("protein_g", sa.Integer(), nullable=False),
            sa.Column("carbs_g", sa.Integer(), nullable=False),
            sa.Column("fat_g", sa.Integer(), nullable=False),
            sa.Column("meals_json", sa.Text(), nullable=False),
            sa.Column("grocery_list_json", sa.Text(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
        )
        op.create_index("ix_diet_plans_id", "diet_plans", ["id"], unique=False)
        op.create_index("ix_diet_plans_user_id", "diet_plans", ["user_id"], unique=False)

    # 5. habit_logs
    if "habit_logs" not in existing_tables:
        op.create_table(
            "habit_logs",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("date_str", sa.String(length=20), nullable=False),
            sa.Column("scheduled_workout", sa.String(length=100), nullable=True),
            sa.Column("completed", sa.Boolean(), nullable=True, server_default=sa.text("true")),
            sa.Column("sleep_hours", sa.Float(), nullable=True, server_default="7.5"),
            sa.Column("stress_level", sa.Integer(), nullable=True, server_default="4"),
            sa.Column("work_hours", sa.Float(), nullable=True, server_default="8.0"),
            sa.Column("motivation_level", sa.Integer(), nullable=True, server_default="8"),
            sa.Column("water_liters", sa.Float(), nullable=True, server_default="2.5"),
            sa.Column("adherence_prob", sa.Float(), nullable=True, server_default="0.82"),
            sa.Column("notes", sa.String(length=255), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
        )
        op.create_index("ix_habit_logs_id", "habit_logs", ["id"], unique=False)
        op.create_index("ix_habit_logs_user_id", "habit_logs", ["user_id"], unique=False)
        op.create_index("ix_habit_logs_date_str", "habit_logs", ["date_str"], unique=False)

    # 6. chat_history
    if "chat_history" not in existing_tables:
        op.create_table(
            "chat_history",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("role", sa.String(length=20), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("sentiment", sa.String(length=30), nullable=True, server_default="positive"),
            sa.Column("mood_tag", sa.String(length=50), nullable=True, server_default="Focused"),
            sa.Column("provider", sa.String(length=60), nullable=True, server_default="local_fallback"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
        )
        op.create_index("ix_chat_history_id", "chat_history", ["id"], unique=False)
        op.create_index("ix_chat_history_user_id", "chat_history", ["user_id"], unique=False)

    # Supporting tables (bmi_history, workout_plans, nutrition_logs, performance_analytics, iot_devices, gym_locations)
    if "bmi_history" not in existing_tables:
        op.create_table(
            "bmi_history",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("height_cm", sa.Float(), nullable=False),
            sa.Column("weight_kg", sa.Float(), nullable=False),
            sa.Column("bmi", sa.Float(), nullable=False),
            sa.Column("category", sa.String(length=50), nullable=False),
            sa.Column("bmr", sa.Float(), nullable=True, server_default="1700.0"),
            sa.Column("tdee", sa.Float(), nullable=True, server_default="2400.0"),
            sa.Column(
                "recorded_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
        )
        op.create_index("ix_bmi_history_id", "bmi_history", ["id"], unique=False)
        op.create_index("ix_bmi_history_user_id", "bmi_history", ["user_id"], unique=False)

    if "workout_plans" not in existing_tables:
        op.create_table(
            "workout_plans",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("title", sa.String(length=150), nullable=False),
            sa.Column("goal", sa.String(length=50), nullable=False),
            sa.Column("experience_level", sa.String(length=50), nullable=True, server_default="Intermediate"),
            sa.Column("equipment", sa.String(length=150), nullable=True, server_default="Full Gym"),
            sa.Column("days_per_week", sa.Integer(), nullable=True, server_default="5"),
            sa.Column("schedule_json", sa.Text(), nullable=False),
            sa.Column("challenges_json", sa.Text(), nullable=True, server_default="[]"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
        )
        op.create_index("ix_workout_plans_id", "workout_plans", ["id"], unique=False)
        op.create_index("ix_workout_plans_user_id", "workout_plans", ["user_id"], unique=False)

    if "nutrition_logs" not in existing_tables:
        op.create_table(
            "nutrition_logs",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("date_str", sa.String(length=20), nullable=False),
            sa.Column("meal_type", sa.String(length=40), nullable=False),
            sa.Column("food_name", sa.String(length=150), nullable=False),
            sa.Column("calories", sa.Integer(), nullable=False),
            sa.Column("protein_g", sa.Float(), nullable=True, server_default="0.0"),
            sa.Column("carbs_g", sa.Float(), nullable=True, server_default="0.0"),
            sa.Column("fat_g", sa.Float(), nullable=True, server_default="0.0"),
            sa.Column("is_vegetarian", sa.Boolean(), nullable=True, server_default=sa.text("true")),
            sa.Column(
                "logged_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
        )
        op.create_index("ix_nutrition_logs_id", "nutrition_logs", ["id"], unique=False)
        op.create_index("ix_nutrition_logs_user_id", "nutrition_logs", ["user_id"], unique=False)
        op.create_index("ix_nutrition_logs_date_str", "nutrition_logs", ["date_str"], unique=False)

    if "performance_analytics" not in existing_tables:
        op.create_table(
            "performance_analytics",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("exercise", sa.String(length=80), nullable=False),
            sa.Column("session_id", sa.Integer(), nullable=True),
            sa.Column("rom_angle_min", sa.Float(), nullable=True, server_default="45.0"),
            sa.Column("rom_angle_max", sa.Float(), nullable=True, server_default="165.0"),
            sa.Column("rom_efficiency", sa.Float(), nullable=True, server_default="88.0"),
            sa.Column("symmetry_score", sa.Float(), nullable=True, server_default="92.0"),
            sa.Column("tempo_consistency", sa.Float(), nullable=True, server_default="85.0"),
            sa.Column("posture_accuracy", sa.Float(), nullable=True, server_default="90.0"),
            sa.Column("overall_score", sa.Float(), nullable=True, server_default="89.0"),
            sa.Column("reps_analyzed", sa.Integer(), nullable=True, server_default="12"),
            sa.Column("feedback_summary", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
        )
        op.create_index("ix_performance_analytics_id", "performance_analytics", ["id"], unique=False)
        op.create_index("ix_performance_analytics_user_id", "performance_analytics", ["user_id"], unique=False)

    if "iot_devices" not in existing_tables:
        op.create_table(
            "iot_devices",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("device_id", sa.String(length=60), nullable=False, unique=True),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("device_type", sa.String(length=60), nullable=False),
            sa.Column("mqtt_topic", sa.String(length=120), nullable=False),
            sa.Column("is_connected", sa.Boolean(), nullable=True, server_default=sa.text("true")),
            sa.Column("is_simulated", sa.Boolean(), nullable=True, server_default=sa.text("true")),
            sa.Column("resistance_kg", sa.Float(), nullable=True, server_default="15.0"),
            sa.Column("speed_kmh", sa.Float(), nullable=True, server_default="0.0"),
            sa.Column("heart_rate_bpm", sa.Integer(), nullable=True, server_default="118"),
            sa.Column("intensity_level", sa.String(length=40), nullable=True, server_default="Moderate"),
            sa.Column("status", sa.String(length=40), nullable=True, server_default="Active (Simulated)"),
            sa.Column("last_telemetry_json", sa.Text(), nullable=True, server_default="{}"),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
        )
        op.create_index("ix_iot_devices_id", "iot_devices", ["id"], unique=False)
        op.create_index("ix_iot_devices_device_id", "iot_devices", ["device_id"], unique=True)

    if "gym_locations" not in existing_tables:
        op.create_table(
            "gym_locations",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("address", sa.String(length=255), nullable=False),
            sa.Column("city", sa.String(length=80), nullable=False),
            sa.Column("latitude", sa.Float(), nullable=False),
            sa.Column("longitude", sa.Float(), nullable=False),
            sa.Column("rating", sa.Float(), nullable=True, server_default="4.5"),
            sa.Column("facilities_json", sa.Text(), nullable=True, server_default="[]"),
            sa.Column("price_tier", sa.String(length=30), nullable=True, server_default="$$"),
            sa.Column("opening_hours", sa.String(length=100), nullable=True, server_default="05:30 AM - 10:30 PM"),
            sa.Column("distance_km", sa.Float(), nullable=True, server_default="1.2"),
            sa.Column("is_sample_data", sa.Boolean(), nullable=True, server_default=sa.text("true")),
        )
        op.create_index("ix_gym_locations_id", "gym_locations", ["id"], unique=False)
        op.create_index("ix_gym_locations_city", "gym_locations", ["city"], unique=False)


def downgrade() -> None:
    for table_name in [
        "gym_locations",
        "iot_devices",
        "performance_analytics",
        "nutrition_logs",
        "workout_plans",
        "bmi_history",
        "chat_history",
        "habit_logs",
        "diet_plans",
        "workout_history",
        "fitness_profiles",
        "users",
    ]:
        op.drop_table(table_name)
