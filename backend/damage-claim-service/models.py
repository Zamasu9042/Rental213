from sqlalchemy import Column, DateTime, Integer, Numeric, String
from sqlalchemy.dialects.mysql import JSON

from database import Base


class DamageClaim(Base):
    """Aligns with diagram: claimID, rentalID, photoURL, damageType, confidence, severity, status."""

    __tablename__ = "damage_claims"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rental_id = Column(Integer, nullable=False, index=True)
    equipment_id = Column(Integer, nullable=True)
    renter_id = Column(Integer, nullable=True)
    photo_url = Column(String(1024), nullable=True)
    damage_type = Column(String(255), nullable=True)
    confidence = Column(Numeric(10, 6), nullable=True)
    severity = Column(String(64), nullable=True)
    status = Column(String(64), nullable=False, index=True)
    damage_amount = Column(Numeric(10, 2), nullable=True)
    analysis_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False)
    analyzed_at = Column(DateTime, nullable=True)
