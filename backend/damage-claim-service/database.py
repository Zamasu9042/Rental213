import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://damage:damage_pass@localhost:3311/damage_claims_db",
)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def create_tables():
    Base.metadata.create_all(bind=engine)
    # Idempotent migrations — add new columns if the table already existed without them
    _run_migrations()


def _run_migrations():
    from sqlalchemy import text
    migrations = [
        "ALTER TABLE damage_claims ADD COLUMN equipment_id INT NULL",
        "ALTER TABLE damage_claims ADD COLUMN renter_id INT NULL",
        "ALTER TABLE damage_claims ADD COLUMN damage_amount DECIMAL(10,2) NULL",
    ]
    with engine.begin() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
            except Exception:
                pass  # column already exists — safe to ignore


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
