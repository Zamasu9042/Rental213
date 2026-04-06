"""Optional one-off seed for local demo (run manually if needed)."""

from sqlalchemy.orm import sessionmaker

from database import Base, engine
from models import Account

Session = sessionmaker(bind=engine)


def main():
    Base.metadata.create_all(bind=engine)
    db = Session()
    if db.query(Account).count() == 0:
        db.add_all(
            [
                Account(
                    account_id=1001,
                    account_name="Demo Renter",
                    phone_no="+65-9000-1001",
                ),
                Account(
                    account_id=1002,
                    account_name="Demo Owner",
                    phone_no="+65-9000-1002",
                ),
            ]
        )
        db.commit()
        print("Seeded demo accounts")
    else:
        print("Accounts already present")
    db.close()


if __name__ == "__main__":
    main()
