"""Database initialization and realistic demo data seeding for AI Gym & Fitness Assistant.

Seeds a default user (`alex@ironclad.ai` / `Fitness@123`) and sample historical records
across all 7 modules so charts, habit streaks, nutrition logs, IoT devices, performance reports,
and sample gyms work immediately out-of-the-box.
"""

import json
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from backend.auth import hash_password
from backend.database import Base, SessionLocal, engine
from backend.init_db import initialize_database
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
from backend.services.diet_service import generate_personalized_diet_plan
from backend.services.planner_service import generate_weekly_workout_plan


def init_and_seed_db() -> None:
    """Runs Alembic migrations, creates all tables if they do not exist, and populates initial data."""
    initialize_database()
    db: Session = SessionLocal()
    try:
        existing_user = db.query(User).filter(User.email == "alex@ironclad.ai").first()
        if existing_user:
            has_diet = db.query(DietPlanRecord).filter(DietPlanRecord.user_id == existing_user.id).first()
            if not has_diet:
                diet_data = generate_personalized_diet_plan("Muscle Gain", "Vegetarian", 2550)
                db.add(
                    DietPlanRecord(
                        user_id=existing_user.id,
                        goal="Muscle Gain",
                        dietary_preference="Vegetarian",
                        target_calories=2550,
                        protein_g=diet_data["macros"]["protein_g"],
                        carbs_g=diet_data["macros"]["carbs_g"],
                        fat_g=diet_data["macros"]["fat_g"],
                        meals_json=json.dumps(diet_data["meals"]),
                        grocery_list_json=json.dumps(diet_data["grocery_list"]),
                    )
                )
            has_chat = db.query(ChatMessage).filter(ChatMessage.user_id == existing_user.id).first()
            if not has_chat:
                db.add(
                    ChatMessage(
                        user_id=existing_user.id,
                        role="assistant",
                        content=(
                            "Welcome to **AI Gym & Fitness Assistant**, Alex! I'm your **Virtual Gym Buddy**. "
                            "Ask me anything about exercise biomechanics, vegetarian/non-vegetarian meal prep, "
                            "recovery strategies, or workout splits!"
                        ),
                        sentiment="positive",
                        mood_tag="Welcoming",
                        provider="system",
                    )
                )
            db.commit()
            return

        # 1. Default Demo User
        demo_user = User(
            name="Alex Rivera",
            email="alex@ironclad.ai",
            password_hash=hash_password("Fitness@123"),
            age=26,
            gender="Male",
        )
        db.add(demo_user)
        db.flush()

        # 2. Fitness Profile
        profile = FitnessProfile(
            user_id=demo_user.id,
            height_cm=178.0,
            weight_kg=74.5,
            target_weight_kg=76.0,
            fitness_goal="Muscle Gain",
            experience_level="Intermediate",
            dietary_preference="Vegetarian",
            activity_level="Moderately Active",
            available_equipment="Full Gym, Dumbbells, Bodyweight",
            workout_days_per_week=5,
            preferred_workout_time="18:00",
            daily_calorie_target=2550,
            city="Bengaluru",
        )
        db.add(profile)

        now = datetime.now(timezone.utc)

        # 3. Historical BMI Records
        bmi_samples = [
            (21, 178.0, 72.8, 22.98, "Normal", 1742, 2490),
            (14, 178.0, 73.4, 23.17, "Normal", 1748, 2505),
            (7, 178.0, 74.0, 23.36, "Normal", 1754, 2520),
            (0, 178.0, 74.5, 23.51, "Normal", 1759, 2550),
        ]
        for days_ago, h, w, bmi_val, cat, bmr_val, tdee_val in bmi_samples:
            db.add(
                BMIRecord(
                    user_id=demo_user.id,
                    height_cm=h,
                    weight_kg=w,
                    bmi=bmi_val,
                    category=cat,
                    bmr=bmr_val,
                    tdee=tdee_val,
                    recorded_at=now - timedelta(days=days_ago),
                )
            )

        # 4. Workout Sessions & Module 6 Performance Reports across all 5 exercises
        session_samples = [
            (10, "Bicep Curl", 16, 16, 32, 210, 12.8, 86.0, 90.0, 85.0, 87.4, "Shoulders level, strong contraction", 38.0, 162.0),
            (8, "Squat", 24, 0, 24, 260, 15.6, 84.0, 88.0, 86.0, 86.1, "Parallel depth achieved consistently", 88.0, 168.0),
            (6, "Pushup", 28, 0, 28, 195, 15.4, 88.0, 91.0, 87.0, 89.0, "Rigid plank alignment maintained", 86.0, 166.0),
            (4, "Lunge", 14, 14, 28, 240, 16.8, 85.0, 89.0, 84.0, 86.5, "Good stride spread and upright torso", 92.0, 166.0),
            (2, "Shoulder Press", 15, 15, 30, 220, 14.4, 89.0, 92.0, 88.0, 90.1, "Full overhead lockout, symmetrical press", 72.0, 165.0),
            (1, "Bicep Curl", 18, 18, 36, 230, 14.4, 91.0, 93.0, 90.0, 91.6, "Peak ROM efficiency and zero torso swing", 35.0, 166.0),
        ]
        for days_ago, ex, l_r, r_r, tot, dur, cal, rom_s, form_s, tempo_s, perf_s, notes, r_min, r_max in session_samples:
            rec_time = now - timedelta(days=days_ago)
            ws = WorkoutSession(
                user_id=demo_user.id,
                exercise=ex,
                left_reps=l_r,
                right_reps=r_r,
                total_reps=tot,
                duration_sec=dur,
                calories_burned=cal,
                avg_rom_score=rom_s,
                form_score=form_s,
                tempo_score=tempo_s,
                performance_score=perf_s,
                posture_notes=notes,
                mode="demo",
                recorded_at=rec_time,
            )
            db.add(ws)
            db.flush()

            db.add(
                PerformanceReport(
                    user_id=demo_user.id,
                    exercise=ex,
                    session_id=ws.id,
                    rom_angle_min=r_min,
                    rom_angle_max=r_max,
                    rom_efficiency=rom_s,
                    symmetry_score=93.0,
                    tempo_consistency=tempo_s,
                    posture_accuracy=form_s,
                    overall_score=perf_s,
                    reps_analyzed=tot,
                    feedback_summary=notes,
                    created_at=rec_time,
                )
            )

        # 5. Diet Plan & Today's Nutrition Logs
        diet_data = generate_personalized_diet_plan("Muscle Gain", "Vegetarian", 2550)
        db.add(
            DietPlanRecord(
                user_id=demo_user.id,
                goal="Muscle Gain",
                dietary_preference="Vegetarian",
                target_calories=2550,
                protein_g=diet_data["macros"]["protein_g"],
                carbs_g=diet_data["macros"]["carbs_g"],
                fat_g=diet_data["macros"]["fat_g"],
                meals_json=json.dumps(diet_data["meals"]),
                grocery_list_json=json.dumps(diet_data["grocery_list"]),
            )
        )

        today_str = now.strftime("%Y-%m-%d")
        sample_meals = [
            ("Breakfast", "High-Protein Oats, Chia & Greek Yogurt Bowl", 520, 32.0, 66.0, 14.0, True),
            ("Lunch", "Grilled Paneer Tikka, Dal Tadka & Brown Rice", 680, 38.0, 74.0, 22.0, True),
            ("Post-Workout", "Whey Isolate Shake & Peanut Butter Toast", 340, 34.0, 26.0, 10.0, True),
        ]
        for m_type, f_name, cal, p, c, f, is_veg in sample_meals:
            db.add(
                NutritionLog(
                    user_id=demo_user.id,
                    date_str=today_str,
                    meal_type=m_type,
                    food_name=f_name,
                    calories=cal,
                    protein_g=p,
                    carbs_g=c,
                    fat_g=f,
                    is_vegetarian=is_veg,
                )
            )

        # 6. Habit Logs (Last 10 Days for Streak & Consistency Analytics)
        habit_days = [
            (9, "Push Day Hypertrophy", True, 7.5, 4, 8.0, 8, 2.8, 0.84),
            (8, "Pull Day & Biceps", True, 7.2, 5, 8.5, 7, 2.6, 0.79),
            (7, "Legs & Squat Mobility", True, 8.0, 3, 7.5, 9, 3.0, 0.91),
            (6, "Active Recovery Flow", False, 5.5, 8, 10.5, 4, 1.8, 0.34),
            (5, "Upper Body Symmetry", True, 7.8, 4, 8.0, 8, 2.7, 0.86),
            (4, "Lower Body & Lunges", True, 7.4, 4, 8.0, 8, 2.9, 0.83),
            (3, "Push Day Strength", True, 7.6, 3, 7.5, 9, 3.1, 0.89),
            (2, "Pull Day & Core", True, 7.9, 4, 8.0, 8, 2.8, 0.87),
            (1, "AI Pose Trainer Session", True, 8.1, 3, 7.0, 9, 3.2, 0.92),
            (0, "Full Body & IoT Conditioning", True, 7.8, 4, 8.0, 9, 2.9, 0.88),
        ]
        for d_ago, sched, comp, slp, strs, wrk, mot, wtr, prob in habit_days:
            d_str = (now - timedelta(days=d_ago)).strftime("%Y-%m-%d")
            db.add(
                HabitLog(
                    user_id=demo_user.id,
                    date_str=d_str,
                    scheduled_workout=sched,
                    completed=comp,
                    sleep_hours=slp,
                    stress_level=strs,
                    work_hours=wrk,
                    motivation_level=mot,
                    water_liters=wtr,
                    adherence_prob=prob,
                    notes="Completed on schedule" if comp else "Missed due to late work deadline",
                )
            )

        # 7. Initial Chat Messages
        db.add(
            ChatMessage(
                user_id=demo_user.id,
                role="assistant",
                content=(
                    "Welcome to **AI Gym & Fitness Assistant**, Alex! I'm your **Virtual Gym Buddy**. "
                    "Ask me anything about exercise biomechanics, vegetarian/non-vegetarian meal prep, "
                    "recovery strategies, or workout splits!"
                ),
                sentiment="positive",
                mood_tag="Welcoming",
                provider="system",
            )
        )

        # 8. Workout Plan
        plan_data = generate_weekly_workout_plan("Muscle Gain", "Intermediate", "Full Gym", 5)
        db.add(
            WorkoutPlan(
                user_id=demo_user.id,
                title=plan_data["title"],
                goal=plan_data["goal"],
                experience_level=plan_data["experience_level"],
                equipment=plan_data["equipment"],
                days_per_week=plan_data["days_per_week"],
                schedule_json=json.dumps(plan_data["schedule"]),
                challenges_json=json.dumps(plan_data["challenges"]),
            )
        )

        # 9. Smart Gym IoT Simulated Devices (Module 3)
        iot_devices = [
            IoTDeviceRecord(
                user_id=demo_user.id,
                device_id="esp32_dumbbell_01",
                name="Smart Adjustable Dumbbell Set",
                device_type="smart_dumbbell",
                mqtt_topic="gym/equipment/esp32_dumbbell_01/telemetry",
                is_connected=True,
                is_simulated=True,
                resistance_kg=17.5,
                speed_kmh=0.0,
                heart_rate_bpm=128,
                intensity_level="Moderate",
                status="Simulated Active",
            ),
            IoTDeviceRecord(
                user_id=demo_user.id,
                device_id="esp32_cable_02",
                name="Digital Cable Resistance Tower",
                device_type="cable_machine",
                mqtt_topic="gym/equipment/esp32_cable_02/telemetry",
                is_connected=True,
                is_simulated=True,
                resistance_kg=32.5,
                speed_kmh=0.0,
                heart_rate_bpm=132,
                intensity_level="High",
                status="Simulated Active",
            ),
            IoTDeviceRecord(
                user_id=demo_user.id,
                device_id="esp32_treadmill_03",
                name="Smart Incline Treadmill Pro",
                device_type="treadmill",
                mqtt_topic="gym/equipment/esp32_treadmill_03/telemetry",
                is_connected=True,
                is_simulated=True,
                resistance_kg=0.0,
                speed_kmh=9.5,
                heart_rate_bpm=138,
                intensity_level="Moderate",
                status="Simulated Active",
            ),
            IoTDeviceRecord(
                user_id=demo_user.id,
                device_id="esp32_hr_band_04",
                name="Optical Chest/Wrist Heart Rate Strap",
                device_type="hr_sensor",
                mqtt_topic="gym/equipment/esp32_hr_band_04/telemetry",
                is_connected=True,
                is_simulated=True,
                resistance_kg=0.0,
                speed_kmh=0.0,
                heart_rate_bpm=126,
                intensity_level="Moderate",
                status="Simulated Active",
            ),
        ]
        db.add_all(iot_devices)

        # Purge any legacy sample gym records if present
        db.query(GymLocationRecord).filter(
            (GymLocationRecord.is_sample_data.is_(True))
            | (GymLocationRecord.name.like("[Sample Demo]%"))
        ).delete(synchronize_session=False)

        db.commit()
    finally:
        db.close()
