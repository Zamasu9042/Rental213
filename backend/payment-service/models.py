from sqlalchemy import Column, DateTime, Integer, Numeric, String

from database import Base


class Payment(Base):
    __tablename__ = "payment"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rental_id = Column(Integer, nullable=False, index=True)
    renter_id = Column(Integer, nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    type = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False)
    item_name = Column(String(512), nullable=True)
    stripe_session_id = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
