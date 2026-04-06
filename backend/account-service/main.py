from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import bcrypt
from sqlalchemy.orm import Session

from database import create_tables, get_db
from models import Account

create_tables()

app = FastAPI(title="Account Info Service")


class LoginRequest(BaseModel):
    email: str
    password: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/account/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    row = db.query(Account).filter(Account.email == body.email).first()
    if not row or not bcrypt.checkpw(body.password.encode(), row.password_hash.encode()):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {
        "id": str(row.account_id),
        "name": row.account_name,
        "email": row.email,
        "phone": row.phone_no,
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
