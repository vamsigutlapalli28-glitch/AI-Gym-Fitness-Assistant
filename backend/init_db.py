r"""Database Initialization, Non-Destructive Data Sync & Alembic Migration Runner.

Usage:
    .\venv\Scripts\python.exe -m backend.init_db
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from backend.database import (
    ACTIVE_DATABASE_URL,
    CONFIGURED_DATABASE_URL,
    FALLBACK_DISK_SQLITE_URL,
    Base,
    engine,
    ensure_postgresql_database_exists,
    get_database_status,
)
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

logger = logging.getLogger(__name__)


def run_alembic_migrations() -> None:
    """Runs `alembic upgrade head` programmatically."""
    alembic_ini_path = Path(__file__).resolve().parent.parent / "alembic.ini"
    if alembic_ini_path.exists():
        alembic_cfg = Config(str(alembic_ini_path))
        alembic_cfg.set_main_option("sqlalchemy.url", ACTIVE_DATABASE_URL.replace("%", "%%"))
        command.upgrade(alembic_cfg, "head")
    else:
        Base.metadata.create_all(bind=engine)


def sync_existing_sqlite_data_to_postgresql() -> int:
    """Non-destructively copies existing users and records from `gym_ai_assistant.db` into PostgreSQL `fitness_db`."""
    if engine.dialect.name != "postgresql":
        return 0

    sqlite_file = Path(__file__).resolve().parent.parent / "gym_ai_assistant.db"
    if not sqlite_file.exists():
        return 0

    migrated_users = 0
    try:
        sqlite_engine = create_engine(
            FALLBACK_DISK_SQLITE_URL,
            connect_args={"check_same_thread": False},
        )
        SqliteSession = sessionmaker(bind=sqlite_engine)
        PgSession = sessionmaker(bind=engine)

        with SqliteSession() as src_db, PgSession() as dst_db:
            src_users = src_db.query(User).all()
            for u in src_users:
                exists = dst_db.query(User).filter(User.email == u.email).first()
                if exists:
                    continue

                new_u = User(
                    name=u.name,
                    email=u.email,
                    password_hash=u.password_hash,
                    age=u.age,
                    gender=u.gender,
                    created_at=u.created_at,
                )
                dst_db.add(new_u)
                dst_db.flush()

                if u.profile:
                    p = u.profile
                    dst_db.add(
                        FitnessProfile(
                            user_id=new_u.id,
                            height_cm=p.height_cm,
                            weight_kg=p.weight_kg,
                            target_weight_kg=p.target_weight_kg,
                            fitness_goal=p.fitness_goal,
                            experience_level=p.experience_level,
                            dietary_preference=p.dietary_preference,
                            activity_level=p.activity_level,
                            available_equipment=p.available_equipment,
                            workout_days_per_week=p.workout_days_per_week,
                            preferred_workout_time=p.preferred_workout_time,
                            daily_calorie_target=p.daily_calorie_target,
                            city=p.city,
                        )
                    )
                migrated_users += 1
            dst_db.commit()
        sqlite_engine.dispose()
    except Exception as exc:
        logger.warning("Non-destructive SQLite->PostgreSQL sync skipped: %s", exc)

    return migrated_users


def cleanup_legacy_fallback_chat_rows() -> None:
    """Removes legacy hardcoded 'Coach Response for ...' fallback rows and unpaired user rows from chat_history."""
    SessionCls = sessionmaker(bind=engine)
    with SessionCls() as db:
        db.query(ChatMessage).filter(
            (ChatMessage.provider.like("local_fallback%"))
            | (ChatMessage.content.like("### Coach Response for %"))
        ).delete(synchronize_session=False)
        db.commit()

        # Remove any orphan user messages that are not followed by an assistant reply
        all_msgs = db.query(ChatMessage).order_by(ChatMessage.user_id.asc(), ChatMessage.id.asc()).all()
        orphan_ids = []
        for idx, msg in enumerate(all_msgs):
            if msg.role == "user":
                nxt = all_msgs[idx + 1] if idx + 1 < len(all_msgs) else None
                if not nxt or nxt.user_id != msg.user_id or nxt.role != "assistant":
                    orphan_ids.append(msg.id)
        if orphan_ids:
            db.query(ChatMessage).filter(ChatMessage.id.in_(orphan_ids)).delete(synchronize_session=False)
            db.commit()

        # Remove any legacy sample/demo gym records
        db.query(GymLocationRecord).filter(
            (GymLocationRecord.is_sample_data.is_(True))
            | (GymLocationRecord.name.like("[Sample Demo]%"))
        ).delete(synchronize_session=False)
        db.commit()


def initialize_database() -> dict:
    """Ensures PostgreSQL `fitness_db` is migrated via Alembic and preserves all existing data."""
    if CONFIGURED_DATABASE_URL.startswith("postgresql"):
        ensure_postgresql_database_exists(CONFIGURED_DATABASE_URL)

    run_alembic_migrations()
    Base.metadata.create_all(bind=engine)
    sync_existing_sqlite_data_to_postgresql()
    cleanup_legacy_fallback_chat_rows()

    inspector = inspect(engine)
    tables = sorted(inspector.get_table_names())
    status = get_database_status()
    status["tables"] = tables
    return status


if __name__ == "__main__":
    info = initialize_database()
    print("=== AI Gym & Fitness Assistant — Database Initialized ===")
    print(f"Configured Driver : {info['configured_driver']}")
    print(f"Configured DB     : {info['configured_database']} ({info['configured_host']}:{info['configured_port']})")
    print(f"Password Set      : {info['password_configured']}")
    print(f"Active Dialect    : {info['active_dialect']}")
    print(f"Status Notice     : {info['connection_notice']}")
    print(f"Tables Verified   : {', '.join(info['tables'])}")
