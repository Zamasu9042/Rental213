from sqlalchemy import Column, DateTime, Integer, Numeric, String
from sqlalchemy.dialects.mysql import JSON

from database import Base


class DamageClaim(Base):
    """Aligns with diagram: claimID, rentalID, photoURL, damageType, confidence, severity, status."""

    __tablename__ = "damage_claims"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rental_id = Column(Integer, nullable=False, index=True)
    photo_url = Column(String(1024), nullable=True)
    damage_type = Column(String(255), nullable=True)
    confidence = Column(Numeric(10, 6), nullable=True)
    severity = Column(String(64), nullable=True)
    status = Column(String(64), nullable=False, index=True)
    analysis_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False)
    analyzed_at = Column(DateTime, nullable=True)
