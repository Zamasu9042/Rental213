from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class RatingInput(BaseModel):
    rental_id: str
    rater_id: str
    ratee_id: str
    rater_role: str       # USER or RENTER
    rating: int           # 1 to 5
    scenario: str         # NORMAL_RENTAL, DAMAGE_CLAIM, LATE_RETURN