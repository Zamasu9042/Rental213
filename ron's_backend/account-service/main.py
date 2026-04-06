from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session

from database import create_tables, get_db
from models import Account

create_tables()

app = FastAPI(title="Account Info Service")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/account/{account_id}")
def get_account(account_id: int, db: Session = Depends(get_db)):
    row = db.query(Account).filter(Account.account_id == account_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    return {
        "id": row.id,
        "accountID": row.account_id,
        "accountName": row.account_name,
        "phoneNo": row.phone_no,
    }
