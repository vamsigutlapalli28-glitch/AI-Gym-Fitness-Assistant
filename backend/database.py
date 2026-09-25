"""PostgreSQL 18 (`fitness_db`) & SQLAlchemy Database Configuration and Session Management.

Loads `DATABASE_URL` and `POSTGRES_*` credentials from `backend/.env` (targeting `fitness_db`).
Never hardcodes or invents database passwords.
"""

import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import quote_plus, urlparse, urlunparse

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger(__name__)

_BACKEND_ENV_PATH = Path(__file__).resolve().parent / ".env"
_ROOT_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

if _ROOT_ENV_PATH.exists():
    load_dotenv(dotenv_path=_ROOT_ENV_PATH, override=False)
if _BACKEND_ENV_PATH.exists():
    load_dotenv(dotenv_path=_BACKEND_ENV_PATH, override=True)

DEFAULT_POSTGRES_URL = "postgresql+psycopg2://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/fitness_db"
FALLBACK_DISK_SQLITE_URL = "sqlite:///./gym_ai_assistant.db"

PASSWORD_PLACEHOLDERS = {
    "",
    "your_postgres_password",
    "your_password_here",
    "change_me",
    "placeholder",
}


def resolve_configured_database_url() -> str:
    """Resolves the PostgreSQL connection URL from `backend/.env` (`DATABASE_URL` or `POSTGRES_*` vars)."""
    raw_url = os.getenv("DATABASE_URL", "").strip()
    pg_host = os.getenv("POSTGRES_HOST", "localhost").strip() or "localhost"
    pg_port = os.getenv("POSTGRES_PORT", "5432").strip() or "5432"
    pg_db = os.getenv("POSTGRES_DB", "fitness_db").strip() or "fitness_db"
    pg_user = os.getenv("POSTGRES_USER", "postgres").strip() or "postgres"
    pg_password = os.getenv("POSTGRES_PASSWORD", "").strip()

    if raw_url:
        if "YOUR_POSTGRES_PASSWORD" in raw_url and pg_password and pg_password.lower() not in PASSWORD_PLACEHOLDERS:
            raw_url = raw_url.replace("YOUR_POSTGRES_PASSWORD", quote_plus(pg_password))
        url = raw_url
    else:
        encoded_user = quote_plus(pg_user)
        encoded_pw = quote_plus(pg_password) if pg_password else "YOUR_POSTGRES_PASSWORD"
        url = f"postgresql+psycopg2://{encoded_user}:{encoded_pw}@{pg_host}:{pg_port}/{pg_db}"

    if url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://") :]
    return url


def is_postgres_password_configured(pg_url: str) -> bool:
    """Returns True if a real (non-placeholder) PostgreSQL password is provided in `backend/.env`."""
    parsed = urlparse(pg_url)
    pw = (parsed.password or "").strip()
    return bool(pw) and pw.lower() not in PASSWORD_PLACEHOLDERS


CONFIGURED_DATABASE_URL = resolve_configured_database_url()
_LAST_CONNECTION_ERROR: Optional[str] = None


def ensure_postgresql_database_exists(pg_url: str) -> bool:
    """Verifies connection to PostgreSQL 18 `fitness_db` (and creates `fitness_db` if needed)."""
    global _LAST_CONNECTION_ERROR
    if not pg_url.startswith("postgresql"):
        return True

    if not is_postgres_password_configured(pg_url):
        _LAST_CONNECTION_ERROR = (
            "POSTGRES_PASSWORD in backend/.env is still set to placeholder 'YOUR_POSTGRES_PASSWORD'. "
            "Please set your actual PostgreSQL 18 password in backend/.env."
        )
        logger.warning(_LAST_CONNECTION_ERROR)
        return False

    parsed = urlparse(pg_url)
    target_db = (parsed.path or "/fitness_db").lstrip("/") or "fitness_db"

    # First try connecting directly to target_db (`fitness_db`)
    try:
        direct_engine = create_engine(
            pg_url,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 3},
        )
        with direct_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        direct_engine.dispose()
        _LAST_CONNECTION_ERROR = None
        return True
    except Exception as direct_exc:
        # If database doesn't exist yet, attempt creation via `postgres` maintenance DB
        admin_parsed = parsed._replace(path="/postgres")
        admin_url = urlunparse(admin_parsed)
        try:
            admin_engine = create_engine(
                admin_url,
                isolation_level="AUTOCOMMIT",
                pool_pre_ping=True,
                connect_args={"connect_timeout": 3},
            )
            with admin_engine.connect() as conn:
                exists = conn.execute(
                    text("SELECT 1 FROM pg_database WHERE datname = :dbname"),
                    {"dbname": target_db},
                ).scalar()
                if not exists:
                    safe_db_name = "".join(c for c in target_db if c.isalnum() or c == "_")
                    conn.execute(text(f'CREATE DATABASE "{safe_db_name}"'))
                    logger.info("Created PostgreSQL database '%s'.", safe_db_name)
            admin_engine.dispose()
            _LAST_CONNECTION_ERROR = None
            return True
        except Exception as exc:
            _LAST_CONNECTION_ERROR = f"{direct_exc.__class__.__name__}: {direct_exc}"
            logger.warning(
                "Could not connect to PostgreSQL at %s:%s/%s (%s).",
                parsed.hostname or "localhost",
                parsed.port or 5432,
                target_db,
                _LAST_CONNECTION_ERROR,
            )
            return False


def build_engine(db_url: str) -> tuple[Engine, str]:
    """Creates the SQLAlchemy Engine for PostgreSQL `fitness_db` (with safe local disk fallback while password is pending)."""
    normalized_url = resolve_configured_database_url() if db_url == CONFIGURED_DATABASE_URL else db_url

    if normalized_url.startswith("postgresql"):
        pg_ready = ensure_postgresql_database_exists(normalized_url)
        if pg_ready:
            pg_engine = create_engine(
                normalized_url,
                pool_pre_ping=True,
                pool_size=10,
                max_overflow=20,
                connect_args={"connect_timeout": 5},
            )
            return pg_engine, normalized_url

        if os.getenv("STRICT_POSTGRESQL", "false").lower() in ("1", "true", "yes"):
            return (
                create_engine(
                    normalized_url,
                    pool_pre_ping=True,
                    pool_size=10,
                    max_overflow=20,
                ),
                normalized_url,
            )

        logger.warning(
            "PostgreSQL 18 connection pending credentials in backend/.env. Preserving existing local disk data (%s) until POSTGRES_PASSWORD is set.",
            FALLBACK_DISK_SQLITE_URL,
        )
        fallback_engine = create_engine(
            FALLBACK_DISK_SQLITE_URL,
            connect_args={"check_same_thread": False},
            pool_pre_ping=True,
        )
        return fallback_engine, FALLBACK_DISK_SQLITE_URL

    connect_args = {"check_same_thread": False} if normalized_url.startswith("sqlite") else {}
    custom_engine = create_engine(
        normalized_url,
        connect_args=connect_args,
        pool_pre_ping=True,
    )
    return custom_engine, normalized_url


engine, ACTIVE_DATABASE_URL = build_engine(CONFIGURED_DATABASE_URL)
DATABASE_URL = CONFIGURED_DATABASE_URL

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_database_status() -> Dict[str, Any]:
    """Returns non-sensitive database configuration and connection status."""
    current_cfg_url = resolve_configured_database_url()
    parsed_cfg = urlparse(current_cfg_url)
    pw_configured = is_postgres_password_configured(current_cfg_url)
    pg_connected = engine.dialect.name == "postgresql"
    return {
        "configured_driver": parsed_cfg.scheme,
        "configured_host": parsed_cfg.hostname or "localhost",
        "configured_port": parsed_cfg.port or 5432,
        "configured_database": (parsed_cfg.path or "/fitness_db").lstrip("/"),
        "configured_user": parsed_cfg.username or "postgres",
        "password_configured": pw_configured,
        "active_dialect": engine.dialect.name,
        "postgresql_configured": current_cfg_url.startswith("postgresql"),
        "postgresql_connected": pg_connected,
        "connection_notice": (
            "Connected to PostgreSQL 18 database 'fitness_db'."
            if pg_connected
            else (
                _LAST_CONNECTION_ERROR
                or "Set your PostgreSQL 18 password in backend/.env (POSTGRES_PASSWORD / DATABASE_URL) and restart the backend."
            )
        ),
    }


def get_db():
    """FastAPI dependency yielding a SQLAlchemy database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
