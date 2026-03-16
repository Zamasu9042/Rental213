from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./reputation.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class RatingDB(Base):
    __tablename__ = "ratings"

    id = Column(Integer, primary_key=True, index=True)
    rental_id = Column(String, nullable=False)
    rater_id = Column(String, nullable=False)
    ratee_id = Column(String, nullable=False)
    rater_role = Column(String, nullable=False)   # USER or RENTER
    rating = Column(Integer, nullable=False)       # 1 to 5
    scenario = Column(String, nullable=False)      # NORMAL_RENTAL, DAMAGE_CLAIM, LATE_RETURN
    created_at = Column(DateTime, default=datetime.utcnow)

def create_tables():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()