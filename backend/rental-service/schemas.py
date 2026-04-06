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
        description="immediate: ACTIVE + equipment rented. pending_payment: PENDING only (Camunda flow).",
    )


class RentalReturnBody(BaseModel):
    return_timestamp: Optional[datetime] = None


class ActorBody(BaseModel):
    """Used for dual-confirm endpoints — caller passes their own account_id."""
    account_id: int


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
    # Dual-confirm flags
    renter_collected: bool = False
    owner_collected: bool = False
    renter_returned: bool = False
    owner_returned: bool = False
    renter_reviewed: bool = False
    owner_reviewed: bool = False


class RenterDashboardOut(BaseModel):
    renter_id: int
    rentals: List[RentalOut]
    should_show_equipment_browse: bool
