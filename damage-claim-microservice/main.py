from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import os

from app.routes.damage import router as damage_router
from app.db.database import get_db

load_dotenv()

app = FastAPI(
    title="Damage Claim Microservice",
    description="Stores and manages damage claims. Does NOT call Google Vision — that is handled by the damage-claim-wrapper.",
    version="2.0.0",
)

# Serve uploaded photos as static files (only needed if photos are stored locally)
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(damage_router)

# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "damage-claim-microservice"}