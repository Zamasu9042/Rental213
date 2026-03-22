from fastapi import FastAPI
from strawberry.fastapi import GraphQLRouter
from schema import schema
from routes import router as damage_router
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Damage Claim Service")

# ── GraphQL (existing) ────────────────────────────────────────────────────────
graphql_app = GraphQLRouter(schema, multipart_uploads_enabled=True)
app.include_router(graphql_app, prefix="/graphql")

# ── REST endpoints (new) ──────────────────────────────────────────────────────
app.include_router(damage_router)

# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}
