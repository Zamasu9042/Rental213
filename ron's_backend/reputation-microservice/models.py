from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field


class ItemRatingBody(BaseModel):
    rater_id: int
    equipment_id: int
    owner_id: int
    rental_id: Optional[int] = None
    score: Decimal = Field(..., ge=Decimal("0"), le=Decimal("5"))
    review_text: Optional[str] = None


class UserRatingBody(BaseModel):
    rater_id: int
    rental_id: int
    target_type: Literal["RENTER", "OWNER"]
    score: Decimal = Field(..., ge=Decimal("0"), le=Decimal("5"))
    review_text: Optional[str] = None


class DeductBody(BaseModel):
    user_id: int
    points: Decimal = Field(..., gt=Decimal("0"), le=Decimal("100"))
