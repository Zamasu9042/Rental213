from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class EquipmentCreate(BaseModel):
    owner_id: int
    item_name: str
    category: str
    status: str = "available"
    hourly_rate: Decimal
    pickup_location: str


class EquipmentUpdate(BaseModel):
    owner_id: Optional[int] = None
    item_name: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    hourly_rate: Optional[Decimal] = None
    pickup_location: Optional[str] = None


class EquipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    item_name: str
    category: str
    status: str
    hourly_rate: Decimal
    pickup_location: str
    image_url: Optional[str] = None
