import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://rental:rental_pass@localhost:3306/rental_db",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def create_tables():
    # Import models so Base.metadata knows the rental table
    from models import Rental  # noqa: F401

    Base.metadata.create_all(bind=engine)


def ensure_columns():
    """Add columns added after first deploy (idempotent)."""
    insp = inspect(engine)
    if not insp.has_table("rental"):
        return
    existing = {c["name"].lower() for c in insp.get_columns("rental")}
    # MySQL: BOOLEAN → TINYINT(1)
    additions = [
        ("renter_collected", "TINYINT(1) NOT NULL DEFAULT 0"),
        ("owner_collected", "TINYINT(1) NOT NULL DEFAULT 0"),
        ("renter_returned", "TINYINT(1) NOT NULL DEFAULT 0"),
        ("owner_returned", "TINYINT(1) NOT NULL DEFAULT 0"),
        ("renter_reviewed", "TINYINT(1) NOT NULL DEFAULT 0"),
        ("owner_reviewed", "TINYINT(1) NOT NULL DEFAULT 0"),
    ]
    with engine.begin() as conn:
        for col, ddl in additions:
            if col not in existing:
                conn.execute(text(f"ALTER TABLE rental ADD COLUMN {col} {ddl}"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
