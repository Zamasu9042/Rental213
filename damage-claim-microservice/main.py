from fastapi import FastAPI
from strawberry.fastapi import GraphQLRouter
from schema import schema
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Damage Claim Service")
graphql_app = GraphQLRouter(schema, multipart_uploads_enabled=True)

app.include_router(graphql_app, prefix="/graphql")

@app.get("/health")
def health():
    return {"status": "ok"}