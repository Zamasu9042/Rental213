import stripe
from stripe import StripeError
from decimal import Decimal
from datetime import datetime

from .. import db
from ..models import Payment
from ..messaging import publish_payment_status_event


def pay_rental(rental_id: int, renter_id: int, amount_dollars: float, item_name: str, payment_method_id: str, currency: str = "usd") -> Payment:
    """
    Creates a Stripe PaymentIntent for a rental, confirms it, and persists the transaction.
    amount_dollars: decimal dollar amount (e.g. 49.99)
    payment_method_id: Stripe PaymentMethod ID from the frontend
    """
    amount_cents = int(round(amount_dollars * 100))

    try:
        intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency=currency,
            payment_method=payment_method_id,
            confirm=True,
            automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
            metadata={
                "rental_id": rental_id,
                "renter_id": renter_id,
                "item_name": item_name,
            },
        )
        stripe_status = intent.status  # "succeeded", "requires_action", etc.
        status = "paid" if stripe_status == "succeeded" else "pending"

    except StripeError as e:
        # Persist failed record then raise
        payment = Payment(
            rental_id=rental_id,
            renter_id=renter_id,
            amount=Decimal(str(amount_dollars)),
            type="rental",
            status="failed",
            item_name=item_name,
        )
        db.session.add(payment)
        db.session.commit()
        publish_payment_status_event(payment.id, rental_id, renter_id, "failed", amount_dollars, item_name)
        raise ValueError(f"Stripe error: {e.user_message}")

    payment = Payment(
        rental_id=rental_id,
        renter_id=renter_id,
        amount=Decimal(str(amount_dollars)),
        type="rental",
        status=status,
        item_name=item_name,
    )
    db.session.add(payment)
    db.session.commit()

    publish_payment_status_event(payment.id, rental_id, renter_id, status, amount_dollars, item_name)

    return payment


def process_outstanding_payment(payment_id: int) -> Payment:
    """
    Re-attempts processing of a failed/pending payment (e.g. outstanding balance).
    Uses the existing record and tries a new Stripe charge.
    """
    payment = Payment.query.get(payment_id)
    if not payment:
        raise ValueError(f"Payment {payment_id} not found")

    if payment.status == "paid":
        raise ValueError(f"Payment {payment_id} is already paid")

    amount_cents = int(round(float(payment.amount) * 100))

    try:
        intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency="usd",
            automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
            metadata={
                "rental_id": payment.rental_id,
                "renter_id": payment.renter_id,
                "item_name": payment.item_name,
                "retry_for_payment_id": payment.id,
            },
        )
        new_status = "paid" if intent.status == "succeeded" else "pending"

    except StripeError as e:
        payment.status = "failed"
        payment.timestamp = datetime.utcnow()
        db.session.commit()
        publish_payment_status_event(payment.id, payment.rental_id, payment.renter_id, "failed", float(payment.amount), payment.item_name)
        raise ValueError(f"Stripe error: {e.user_message}")

    payment.status = new_status
    payment.type = "outstanding"
    payment.timestamp = datetime.utcnow()
    db.session.commit()

    publish_payment_status_event(payment.id, payment.rental_id, payment.renter_id, new_status, float(payment.amount), payment.item_name)

    return payment


def get_transaction(payment_id: int) -> Payment:
    payment = Payment.query.get(payment_id)
    if not payment:
        raise ValueError(f"Payment {payment_id} not found")
    return payment