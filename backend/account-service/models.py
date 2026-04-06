from sqlalchemy import Column, Integer, String

from database import Base


class Account(Base):
    __tablename__ = "account"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, nullable=False, unique=True, index=True)
    account_name = Column(String(255), nullable=False)
    phone_no = Column(String(64), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
