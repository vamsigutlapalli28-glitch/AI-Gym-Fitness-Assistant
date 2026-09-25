"""Google Gemini AI Service (Official `google-genai` Python SDK).

Connects Google Gemini (`GEMINI_API_KEY`, `GEMINI_MODEL` in `backend/.env`) to:
1. Virtual Gym Buddy Chatbot (multi-turn conversation history + sentiment analysis)
2. AI Dietician Coach (personalized meal plan analysis, macro timing & culinary tips)
3. Personalized Workout Plan Generation (AI split optimization & progressive overload cues)
4. Fitness Motivation, Habit Adherence & Biomechanical Pose Guidance

Security & Reliability:
- Uses `python-dotenv` to load `backend/.env` and root `.env`.
- Never hardcodes or exposes `GEMINI_API_KEY` in any frontend response.
- Never returns a fake/hardcoded coaching response in Virtual Gym Buddy chat when Gemini fails;
  instead surfaces clear, actionable error diagnostics.
"""

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError

logger = logging.getLogger(__name__)

_BACKEND_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
_ROOT_ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"

SUPPORTED_GEMINI_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3-flash-preview",
    "gemini-flash-lite-latest",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
]

FAILOVER_GEMINI_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3-flash-preview",
    "gemini-flash-lite-latest",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
]

PLACEHOLDER_KEYS = {
    "",
    "your_actual_gemini_api_key",
    "your_gemini_api_key",
    "your_api_key_here",
    "change_me",
    "placeholder",
}

_backend_env_mtime: float = 0.0
_root_env_mtime: float = 0.0

if _ROOT_ENV_PATH.exists():
    load_dotenv(dotenv_path=_ROOT_ENV_PATH, override=False)
    _root_env_mtime = _ROOT_ENV_PATH.stat().st_mtime
if _BACKEND_ENV_PATH.exists():
    load_dotenv(dotenv_path=_BACKEND_ENV_PATH, override=True)
    _backend_env_mtime = _BACKEND_ENV_PATH.stat().st_mtime


def _load_gemini_env() -> Tuple[str, str]:
    """Loads environment variables from backend/.env and root .env, reloading on file modification."""
    global _backend_env_mtime, _root_env_mtime

    if _ROOT_ENV_PATH.exists():
        current_root_mtime = _ROOT_ENV_PATH.stat().st_mtime
        if current_root_mtime != _root_env_mtime:
            load_dotenv(dotenv_path=_ROOT_ENV_PATH, override=True)
            _root_env_mtime = current_root_mtime

    if _BACKEND_ENV_PATH.exists():
        current_backend_mtime = _BACKEND_ENV_PATH.stat().st_mtime
        if current_backend_mtime != _backend_env_mtime:
            load_dotenv(dotenv_path=_BACKEND_ENV_PATH, override=True)
            _backend_env_mtime = current_backend_mtime

    raw_key = os.getenv("GEMINI_API_KEY", "").strip()
    raw_model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash").strip()

    if not raw_model or raw_model.upper() in ("YOUR_SUPPORTED_GEMINI_MODEL", "YOUR_GEMINI_MODEL"):
        model = "gemini-3.6-flash"
    else:
        model = raw_model

    return raw_key, model


def is_gemini_key_configured(api_key: Optional[str] = None) -> bool:
    """Returns True if a non-placeholder Gemini API key is configured."""
    key = (api_key if api_key is not None else _load_gemini_env()[0]).strip()
    return bool(key) and key.lower() not in PLACEHOLDER_KEYS


def get_gemini_status() -> Dict[str, Any]:
    """Returns safe, non-sensitive Gemini configuration status for health/UI display."""
    raw_key, model = _load_gemini_env()
    configured = is_gemini_key_configured(raw_key)
    model_supported = model in SUPPORTED_GEMINI_MODELS or model.startswith("gemini-")
    return {
        "sdk": "google-genai",
        "configured": configured,
        "api_key_configured": configured,
        "model": model,
        "model_supported": model_supported,
        "supported_models": SUPPORTED_GEMINI_MODELS,
        "env_file": "backend/.env",
        "status_message": (
            f"Google Gemini ({model}) configured via official google-genai SDK."
            if configured
            else "GEMINI_API_KEY in backend/.env is not set (currently using placeholder 'YOUR_ACTUAL_GEMINI_API_KEY'). Please set a valid Google Gemini API key in backend/.env."
        ),
    }


def _call_gemini(
    prompt_or_contents: Any,
    system_instruction: str,
    temperature: float = 0.7,
    max_output_tokens: int = 850,
) -> Tuple[Optional[str], str, Optional[str], str]:
    """Calls Google Gemini using the official `google-genai` SDK.

    Returns:
        Tuple of (text_or_none, gemini_status, error_message_or_none, model_name)
        where gemini_status is one of:
        - 'success'
        - 'missing_api_key'
        - 'invalid_api_key'
        - 'quota_exceeded'
        - 'unsupported_model'
        - 'api_error'
    """
    api_key, model = _load_gemini_env()

    if not is_gemini_key_configured(api_key):
        msg = (
            "GEMINI_API_KEY is missing or set to placeholder ('YOUR_ACTUAL_GEMINI_API_KEY') in backend/.env. "
            "Please add your real Google Gemini API key to backend/.env."
        )
        logger.warning("Gemini API call blocked: %s", msg)
        return (None, "missing_api_key", msg, model)

    if not (model in SUPPORTED_GEMINI_MODELS or model.startswith("gemini-")):
        msg = (
            f"Configured GEMINI_MODEL '{model}' is not a supported Gemini model identifier. "
            "Recommended: gemini-3.6-flash or gemini-3.5-flash-lite."
        )
        logger.error("Gemini API call blocked: %s", msg)
        return (None, "unsupported_model", msg, model)

    candidate_models = [model] + [m for m in FAILOVER_GEMINI_MODELS if m != model]
    client = genai.Client(api_key=api_key)

    last_status = "api_error"
    last_error = "Failed to generate a response from Google Gemini."

    for candidate_model in candidate_models:
        try:
            response = client.models.generate_content(
                model=candidate_model,
                contents=prompt_or_contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=temperature,
                    max_output_tokens=max_output_tokens,
                    http_options=types.HttpOptions(
                        retry_options=types.HttpRetryOptions(attempts=1),
                    ),
                ),
            )
            text = getattr(response, "text", None)
            if text and text.strip():
                return text.strip(), "success", None, candidate_model
            last_status = "api_error"
            last_error = f"Google Gemini ({candidate_model}) returned an empty response candidate."
        except APIError as exc:
            code = getattr(exc, "code", None) or 0
            raw_msg = str(exc)
            if api_key:
                raw_msg = raw_msg.replace(api_key, "[REDACTED]")
            logger.warning("Gemini APIError on model '%s' (code=%s): %s", candidate_model, code, raw_msg)

            if code in (400, 401, 403) or "API_KEY_INVALID" in raw_msg or "invalid api key" in raw_msg.lower():
                return (
                    None,
                    "invalid_api_key",
                    "Invalid or unauthorized GEMINI_API_KEY in backend/.env. Please verify your Google AI Studio API key.",
                    candidate_model,
                )
            if code == 404 or "not found" in raw_msg.lower() or "no longer available" in raw_msg.lower():
                last_status = "unsupported_model"
                last_error = (
                    f"Gemini model '{candidate_model}' is unavailable (404). "
                    "Trying next available Gemini model or update GEMINI_MODEL in backend/.env to gemini-3.6-flash."
                )
                continue
            if code == 429 or "RESOURCE_EXHAUSTED" in raw_msg or "quota" in raw_msg.lower():
                last_status = "quota_exceeded"
                last_error = "Google Gemini API rate/quota limit reached (HTTP 429). Please wait a moment or check your Google AI Studio quota."
                continue
            if code == 503 or "UNAVAILABLE" in raw_msg or "high demand" in raw_msg.lower():
                last_status = "api_error"
                last_error = f"Gemini model '{candidate_model}' is experiencing temporary high demand (503)."
                continue
            last_status = "api_error"
            last_error = f"Google Gemini API error (HTTP {code}). Please verify your API key and network connection."
        except Exception as exc:
            raw_msg = str(exc)
            if api_key:
                raw_msg = raw_msg.replace(api_key, "[REDACTED]")
            logger.error("Gemini unexpected error on model '%s': %s", candidate_model, raw_msg)
            if "API_KEY_INVALID" in raw_msg or "401" in raw_msg or "403" in raw_msg or "invalid api key" in raw_msg.lower():
                return (
                    None,
                    "invalid_api_key",
                    "Invalid or unauthorized GEMINI_API_KEY in backend/.env. Please verify your Google AI Studio API key.",
                    candidate_model,
                )
            if "429" in raw_msg or "quota" in raw_msg.lower():
                last_status = "quota_exceeded"
                last_error = "Google Gemini API quota limit reached (HTTP 429). Please wait a moment or check your Google AI Studio quota."
                continue
            last_status = "api_error"
            last_error = f"Could not reach Google Gemini API ({raw_msg[:160]})."
            break

    return (None, last_status, last_error, model)


def analyze_user_sentiment(message: str) -> Dict[str, str]:
    """Detects emotional state and sentiment from user message to tailor coaching tone."""
    msg = message.lower()
    if any(w in msg for w in ["tired", "exhausted", "sore", "fatigue", "sleepy", "drained", "low energy", "pain"]):
        return {
            "sentiment": "fatigued",
            "mood_tag": "Needs Recovery & Gentle Encouragement",
            "coaching_cue": "Empathetic, recovery-focused, suggesting lighter intensity or mobility.",
        }
    if any(w in msg for w in ["stressed", "anxious", "overwhelmed", "busy", "skip", "quit", "unmotivated", "hard"]):
        return {
            "sentiment": "stressed",
            "mood_tag": "High Stress / Needs Micro-Goal Motivation",
            "coaching_cue": "Reassuring, breaking goals into a 10-minute habit win.",
        }
    if any(w in msg for w in ["excited", "ready", "crush", "pr", "strong", "motivated", "pump", "great"]):
        return {
            "sentiment": "motivated",
            "mood_tag": "High Energy & Peak Readiness",
            "coaching_cue": "Energetic, challenging, focusing on progressive overload and form precision.",
        }
    return {
        "sentiment": "positive",
        "mood_tag": "Focused & Curious",
        "coaching_cue": "Structured, evidence-based, encouraging fitness & nutrition guidance.",
    }


# ==============================================================================
# 1. VIRTUAL GYM BUDDY CHATBOT (MULTI-TURN CONVERSATION)
# ==============================================================================

def generate_buddy_reply(
    question: str,
    conversation_history: List[Dict[str, str]],
    user_context: Dict,
) -> Dict:
    """Generates a fresh multi-turn response from Google Gemini (`google-genai` SDK).

    Never returns a hardcoded or fake coaching response. If Gemini fails, returns
    `answer=None` along with `gemini_status` and `gemini_error`.
    """
    clean_question = question.strip()
    sentiment_info = analyze_user_sentiment(clean_question)

    system_prompt = (
        f"You are Virtual Gym Buddy, an intelligent, empathetic AI personal trainer, sports nutritionist, and helpful assistant. "
        f"Athlete profile context (use when relevant to fitness/nutrition questions): "
        f"Name={user_context.get('name', 'Athlete')}, Goal={user_context.get('goal', 'Muscle Gain')}, "
        f"Diet={user_context.get('dietary_preference', 'Vegetarian')}, TargetCalories={user_context.get('daily_calorie_target', 2200)} kcal. "
        f"Detected User Mood: {sentiment_info['mood_tag']}. "
        "CRITICAL INSTRUCTIONS:\n"
        "1. Always answer the user's exact message directly, specifically, and accurately.\n"
        "2. If the user asks a general knowledge or factual question (e.g., 'What is the capital of India?'), answer that exact question directly and accurately.\n"
        "3. If the user asks how to perform an exercise (e.g., squats, pushups, lunges, bicep curls), provide clear step-by-step biomechanical form cues, breathing, and common mistakes to avoid.\n"
        "4. If the user asks for meal or nutrition suggestions, provide specific meal ideas with estimated macros tailored to their dietary preference, noting that calorie/macro figures are estimates.\n"
        "5. Use the prior conversation history to understand follow-up questions and context.\n"
        "6. Never reply with a generic template that ignores the user's actual message."
    )

    contents: List[types.Content] = []
    for msg in conversation_history[-12:]:
        role_raw = (msg.get("role") or "").lower()
        role = "model" if role_raw in ("assistant", "model") else "user"
        text_val = (msg.get("content") or "").strip()
        provider_val = (msg.get("provider") or "").lower()

        if not text_val:
            continue
        if provider_val == "system" or provider_val.startswith("local_fallback"):
            continue
        if text_val.startswith("### Coach Response for ") or text_val.startswith("Chat history cleared!"):
            continue

        contents.append(
            types.Content(role=role, parts=[types.Part.from_text(text=text_val)])
        )

    if not contents or contents[-1].role != "user" or contents[-1].parts[0].text != clean_question:
        contents.append(
            types.Content(role="user", parts=[types.Part.from_text(text=clean_question)])
        )

    answer, gemini_status, gemini_error, model_name = _call_gemini(
        prompt_or_contents=contents,
        system_instruction=system_prompt,
        temperature=0.7,
        max_output_tokens=850,
    )

    if answer and gemini_status == "success":
        return {
            "answer": answer,
            "sentiment": sentiment_info["sentiment"],
            "mood_tag": sentiment_info["mood_tag"],
            "provider": f"google-genai ({model_name})",
            "gemini_status": "success",
            "gemini_error": None,
            "fallback_used": False,
        }

    return {
        "answer": None,
        "sentiment": sentiment_info["sentiment"],
        "mood_tag": sentiment_info["mood_tag"],
        "provider": f"google-genai ({gemini_status})",
        "gemini_status": gemini_status,
        "gemini_error": gemini_error or "Failed to generate a response from Google Gemini.",
        "fallback_used": False,
    }



# ==============================================================================
# 2. AI DIETICIAN COACH GEMINI INTEGRATION (MULTI-TURN CONVERSATION & ANALYSIS)
# ==============================================================================

def generate_dietician_chat_reply(
    question: str,
    conversation_history: List[Dict[str, str]],
    user_context: Dict[str, Any],
) -> Dict[str, Any]:
    """Generates a real, personalized, multi-turn AI Dietician response using Google Gemini (`google-genai`).

    Supports pre/post-workout meals, daily protein/calorie targets, muscle gain, weight loss,
    Indian & vegetarian foods, ingredient substitutions (e.g., paneer vs. tofu/soya chunks),
    budget-friendly meals, and dynamic daily adjustments (e.g., missed breakfast).
    Never returns a fake or hardcoded AI response when Gemini is unavailable.
    """
    clean_question = question.strip()
    sentiment_info = analyze_user_sentiment(clean_question)

    name = user_context.get("name") or "Member"
    age = user_context.get("age")
    gender = user_context.get("gender")
    height_cm = user_context.get("height_cm")
    weight_kg = user_context.get("weight_kg")
    target_weight_kg = user_context.get("target_weight_kg")
    goal = user_context.get("goal") or user_context.get("fitness_goal") or "General Fitness"
    diet_pref = user_context.get("dietary_preference") or "Balanced"
    allergies = (user_context.get("allergies") or "").strip() or "None reported"
    activity_level = user_context.get("activity_level") or "Moderately Active"
    calorie_target = user_context.get("daily_calorie_target") or 2200
    logged_cal = user_context.get("logged_calories_today")
    logged_pro = user_context.get("logged_protein_today")

    profile_lines = [
        f"- Name: {name}",
        f"- Age: {age if age is not None else 'Not specified'}",
        f"- Gender: {gender or 'Not specified'}",
        f"- Height: {f'{height_cm} cm' if height_cm else 'Not specified'}",
        f"- Current Weight: {f'{weight_kg} kg' if weight_kg else 'Not specified'}",
        f"- Target Weight: {f'{target_weight_kg} kg' if target_weight_kg else 'Not specified'}",
        f"- Fitness Goal: {goal}",
        f"- Dietary Preference: {diet_pref}",
        f"- Allergies / Intolerances: {allergies}",
        f"- Activity Level: {activity_level}",
        f"- Daily Calorie Target: {calorie_target} kcal/day",
    ]
    if logged_cal is not None:
        profile_lines.append(
            f"- Logged Nutrition Today So Far: {logged_cal} kcal ({logged_pro or 0}g protein)"
        )

    system_prompt = (
        "You are an expert AI Dietician & Sports Nutritionist. "
        "Your role is to provide practical, science-informed, culturally adaptable nutrition, meal planning, hydration, and recovery coaching.\n\n"
        "USER PROFILE CONTEXT (use these exact details to personalize your advice; never invent missing user details):\n"
        + "\n".join(profile_lines)
        + "\n\nCRITICAL GUIDELINES:\n"
        "1. Answer the user's specific nutrition, meal plan, calorie, protein, weight loss, muscle gain, Indian food, vegetarian/vegan/non-vegetarian, food substitution, or budget meal question directly.\n"
        "2. Respect the user's Dietary Preference and Allergies/Intolerances at all times. For example, if they ask about replacing paneer with tofu or soya chunks, compare protein per 100g, calories, digestibility, and culinary usage.\n"
        "3. When suggesting meals or daily plans, include practical portion sizes (e.g., grams, bowls, rotis, scoops) and estimated calories & protein/carbs/fat.\n"
        "4. If the user asks how to adjust their plan (e.g., if they missed breakfast or trained late), redistribute their remaining daily calories and protein practically across their remaining meals.\n"
        "5. Use prior conversation history to handle follow-up questions seamlessly. Ask 1 brief, relevant follow-up question when helpful to refine their plan.\n"
        "6. Keep guidance focused on nutrition, fitness, hydration, recovery, and healthy habits. Treat all calorie/macro numbers as nutritional estimates and avoid making unsupported medical diagnoses or clinical claims."
    )

    contents: List[types.Content] = []
    for msg in conversation_history[-16:]:
        role_raw = (msg.get("role") or "").lower()
        role = "model" if role_raw in ("assistant", "model") else "user"
        text_val = (msg.get("content") or "").strip()
        provider_val = (msg.get("provider") or "").lower()

        if not text_val:
            continue
        if provider_val == "system" or provider_val.startswith("local_fallback"):
            continue
        if text_val.startswith("### Coach Response for ") or text_val.startswith("Chat history cleared!"):
            continue

        contents.append(
            types.Content(role=role, parts=[types.Part.from_text(text=text_val)])
        )

    if not contents or contents[-1].role != "user" or contents[-1].parts[0].text != clean_question:
        contents.append(
            types.Content(role="user", parts=[types.Part.from_text(text=clean_question)])
        )

    answer, gemini_status, gemini_error, model_name = _call_gemini(
        prompt_or_contents=contents,
        system_instruction=system_prompt,
        temperature=0.65,
        max_output_tokens=950,
    )

    if answer and gemini_status == "success":
        return {
            "answer": answer,
            "sentiment": sentiment_info["sentiment"],
            "mood_tag": sentiment_info["mood_tag"],
            "provider": f"google-genai ({model_name})",
            "gemini_status": "success",
            "gemini_error": None,
            "fallback_used": False,
        }

    return {
        "answer": None,
        "sentiment": sentiment_info["sentiment"],
        "mood_tag": sentiment_info["mood_tag"],
        "provider": f"google-genai ({gemini_status})",
        "gemini_status": gemini_status,
        "gemini_error": gemini_error or "AI Dietician service is temporarily unavailable. Please try again shortly.",
        "fallback_used": False,
    }


def generate_diet_gemini_coaching(
    diet_plan: Dict,
    user_context: Dict,
    custom_query: Optional[str] = None,
) -> Dict:
    """Uses Google Gemini (`google-genai`) to generate personalized nutrition & meal-timing insights."""
    name = user_context.get("name", "Athlete")
    goal = diet_plan.get("goal") or user_context.get("goal", "Muscle Gain")
    pref = diet_plan.get("dietary_preference") or user_context.get("dietary_preference", "Vegetarian")
    target_cal = diet_plan.get("target_calories") or user_context.get("daily_calorie_target", 2200)
    macros = diet_plan.get("macros", {})

    system_prompt = (
        "You are an AI Sports Dietician & Calorie Coach. "
        "Provide practical, culturally adaptable, evidence-based nutrition guidance in concise Markdown. "
        "Remind the user that calorie and macro figures are estimates and not medical prescriptions."
    )

    prompt = (
        f"Athlete: {name}\n"
        f"Fitness Goal: {goal}\n"
        f"Dietary Preference: {pref}\n"
        f"Target Daily Calories: {target_cal} kcal/day (Protein: {macros.get('protein_g', 160)}g, "
        f"Carbs: {macros.get('carbs_g', 240)}g, Fat: {macros.get('fat_g', 65)}g)\n"
        f"User Request: {custom_query or 'Provide 3 high-impact meal-prep, macro-timing, and micronutrient optimization tips for this meal plan.'}"
    )

    answer, gemini_status, gemini_error, model_name = _call_gemini(
        prompt_or_contents=prompt,
        system_instruction=system_prompt,
        temperature=0.65,
        max_output_tokens=550,
    )

    if answer and gemini_status == "success":
        return {
            "coaching_notes": answer,
            "provider": f"google-genai ({model_name})",
            "gemini_status": "success",
            "gemini_error": None,
            "fallback_used": False,
        }

    fallback_notes = (
        f"### Nutrition & Meal Timing Summary ({goal} • {pref})\n"
        f"1. **Protein Distribution (~{macros.get('protein_g', 160)}g/day):** Split protein evenly across 4–5 meals (~30–40g per meal) to support muscle recovery.\n"
        f"2. **Workout Fueling (~{macros.get('carbs_g', 240)}g/day):** Consume complex carbohydrates 60–90 minutes before training and pair protein with carbs after your workout.\n"
        f"3. **Micronutrients & Hydration:** Pair iron-rich {'plant sources (spinach, lentils, chickpeas)' if pref == 'Vegetarian' else 'lean proteins'} with Vitamin C and aim for 3.0–3.5L of water daily.\n"
        "*(Note: Calorie and macro targets are nutritional estimates, not medical advice.)*"
    )
    return {
        "coaching_notes": fallback_notes,
        "provider": f"local_fallback ({gemini_status})",
        "gemini_status": gemini_status,
        "gemini_error": gemini_error,
        "fallback_used": True,
    }


# ==============================================================================
# 3. PERSONALIZED WORKOUT PLAN GENERATION GEMINI INTEGRATION
# ==============================================================================

def generate_planner_gemini_guidance(
    workout_plan: Dict,
    user_context: Dict,
    custom_query: Optional[str] = None,
) -> Dict:
    """Uses Google Gemini (`google-genai`) to provide personalized weekly split progression & periodization advice."""
    name = user_context.get("name", "Athlete")
    title = workout_plan.get("title", "7-Day Workout Split")
    goal = workout_plan.get("goal", "Muscle Gain")
    level = workout_plan.get("experience_level", "Intermediate")
    equipment = workout_plan.get("equipment", "Full Gym")
    days = workout_plan.get("days_per_week", 5)

    system_prompt = (
        "You are an elite Strength & Conditioning Specialist powered by Google Gemini. "
        "Provide structured, actionable workout programming, progressive overload rules, and warm-up/recovery protocols in Markdown."
    )

    prompt = (
        f"Athlete: {name} | Level: {level} | Goal: {goal}\n"
        f"Equipment: {equipment} | Training Frequency: {days} days/week\n"
        f"Current Plan: {title}\n"
        f"Focus Request: {custom_query or 'Give me a 4-week progressive overload roadmap, warm-up protocol, and deload strategy for this split.'}"
    )

    answer, gemini_status, gemini_error, model_name = _call_gemini(
        prompt_or_contents=prompt,
        system_instruction=system_prompt,
        temperature=0.65,
        max_output_tokens=550,
    )

    if answer and gemini_status == "success":
        return {
            "ai_program_notes": answer,
            "provider": f"google-genai ({model_name})",
            "gemini_status": "success",
            "gemini_error": None,
            "fallback_used": False,
        }

    fallback_notes = (
        f"### 4-Week Progressive Overload Roadmap ({title})\n"
        f"- **Week 1 (Baseline Volume):** Complete all prescribed sets at RPE 7.5 (leave 2–3 clean reps in reserve) and focus on >90% posture accuracy in the AI Pose Trainer.\n"
        f"- **Week 2 (+Rep Progression):** Add **1–2 reps per set** on primary compound movements ({equipment}) while keeping rest intervals at 60–90 seconds.\n"
        f"- **Week 3 (Peak Stimulus):** Increase working resistance by **2.5–5%** or add 1 slowed eccentric set (3-second lowering phase).\n"
        f"- **Week 4 (Recovery / Deload):** Reduce total set volume by 30% to allow full central nervous system and connective tissue supercompensation."
    )
    return {
        "ai_program_notes": fallback_notes,
        "provider": f"local_fallback ({gemini_status})",
        "gemini_status": gemini_status,
        "gemini_error": gemini_error,
        "fallback_used": True,
    }


# ==============================================================================
# 4. FITNESS MOTIVATION, HABIT & POSE BIOMECHANICS GEMINI GUIDANCE
# ==============================================================================

def generate_workout_gemini_advice(workout_stats: Dict, user_context: Dict) -> Dict:
    """Generates personalized coaching advice from Google Gemini based strictly on local MediaPipe workout stats.

    Privacy & Bandwidth Safeguard: Never sends raw webcam frames to Gemini.
    Only structured joint-angle, repetition, posture, and duration statistics are transmitted.
    """
    exercise = workout_stats.get("exercise", "Bicep Curl")
    total_reps = workout_stats.get("total", 0)
    left_reps = workout_stats.get("left", 0)
    right_reps = workout_stats.get("right", 0)
    duration = workout_stats.get("duration", 0)
    calories = workout_stats.get("calories", 0.0)
    left_angle = workout_stats.get("left_angle", 0)
    right_angle = workout_stats.get("right_angle", 0)
    feedback_msg = workout_stats.get("feedback", {}).get("message", "Good form")
    perf = workout_stats.get("performance", {})
    alerts = workout_stats.get("posture_alerts", [])

    system_prompt = (
        "You are an expert AI Biomechanics & Strength Coach powered by Google Gemini. "
        "Analyze real-time MediaPipe Pose joint telemetry and provide concise, motivating 3-part feedback."
    )

    stats_summary_prompt = (
        f"Analyze the following real-time MediaPipe Pose workout statistics for {user_context.get('name', 'Athlete')} "
        f"(Goal: {user_context.get('goal', 'Muscle Gain')}):\n"
        f"- Exercise: {exercise}\n"
        f"- Total Repetitions: {total_reps} (Left: {left_reps}, Right: {right_reps})\n"
        f"- Workout Duration: {duration} seconds\n"
        f"- Estimated Calories Burned: {calories} kcal\n"
        f"- Current Joint Angles: Left={left_angle} deg, Right={right_angle} deg\n"
        f"- Range of Motion (ROM) Window: {perf.get('rom_angle_min', 42)} deg to {perf.get('rom_angle_max', 164)} deg "
        f"(ROM Efficiency: {perf.get('rom_efficiency', 88)}%)\n"
        f"- Posture Accuracy: {perf.get('posture_accuracy', 90)}% | Bilateral Symmetry: {perf.get('symmetry_score', 92)}%\n"
        f"- Overall Heuristic Performance Score: {perf.get('performance_score', 90)} / 100\n"
        f"- Live Posture Feedback: {feedback_msg}\n"
        f"- Detected Form Alerts: {', '.join(alerts) if alerts else 'None'}\n\n"
        "Provide a concise, actionable 3-part coaching response in Markdown:\n"
        "1. **Performance Breakdown**: Explain what their rep count, pace, and ROM efficiency indicate.\n"
        "2. **Biomechanical Form Cue**: Specific joint-angle correction or progression tip for this exercise.\n"
        "3. **Next Set Target**: Recommended rest time and rep/tempo goal for the next set."
    )

    advice_text, gemini_status, gemini_error, model_name = _call_gemini(
        prompt_or_contents=stats_summary_prompt,
        system_instruction=system_prompt,
        temperature=0.65,
        max_output_tokens=480,
    )

    if advice_text and gemini_status == "success":
        return {
            "advice": advice_text,
            "provider": f"google-genai ({model_name})",
            "gemini_status": "success",
            "gemini_error": None,
            "fallback_used": False,
            "privacy_note": "Processed locally via MediaPipe. Only numerical exercise statistics (0 raw video frames) were sent to Gemini.",
            "stats_snapshot": {
                "exercise": exercise,
                "total_reps": total_reps,
                "duration_sec": duration,
                "performance_score": perf.get("performance_score", 90),
            },
        }

    return {
        "advice": None,
        "provider": "google-genai",
        "gemini_status": gemini_status,
        "gemini_error": gemini_error or "Unable to generate AI workout feedback from Google Gemini.",
        "fallback_used": False,
        "privacy_note": "Processed locally via MediaPipe. Only numerical exercise statistics (0 raw video frames) were evaluated.",
        "stats_snapshot": {
            "exercise": exercise,
            "total_reps": total_reps,
            "duration_sec": duration,
            "performance_score": perf.get("performance_score", 90),
        },
    }


def generate_habit_gemini_motivation(
    habit_summary: Dict,
    prediction: Dict,
    user_context: Dict,
) -> Dict:
    """Uses Google Gemini (`google-genai`) to generate personalized habit motivation & behavioral coaching."""
    name = user_context.get("name", "Athlete")
    goal = user_context.get("goal", "Muscle Gain")
    streak = habit_summary.get("current_streak", 0)
    consistency = habit_summary.get("consistency_pct", 0.0)
    adherence_pct = prediction.get("adherence_percentage", 85.0)
    risk = prediction.get("risk_level", "Low Skip Risk")

    system_prompt = (
        "You are an AI Behavioral Fitness & Habit Coach powered by Google Gemini. "
        "Provide motivating, psychologically grounded habit-stacking advice in concise Markdown."
    )

    prompt = (
        f"Athlete: {name} (Goal: {goal})\n"
        f"Current Workout Streak: {streak} days | 14-Day Consistency: {consistency}%\n"
        f"Scikit-Learn ML Adherence Prediction Today: {adherence_pct}% ({risk})\n"
        f"Schedule Recommendation: {prediction.get('recommended_schedule_adjustment', '')}\n"
        "Give a short, energizing motivational message and 2 behavioral habit-stacking tactics for today."
    )

    advice_text, gemini_status, gemini_error, model_name = _call_gemini(
        prompt_or_contents=prompt,
        system_instruction=system_prompt,
        temperature=0.7,
        max_output_tokens=400,
    )

    if advice_text and gemini_status == "success":
        return {
            "motivation": advice_text,
            "provider": f"google-genai ({model_name})",
            "gemini_status": "success",
            "gemini_error": None,
            "fallback_used": False,
        }

    fallback_motivation = (
        f"### Behavioral Habit Coaching for {name}\n"
        f"- **Streak Momentum ({streak}-Day Active Streak • {consistency}% Consistency):** Your ML adherence readiness is **{adherence_pct}% ({risk})**.\n"
        "- **Habit-Stacking Cue:** Lay out your gym gear 30 minutes before your scheduled session and pair your pre-workout hydration with a 5-minute dynamic warm-up.\n"
        f"- **Today's Action Plan:** {prediction.get('recommended_schedule_adjustment', 'Complete your scheduled workout session with full ROM focus.')}"
    )
    return {
        "motivation": fallback_motivation,
        "provider": f"local_fallback ({gemini_status})",
        "gemini_status": gemini_status,
        "gemini_error": gemini_error,
        "fallback_used": True,
    }
