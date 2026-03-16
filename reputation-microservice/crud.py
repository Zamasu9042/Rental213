from sqlalchemy.orm import Session
from sqlalchemy import func
from database import RatingDB
from typing import List, Optional

def submit_rating(
    db: Session,
    rental_id: str,
    rater_id: str,
    ratee_id: str,
    rater_role: str,
    rating: int,
    scenario: str,
) -> RatingDB:
    # prevent duplicate ratings for same rental + rater
    existing = db.query(RatingDB).filter(
        RatingDB.rental_id == rental_id,
        RatingDB.rater_id == rater_id,
    ).first()
    if existing:
        raise ValueError(f"You have already submitted a rating for rental {rental_id}")

    new_rating = RatingDB(
        rental_id=rental_id,
        rater_id=rater_id,
        ratee_id=ratee_id,
        rater_role=rater_role,
        rating=rating,
        scenario=scenario,
    )
    db.add(new_rating)
    db.commit()
    db.refresh(new_rating)
    return new_rating

def get_ratings_for_user(db: Session, user_id: str) -> List[RatingDB]:
    return db.query(RatingDB).filter(RatingDB.ratee_id == user_id).all()

def get_reputation_profile(db: Session, user_id: str) -> dict:
    # ratings received as a user
    as_user = db.query(RatingDB).filter(
        RatingDB.ratee_id == user_id,
        RatingDB.rater_role == "RENTER",
    ).all()

    # ratings received as a renter
    as_renter = db.query(RatingDB).filter(
        RatingDB.ratee_id == user_id,
        RatingDB.rater_role == "USER",
    ).all()

    avg_as_user = (
        round(sum(r.rating for r in as_user) / len(as_user), 2)
        if as_user else None
    )
    avg_as_renter = (
        round(sum(r.rating for r in as_renter) / len(as_renter), 2)
        if as_renter else None
    )

    # breakdown by scenario
    all_received = as_user + as_renter
    scenarios = {}
    for r in all_received:
        if r.scenario not in scenarios:
            scenarios[r.scenario] = {"count": 0, "total": 0}
        scenarios[r.scenario]["count"] += 1
        scenarios[r.scenario]["total"] += r.rating

    breakdown = [
        {
            "scenario": scenario,
            "count": data["count"],
            "average": round(data["total"] / data["count"], 2),
        }
        for scenario, data in scenarios.items()
    ]

    return {
        "user_id": user_id,
        "average_as_user": avg_as_user,
        "average_as_renter": avg_as_renter,
        "total_ratings_as_user": len(as_user),
        "total_ratings_as_renter": len(as_renter),
        "breakdown": breakdown,
    }

def get_all_ratings_by_rental(db: Session, rental_id: str) -> List[RatingDB]:
    return db.query(RatingDB).filter(RatingDB.rental_id == rental_id).all()