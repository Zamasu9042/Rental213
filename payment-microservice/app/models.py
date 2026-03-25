from . import db
from datetime import datetime


class Payment(db.Model):
    __tablename__ = "payments"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    rental_id = db.Column(db.Integer, nullable=False)
    renter_id = db.Column(db.Integer, nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    type = db.Column(db.Text, nullable=False)          # e.g. "rental", "outstanding", "refund"
    status = db.Column(db.Text, nullable=False, default="pending")  # pending, paid, failed
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    item_name = db.Column(db.Text, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "rental_id": self.rental_id,
            "renter_id": self.renter_id,
            "amount": float(self.amount),
            "type": self.type,
            "status": self.status,
            "timestamp": self.timestamp.isoformat(),
            "item_name": self.item_name,
        }
