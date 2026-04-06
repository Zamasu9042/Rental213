from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Optional
import stripe
import os

load_dotenv()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

app = FastAPI(
    title="Payment Wrapper",
    description="Creates Stripe payment intents and returns client_secret to the UI. Never touches the payment database.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────────────────

class CreatePaymentIntentRequest(BaseModel):
    amount: float           # in your currency's main unit e.g. 49.99 (dollars)
    currency: str           # e.g. "sgd", "usd"
    rental_id: int
    user_id: str
    description: Optional[str] = None


class CreatePaymentIntentResponse(BaseModel):
    client_secret: str      # UI passes this to Stripe.js to confirm payment
    payment_intent_id: str  # UI forwards this to the microservice after confirmation
    amount: int             # amount in cents as confirmed by Stripe
    currency: str
    status: str             # e.g. "requires_payment_method"


class RefundRequest(BaseModel):
    payment_intent_id: str
    reason: Optional[str] = "requested_by_customer"  # or "duplicate" / "fraudulent"


class RefundResponse(BaseModel):
    refund_id: str
    payment_intent_id: str
    amount: int             # refunded amount in cents
    status: str             # "succeeded", "pending", "failed"
    reason: Optional[str]


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "payment-wrapper"}


# ── CREATE PAYMENT INTENT ─────────────────────────────────────────────────────

@app.post("/payment/create-intent", response_model=CreatePaymentIntentResponse, tags=["Payment"])
def create_payment_intent(body: CreatePaymentIntentRequest):
    """
    Step 1 of the payment flow — called by the UI when the user is ready to pay.

    Creates a Stripe PaymentIntent and returns a client_secret.
    The UI passes the client_secret to Stripe.js, which securely
    collects card details and confirms the payment directly with Stripe.

    After Stripe.js confirms, the UI receives the final payment status
    and forwards it to the payment microservice to be logged.

    Flow:
        UI  →  POST /payment/create-intent  (this endpoint)
            ←  { client_secret, payment_intent_id, ... }
        UI  →  Stripe.js confirmCardPayment(client_secret)
            ←  { paymentIntent: { status: "succeeded", ... } }
        UI  →  POST payment-microservice/payments  (log the result)
    """
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe key not configured.")

    # Convert to cents (Stripe always works in smallest currency unit)
    amount_cents = int(round(body.amount * 100))

    try:
        intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency=body.currency.lower(),
            description=body.description or f"Rental {body.rental_id} payment",
            metadata={
                "rental_id": str(body.rental_id),
                "user_id":   body.user_id,
            },
            # Automatic payment methods — lets Stripe show the best options
            # for the user's region (card, PayNow, GrabPay, etc.)
            automatic_payment_methods={"enabled": True},
        )
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=402, detail=str(e.user_message))

    return CreatePaymentIntentResponse(
        client_secret      = intent.client_secret,
        payment_intent_id  = intent.id,
        amount             = intent.amount,
        currency           = intent.currency,
        status             = intent.status,
    )


# ── REFUND ────────────────────────────────────────────────────────────────────

@app.post("/payment/refund", response_model=RefundResponse, tags=["Payment"])
def create_refund(body: RefundRequest):
    """
    Issues a full refund for a given PaymentIntent.

    The UI calls this after a claim is approved, then logs the
    refund result to the payment microservice.
    """
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe key not configured.")

    try:
        # Retrieve the intent first to get the charge ID
        intent = stripe.PaymentIntent.retrieve(body.payment_intent_id)
        if not intent.latest_charge:
            raise HTTPException(
                status_code=400,
                detail="No charge found for this payment intent. Was it confirmed?"
            )

        refund = stripe.Refund.create(
            charge=intent.latest_charge,
            reason=body.reason,
        )
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=402, detail=str(e.user_message))

    return RefundResponse(
        refund_id          = refund.id,
        payment_intent_id  = body.payment_intent_id,
        amount             = refund.amount,
        status             = refund.status,
        reason             = refund.reason,
    )