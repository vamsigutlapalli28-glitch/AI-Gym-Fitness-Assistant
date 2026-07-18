from flask import Flask, render_template, request, redirect, session, Response, jsonify
from config import mysql
import bcrypt
from groq import Groq
from dotenv import load_dotenv
import os
from camera import WorkoutCamera

camera = WorkoutCamera()

app = Flask(__name__)
app.secret_key = "gym_secret_key"
app.config["MYSQL_HOST"] = "localhost"
app.config["MYSQL_USER"] = "root"
app.config["MYSQL_PASSWORD"] = ""
app.config["MYSQL_DB"] = "gym_ai_assistant"
mysql.init_app(app)
load_dotenv()

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/login", methods=["GET", "POST"])
def login():

    if request.method == "POST":

        email = request.form["email"]
        password = request.form["password"]

        cur = mysql.connection.cursor()

        cur.execute(
            "SELECT * FROM users WHERE email=%s",
            (email,)
        )

        user = cur.fetchone()

        cur.close()

        if user:

            stored_password = user[3]

            if bcrypt.checkpw(
                password.encode("utf-8"),
                stored_password.encode("utf-8")
            ):

                session["user_id"] = user[0]
                session["username"] = user[1]

                return redirect("/dashboard")

        return "Invalid Email or Password"

    return render_template("login.html")
@app.route("/dashboard")
def dashboard():

    if "user_id" not in session:
        return redirect("/login")

    return render_template(
        "dashboard.html",
        username=session["username"]
    )

@app.route("/test_db")
def test_db():

    cur = mysql.connection.cursor()

    cur.execute("SELECT VERSION()")

    version = cur.fetchone()

    cur.close()

    return f"MySQL Connected Successfully : {version}"

@app.route("/register", methods=["GET","POST"])
def register():

    if request.method == "POST":

        name = request.form["name"]
        email = request.form["email"]
        password = request.form["password"]
        age = request.form["age"]
        gender = request.form["gender"]

        hashed_password = bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt()
        ).decode("utf-8")

        cur = mysql.connection.cursor()

        cur.execute("SELECT * FROM users WHERE email=%s",(email,))
        existing_user = cur.fetchone()

        if existing_user:
            return "Email already exists"
            
        cur.execute("""
            INSERT INTO users(name,email,password,age,gender)
            VALUES(%s,%s,%s,%s,%s)
        """,(name,email,hashed_password,age,gender))

        mysql.connection.commit()

        cur.close()

        return "Registration Successful"

    return render_template("register.html")
@app.route("/logout")
def logout():

    session.clear()

    return redirect("/login")

@app.route("/bmi", methods=["GET", "POST"])
def bmi():

    if "user_id" not in session:
        return redirect("/login")

    if request.method == "POST":

        height = float(request.form["height"])
        weight = float(request.form["weight"])

        if height < 100 or height > 250:
            return "Invalid height"

        if weight < 20 or weight > 300:
            return "Invalid weight"

        bmi = weight / ((height / 100) ** 2)

    
        if bmi < 18.5:
            category = "Underweight"

        elif bmi < 25:
            category = "Normal"

        elif bmi < 30:
            category = "Overweight"

        else:
            category = "Obese"

        cur = mysql.connection.cursor()

        cur.execute("""
            INSERT INTO bmi_history(user_id,height,weight,bmi,category)
            VALUES(%s,%s,%s,%s,%s)
        """,
            (session["user_id"], height, weight, bmi,category))

        mysql.connection.commit()

        cur.close()

        return render_template(
            "bmi_result.html",
            bmi=round(bmi, 2),
            category=category
)

    return render_template("bmi.html")


@app.route("/diet", methods=["GET", "POST"])
def diet():

    if "user_id" not in session:
        return redirect("/login")

    category = None

    if request.method == "POST":
        category = request.form["category"]
    else:
        cur = mysql.connection.cursor()
        cur.execute("""
SELECT category
FROM bmi_history
WHERE user_id=%s
ORDER BY bmi_id DESC
LIMIT 1
""", (session["user_id"],))
        result = cur.fetchone()
        cur.close()

        if result:
            category = result[0]

    if category:

        if category == "Underweight":
            diet = """
            • Milk
            • Eggs
            • Rice
            • Banana
            • Peanut Butter
            """

        elif category == "Normal":
            diet = """
            • Fruits
            • Vegetables
            • Chicken
            • Rice
            • Water
            """

        elif category == "Overweight":
            diet = """
            • Oats
            • Salad
            • Brown Rice
            • Grilled Chicken
            • Green Tea
            """

        else:
            diet = """
            • Low Carb Diet
            • Vegetables
            • Soup
            • Fish
            • Fruits
            """

        return render_template(
            "diet_result.html",
            category=category,
            diet=diet
        )

    cur = mysql.connection.cursor()

    cur.execute("""
    INSERT INTO diet_history(user_id, category, diet_plan)
    VALUES(%s, %s, %s)
    """,
    (session["user_id"], category, diet))

    mysql.connection.commit()

    cur.close()
    return render_template(
    "diet_result.html",
    category=category,
    diet=diet
)


@app.route("/workout")
def workout():

    if "user_id" not in session:
        return redirect("/login")

    return render_template("workout.html")

@app.route("/video_feed")
def video_feed():
    return Response(camera.generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route("/workout_stats")
def workout_stats():
    return jsonify(camera.get_stats())

@app.route("/finish_workout")
def finish_workout():

    if "user_id" not in session:
        return redirect("/login")

    total_reps = camera.left_counter + camera.right_counter
    calories = round(total_reps * 0.4, 2)

    cur = mysql.connection.cursor()

    cur.execute("""
        INSERT INTO workout_history
        (
            user_id,
            exercise,
            left_reps,
            right_reps,
            total_reps,
            duration,
            calories_burned
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s)
    """,
    (
        session["user_id"],
        camera.exercise,
        camera.left_counter,
        camera.right_counter,
        total_reps,
        camera.get_duration(),
        calories
    ))

    mysql.connection.commit()
    cur.close()

    # Reset workout
    camera.left_counter = 0
    camera.right_counter = 0
    camera.left_angle = 0
    camera.right_angle = 0
    camera.start_time = None
    camera.feedback = "Ready to Start"

    return redirect("/dashboard")


@app.route("/chatbot", methods=["GET", "POST"])
def chatbot():

    if "user_id" not in session:
        return redirect("/login")

    answer = None
    chat_history = []

    if request.method == "POST":

        question = request.form["question"]

        response = client.chat.completions.create(

            model="llama-3.3-70b-versatile",

            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an AI Fitness Trainer. "
                        "Answer only fitness, gym, workout, nutrition, "
                        "diet, and health-related questions."
                    )
                },
                {
                    "role": "user",
                    "content": question
                }
            ]
        )

        answer = response.choices[0].message.content

        cur = mysql.connection.cursor()
        cur.execute("""
            INSERT INTO chatbot_history (user_id, question, answer)
            VALUES (%s, %s, %s)
        """, (session["user_id"], question, answer))
        mysql.connection.commit()
        cur.close()

    cur = mysql.connection.cursor()
    cur.execute("""
        SELECT question, answer
        FROM chatbot_history
        WHERE user_id=%s
        ORDER BY chat_id DESC
        LIMIT 10
    """, (session["user_id"],))
    chat_history = cur.fetchall()
    cur.close()

    return render_template(
        "chatbot.html",
        answer=answer,
        chat_history=chat_history
    )


@app.route("/clear_chat")
def clear_chat():

    if "user_id" not in session:
        return redirect("/login")

    cur = mysql.connection.cursor()

    cur.execute("""
    DELETE FROM chatbot_history
    WHERE user_id=%s
    """, (session["user_id"],))

    mysql.connection.commit()

    cur.close()

    return redirect("/chatbot")
@app.route("/profile")
def profile():

    if "user_id" not in session:
        return redirect("/login")

    cur = mysql.connection.cursor()

    # Query 1: User Details
    cur.execute("""
        SELECT name, email, age, gender
        FROM users
        WHERE user_id=%s
    """, (session["user_id"],))

    user = cur.fetchone()

    # Query 2: BMI History
    cur.execute("""
        SELECT height, weight, bmi, category
        FROM bmi_history
        WHERE user_id=%s
        ORDER BY bmi_id DESC
    """, (session["user_id"],))

    bmi_history = cur.fetchall()

    cur.close()

    return render_template(
        "profile.html",
        user=user,
        bmi_history=bmi_history
    )
if __name__ == "__main__":
    app.run(debug=True)