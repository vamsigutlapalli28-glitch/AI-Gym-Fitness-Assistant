"""Authentication & Security utilities using Bcrypt, signed JWT tokens, HttpOnly session cookies, and database-backed sessions.

Implements:
- Bcrypt password hashing (`hash_password`) and verification (`verify_password`).
- JWT access token creation with database session persistence (`UserSession` table).
- Database-backed session revocation on logout (`revoke_token`).
- Password reset signed token generation & verification.
- Strict route protection (`get_current_user`) accepting Bearer header, HttpOnly cookie, or stream query token.
"""

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Set
import uuid

import bcrypt
from dotenv import load_dotenv
import jwt
from fastapi import Cookie, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User, UserSession

_BACKEND_ENV = Path(__file__).resolve().parent / ".env"
if _BACKEND_ENV.exists():
    load_dotenv(dotenv_path=_BACKEND_ENV, override=False)

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "ai-gym-fitness-assistant-dev-secret-key-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "72"))
SESSION_COOKIE_NAME = "gym_ai_session"

security_scheme = HTTPBearer(auto_error=False)

# Secondary in-process revocation cache (paired with persistent `user_sessions` DB table)
_REVOKED_TOKENS: Set[str] = set()


def hash_password(plain_password: str) -> str:
    """Hashes a plaintext password using bcrypt with a random salt."""
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(
    user_id: int,
    email: str,
    name: str,
    remember_me: bool = False,
    db: Optional[Session] = None,
) -> str:
    """Creates a signed JWT access token and persists the active session in the database."""
    hours = JWT_EXPIRE_HOURS * 4 if remember_me else JWT_EXPIRE_HOURS
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=hours)
    jti = str(uuid.uuid4())
    payload = {
        "sub": str(user_id),
        "email": email,
        "name": name,
        "type": "access",
        "jti": jti,
        "iat": now,
        "exp": expire,
    }
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

    if db is not None:
        session_row = UserSession(
            user_id=user_id,
            token_jti=jti,
            is_revoked=False,
            remember_me=remember_me,
            created_at=now,
            expires_at=expire,
        )
        db.add(session_row)
        db.commit()

    return token


def create_password_reset_token(user_id: int, email: str) -> str:
    """Creates a short-lived (30-minute) signed JWT token specifically for password reset."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=30)
    payload = {
        "sub": str(user_id),
        "email": email.lower().strip(),
        "type": "password_reset",
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str, db: Optional[Session] = None) -> Optional[dict]:
    """Decodes and validates a JWT access token against both signature and database revocation status."""
    if not token or token in _REVOKED_TOKENS:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        jti = payload.get("jti")
        if jti and jti in _REVOKED_TOKENS:
            return None
        if payload.get("type", "access") != "access":
            return None
        if db is not None and jti:
            db_session = (
                db.query(UserSession)
                .filter(UserSession.token_jti == jti)
                .first()
            )
            if db_session and db_session.is_revoked:
                _REVOKED_TOKENS.add(jti)
                return None
        return payload
    except Exception:
        return None


def verify_password_reset_token(token: str, email: str) -> Optional[dict]:
    """Verifies a signed password-reset JWT token."""
    if not token or token in _REVOKED_TOKENS:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "password_reset":
            return None
        if payload.get("email", "").lower().strip() != email.lower().strip():
            return None
        return payload
    except Exception:
        return None


def revoke_token(token: Optional[str], db: Optional[Session] = None) -> None:
    """Revokes a JWT token in the database (`user_sessions` table) and in-memory cache on logout."""
    if not token:
        return
    _REVOKED_TOKENS.add(token)
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"verify_exp": False},
        )
        jti = payload.get("jti")
        sub = payload.get("sub")
        if jti:
            _REVOKED_TOKENS.add(jti)
            if db is not None:
                now = datetime.now(timezone.utc)
                db_session = (
                    db.query(UserSession)
                    .filter(UserSession.token_jti == jti)
                    .first()
                )
                if db_session:
                    db_session.is_revoked = True
                    db_session.revoked_at = now
                elif sub:
                    db.add(
                        UserSession(
                            user_id=int(sub),
                            token_jti=jti,
                            is_revoked=True,
                            remember_me=False,
                            created_at=now,
                            revoked_at=now,
                        )
                    )
                db.commit()
    except Exception:
        pass


def extract_token_from_request(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = None,
    session_cookie: Optional[str] = None,
    query_token: Optional[str] = None,
) -> Optional[str]:
    """Extracts JWT token from Authorization Bearer header, HttpOnly cookie, or query string."""
    if credentials and credentials.credentials:
        return credentials.credentials.strip()
    if session_cookie:
        return session_cookie.strip()
    cookie_val = request.cookies.get(SESSION_COOKIE_NAME)
    if cookie_val:
        return cookie_val.strip()
    if query_token:
        return query_token.strip()
    return None


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    token: Optional[str] = Query(default=None, include_in_schema=False),
    db: Session = Depends(get_db),
) -> User:
    """Strictly authenticates the current user via JWT Bearer token or session cookie against the database.

    Raises 401 Unauthorized if no token is provided, if the token is invalid/expired/revoked,
    or if the user account no longer exists in the database.
    """
    raw_token = extract_token_from_request(request, credentials, session_cookie, token)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in to access your fitness dashboard.",
        )

    payload = decode_access_token(raw_token, db=db)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication session. Please log in again.",
        )

    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found. Please log in again.",
        )
    return user
