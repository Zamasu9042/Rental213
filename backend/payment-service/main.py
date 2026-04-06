"""
Payment microservice (report User Scenario 1 & 2; technical diagram).

Endpoints:
  POST /payment/payrental           — initial rental checkout (Stripe)
  POST /payment/outstanding         — late check + record unpaid late fee (logic lives here)
  POST /payment/outstanding/{id}/checkout — Stripe for an unpaid late-fee row
  GET  /payment/{id}
  POST /payment/webhook             — Stripe signature verification
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

import httpx
import stripe
from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import create_tables, get_db
from messaging import publish_payment_confirmed
from models import Payment

create_tables()

app = FastAPI(title="Payment Service")

RENTAL_SERVICE_URL = os.getenv("RENTAL_SERVICE_URL", "http://localhost:8002").rstrip("/")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

TYPE_RENTAL = "rental"
TYPE_LATE = "late"
STATUS_PAYING = "paying"
STATUS_UNPAID = "unpaid"
STATUS_PAID = "paid"
STATUS_FAILED = "failed"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _parse_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value
    s = str(value).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _rental_client() -> httpx.Client:
    return httpx.Client(base_url=RENTAL_SERVICE_URL, timeout=30.0)


def fetch_rental(rental_id: int) -> dict[str, Any]:
    with _rental_client() as c:
        r = c.get(f"/rental/{rental_id}")
        if r.status_code == 404:
            raise HTTPException(status_code=404, detail="Rental not found")
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail="Rental service error")
        return r.json()


def is_late_return(rental: dict[str, Any]) -> tuple[bool, Decimal]:
    """
    Compare return time vs scheduled end (due). Used for Scenario 2 late fee (report).
    """
    ret = _parse_dt(rental.get("return_timestamp"))
    due = _parse_dt(rental.get("end_time"))
    if ret is None or due is None:
        return False, Decimal("0")
    if ret <= due:
        return False, Decimal("0")
    delta_sec = (ret - due).total_seconds()
    hours = Decimal(str(max(delta_sec / 3600.0, 0.0)))
    rate = Decimal(str(rental.get("hourly_rate") or 0))
    amount = (hours * rate).quantize(Decimal("0.01"))
    return True, amount


def payment_to_dict(row: Payment) -> dict[str, Any]:
    return {
        "paymentID": row.id,
        "rentalID": row.rental_id,
        "renterID": row.renter_id,
        "amount": float(row.amount),
        "type": row.type,
        "status": row.status,
        "itemName": row.item_name,
        "stripeSessionId": row.stripe_session_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


class PayRentalBody(BaseModel):
    rental_id: int = Field(..., ge=1)
    renter_id: int = Field(..., ge=1)
    amount: Decimal = Field(..., gt=0)
    item_name: Optional[str] = None


class OutstandingBody(BaseModel):
    rental_id: int = Field(..., ge=1)
    return_timestamp: Optional[datetime] = Field(
        default=None,
        description="Optional override; otherwise rental.return_timestamp is used.",
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "payment"}


@app.post("/payment/payrental", status_code=201)
def pay_rental(body: PayRentalBody, db: Session = Depends(get_db)):
    """Initial rental payment — creates DB row (paying) + Stripe Checkout (report step 8–11)."""
    rental = fetch_rental(body.rental_id)
    if rental.get("status") != "PENDING":
        raise HTTPException(
            status_code=409,
            detail="Rental must be PENDING to pay",
        )
    if int(rental.get("renter_id")) != int(body.renter_id):
        raise HTTPException(status_code=403, detail="renter_id does not match rental")

    existing = (
        db.query(Payment)
        .filter(Payment.rental_id == body.rental_id)
        .filter(Payment.type == TYPE_RENTAL)
        .filter(Payment.status.in_((STATUS_PAYING, STATUS_PAID)))
        .first()
    )
    if existing and existing.status == STATUS_PAID:
        raise HTTPException(status_code=409, detail="Rental payment already completed")

    now = _now()
    item_name = body.item_name or f"Equipment rental #{body.rental_id}"
    row = Payment(
        rental_id=body.rental_id,
        renter_id=body.renter_id,
        amount=body.amount,
        type=TYPE_RENTAL,
        status=STATUS_PAYING,
        item_name=item_name,
        stripe_session_id=None,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    checkout_url: str
    if STRIPE_SECRET_KEY:
        amount_cents = int((body.amount * 100).quantize(Decimal("1")))
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "sgd",
                        "product_data": {"name": item_name},
                        "unit_amount": amount_cents,
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            success_url=f"{FRONTEND_URL}/confirmation?rental_id={body.rental_id}",
            cancel_url=f"{FRONTEND_URL}/marketplace",
            metadata={
                "payment_id": str(row.id),
                "rental_id": str(body.rental_id),
                "kind": TYPE_RENTAL,
            },
        )
        row.stripe_session_id = session.id
        db.commit()
        checkout_url = session.url or ""
    else:
        checkout_url = f"{FRONTEND_URL}/confirmation?rental_id={body.rental_id}&mock=1"

    return {
        **payment_to_dict(row),
        "checkout_url": checkout_url,
    }


@app.post("/payment/outstanding", status_code=201)
def record_outstanding(body: OutstandingBody, db: Session = Depends(get_db)):
    """
    Late check is performed here (report Scenario 2 — compare return vs due).
    If not late: 400. If late: payment row type=late, status=unpaid; rental → LATE.
    """
    rental = fetch_rental(body.rental_id)
    ret_ts = body.return_timestamp or _parse_dt(rental.get("return_timestamp"))
    due = _parse_dt(rental.get("end_time"))
    if ret_ts is None or due is None:
        raise HTTPException(
            status_code=400,
            detail="Need return_timestamp on rental (or pass return_timestamp)",
        )

    rental_for_check = {**rental, "return_timestamp": ret_ts.isoformat()}
    late, amount = is_late_return(rental_for_check)
    if not late or amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Rental is not late; no outstanding late fee applies",
        )

    st = rental.get("status")
    if st not in ("RETURNED", "LATE"):
        raise HTTPException(
            status_code=409,
            detail="Rental must be RETURNED (or already LATE) to record late fee",
        )

    dup = (
        db.query(Payment)
        .filter(Payment.rental_id == body.rental_id)
        .filter(Payment.type == TYPE_LATE)
        .filter(Payment.status == STATUS_UNPAID)
        .first()
    )
    if dup:
        return {
            **payment_to_dict(dup),
            "is_late": True,
            "message": "Existing unpaid late fee row",
        }

    now = _now()
    row = Payment(
        rental_id=body.rental_id,
        renter_id=int(rental["renter_id"]),
        amount=amount,
        type=TYPE_LATE,
        status=STATUS_UNPAID,
        item_name=f"Late fee — rental #{body.rental_id}",
        stripe_session_id=None,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    with _rental_client() as c:
        r = c.post(f"/rental/{body.rental_id}/mark-late")
        if r.status_code >= 400:
            db.delete(row)
            db.commit()
            raise HTTPException(
                status_code=502,
                detail=r.json().get("detail", "Could not mark rental LATE"),
            )

    return {**payment_to_dict(row), "is_late": True}


@app.post("/payment/outstanding/{payment_id}/checkout")
def outstanding_checkout(payment_id: int, db: Session = Depends(get_db)):
    """Hosted Stripe checkout for an unpaid late-fee payment row."""
    row = db.query(Payment).filter(Payment.id == payment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Payment not found")
    if row.type != TYPE_LATE or row.status != STATUS_UNPAID:
        raise HTTPException(status_code=409, detail="Not an unpaid late fee payment")

    if STRIPE_SECRET_KEY:
        amount_cents = int((row.amount * 100).quantize(Decimal("1")))
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "sgd",
                        "product_data": {
                            "name": row.item_name or f"Late fee #{payment_id}",
                        },
                        "unit_amount": amount_cents,
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            success_url=f"{FRONTEND_URL}/confirmation?rental_id={row.rental_id}&payment_id={payment_id}",
            cancel_url=f"{FRONTEND_URL}/my-rentals?filter=payment-due",
            metadata={
                "payment_id": str(payment_id),
                "rental_id": str(row.rental_id),
                "kind": TYPE_LATE,
            },
        )
        row.stripe_session_id = session.id
        db.commit()
        checkout_url = session.url or ""
    else:
        checkout_url = f"{FRONTEND_URL}/confirmation?rental_id={row.rental_id}&payment_id={payment_id}&mock=1"

    return {**payment_to_dict(row), "checkout_url": checkout_url}


@app.get("/payment/{payment_id}")
def get_payment(payment_id: int, db: Session = Depends(get_db)):
    row = db.query(Payment).filter(Payment.id == payment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment_to_dict(row)


@app.post("/payment/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Stripe webhook — verify signature, mark paid, advance rental workflow (report step 12–14)."""
    body = await request.body()
    sig = request.headers.get("stripe-signature")

    if STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(
                body, sig or "", STRIPE_WEBHOOK_SECRET
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Webhook error: {exc}") from exc
    else:
        import json

        try:
            event = json.loads(body.decode("utf-8"))
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON") from exc

    etype = getattr(event, "type", None) or (
        event.get("type") if isinstance(event, dict) else None
    )
    if etype != "checkout.session.completed":
        return {"received": True}

    if hasattr(event, "data") and hasattr(event.data, "object"):
        sess = event.data.object
        meta_raw = getattr(sess, "metadata", None) or {}
    elif isinstance(event, dict):
        sess = event.get("data", {}).get("object") or {}
        meta_raw = sess.get("metadata") or {}
    else:
        meta_raw = {}
    meta = dict(meta_raw) if meta_raw else {}
    payment_id = meta.get("payment_id")
    kind = meta.get("kind", TYPE_RENTAL)
    rental_id = meta.get("rental_id")

    if not payment_id:
        return {"received": True}

    row = db.query(Payment).filter(Payment.id == int(payment_id)).first()
    if not row:
        return {"received": True}

    now = _now()
    row.status = STATUS_PAID
    row.updated_at = now
    db.commit()

    with _rental_client() as c:
        if kind == TYPE_RENTAL and rental_id:
            c.post(f"/rental/{rental_id}/finalize-booking")
        elif kind == TYPE_LATE and rental_id:
            c.post(f"/rental/{rental_id}/complete-after-late-payment")

    try:
        publish_payment_confirmed(
            {
                "event": "SendPaymentConfirmation",
                "payment_id": row.id,
                "rental_id": row.rental_id,
                "renter_id": row.renter_id,
                "amount": float(row.amount),
                "type": row.type,
            }
        )
    except Exception:
        pass

    return {"received": True}


# Kong may forward legacy path used by Stripe CLI / older config
@app.post("/webhook/stripe")
async def stripe_webhook_legacy(request: Request, db: Session = Depends(get_db)):
    return await stripe_webhook(request, db)
