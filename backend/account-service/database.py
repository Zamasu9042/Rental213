import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://account:account_pass@localhost:3310/account_db",
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# bcrypt hash of 'password123' — same as schema.sql
_DEMO_RENTER2 = (
    "INSERT IGNORE INTO account (account_id, account_name, phone_no, email, password_hash, role) VALUES "
    "(1004, 'Demo Renter 2', '+65-9000-1004', 'renter2@test.com', "
    "'$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeAiZ0jY7Kq1H3pMu', 'renter')"
)


def create_tables():
    Base.metadata.create_all(bind=engine)


def ensure_demo_accounts():
    """Backfill demo rows when MySQL volume was created before renter2 existed."""
    with engine.begin() as conn:
        conn.execute(text(_DEMO_RENTER2))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
