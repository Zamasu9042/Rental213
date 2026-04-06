from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session

from crud import add_entry, apply_penalty, user_scores
from database import create_tables, get_db
from models import DeductBody, ItemRatingBody, UserRatingBody
from orm_models import ReputationRow

create_tables()

app = FastAPI(title="Reputation Service")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/reputation/item", status_code=201)
def submit_item_rating(body: ItemRatingBody, db: Session = Depends(get_db)):
    """Rate an equipment item; subject user is the owner (diagram: UserID + item context)."""
    if body.rater_id == body.owner_id:
        raise HTTPException(status_code=400, detail="Cannot rate your own item as rater/owner")
    row = add_entry(
        db,
        user_id=body.owner_id,
        target_id=body.equipment_id,
        target_type="ITEM",
        score=body.score,
        review_text=body.review_text,
        rater_id=body.rater_id,
        rental_id=body.rental_id,
    )
    return _row_out(row)


@app.post("/reputation/user/{user_id}", status_code=201)
def rate_user(user_id: int, body: UserRatingBody, db: Session = Depends(get_db)):
    if body.rater_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot rate yourself")
    row = add_entry(
        db,
        user_id=user_id,
        target_id=body.rental_id,
        target_type=body.target_type,
        score=body.score,
        review_text=body.review_text,
        rater_id=body.rater_id,
        rental_id=body.rental_id,
    )
    return _row_out(row)


@app.get("/reputation/user/{user_id}")
def get_scores(user_id: int, db: Session = Depends(get_db)):
    return user_scores(db, user_id)


@app.put("/reputation/deduct")
def deduct(body: DeductBody, db: Session = Depends(get_db)):
    row = apply_penalty(db, body.user_id, body.points)
    return _row_out(row)


def _row_out(row: ReputationRow) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "target_id": row.target_id,
        "target_type": row.target_type,
        "score": float(row.score),
        "review_text": row.review_text,
        "rater_id": row.rater_id,
        "rental_id": row.rental_id,
        "timestamp": row.created_at.isoformat() if row.created_at else None,
    }
