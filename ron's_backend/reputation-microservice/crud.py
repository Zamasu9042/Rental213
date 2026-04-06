from decimal import Decimal
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from orm_models import ReputationRow


def add_entry(
    db: Session,
    *,
    user_id: int,
    target_id: int,
    target_type: str,
    score: Decimal,
    review_text: str | None,
    rater_id: int | None,
    rental_id: int | None,
) -> ReputationRow:
    row = ReputationRow(
        user_id=user_id,
        target_id=target_id,
        target_type=target_type,
        score=score,
        review_text=review_text,
        rater_id=rater_id,
        rental_id=rental_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def user_scores(db: Session, user_id: int) -> Dict[str, Any]:
    rows: List[ReputationRow] = (
        db.query(ReputationRow).filter(ReputationRow.user_id == user_id).all()
    )
    if not rows:
        return {
            "user_id": user_id,
            "average_score": None,
            "total_entries": 0,
            "by_target_type": {},
            "entries": [],
        }
    total = sum(Decimal(str(r.score)) for r in rows)
    avg = (total / len(rows)).quantize(Decimal("0.01"))
    by_type: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        t = r.target_type
        if t not in by_type:
            by_type[t] = {"count": 0, "sum": Decimal("0")}
        by_type[t]["count"] += 1
        by_type[t]["sum"] += Decimal(str(r.score))
    breakdown = {
        k: {
            "count": v["count"],
            "average": (v["sum"] / v["count"]).quantize(Decimal("0.01")),
        }
        for k, v in by_type.items()
    }
    return {
        "user_id": user_id,
        "average_score": float(avg),
        "total_entries": len(rows),
        "by_target_type": breakdown,
        "entries": [
            {
                "id": r.id,
                "target_id": r.target_id,
                "target_type": r.target_type,
                "score": float(Decimal(str(r.score))),
                "review_text": r.review_text,
                "rater_id": r.rater_id,
                "rental_id": r.rental_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


def apply_penalty(db: Session, user_id: int, points: Decimal) -> ReputationRow:
    neg = -abs(points)
    return add_entry(
        db,
        user_id=user_id,
        target_id=0,
        target_type="PENALTY",
        score=neg,
        review_text="score_penalty",
        rater_id=None,
        rental_id=None,
    )
