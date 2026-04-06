from sqlalchemy import Boolean, Column, DateTime, Integer, Numeric, String

from database import Base


class Rental(Base):
    __tablename__ = "rental"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    renter_id = Column(Integer, nullable=False, index=True)
    equipment_id = Column(Integer, nullable=False, index=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    status = Column(String(64), nullable=False)
    return_timestamp = Column(DateTime, nullable=True)
    hourly_rate = Column(Numeric(10, 2), nullable=False)
    pickup_location = Column(String(512), nullable=False)
    # Dual-confirmation flags
    renter_collected = Column(Boolean, nullable=False, default=False)
    owner_collected  = Column(Boolean, nullable=False, default=False)
    renter_returned  = Column(Boolean, nullable=False, default=False)
    owner_returned   = Column(Boolean, nullable=False, default=False)
    renter_reviewed  = Column(Boolean, nullable=False, default=False)
    owner_reviewed   = Column(Boolean, nullable=False, default=False)
