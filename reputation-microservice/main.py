from fastapi import FastAPI, HTTPException
from database import create_tables, get_db
from crud import submit_rating, get_reputation_profile, get_ratings_for_user, get_all_ratings_by_rental
from models import RatingInput
from dotenv import load_dotenv

load_dotenv()
create_tables()

app = FastAPI(title="Reputation Microservice")

@app.get("/health")
def health():
    return {"status": "ok"}

# submit a rating
@app.post("/ratings")
def create_rating(data: RatingInput):
    db = next(get_db())
    if data.rating < 1 or data.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    try:
        result = submit_rating(
            db=db,
            rental_id=data.rental_id,
            rater_id=data.rater_id,
            ratee_id=data.ratee_id,
            rater_role=data.rater_role,
            rating=data.rating,
            scenario=data.scenario,
        )
        return {
            "id": result.id,
            "rental_id": result.rental_id,
            "rater_id": result.rater_id,
            "ratee_id": result.ratee_id,
            "rater_role": result.rater_role,
            "rating": result.rating,
            "scenario": result.scenario,
            "created_at": str(result.created_at),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# get reputation profile for a user
@app.get("/reputation/{user_id}")
def get_reputation(user_id: str):
    db = next(get_db())
    return get_reputation_profile(db, user_id)

# get all ratings received by a user
@app.get("/ratings/user/{user_id}")
def get_user_ratings(user_id: str):
    db = next(get_db())
    ratings = get_ratings_for_user(db, user_id)
    return [
        {
            "id": r.id,
            "rental_id": r.rental_id,
            "rater_id": r.rater_id,
            "ratee_id": r.ratee_id,
            "rater_role": r.rater_role,
            "rating": r.rating,
            "scenario": r.scenario,
            "created_at": str(r.created_at),
        }
        for r in ratings
    ]

# get all ratings for a specific rental
@app.get("/ratings/rental/{rental_id}")
def get_rental_ratings(rental_id: str):
    db = next(get_db())
    ratings = get_all_ratings_by_rental(db, rental_id)
    return [
        {
            "id": r.id,
            "rental_id": r.rental_id,
            "rater_id": r.rater_id,
            "ratee_id": r.ratee_id,
            "rater_role": r.rater_role,
            "rating": r.rating,
            "scenario": r.scenario,
            "created_at": str(r.created_at),
        }
        for r in ratings
    ]