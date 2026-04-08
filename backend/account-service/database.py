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
_HASH = "$2b$12$r1D9Okz4gN05F/z96YXU9u9D.kp/JZHtYepIFoEL1mIIh.fQIk0bm"

_DEMO_ROWS = [
<<<<<<< HEAD
    (1001, "Demo Renter",   "+6587218728", "renter@test.com",        "renter"),
    (1002, "Demo Owner",    "+6587218728", "owner@test.com",         "owner"),
    (1003, "Demo Staff",    "+6587218728", "staff@test.com",         "staff"),
    (1004, "Demo Renter 2", "+6587218728", "renter2check@gmail.com", "renter"),
    # Renter 3: dedicated Scenario 3 account — damage fee charged to this account
    (1005, "Demo Renter 3", "+6587218728", "renter3@test.com",       "renter"),
=======
    (1001, "Demo Renter", "+65-9000-1001", "renter@test.com", "renter"),
    (1002, "Demo Owner", "+65-9000-1002", "owner@test.com", "owner"),
    (1003, "Demo Staff", "+65-9000-1003", "staff@test.com", "staff"),
    (1004, "Demo Renter 2", "+65-9000-1004", "renter2check@gmail.com", "renter"),
>>>>>>> parent of da84f780 (done up scenario 1-3)
]


def create_tables():
    Base.metadata.create_all(bind=engine)


def ensure_demo_accounts():
    """
    Ensure demo accounts exist with correct credentials.

    Uses MySQL REPLACE INTO on account_id so rows are always refreshed (fixes stale
    email/hash). Removes any stray row that stole renter2 email with another account_id.
    """
    stmt = text(
        """
        REPLACE INTO account (account_id, account_name, phone_no, email, password_hash, role)
        VALUES (:account_id, :account_name, :phone_no, :email, :password_hash, :role)
        """
    )
    with engine.begin() as conn:
        # If another row used this email, drop it so REPLACE for 1004 can succeed
        conn.execute(
            text(
                "DELETE FROM account WHERE email = :em AND account_id != :aid"
            ),
            {"em": "renter2check@gmail.com", "aid": 1004},
        )
        conn.execute(
            text(
                "DELETE FROM account WHERE email = :em AND account_id != :aid"
            ),
            {"em": "renter2@test.com", "aid": 1004},
        )
        for account_id, name, phone, email, role in _DEMO_ROWS:
            conn.execute(
                stmt,
                {
                    "account_id": account_id,
                    "account_name": name,
                    "phone_no": phone,
                    "email": email,
                    "password_hash": _HASH,
                    "role": role,
                },
            )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
