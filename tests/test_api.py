"""
Automated API & Unit Test Suite for AI Gym & Fitness Assistant
Covers:
1. Registration with a new account (+ password confirmation & per-user isolation)
2. Login with valid credentials (+ Remember Me & HttpOnly session cookie)
3. Login with an incorrect password (401 Unauthorized)
4. Logout and protected route behavior (401 Unauthorized before login and after logout)
5. Gemini chatbot & AI coach endpoints with a configured API key (official google-genai SDK)
6. Missing or invalid Gemini API key handling (clear error code, zero key leakage, graceful fallback)
7. Sidebar navigation items & removal of Home / Mod 1..7 badges + all 7 modules
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
from camera import WorkoutCamera, calculate_angle, SUPPORTED_EXERCISES


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
    """Test registration with a new account, password mismatch validation, and isolated user records."""
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
        },
    )
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    assert "access_token" in reg_data
    assert reg_data["user"]["email"] == unique_email
    assert reg_data["user"]["name"] == "Priya Sharma"
    assert reg_data["user"]["profile"]["fitness_goal"] == "Weight Loss"

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

    # Verify new user has isolated dashboard & profile data
    new_user_headers = {"Authorization": f"Bearer {reg_data['access_token']}"}
    overview_res = client.get("/api/dashboard/overview", headers=new_user_headers)
    assert overview_res.status_code == 200
    assert overview_res.json()["user"]["email"] == unique_email
    assert overview_res.json()["kpis"]["total_workouts"] == 0


def test_2_login_with_valid_credentials_and_profile(client):
    """Test login with valid credentials, Remember Me token, /api/auth/me, and profile update."""
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
        json={"fitness_goal": "Muscle Gain", "workout_days_per_week": 5},
    )
    assert upd_res.status_code == 200
    assert upd_res.json()["user"]["profile"]["workout_days_per_week"] == 5


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

    # Protected routes must reject unauthenticated requests with 401
    for protected_path in [
        "/api/auth/me",
        "/api/profile",
        "/api/dashboard/overview",
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


def test_5_gemini_chatbot_and_coaches_with_configured_api_key(client, auth_headers):
    """Test Gemini integration with a configured API key using the official google-genai SDK."""
    def dynamic_generate_content(model, contents, config):
        resp = MagicMock()
        last_text = str(contents[-1]) if isinstance(contents, list) and contents else str(contents)
        if "capital of india" in last_text.lower():
            resp.text = "The capital of India is New Delhi."
        elif "squat" in last_text.lower():
            resp.text = (
                "To perform a squat correctly: stand with feet shoulder-width apart, brace your core, "
                "track knees over toes, and lower your hips until your thighs are at least parallel to the floor."
            )
        elif "vegetarian post-workout meal" in last_text.lower():
            resp.text = (
                "A great vegetarian post-workout meal is paneer bhurji or tofu scramble with whole-wheat roti "
                "or Greek yogurt with oats and berries (~32g protein, ~45g carbs)."
            )
        else:
            resp.text = (
                "1. Prioritize 1.8g/kg protein daily across 4 meals.\n"
                "2. Keep squat knee valgus in check by screwing your feet into the floor.\n"
                "3. Take a deload session if sleep drops below 6.5 hours."
            )
        return resp

    mock_client_instance = MagicMock()
    mock_client_instance.models.generate_content.side_effect = dynamic_generate_content

    with patch.dict(os.environ, {"GEMINI_API_KEY": "AIzaSyTestConfiguredValidKey123456789", "GEMINI_MODEL": "gemini-2.5-flash"}):
        with patch("backend.services.chatbot_service.genai.Client", return_value=mock_client_instance):
            status_res = client.get("/api/gemini/status")
            assert status_res.status_code == 200
            assert status_res.json()["sdk"] == "google-genai"
            assert status_res.json()["api_key_configured"] is True

            # 1. Virtual Gym Buddy Chatbot — verify distinct answers for distinct questions & history
            q1 = client.post(
                "/api/chat/message",
                headers=auth_headers,
                json={"message": "What is the capital of India?", "history": []},
            )
            assert q1.status_code == 200
            d1 = q1.json()
            assert "New Delhi" in d1["answer"]
            assert "Coach Response for" not in d1["answer"]

            q2 = client.post(
                "/api/chat/message",
                headers=auth_headers,
                json={
                    "message": "Explain how to perform a squat correctly",
                    "history": [
                        {"role": "user", "content": "What is the capital of India?"},
                        {"role": "assistant", "content": d1["answer"]},
                    ],
                },
            )
            assert q2.status_code == 200
            d2 = q2.json()
            assert "squat" in d2["answer"].lower()
            assert d2["answer"] != d1["answer"]

            q3 = client.post(
                "/api/chat/message",
                headers=auth_headers,
                json={"message": "Give me a vegetarian post-workout meal"},
            )
            assert q3.status_code == 200
            d3 = q3.json()
            assert "vegetarian" in d3["answer"].lower()
            assert d3["answer"] != d2["answer"]

            # 2. AI Dietician Coach
            diet_res = client.post(
                "/api/diet/gemini-coach",
                headers=auth_headers,
                json={
                    "goal": "Muscle Gain",
                    "dietary_preference": "Vegetarian",
                    "target_calories": 2500,
                },
            )
            assert diet_res.status_code == 200
            assert "google-genai" in diet_res.json()["provider"]

            # 3. Personalized Workout Plan Generation
            plan_res = client.post(
                "/api/planner/gemini-plan",
                headers=auth_headers,
                json={
                    "goal": "Muscle Gain",
                    "experience_level": "Intermediate",
                    "equipment": "Full Gym",
                    "days_per_week": 5,
                },
            )
            assert plan_res.status_code == 200
            assert "google-genai" in plan_res.json()["ai_guidance"]["provider"]

            # 4. Fitness Motivation & Guidance
            mot_res = client.post("/api/habits/gemini-motivation", headers=auth_headers)
            assert mot_res.status_code == 200
            assert "google-genai" in mot_res.json()["provider"]


def test_6_missing_or_invalid_gemini_api_key_handling(client, auth_headers):
    """Test missing/placeholder or invalid Gemini API key returns clear error instead of default coaching response."""
    # Case A: Placeholder / Missing API Key
    with patch.dict(os.environ, {"GEMINI_API_KEY": "YOUR_ACTUAL_GEMINI_API_KEY"}):
        status_res = client.get("/api/gemini/status")
        assert status_res.status_code == 200
        assert status_res.json()["api_key_configured"] is False

        chat_res = client.post(
            "/api/chat/message",
            headers=auth_headers,
            json={"message": "I feel tired today, should I train or rest?"},
        )
        assert chat_res.status_code == 503
        data = chat_res.json()
        assert data["gemini_error_code"] == "missing_api_key"
        assert data["gemini_error"] is not None
        assert data["answer"] is None
        assert data["fallback_used"] is False
        assert "Coach Response for" not in str(data)

    # Case B: Invalid API Key rejected by Gemini API
    SecretBadKey = "AIzaSyInvalidSecretKeyDoNotLeak99999"
    mock_bad_client = MagicMock()
    mock_bad_client.models.generate_content.side_effect = Exception("400 API_KEY_INVALID: API key not valid")

    with patch.dict(os.environ, {"GEMINI_API_KEY": SecretBadKey}):
        with patch("backend.services.chatbot_service.genai.Client", return_value=mock_bad_client):
            res = client.post(
                "/api/chat/message",
                headers=auth_headers,
                json={"message": "Give me high protein vegetarian meal ideas"},
            )
            assert res.status_code == 502
            body = res.json()
            assert body["gemini_error_code"] == "invalid_api_key"
            assert "invalid" in body["gemini_error"].lower()
            assert body["answer"] is None
            assert "Coach Response for" not in str(body)
            # Ensure the secret API key is NEVER leaked in the response
            assert SecretBadKey not in str(body)


def test_7_sidebar_navigation_and_all_7_modules(client, auth_headers):
    """Verify sidebar has no Home/Mod badges and all 7 modules function end-to-end."""
    # Check frontend/src/App.jsx sidebar navigation items
    app_jsx_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "App.jsx")
    )
    with open(app_jsx_path, "r", encoding="utf-8") as f:
        app_jsx = f.read()

    expected_labels = [
        "Command Overview",
        "AI Gym Trainer",
        "AI Dietician Coach",
        "Smart Gym IoT + MQTT",
        "Habit & ML Tracker",
        "Virtual Gym Buddy",
        "Pose-to-Performance",
        "Gym & Split Planner",
    ]
    for label in expected_labels:
        assert label in app_jsx, f"Missing sidebar navigation item: {label}"

    for removed_badge in ["Mod 1", "Mod 2", "Mod 3", "Mod 4", "Mod 5", "Mod 6", "Mod 7", "badge:", "UNLOX"]:
        assert removed_badge not in app_jsx, f"Found forbidden text '{removed_badge}' in App.jsx"

    # Verify UNLOX, API key requirement banners, and DEMO MODE (SAMPLE GYM DATA) are removed across frontend files
    for rel_path in [
        ("frontend", "src", "components", "OverviewTab.jsx"),
        ("frontend", "src", "components", "PlannerTab.jsx"),
        ("frontend", "index.html"),
    ]:
        fpath = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", *rel_path))
        with open(fpath, "r", encoding="utf-8") as f:
            fcontent = f.read()
        assert "UNLOX" not in fcontent, f"Found 'UNLOX' in {'/'.join(rel_path)}"
        assert "DEMO MODE (SAMPLE GYM DATA)" not in fcontent, f"Found sample gym banner in {'/'.join(rel_path)}"
        assert "Google Maps Browser API Key Required for Interactive Map" not in fcontent

    planner_jsx_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "components", "PlannerTab.jsx")
    )
    with open(planner_jsx_path, "r", encoding="utf-8") as f:
        planner_jsx = f.read()

    assert "https://www.google.com/maps/search/?api=1&query=" in planner_jsx
    assert "encodeURIComponent" in planner_jsx
    assert "Search Nearby Gyms" in planner_jsx
    assert "Open in Google Maps" in planner_jsx
    assert "Get Directions" in planner_jsx
    assert "window.open" in planner_jsx
    assert "noopener" in planner_jsx and "noreferrer" in planner_jsx
    assert "google-maps-js-sdk" not in planner_jsx
    assert "VITE_GOOGLE_MAPS_API_KEY" not in planner_jsx
    assert "<svg" not in planner_jsx

    # Verify Dashboard Overview
    dash = client.get("/api/dashboard/overview", headers=auth_headers)
    assert dash.status_code == 200
    assert "kpis" in dash.json()

    # Module 1: AI Gym Trainer
    import base64
    import cv2
    import numpy as np

    angle_90 = calculate_angle([0, 1], [0, 0], [1, 0])
    assert 89.0 <= angle_90 <= 91.0

    cam = WorkoutCamera()
    assert (cam._mp_landmarker is not None) or (cam._mp_pose_instance is not None)
    cam.is_demo_mode = True
    for ex_name in SUPPORTED_EXERCISES:
        cam.reset_session()
        cam.set_exercise(ex_name, demo_mode=True)
        sim = cam.simulate_step(steps=2)
        assert sim["total"] >= 1

    dummy_img = np.zeros((240, 320, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", dummy_img)
    b64_str = "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("utf-8")
    pf_res = client.post(
        "/api/trainer/process_frame",
        headers=auth_headers,
        json={"image_base64": b64_str, "exercise": "Squat"},
    )
    assert pf_res.status_code == 200
    assert "connections" in pf_res.json()

    client.post("/api/trainer/simulate_reps?steps=4", headers=auth_headers)
    fin = client.post("/api/trainer/finish", headers=auth_headers, json={"exercise": "Squat"})
    assert fin.status_code == 200

    # Module 2: AI Dietician Coach
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

    # Module 3: Smart Gym IoT
    iot_res = client.get("/api/iot/status", headers=auth_headers)
    assert iot_res.status_code == 200
    assert iot_res.json()["simulation_mode"] is True

    # Module 4: Habit & ML Tracker
    hab_res = client.get("/api/habits/dashboard", headers=auth_headers)
    assert hab_res.status_code == 200
    assert 0.0 <= hab_res.json()["latest_prediction"]["adherence_probability"] <= 1.0

    # Module 6: Pose-to-Performance
    perf_res = client.get("/api/performance/reports", headers=auth_headers)
    assert perf_res.status_code == 200

    # Module 7: Gym & Split Planner (Direct Google Maps search URLs — no API key, no sample data)
    plan_res = client.get("/api/planner/current", headers=auth_headers)
    assert plan_res.status_code == 200

    gyms_res = client.get("/api/planner/gyms?location=gyms%20in%20Vijayawada", headers=auth_headers)
    assert gyms_res.status_code == 200
    gyms_body = gyms_res.json()
    assert gyms_body["api_key_required"] is False
    assert gyms_body["sample_data"] is False
    assert gyms_body["gyms"] == []
    assert (
        gyms_body["google_maps_url"]
        == "https://www.google.com/maps/search/?api=1&query=gyms%20in%20Vijayawada"
    )
    assert (
        gyms_body["directions_url"]
        == "https://www.google.com/maps/dir/?api=1&destination=gyms%20in%20Vijayawada"
    )
    assert "[Sample Demo]" not in str(gyms_body)




def test_8_postgresql_schema_alembic_and_user_authorization(client, auth_headers):
    """Verify PostgreSQL fitness_db DATABASE_URL, required tables & FK relationships, no plaintext/API key storage, and 403 cross-user authorization."""
    from backend.database import Base, CONFIGURED_DATABASE_URL
    from backend.models import User, ChatMessage

    # 1. Verify PostgreSQL DATABASE_URL is configured for fitness_db
    assert CONFIGURED_DATABASE_URL.startswith("postgresql")
    assert "fitness_db" in CONFIGURED_DATABASE_URL
    db_status = client.get("/api/database/status")
    assert db_status.status_code == 200
    assert db_status.json()["postgresql_configured"] is True
    assert db_status.json()["configured_database"] == "fitness_db"

    # 2. Verify all required tables (including user_sessions) exist in SQLAlchemy metadata with proper foreign keys
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

    # 3. Verify plaintext passwords and Gemini API keys are never stored in database models
    with pytest.raises(ValueError, match="bcrypt"):
        User(name="Bad User", email="bad@example.com", password_hash="PlaintextPassword123")

    msg = ChatMessage(user_id=1, role="user", content="My key is AIzaSySecretKey12345678901234567890")
    assert "AIzaSySecretKey" not in msg.content
    assert "[REDACTED_API_KEY]" in msg.content

    # 4. Verify cross-user authorization (User A cannot access or delete User B's records)
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

    # User B logs a nutrition item
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

    # User A (auth_headers) must receive 403 Forbidden when trying to access User B's records or delete User B's log
    cross_records = client.get(f"/api/users/{user_b_id}/records", headers=auth_headers)
    assert cross_records.status_code == 403

    cross_delete = client.delete(f"/api/diet/nutrition-logs/{log_b_id}", headers=auth_headers)
    assert cross_delete.status_code == 403

    # User B can access their own records (200 OK)
    own_records = client.get(f"/api/users/{user_b_id}/records", headers=user_b_headers)
    assert own_records.status_code == 200
    assert own_records.json()["user"]["id"] == user_b_id

