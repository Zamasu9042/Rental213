import stripe
from stripe import StripeError

def create_payment_intent(amount: int, currency: str = "usd", metadata: dict = None):
    """
    amount: integer in the smallest currency unit (e.g. cents for USD)
    currency: ISO 4217 currency code
    """
    try:
        intent = stripe.PaymentIntent.create(
            amount=amount,
            currency=currency,
            metadata=metadata or {},
            automatic_payment_methods={"enabled": True},
        )
        return {"client_secret": intent.client_secret, "id": intent.id}
    except StripeError as e:
        raise ValueError(f"Stripe error: {e.user_message}")


def retrieve_payment_intent(intent_id: str):
    try:
        intent = stripe.PaymentIntent.retrieve(intent_id)
        return {"id": intent.id, "status": intent.status, "amount": intent.amount}
    except StripeError as e:
        raise ValueError(f"Stripe error: {e.user_message}")