from datetime import datetime
from decimal import Decimal

from sqlalchemy import Column, DateTime, Integer, Numeric, String

from database import Base


class ReputationRow(Base):
    __tablename__ = "reputation"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    target_id = Column(Integer, nullable=False)
    target_type = Column(String(32), nullable=False)
    score = Column(Numeric(6, 2), nullable=False)
    review_text = Column(String(1024), nullable=True)
    rater_id = Column(Integer, nullable=True, index=True)
    rental_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
