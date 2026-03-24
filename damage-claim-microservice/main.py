from fastapi import FastAPI
from dotenv import load_dotenv

from app.routes.damage import router as damage_router

load_dotenv()

app = FastAPI(
    title="Damage Claim Service",
    description="Analyses rental item damage via Google Vision and manages claims.",
    version="1.0.0",
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(damage_router)

# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
