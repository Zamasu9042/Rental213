from sqlalchemy import Column, DateTime, Integer, Numeric, String
from sqlalchemy.dialects.mysql import JSON

from database import Base


class DamageClaim(Base):
    """
    Damage claim lifecycle:
      DRAFT
        → PENDING_STAFF_REVIEW    after AI analysis
        → PENDING_OWNER_AMOUNT    staff approves AI result
        → PENDING_STAFF_APPROVAL  owner submits damage amount
        → AMOUNT_REJECTED         staff rejects amount (owner re-enters)
        → APPROVED                staff approves amount → Camunda starts
        → REJECTED                staff rejects claim at AI review stage
    """

    __tablename__ = "damage_claims"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    rental_id     = Column(Integer, nullable=False, index=True)
    equipment_id  = Column(Integer, nullable=True)   # cached from rental for Camunda
    renter_id     = Column(Integer, nullable=True)   # cached from rental for Camunda
    photo_url     = Column(String(1024), nullable=True)
    damage_type   = Column(String(255), nullable=True)
    confidence    = Column(Numeric(10, 6), nullable=True)
    severity      = Column(String(64), nullable=True)
    status        = Column(String(64), nullable=False, index=True)
    damage_amount = Column(Numeric(10, 2), nullable=True)  # entered by owner
    analysis_json = Column(JSON, nullable=True)
    created_at    = Column(DateTime, nullable=False)
    analyzed_at   = Column(DateTime, nullable=True)