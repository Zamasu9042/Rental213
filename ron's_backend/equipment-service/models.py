from sqlalchemy import Column, Integer, Numeric, String

from database import Base


class Equipment(Base):
    __tablename__ = "equipment"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    owner_id = Column(Integer, nullable=False, index=True)
    item_name = Column(String(255), nullable=False)
    category = Column(String(128), nullable=False)
    status = Column(String(64), nullable=False, default="available")
    hourly_rate = Column(Numeric(10, 2), nullable=False)
    pickup_location = Column(String(512), nullable=False)
