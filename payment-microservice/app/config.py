import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
    STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY")
    DEBUG = os.getenv("FLASK_DEBUG", "false").lower() == "true"