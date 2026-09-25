"""Main Entrypoint for AI Gym & Fitness Assistant Backend.

Running `python app.py` initializes the database and starts the FastAPI server
on http://127.0.0.1:8000 (with Swagger/OpenAPI docs at http://127.0.0.1:8000/docs).
"""

import os
import uvicorn
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)