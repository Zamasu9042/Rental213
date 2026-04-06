import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://rental:rental_pass@localhost:3308/rental_db",
)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def create_tables():
    Base.metadata.create_all(bind=engine)


def ensure_columns():
    """Add new columns to existing tables without dropping data (safe migration)."""
    from sqlalchemy import text
    with engine.begin() as conn:
        try:
            conn.execute(text(
                "ALTER TABLE rental ADD COLUMN owner_collected TINYINT(1) NOT NULL DEFAULT 0"
            ))
        except Exception:
            pass  # Column already exists


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
