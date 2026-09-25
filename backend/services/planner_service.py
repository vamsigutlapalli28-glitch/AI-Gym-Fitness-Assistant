"""Module 7: Gym Recommender and Workout Planner Service.

Implements:
- Personalized 7-day workout split generation based on fitness goal, experience level,
  available equipment, and weekly schedule.
- Curated exercise library and progressive fitness challenges.
- Direct Google Maps gym search and directions URLs (`https://www.google.com/maps/search/?api=1&query=SEARCH_TEXT`)
  with zero API key requirements, no embedded maps, and no fabricated or sample gym data.
"""

from typing import Any, Dict, List, Optional
from urllib.parse import quote


FACILITY_FILTERS: List[str] = [
    "All",
    "Free Weights",
    "Olympic Lifting",
    "Cardio Zone",
    "Recovery & Sauna",
    "Smart IoT Equipment",
]


def build_gym_search_text(
    location_or_query: Optional[str] = None,
    facility_filter: Optional[str] = None,
    extra_search: Optional[str] = None,
) -> str:
    """Constructs the search query text for Google Maps search.

    - If the user already included 'gym' or 'fitness' (e.g., 'gyms in Vijayawada'),
      preserves their exact phrasing.
    - If the user entered a city/neighborhood (e.g., 'Vijayawada'), prefixes 'gyms in '.
    - Appends or prepends the selected facility filter when not 'All'.
    """
    raw = (location_or_query or "").strip()
    extra = (extra_search or "").strip()
    fac = (facility_filter or "All").strip()
    has_fac = bool(fac) and fac.lower() not in ("all", "all facilities")

    combined_input = f"{extra} {raw}".strip() if extra else raw
    if not combined_input:
        return f"{fac} gyms near me" if has_fac else "gyms near me"

    lower_input = combined_input.lower()
    already_has_gym_keyword = "gym" in lower_input or "fitness" in lower_input

    if already_has_gym_keyword:
        if has_fac and fac.lower() not in lower_input:
            return f"{combined_input} {fac}"
        return combined_input

    if has_fac:
        return f"{fac} gyms in {combined_input}"
    return f"gyms in {combined_input}"


def build_google_maps_urls(
    location_or_query: Optional[str] = None,
    facility_filter: Optional[str] = None,
    extra_search: Optional[str] = None,
) -> Dict[str, str]:
    """Builds direct Google Maps search and directions URLs with URL-encoded parameters."""
    search_text = build_gym_search_text(
        location_or_query=location_or_query,
        facility_filter=facility_filter,
        extra_search=extra_search,
    )
    encoded_query = quote(search_text, safe="")
    google_maps_url = f"https://www.google.com/maps/search/?api=1&query={encoded_query}"
    directions_url = f"https://www.google.com/maps/dir/?api=1&destination={encoded_query}"
    return {
        "search_text": search_text,
        "google_maps_url": google_maps_url,
        "directions_url": directions_url,
    }


def get_google_maps_status() -> Dict[str, Any]:
    """Returns status for direct Google Maps URL integration (no API key required)."""
    return {
        "mode": "direct_google_maps_urls",
        "api_key_required": False,
        "search_url_pattern": "https://www.google.com/maps/search/?api=1&query=SEARCH_TEXT",
        "directions_url_pattern": "https://www.google.com/maps/dir/?api=1&destination=SEARCH_TEXT",
    }



EXERCISE_CATALOG = [
    {"id": "ex_curl", "name": "Bicep Curl", "muscle": "Arms (Biceps)", "equipment": "Dumbbells", "difficulty": "Beginner", "sets_reps": "3–4 sets × 10–12 reps", "cv_supported": True, "cues": "Pin elbows to torso, control eccentric lowering for 2 seconds."},
    {"id": "ex_squat", "name": "Squat", "muscle": "Legs (Quads & Glutes)", "equipment": "Bodyweight / Full Gym", "difficulty": "Beginner", "sets_reps": "4 sets × 8–12 reps", "cv_supported": True, "cues": "Brace core, sit hips back and down until thighs reach parallel."},
    {"id": "ex_pushup", "name": "Pushup", "muscle": "Chest & Triceps", "equipment": "Bodyweight", "difficulty": "Beginner", "sets_reps": "3–4 sets × 12–15 reps", "cv_supported": True, "cues": "Keep rigid plank line from shoulders to ankles; elbows at 45°."},
    {"id": "ex_lunge", "name": "Lunge", "muscle": "Legs & Balance", "equipment": "Bodyweight / Dumbbells", "difficulty": "Beginner", "sets_reps": "3 sets × 10 reps/leg", "cv_supported": True, "cues": "Step forward with wide base; keep front knee stacked over ankle."},
    {"id": "ex_spress", "name": "Shoulder Press", "muscle": "Shoulders (Deltoids)", "equipment": "Dumbbells / Full Gym", "difficulty": "Intermediate", "sets_reps": "4 sets × 8–10 reps", "cv_supported": True, "cues": "Press overhead without arching lower back; lock out smoothly."},
    {"id": "ex_rdl", "name": "Romanian Deadlift", "muscle": "Hamstrings & Posterior Chain", "equipment": "Dumbbells / Full Gym", "difficulty": "Intermediate", "sets_reps": "4 sets × 10 reps", "cv_supported": False, "cues": "Hinge at hips with soft knees; keep weights close to shins."},
    {"id": "ex_row", "name": "Bent-Over Dumbbell Row", "muscle": "Back (Lats & Rhomboids)", "equipment": "Dumbbells", "difficulty": "Beginner", "sets_reps": "4 sets × 10–12 reps", "cv_supported": False, "cues": "Pull elbow toward hip pocket and pause 1 second at peak contraction."},
    {"id": "ex_plank", "name": "Forearm Plank Hold", "muscle": "Core & Stability", "equipment": "Bodyweight", "difficulty": "Beginner", "sets_reps": "3 sets × 45–60 sec", "cv_supported": False, "cues": "Squeeze glutes and quads; breathe steadily without hip sag."},
    {"id": "ex_burpee", "name": "HIIT Burpee & Mountain Climber", "muscle": "Full Body Conditioning", "equipment": "Bodyweight", "difficulty": "Intermediate", "sets_reps": "4 rounds × 40 sec work / 20 sec rest", "cv_supported": False, "cues": "Land softly on midfoot and maintain steady pacing."},
    {"id": "ex_lat", "name": "Lat Pulldown / Pull-Up", "muscle": "Back (Upper Width)", "equipment": "Full Gym", "difficulty": "Intermediate", "sets_reps": "4 sets × 8–12 reps", "cv_supported": False, "cues": "Depress scapulae first, then drive elbows down toward ribs."},
]

FITNESS_CHALLENGES = [
    {
        "id": "chal_posture_14",
        "title": "14-Day AI Posture Perfection Challenge",
        "goal": "All Goals",
        "duration_days": 14,
        "target_metric": "Maintain >= 88% Pose-to-Performance Score across 10 AI Trainer sessions",
        "reward_badge": "Biomechanics Master",
        "daily_tasks": ["Complete 3 sets of AI-tracked Squats & Pushups", "Zero 'Red/Danger' spine lean alerts"],
    },
    {
        "id": "chal_hypertrophy_21",
        "title": "21-Day Progressive Overload Builder",
        "goal": "Muscle Gain",
        "duration_days": 21,
        "target_metric": "Log 15 strength sessions + hit daily protein gram target 18/21 days",
        "reward_badge": "Hypertrophy Vanguard",
        "daily_tasks": ["Track Bicep Curls & Shoulder Presses in AI Trainer", "Log post-workout protein meal in Diet Coach"],
    },
    {
        "id": "chal_metabolic_30",
        "title": "30-Day Metabolic Shred & Streak Challenge",
        "goal": "Weight Loss",
        "duration_days": 30,
        "target_metric": "Achieve 85%+ Weekly Habit Consistency & burn 4,500+ tracked active kcal",
        "reward_badge": "Metabolic Igniter",
        "daily_tasks": ["25-min Lunge + Squat + Pushup circuit", "Maintain 350–450 kcal daily deficit"],
    },
]


def generate_weekly_workout_plan(
    goal: str = "Muscle Gain",
    experience_level: str = "Intermediate",
    equipment: str = "Full Gym",
    days_per_week: int = 5,
) -> Dict:
    """Generates a structured 7-day workout schedule tailored to user parameters."""
    days_per_week = max(2, min(6, int(days_per_week)))
    vol_mult = "3 sets × 10 reps" if experience_level == "Beginner" else "4 sets × 8–12 reps" if experience_level == "Intermediate" else "5 sets × 6–10 reps (RPE 8.5)"

    all_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    if goal == "Weight Loss":
        templates = [
            {"focus": "Metabolic Lower Body & Core", "exercises": [f"Squat ({vol_mult})", f"Lunge ({vol_mult})", "Forearm Plank Hold (3 × 60s)", "HIIT Mountain Climbers (4 × 40s)"], "duration_min": 45, "est_calories": 380},
            {"focus": "Upper Body Push/Pull Superset", "exercises": [f"Pushup ({vol_mult})", f"Shoulder Press ({vol_mult})", f"Bent-Over Dumbbell Row ({vol_mult})", f"Bicep Curl ({vol_mult})"], "duration_min": 45, "est_calories": 340},
            {"focus": "HIIT Conditioning & Mobility", "exercises": ["HIIT Burpees (4 × 40s)", "Bodyweight Squat Pulses (3 × 20)", "Walking Lunges (3 × 12/leg)", "Thoracic & Hip Mobility Flow (15 min)"], "duration_min": 40, "est_calories": 410},
            {"focus": "Full-Body Circuit & Posture Control", "exercises": [f"Squat ({vol_mult})", f"Pushup ({vol_mult})", f"Shoulder Press ({vol_mult})", f"Bicep Curl ({vol_mult})"], "duration_min": 50, "est_calories": 390},
            {"focus": "Endurance & Core Finisher", "exercises": [f"Lunge ({vol_mult})", "Romanian Deadlift (3 × 12)", "Plank & Side Plank Circuit", "Zone-2 Brisk Incline Walk (20 min)"], "duration_min": 45, "est_calories": 360},
            {"focus": "Active Athlete Conditioning", "exercises": ["Kettlebell/Dumbbell Swings (4 × 15)", "Pushup to Plank Hold (3 × 12)", "Full-Body Foam Roll & Stretch"], "duration_min": 35, "est_calories": 290},
        ]
    elif goal == "Muscle Gain":
        templates = [
            {"focus": "Push Day (Chest, Shoulders & Triceps)", "exercises": [f"Pushup / Bench Press ({vol_mult})", f"Shoulder Press ({vol_mult})", "Incline Dumbbell Press (3 × 10)", "Lateral Raises (3 × 15)"], "duration_min": 55, "est_calories": 350},
            {"focus": "Pull Day (Back, Lats & Biceps)", "exercises": [f"Lat Pulldown / Pull-Up ({vol_mult})", f"Bent-Over Dumbbell Row ({vol_mult})", f"Bicep Curl ({vol_mult})", "Hammer Curls & Rear Delt Flyes (3 × 12)"], "duration_min": 55, "est_calories": 340},
            {"focus": "Legs & Posterior Chain Hypertrophy", "exercises": [f"Squat ({vol_mult})", f"Romanian Deadlift ({vol_mult})", f"Lunge ({vol_mult})", "Standing Calf Raises & Core Plank (4 × 15)"], "duration_min": 60, "est_calories": 420},
            {"focus": "Upper Body Hypertrophy & Symmetry", "exercises": [f"Shoulder Press ({vol_mult})", f"Pushup ({vol_mult})", f"Bicep Curl ({vol_mult})", "Single-Arm Row (3 × 12/side)"], "duration_min": 50, "est_calories": 330},
            {"focus": "Lower Body Power & Unilateral Stability", "exercises": [f"Squat ({vol_mult})", f"Lunge ({vol_mult})", "Glute Bridge / Hip Thrust (4 × 10)", "Hanging Knee Raises (3 × 15)"], "duration_min": 55, "est_calories": 390},
            {"focus": "Arms, Delts & Weak-Point Specialization", "exercises": [f"Bicep Curl ({vol_mult})", f"Shoulder Press ({vol_mult})", "Close-Grip Pushups (3 × AMRAP)", "Core Stability Flow"], "duration_min": 45, "est_calories": 280},
        ]
    else:
        templates = [
            {"focus": "Full-Body Foundational Strength A", "exercises": [f"Squat ({vol_mult})", f"Pushup ({vol_mult})", f"Bent-Over Dumbbell Row ({vol_mult})", "Forearm Plank Hold (3 × 45s)"], "duration_min": 45, "est_calories": 320},
            {"focus": "Full-Body Functional Strength B", "exercises": [f"Lunge ({vol_mult})", f"Shoulder Press ({vol_mult})", f"Bicep Curl ({vol_mult})", "Romanian Deadlift (3 × 10)"], "duration_min": 45, "est_calories": 330},
            {"focus": "Cardiovascular & Core Conditioning", "exercises": ["Zone-2 Cardio / Treadmill (25 min)", "Pushup & Squat Superset (3 × 12)", "Mobility & Stretch (10 min)"], "duration_min": 45, "est_calories": 350},
            {"focus": "Upper Body Posture & Strength", "exercises": [f"Shoulder Press ({vol_mult})", f"Bicep Curl ({vol_mult})", f"Pushup ({vol_mult})", "Scapular Wall Slides (3 × 12)"], "duration_min": 45, "est_calories": 300},
            {"focus": "Lower Body & Balance", "exercises": [f"Squat ({vol_mult})", f"Lunge ({vol_mult})", "Calf & Ankle Stability (3 × 15)", "Core Plank (3 × 60s)"], "duration_min": 45, "est_calories": 340},
            {"focus": "Weekend Active Sport / Mobility", "exercises": ["30-min Outdoor Run / Cycling", "Full-Body Dynamic Stretching"], "duration_min": 40, "est_calories": 280},
        ]

    schedule = []
    active_assigned = 0
    for idx, day_name in enumerate(all_days):
        is_rest = False
        if days_per_week <= 3 and idx in (1, 3, 5, 6):
            is_rest = True
        elif days_per_week == 4 and idx in (2, 4, 6):
            is_rest = True
        elif days_per_week == 5 and idx in (3, 6):
            is_rest = True
        elif days_per_week == 6 and idx == 6:
            is_rest = True

        if is_rest or active_assigned >= days_per_week:
            schedule.append(
                {
                    "day": day_name,
                    "is_rest_day": True,
                    "focus": "Active Recovery, Hydration & Mobility",
                    "exercises": ["20-min light walk", "Foam rolling & hamstring/thoracic stretching", "8 hours target sleep"],
                    "duration_min": 20,
                    "est_calories": 110,
                }
            )
        else:
            tmpl = templates[active_assigned % len(templates)]
            schedule.append(
                {
                    "day": day_name,
                    "is_rest_day": False,
                    "focus": tmpl["focus"],
                    "exercises": tmpl["exercises"],
                    "duration_min": tmpl["duration_min"],
                    "est_calories": tmpl["est_calories"],
                }
            )
            active_assigned += 1

    return {
        "title": f"{days_per_week}-Day {goal} ({experience_level}) Split",
        "goal": goal,
        "experience_level": experience_level,
        "equipment": equipment,
        "days_per_week": days_per_week,
        "schedule": schedule,
        "challenges": FITNESS_CHALLENGES,
    }


def search_nearby_gyms(
    city: Optional[str] = None,
    facility_filter: Optional[str] = None,
    search_query: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_m: int = 5000,
) -> Dict[str, Any]:
    """Builds direct Google Maps search & directions URLs for the requested location and facility filter.

    Requires no Google Maps API key, embeds no maps, and never fabricates gym names, ratings, or addresses.
    """
    location_text = (city or "").strip()
    custom_q = (search_query or "").strip()
    fac_filter = (facility_filter or "All").strip()

    urls = build_google_maps_urls(
        location_or_query=location_text,
        facility_filter=fac_filter,
        extra_search=custom_q,
    )

    facility_links = []
    for fac in FACILITY_FILTERS:
        if fac == "All":
            continue
        fac_urls = build_google_maps_urls(
            location_or_query=location_text,
            facility_filter=fac,
            extra_search=custom_q,
        )
        facility_links.append(
            {
                "facility": fac,
                "search_text": fac_urls["search_text"],
                "google_maps_url": fac_urls["google_maps_url"],
                "directions_url": fac_urls["directions_url"],
            }
        )

    return {
        "source_mode": "google_maps_direct_url",
        "api_key_required": False,
        "sample_data": False,
        "query_location": location_text,
        "facility_filter": fac_filter,
        "search_text": urls["search_text"],
        "google_maps_url": urls["google_maps_url"],
        "directions_url": urls["directions_url"],
        "facility_links": facility_links,
        "count": 0,
        "gyms": [],
    }


