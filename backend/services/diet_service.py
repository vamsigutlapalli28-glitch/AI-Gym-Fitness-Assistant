"""Module 2: AI Dietician and Calorie Coach Service.

Implements:
- BMI calculation and WHO category classification.
- BMR (Mifflin-St Jeor equation) and TDEE / goal-based daily calorie estimates.
- Macronutrient breakdown (Protein, Carbohydrates, Fats in grams and kcal).
- Personalized meal plans for Vegetarian and Non-Vegetarian preferences across fitness goals.
- Automated, categorized grocery list generation.
- Explicit non-medical estimation disclaimers.
"""

from typing import Dict, List

ESTIMATE_DISCLAIMER = (
    "All BMI, BMR, calorie, and macronutrient values are mathematical estimates based on standard equations "
    "(Mifflin-St Jeor) for general fitness guidance only. This application is not a medical diagnostic system; "
    "consult a qualified healthcare provider or registered dietitian before making major dietary changes."
)

ACTIVITY_MULTIPLIERS = {
    "Sedentary": 1.2,
    "Lightly Active": 1.375,
    "Moderately Active": 1.55,
    "Very Active": 1.725,
    "Extra Active": 1.9,
}

GOAL_CALORIE_OFFSETS = {
    "Weight Loss": -450,
    "Muscle Gain": +400,
    "Maintenance": 0,
    "Endurance": +250,
}

# Macro ratios (Protein %, Carbs %, Fat %)
GOAL_MACRO_SPLITS = {
    "Weight Loss": (0.35, 0.35, 0.30),
    "Muscle Gain": (0.30, 0.45, 0.25),
    "Maintenance": (0.28, 0.44, 0.28),
    "Endurance": (0.25, 0.52, 0.23),
}


def calculate_bmi_and_calories(
    height_cm: float,
    weight_kg: float,
    age: int = 25,
    gender: str = "Male",
    activity_level: str = "Moderately Active",
    goal: str = "Muscle Gain",
) -> Dict:
    """Calculates BMI, WHO category, BMR, TDEE, and estimated daily calorie/macro targets."""
    if height_cm < 80 or height_cm > 260:
        raise ValueError("Height must be between 80 cm and 260 cm.")
    if weight_kg < 20 or weight_kg > 300:
        raise ValueError("Weight must be between 20 kg and 300 kg.")

    height_m = height_cm / 100.0
    bmi = round(weight_kg / (height_m ** 2), 2)

    if bmi < 18.5:
        category = "Underweight"
        advice = "Prioritize a controlled caloric surplus (+350 to +450 kcal/day) with progressive resistance training."
    elif bmi < 25.0:
        category = "Normal"
        advice = "Healthy BMI range. Focus on body recomposition, strength progression, and balanced micronutrients."
    elif bmi < 30.0:
        category = "Overweight"
        advice = "Aim for a sustainable 350–500 kcal daily deficit with high protein intake (1.8g/kg) to preserve lean mass."
    else:
        category = "Obese"
        advice = "Focus on gradual fat loss through whole foods, high fiber, low-impact cardio, and resistance workouts."

    # Mifflin-St Jeor BMR Equation
    gender_norm = gender.strip().lower()
    if gender_norm.startswith("m"):
        bmr = 10.0 * weight_kg + 6.25 * height_cm - 5.0 * age + 5.0
    else:
        bmr = 10.0 * weight_kg + 6.25 * height_cm - 5.0 * age - 161.0

    multiplier = 1.55
    for key, mult in ACTIVITY_MULTIPLIERS.items():
        if key.lower() in activity_level.lower():
            multiplier = mult
            break

    tdee = bmr * multiplier
    offset = GOAL_CALORIE_OFFSETS.get(goal, 0)
    target_calories = max(1250, int(round(tdee + offset)))

    p_ratio, c_ratio, f_ratio = GOAL_MACRO_SPLITS.get(goal, (0.30, 0.42, 0.28))
    protein_g = int(round((target_calories * p_ratio) / 4.0))
    carbs_g = int(round((target_calories * c_ratio) / 4.0))
    fat_g = int(round((target_calories * f_ratio) / 9.0))

    return {
        "height_cm": height_cm,
        "weight_kg": weight_kg,
        "bmi": bmi,
        "category": category,
        "advice": advice,
        "estimated_bmr_kcal": int(round(bmr)),
        "estimated_tdee_kcal": int(round(tdee)),
        "target_daily_calories_kcal": target_calories,
        "goal": goal,
        "activity_level": activity_level,
        "macros": {
            "protein_g": protein_g,
            "protein_kcal": protein_g * 4,
            "protein_pct": int(round(p_ratio * 100)),
            "carbs_g": carbs_g,
            "carbs_kcal": carbs_g * 4,
            "carbs_pct": int(round(c_ratio * 100)),
            "fat_g": fat_g,
            "fat_kcal": fat_g * 9,
            "fat_pct": int(round(f_ratio * 100)),
        },
        "is_estimate": True,
        "disclaimer": ESTIMATE_DISCLAIMER,
    }


def generate_personalized_diet_plan(
    goal: str,
    dietary_preference: str,
    target_calories: int = 2200,
) -> Dict:
    """Generates a personalized 5-meal daily plan and grocery list for Vegetarian or Non-Vegetarian users."""
    pref = "Vegetarian" if "veg" in dietary_preference.lower() and "non" not in dietary_preference.lower() else "Non-Vegetarian"
    if "vegan" in dietary_preference.lower():
        pref = "Vegetarian"

    p_ratio, c_ratio, f_ratio = GOAL_MACRO_SPLITS.get(goal, (0.30, 0.42, 0.28))
    protein_g = int(round((target_calories * p_ratio) / 4.0))
    carbs_g = int(round((target_calories * c_ratio) / 4.0))
    fat_g = int(round((target_calories * f_ratio) / 9.0))

    scale = target_calories / 2000.0

    if pref == "Vegetarian":
        meals = [
            {
                "meal_type": "Breakfast (08:00 AM)",
                "title": "High-Protein Oats, Chia & Greek Yogurt Bowl",
                "items": [
                    f"{int(round(65 * scale))}g Rolled Oats cooked in skim/soy milk",
                    "150g Greek Yogurt (or high-protein skyr)",
                    "1 tbsp Chia Seeds + 8 Almonds + 1/2 Banana",
                ],
                "estimated_calories": int(round(460 * scale)),
                "protein_g": int(round(28 * scale)),
                "carbs_g": int(round(58 * scale)),
                "fat_g": int(round(12 * scale)),
                "is_vegetarian": True,
            },
            {
                "meal_type": "Mid-Morning Snack (11:00 AM)",
                "title": "Roasted Chickpeas & Sprouted Moong Salad",
                "items": [
                    f"{int(round(80 * scale))}g Steamed Moong Sprouts with lemon & cucumber",
                    "1 Apple or Pear",
                    "Green Tea or Black Coffee",
                ],
                "estimated_calories": int(round(240 * scale)),
                "protein_g": int(round(12 * scale)),
                "carbs_g": int(round(38 * scale)),
                "fat_g": int(round(4 * scale)),
                "is_vegetarian": True,
            },
            {
                "meal_type": "Lunch (01:30 PM)",
                "title": "Grilled Paneer Tikka, Dal Tadka & Brown Rice Bowl",
                "items": [
                    f"{int(round(130 * scale))}g Low-fat Paneer (Cottage Cheese) cubes",
                    "1 bowl Yellow Lentil Dal + 140g Cooked Brown Rice or 2 Multigrain Rotis",
                    "Mixed Green Salad (spinach, tomato, carrots)",
                ],
                "estimated_calories": int(round(620 * scale)),
                "protein_g": int(round(36 * scale)),
                "carbs_g": int(round(68 * scale)),
                "fat_g": int(round(20 * scale)),
                "is_vegetarian": True,
            },
            {
                "meal_type": "Post-Workout Fuel (06:30 PM)",
                "title": "Whey / Plant Protein Shake & Peanut Butter Toast",
                "items": [
                    "1 scoop Whey or Pea-Brown Rice Protein Isolate in water",
                    "1 slice Whole-Grain Toast with 1 tbsp Natural Peanut Butter",
                ],
                "estimated_calories": int(round(290 * scale)),
                "protein_g": int(round(30 * scale)),
                "carbs_g": int(round(20 * scale)),
                "fat_g": int(round(9 * scale)),
                "is_vegetarian": True,
            },
            {
                "meal_type": "Dinner (08:30 PM)",
                "title": "Tofu & Soya Chunk Stir-Fry with Quinoa & Broccoli",
                "items": [
                    f"{int(round(120 * scale))}g Firm Tofu + 35g Soya Chunks sautéed with bell peppers",
                    f"{int(round(110 * scale))}g Steamed Quinoa or Millet",
                    "1 cup Steamed Broccoli & Zucchini with olive oil drizzle",
                ],
                "estimated_calories": int(round(390 * scale)),
                "protein_g": int(round(32 * scale)),
                "carbs_g": int(round(38 * scale)),
                "fat_g": int(round(11 * scale)),
                "is_vegetarian": True,
            },
        ]

        grocery_list: List[Dict] = [
            {"category": "Proteins (Vegetarian)", "items": ["Low-fat Paneer (500g)", "Firm Tofu (400g)", "Greek Yogurt (1 kg)", "Soya Chunks (250g)", "Whey/Plant Protein Powder", "Yellow Moong & Toor Dal (1 kg)"]},
            {"category": "Complex Carbohydrates", "items": ["Rolled Oats (1 kg)", "Brown Basmati Rice (1 kg)", "Quinoa (500g)", "Whole-Grain Multigrain Flour/Bread", "Chickpeas (500g)"]},
            {"category": "Produce & Greens", "items": ["Broccoli (2 heads)", "Spinach (2 bunches)", "Bell Peppers (4 pcs)", "Cucumbers & Tomatoes", "Bananas (6 pcs)", "Apples (6 pcs)", "Lemons"]},
            {"category": "Healthy Fats & Pantry", "items": ["Natural Unsweetened Peanut Butter", "Raw Almonds & Walnuts (250g)", "Chia & Flax Seeds (150g)", "Extra Virgin Olive Oil"]},
        ]
    else:
        meals = [
            {
                "meal_type": "Breakfast (08:00 AM)",
                "title": "Power Egg White & Whole Egg Omelette with Oats",
                "items": [
                    "3 Whole Eggs + 2 Egg Whites scrambled with spinach & mushrooms",
                    f"{int(round(55 * scale))}g Rolled Oats with berries",
                    "Black Coffee or Green Tea",
                ],
                "estimated_calories": int(round(470 * scale)),
                "protein_g": int(round(34 * scale)),
                "carbs_g": int(round(44 * scale)),
                "fat_g": int(round(16 * scale)),
                "is_vegetarian": False,
            },
            {
                "meal_type": "Mid-Morning Snack (11:00 AM)",
                "title": "Greek Yogurt Parfait & Mixed Nuts",
                "items": [
                    "150g Unsweetened Greek Yogurt",
                    "10 Almonds + 4 Walnut halves + 1/2 cup Blueberries",
                ],
                "estimated_calories": int(round(230 * scale)),
                "protein_g": int(round(16 * scale)),
                "carbs_g": int(round(18 * scale)),
                "fat_g": int(round(10 * scale)),
                "is_vegetarian": True,
            },
            {
                "meal_type": "Lunch (01:30 PM)",
                "title": "Herb-Grilled Chicken Breast, Sweet Potato & Greens",
                "items": [
                    f"{int(round(165 * scale))}g Grilled Skinless Chicken Breast",
                    f"{int(round(150 * scale))}g Baked Sweet Potato or Brown Rice",
                    "1.5 cups Asparagus, Cucumber & Leafy Greens with olive oil",
                ],
                "estimated_calories": int(round(610 * scale)),
                "protein_g": int(round(46 * scale)),
                "carbs_g": int(round(62 * scale)),
                "fat_g": int(round(15 * scale)),
                "is_vegetarian": False,
            },
            {
                "meal_type": "Post-Workout Fuel (06:30 PM)",
                "title": "Whey Isolate Recovery Shake & Banana",
                "items": [
                    "1 scoop Whey Protein Isolate (27g protein)",
                    "1 medium Banana + 3g Creatine Monohydrate (optional)",
                ],
                "estimated_calories": int(round(250 * scale)),
                "protein_g": int(round(28 * scale)),
                "carbs_g": int(round(30 * scale)),
                "fat_g": int(round(2 * scale)),
                "is_vegetarian": True,
            },
            {
                "meal_type": "Dinner (08:30 PM)",
                "title": "Pan-Seared Salmon / Fish Fillet with Quinoa & Broccoli",
                "items": [
                    f"{int(round(150 * scale))}g Grilled Salmon or Rohu/Basa Fillet with lemon-garlic herbs",
                    f"{int(round(100 * scale))}g Cooked Quinoa",
                    "1 cup Steamed Broccoli & Green Beans",
                ],
                "estimated_calories": int(round(440 * scale)),
                "protein_g": int(round(36 * scale)),
                "carbs_g": int(round(32 * scale)),
                "fat_g": int(round(16 * scale)),
                "is_vegetarian": False,
            },
        ]

        grocery_list = [
            {"category": "Lean Proteins (Non-Veg & Dairy)", "items": ["Skinless Chicken Breast (1.2 kg)", "Fresh Salmon / Fish Fillets (600g)", "Farm Eggs (2 dozen)", "Greek Yogurt (750g)", "Whey Protein Isolate"]},
            {"category": "Complex Carbohydrates", "items": ["Rolled Oats (1 kg)", "Sweet Potatoes (1 kg)", "Brown Basmati Rice (1 kg)", "Quinoa (500g)"]},
            {"category": "Produce & Greens", "items": ["Broccoli & Asparagus", "Baby Spinach & Mushrooms", "Green Beans & Cucumbers", "Bananas (7 pcs)", "Mixed Berries"]},
            {"category": "Healthy Fats & Seasonings", "items": ["Extra Virgin Olive Oil", "Raw Almonds & Walnuts (250g)", "Garlic, Ginger, Black Pepper & Lemons"]},
        ]

    return {
        "goal": goal,
        "dietary_preference": pref,
        "target_calories": target_calories,
        "macros": {
            "protein_g": protein_g,
            "carbs_g": carbs_g,
            "fat_g": fat_g,
        },
        "meals": meals,
        "grocery_list": grocery_list,
        "is_estimate": True,
        "disclaimer": ESTIMATE_DISCLAIMER,
    }
