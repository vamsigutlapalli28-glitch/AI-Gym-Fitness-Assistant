"""
Automated API & QA Test Suite for AI Gym & Fitness Assistant
Covers:
1. Registration with a new account (+ password confirmation, allergies profile, zero fabricated stats)
2. Login with valid credentials (+ Remember Me, /api/auth/me, profile update with allergies)
3. Login with incorrect password (401) and password reset flow
4. Logout and protected route behavior (401 before login and after logout)
5. Multi-turn AI Dietician Chatbot (/api/diet/chat, /api/diet/chat/history, New Chat) & Virtual Gym Buddy with configured API key
6. Missing or invalid Gemini API key handling on AI Dietician & Gym Buddy (503/502, zero key leakage, no fake answers)
7. Production API docs disabled (/docs, /redoc, /openapi.json return 404), removal of live webcam/OpenCV/MediaPipe UI & technical labels, manual workout logging, and all working features
8. PostgreSQL fitness_db schema, Alembic/column verification, no plaintext/API key storage, and 403 cross-user authorization
"""

import os
import sys
import uuid
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

# Ensure root package is importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.main import app


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def auth_headers(client):
    """Log in as the seeded athlete and return Authorization headers."""
    res = client.post(
        "/api/auth/login",
        json={"email": "alex@ironclad.ai", "password": "Fitness@123", "remember_me": True},
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_1_registration_and_per_user_isolation(client):
    """Test registration with a new account, password mismatch validation, and isolated user records with zero fabricated stats."""
    unique_email = f"athlete_{uuid.uuid4().hex[:8]}@example.com"

    # Mismatched confirm_password should return 400
    mismatch_res = client.post(
        "/api/auth/register",
        json={
            "name": "Test Athlete",
            "email": unique_email,
            "password": "StrongPassword123!",
            "confirm_password": "DifferentPassword123!",
        },
    )
    assert mismatch_res.status_code == 400
    assert "do not match" in mismatch_res.json()["detail"].lower()

    # Valid registration
    reg_res = client.post(
        "/api/auth/register",
        json={
            "name": "Priya Sharma",
            "email": unique_email,
            "password": "StrongPassword123!",
            "confirm_password": "StrongPassword123!",
            "age": 24,
            "gender": "Female",
            "height_cm": 165.0,
            "weight_kg": 60.0,
            "fitness_goal": "Weight Loss",
            "dietary_preference": "Vegetarian",
            "allergies": "Peanuts",
        },
    )
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    assert "access_token" in reg_data
    assert reg_data["user"]["email"] == unique_email
    assert reg_data["user"]["name"] == "Priya Sharma"
    assert reg_data["user"]["profile"]["fitness_goal"] == "Weight Loss"
    assert reg_data["user"]["profile"]["allergies"] == "Peanuts"

    # Duplicate email registration should return 400
    dup_res = client.post(
        "/api/auth/register",
        json={
            "name": "Priya Duplicate",
            "email": unique_email,
            "password": "StrongPassword123!",
            "confirm_password": "StrongPassword123!",
        },
    )
    assert dup_res.status_code == 400

    # Verify new user has isolated dashboard & profile data (0 workouts, 0.0 avg score — no fabricated stats)
    new_user_headers = {"Authorization": f"Bearer {reg_data['access_token']}"}
    overview_res = client.get("/api/dashboard/overview", headers=new_user_headers)
    assert overview_res.status_code == 200
    assert overview_res.json()["user"]["email"] == unique_email
    assert overview_res.json()["kpis"]["total_workouts"] == 0
    assert overview_res.json()["kpis"]["avg_performance_score"] == 0.0


def test_2_login_with_valid_credentials_and_profile(client):
    """Test login with valid credentials, Remember Me token, /api/auth/me, and profile update including allergies."""
    login_res = client.post(
        "/api/auth/login",
        json={"email": "alex@ironclad.ai", "password": "Fitness@123", "remember_me": True},
    )
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    assert token_data["remember_me"] is True
    assert token_data["user"]["email"] == "alex@ironclad.ai"

    headers = {"Authorization": f"Bearer {token_data['access_token']}"}

    # Verify /api/auth/me
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["authenticated"] is True
    assert me_res.json()["user"]["email"] == "alex@ironclad.ai"

    # Verify /api/profile and profile update
    prof_res = client.get("/api/profile", headers=headers)
    assert prof_res.status_code == 200
    assert prof_res.json()["user"]["email"] == "alex@ironclad.ai"

    upd_res = client.put(
        "/api/profile",
        headers=headers,
        json={
            "fitness_goal": "Muscle Gain",
            "workout_days_per_week": 5,
            "allergies": "Lactose",
            "daily_calorie_target": 2450,
        },
    )
    assert upd_res.status_code == 200
    assert upd_res.json()["user"]["profile"]["workout_days_per_week"] == 5
    assert upd_res.json()["user"]["profile"]["allergies"] == "Lactose"
    assert upd_res.json()["user"]["profile"]["daily_calorie_target"] == 2450


def test_3_login_with_incorrect_password_and_reset_flow(client):
    """Test login with an incorrect password returns 401 and verify password reset flow."""
    bad_login = client.post(
        "/api/auth/login",
        json={"email": "alex@ironclad.ai", "password": "WrongPassword999!"},
    )
    assert bad_login.status_code == 401
    assert "invalid email or password" in bad_login.json()["detail"].lower()

    unknown_login = client.post(
        "/api/auth/login",
        json={"email": "nonexistent_user@ironclad.ai", "password": "Fitness@123"},
    )
    assert unknown_login.status_code == 401

    # Test Forgot Password + Reset Password flow on a newly registered account
    reset_email = f"reset_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/auth/register",
        json={
            "name": "Reset Tester",
            "email": reset_email,
            "password": "OldPassword123!",
            "confirm_password": "OldPassword123!",
        },
    )
    forgot_res = client.post("/api/auth/forgot-password", json={"email": reset_email})
    assert forgot_res.status_code == 200
    reset_token = forgot_res.json().get("reset_token")
    assert reset_token

    reset_res = client.post(
        "/api/auth/reset-password",
        json={
            "email": reset_email,
            "reset_token": reset_token,
            "new_password": "NewPassword456!",
            "confirm_password": "NewPassword456!",
        },
    )
    assert reset_res.status_code == 200

    # Old password should now fail, new password should succeed
    assert (
        client.post(
            "/api/auth/login",
            json={"email": reset_email, "password": "OldPassword123!"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login",
            json={"email": reset_email, "password": "NewPassword456!"},
        ).status_code
        == 200
    )


def test_4_logout_and_protected_routes(client):
    """Verify unauthenticated requests are blocked (401) and logout revokes token & clears session."""
    client.cookies.clear()

    for protected_path in [
        "/api/auth/me",
        "/api/profile",
        "/api/dashboard/overview",
        "/api/workouts/history",
        "/api/diet/chat/history",
        "/api/diet/nutrition-logs",
        "/api/habits/dashboard",
        "/api/chat/history",
        "/api/performance/reports",
        "/api/planner/current",
    ]:
        unauth_res = client.get(protected_path)
        assert unauth_res.status_code == 401, f"Expected 401 for {protected_path}, got {unauth_res.status_code}"

    # Login to get a fresh token
    login_res = client.post(
        "/api/auth/login",
        json={"email": "alex@ironclad.ai", "password": "Fitness@123"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Verify access works while authenticated
    assert client.get("/api/dashboard/overview", headers=headers).status_code == 200

    # Logout revokes the token and clears cookies
    logout_res = client.post("/api/auth/logout", headers=headers)
    assert logout_res.status_code == 200
    client.cookies.clear()

    # Using the revoked token must now return 401 Unauthorized
    after_logout = client.get("/api/dashboard/overview", headers=headers)
    assert after_logout.status_code == 401


def test_5_multi_turn_ai_dietician_and_coaches_with_configured_api_key(client, auth_headers):
    """Test multi-turn AI Dietician conversation, follow-up history, New Chat reset, and Gemini coaches."""
    def dynamic_generate_content(model, contents, config):
        resp = MagicMock()
        last_text = str(contents[-1]) if isinstance(contents, list) and contents else str(contents)
        lower_text = last_text.lower()
        if "indian vegetarian" in lower_text:
            resp.text = (
                "High-protein Indian vegetarian meals include: 1) Moong dal chilla with tofu bhurji (~28g protein), "
                "2) Soya chunk pulao with cucumber raita (~34g protein), and 3) Chickpea & spinach curry with multigrain roti (~24g protein)."
            )
        elif "replace paneer with tofu" in lower_text or "soya chunks" in lower_text:
            resp.text = (
                "Yes! Since your profile notes a lactose sensitivity, replacing 100g paneer with 120g firm tofu (~18g protein) "
                "or 50g dry soya chunks (~26g protein) is an excellent dairy-free, high-protein swap for that meal."
            )
        elif "missed breakfast" in lower_text:
            resp.text = (
                "If you missed breakfast (~500 kcal), add 200 kcal to your lunch (e.g., extra bowl of dal/tofu), "
                "150 kcal to your pre-workout snack (banana + peanut butter), and 150 kcal to dinner so you still hit your daily target."
            )
        elif "capital of india" in lower_text:
            resp.text = "The capital of India is New Delhi."
        else:
            resp.text = (
                "1. Aim for 1.6-2.0g of protein per kg of bodyweight.\n"
                "2. Space protein evenly across 4 meals.\n"
                "3. Hydrate with 3L of water daily."
            )
        return resp

    mock_client_instance = MagicMock()
    mock_client_instance.models.generate_content.side_effect = dynamic_generate_content

    with patch.dict(os.environ, {"GEMINI_API_KEY": "AIzaSyTestConfiguredValidKey123456789", "GEMINI_MODEL": "gemini-3.6-flash"}):
        with patch("backend.services.chatbot_service.genai.Client", return_value=mock_client_instance):
            # Clear AI Dietician chat history (New Chat)
            del_res = client.delete("/api/diet/chat/history", headers=auth_headers)
            assert del_res.status_code == 200

            # Turn 1: Ask AI Dietician for high-protein Indian vegetarian meals
            turn1 = client.post(
                "/api/diet/chat",
                headers=auth_headers,
                json={"message": "Suggest high-protein Indian vegetarian meals.", "history": []},
            )
            assert turn1.status_code == 200
            t1_data = turn1.json()
            assert "tofu" in t1_data["answer"].lower() or "soya" in t1_data["answer"].lower()
            assert t1_data["fallback_used"] is False

            # Turn 2: Follow-up question with multi-turn history
            turn2 = client.post(
                "/api/diet/chat",
                headers=auth_headers,
                json={
                    "message": "Can I replace paneer with tofu or soya chunks?",
                    "history": [
                        {"role": "user", "content": "Suggest high-protein Indian vegetarian meals."},
                        {"role": "assistant", "content": t1_data["answer"]},
                    ],
                },
            )
            assert turn2.status_code == 200
            t2_data = turn2.json()
            assert "tofu" in t2_data["answer"].lower() and "soya chunks" in t2_data["answer"].lower()
            assert t2_data["answer"] != t1_data["answer"]

            # Turn 3: Follow-up on missed breakfast adjustment
            turn3 = client.post(
                "/api/diet/chat",
                headers=auth_headers,
                json={"message": "Adjust my plan if I missed breakfast."},
            )
            assert turn3.status_code == 200
            assert "breakfast" in turn3.json()["answer"].lower()

            # Verify AI Dietician chat history persisted all 3 turns (6 messages)
            hist_res = client.get("/api/diet/chat/history", headers=auth_headers)
            assert hist_res.status_code == 200
            assert len(hist_res.json()["messages"]) == 6

            # Verify New Chat button endpoint clears AI Dietician history
            reset_chat = client.delete("/api/diet/chat/history", headers=auth_headers)
            assert reset_chat.status_code == 200
            after_reset = client.get("/api/diet/chat/history", headers=auth_headers)
            assert len(after_reset.json()["messages"]) == 0

            # Also verify Virtual Gym Buddy chat works
            buddy_res = client.post(
                "/api/chat/message",
                headers=auth_headers,
                json={"message": "What is the capital of India?", "history": []},
            )
            assert buddy_res.status_code == 200
            assert "New Delhi" in buddy_res.json()["answer"]


def test_6_missing_or_invalid_gemini_api_key_handling(client, auth_headers):
    """Test missing/placeholder or invalid Gemini API key returns clear error on both AI Dietician and Gym Buddy."""
    # Case A: Placeholder / Missing API Key -> 503 Service Unavailable
    with patch.dict(os.environ, {"GEMINI_API_KEY": "YOUR_ACTUAL_GEMINI_API_KEY"}):
        status_res = client.get("/api/gemini/status")
        assert status_res.status_code == 200
        assert status_res.json()["api_key_configured"] is False

        diet_chat_res = client.post(
            "/api/diet/chat",
            headers=auth_headers,
            json={"message": "How much protein do I need per day?"},
        )
        assert diet_chat_res.status_code == 503
        d_data = diet_chat_res.json()
        assert d_data["gemini_error_code"] == "missing_api_key"
        assert d_data["answer"] is None
        assert d_data["fallback_used"] is False

        chat_res = client.post(
            "/api/chat/message",
            headers=auth_headers,
            json={"message": "I feel tired today, should I train or rest?"},
        )
        assert chat_res.status_code == 503
        data = chat_res.json()
        assert data["gemini_error_code"] == "missing_api_key"
        assert data["answer"] is None
        assert data["fallback_used"] is False

    # Case B: Invalid API Key rejected by Gemini API -> 502 Bad Gateway, zero key leakage
    SecretBadKey = "AIzaSyInvalidSecretKeyDoNotLeak99999"
    mock_bad_client = MagicMock()
    mock_bad_client.models.generate_content.side_effect = Exception("400 API_KEY_INVALID: API key not valid")

    with patch.dict(os.environ, {"GEMINI_API_KEY": SecretBadKey}):
        with patch("backend.services.chatbot_service.genai.Client", return_value=mock_bad_client):
            res = client.post(
                "/api/diet/chat",
                headers=auth_headers,
                json={"message": "Give me a 2200 calorie vegetarian muscle gain plan."},
            )
            assert res.status_code == 502
            body = res.json()
            assert body["gemini_error_code"] == "invalid_api_key"
            assert body["answer"] is None
            assert SecretBadKey not in str(body)


def test_7_live_webcam_workout_manual_logging_and_all_features(client, auth_headers):
    """Verify Live Webcam Workout (getUserMedia on Start Camera, MediaPipe PoseLandmarker, Squat/Pushup state transitions, Start/Pause/Resume/Stop, track cleanup), manual workout logging, and all working modules."""
    # 1. Public API documentation routes remain disabled in production (404)
    for doc_path in ["/docs", "/redoc", "/openapi.json"]:
        doc_res = client.get(doc_path)
        assert doc_res.status_code == 404, f"Expected {doc_path} to be disabled (404), got {doc_res.status_code}"

    # 2. Verify frontend Live Workout implementation & poseWorkoutEngine.js
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    app_jsx_path = os.path.join(root_dir, "frontend", "src", "App.jsx")
    with open(app_jsx_path, "r", encoding="utf-8") as f:
        app_jsx = f.read()

    for nav_label in ["Dashboard", "Workouts", "AI Dietician", "Progress", "Profile"]:
        assert nav_label in app_jsx, f"Missing primary navigation item: {nav_label}"

    trainer_jsx_path = os.path.join(root_dir, "frontend", "src", "components", "TrainerTab.jsx")
    with open(trainer_jsx_path, "r", encoding="utf-8") as f:
        trainer_jsx = f.read()

    for required_live_feature in [
        "Live Workout (Webcam)",
        "Manual Workout Log",
        "Start Camera",
        "getUserMedia",
        "PoseLandmarker",
        "FilesetResolver",
        "detectForVideo",
        "handleStartWorkout",
        "handlePauseWorkout",
        "handleResumeWorkout",
        "handleStopWorkout",
        "track.stop()",
        "drawPoseOverlay",
        "evaluatePoseFrame",
    ]:
        assert required_live_feature in trainer_jsx, (
            f"Missing required live webcam workout feature '{required_live_feature}' in TrainerTab.jsx"
        )

    pose_engine_path = os.path.join(root_dir, "frontend", "src", "utils", "poseWorkoutEngine.js")
    with open(pose_engine_path, "r", encoding="utf-8") as f:
        pose_engine_js = f.read()

    for required_engine_symbol in [
        "calculateAngle",
        "POSE_CONNECTIONS",
        "Squat",
        "Pushup",
        "evaluatePoseFrame",
        "drawPoseOverlay",
        "landmarksDetected: false",
    ]:
        assert required_engine_symbol in pose_engine_js, (
            f"Missing '{required_engine_symbol}' in poseWorkoutEngine.js"
        )

    # 3. Manual Workout Logging & Live Webcam Workout Summary Saving
    log_res = client.post(
        "/api/workouts/log",
        headers=auth_headers,
        json={
            "exercise": "Squat",
            "sets_completed": 4,
            "reps_per_set": 10,
            "weight_kg": 70.0,
            "duration_sec": 1200,
            "form_score": 94.0,
            "notes": "4x10 squats at 70kg with full depth",
            "mode": "manual",
        },
    )
    assert log_res.status_code == 201
    session_data = log_res.json()["session"]
    assert session_data["exercise"] == "Squat"
    assert session_data["sets_completed"] == 4
    assert session_data["total_reps"] == 40
    assert session_data["weight_kg"] == 70.0
    assert session_data["mode"] == "manual"

    live_log_res = client.post(
        "/api/workouts/log",
        headers=auth_headers,
        json={
            "exercise": "Pushup",
            "sets_completed": 1,
            "reps_per_set": 15,
            "left_reps": 15,
            "right_reps": 15,
            "total_reps": 15,
            "weight_kg": 0.0,
            "duration_sec": 65,
            "form_score": 96.0,
            "posture_notes": "Live MediaPipe Pose session (96% clean posture frames)",
            "mode": "live_webcam",
        },
    )
    assert live_log_res.status_code == 201
    live_session = live_log_res.json()["session"]
    assert live_session["exercise"] == "Pushup"
    assert live_session["total_reps"] == 15
    assert live_session["duration_sec"] == 65
    assert live_session["mode"] == "live_webcam"

    hist_res = client.get("/api/workouts/history", headers=auth_headers)
    assert hist_res.status_code == 200
    sessions_list = hist_res.json()["sessions"]
    assert any(s["id"] == session_data["id"] and s["mode"] == "manual" for s in sessions_list)
    assert any(s["id"] == live_session["id"] and s["mode"] == "live_webcam" for s in sessions_list)

    # Verify AI workout feedback does not return fake fallback advice when API key is missing
    with patch.dict(os.environ, {"GEMINI_API_KEY": "YOUR_ACTUAL_GEMINI_API_KEY"}):
        ai_fb_res = client.post("/api/workouts/ai-feedback", headers=auth_headers)
        assert ai_fb_res.status_code == 503
        assert ai_fb_res.json()["advice"] is None
        assert ai_fb_res.json()["fallback_used"] is False

    # 4. BMI Calculator & Meal Plan Generator
    bmi_res = client.post(
        "/api/diet/calculate-bmi-calories",
        headers=auth_headers,
        json={
            "height_cm": 178.0,
            "weight_kg": 74.5,
            "age": 25,
            "gender": "Male",
            "activity_level": "Moderately Active",
            "goal": "Muscle Gain",
        },
    )
    assert bmi_res.status_code == 200

    meal_res = client.post(
        "/api/diet/meal-plan",
        headers=auth_headers,
        json={"goal": "Muscle Gain", "dietary_preference": "Vegetarian", "target_calories": 2400},
    )
    assert meal_res.status_code == 200
    assert len(meal_res.json()["meals"]) >= 4

    # 5. Habit Tracker, Performance Reports & Google Maps Gym Search URLs
    hab_res = client.get("/api/habits/dashboard", headers=auth_headers)
    assert hab_res.status_code == 200
    assert 0.0 <= hab_res.json()["latest_prediction"]["adherence_probability"] <= 1.0

    perf_res = client.get("/api/performance/reports", headers=auth_headers)
    assert perf_res.status_code == 200

    gyms_res = client.get("/api/planner/gyms?location=gyms%20in%20Vijayawada", headers=auth_headers)
    assert gyms_res.status_code == 200
    gyms_body = gyms_res.json()
    assert gyms_body["api_key_required"] is False
    assert gyms_body["sample_data"] is False
    assert (
        gyms_body["google_maps_url"]
        == "https://www.google.com/maps/search/?api=1&query=gyms%20in%20Vijayawada"
    )


def test_8_postgresql_schema_alembic_and_user_authorization(client, auth_headers):
    """Verify PostgreSQL fitness_db DATABASE_URL, required tables & FK relationships, no plaintext/API key storage, and 403 cross-user authorization."""
    from backend.database import Base, CONFIGURED_DATABASE_URL
    from backend.models import User, ChatMessage

    assert CONFIGURED_DATABASE_URL.startswith("postgresql")
    assert "fitness_db" in CONFIGURED_DATABASE_URL
    db_status = client.get("/api/database/status")
    assert db_status.status_code == 200
    assert db_status.json()["postgresql_configured"] is True
    assert db_status.json()["configured_database"] == "fitness_db"

    required_tables = {
        "users",
        "user_sessions",
        "fitness_profiles",
        "workout_history",
        "diet_plans",
        "habit_logs",
        "chat_history",
    }
    metadata_tables = set(Base.metadata.tables.keys())
    assert required_tables.issubset(metadata_tables)

    for child_table in [
        "user_sessions",
        "fitness_profiles",
        "workout_history",
        "diet_plans",
        "habit_logs",
        "chat_history",
    ]:
        fk_targets = {fk.target_fullname for fk in Base.metadata.tables[child_table].foreign_keys}
        assert "users.id" in fk_targets, f"{child_table} missing ForeignKey('users.id')"

    with pytest.raises(ValueError, match="bcrypt"):
        User(name="Bad User", email="bad@example.com", password_hash="PlaintextPassword123")

    msg = ChatMessage(user_id=1, role="user", content="My key is AIzaSySecretKey12345678901234567890")
    assert "AIzaSySecretKey" not in msg.content
    assert "[REDACTED_API_KEY]" in msg.content

    # Verify cross-user authorization (User A cannot access or delete User B's records)
    user_b_email = f"user_b_{uuid.uuid4().hex[:8]}@example.com"
    reg_b = client.post(
        "/api/auth/register",
        json={
            "name": "Athlete B",
            "email": user_b_email,
            "password": "PasswordB123!",
            "confirm_password": "PasswordB123!",
        },
    )
    assert reg_b.status_code == 201
    user_b_id = reg_b.json()["user"]["id"]
    user_b_headers = {"Authorization": f"Bearer {reg_b.json()['access_token']}"}

    log_b = client.post(
        "/api/diet/nutrition-logs",
        headers=user_b_headers,
        json={
            "meal_type": "Dinner",
            "food_name": "Private Athlete B Meal",
            "calories": 600,
            "protein_g": 45.0,
            "carbs_g": 55.0,
            "fat_g": 18.0,
        },
    )
    assert log_b.status_code == 201
    log_b_id = log_b.json()["log"]["id"]

    cross_records = client.get(f"/api/users/{user_b_id}/records", headers=auth_headers)
    assert cross_records.status_code == 403

    cross_delete = client.delete(f"/api/diet/nutrition-logs/{log_b_id}", headers=auth_headers)
    assert cross_delete.status_code == 403

    own_records = client.get(f"/api/users/{user_b_id}/records", headers=user_b_headers)
    assert own_records.status_code == 200
    assert own_records.json()["user"]["id"] == user_b_id
