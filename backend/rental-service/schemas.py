from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class RentalCreate(BaseModel):
    renter_id: int
    equipment_id: int
    start_time: datetime
    end_time: datetime
    checkout_mode: Literal["immediate", "pending_payment"] = Field(
        default="immediate",
        description="immediate: ACTIVE + equipment rented (demo). pending_payment: PENDING only, for Camunda/payment-first flow.",
    )


class RentalReturnBody(BaseModel):
    return_timestamp: Optional[datetime] = None


class RentalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    renter_id: int
    equipment_id: int
    start_time: datetime
    end_time: datetime
    status: str
    return_timestamp: Optional[datetime]
    hourly_rate: Decimal
    pickup_location: str


class RenterDashboardOut(BaseModel):
    renter_id: int
    rentals: List[RentalOut]
    should_show_equipment_browse: bool
