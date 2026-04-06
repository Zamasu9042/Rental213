from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import bcrypt
from sqlalchemy.orm import Session

from database import create_tables, ensure_demo_accounts, get_db
from models import Account

create_tables()
ensure_demo_accounts()

app = FastAPI(title="Account Info Service")


class LoginRequest(BaseModel):
    email: str
    password: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/account/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    email = (body.email or "").strip().lower()
    # Emails are stored lowercase from ensure_demo_accounts / schema
    row = db.query(Account).filter(Account.email == email).first()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    pw_hash = (row.password_hash or "").strip().encode("utf-8")
    if not bcrypt.checkpw(body.password.encode("utf-8"), pw_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {
        "id": str(row.account_id),
        "name": row.account_name,
        "email": row.email,
        "phone": row.phone_no,
        "role": row.role,
    }


@app.get("/account/{account_id}")
def get_account(account_id: int, db: Session = Depends(get_db)):
    row = db.query(Account).filter(Account.account_id == account_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    return {
        "id": str(row.account_id),
        "accountID": row.account_id,
        "accountName": row.account_name,
        "phoneNo": row.phone_no,
        "email": row.email,
    }
