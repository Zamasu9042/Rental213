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

import math
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

# Defaults match Docker Compose service names. For local runs without Compose, set env vars
# e.g. RENTAL_SERVICE_URL=http://127.0.0.1:8002 (direct rental port) or Kong :8000 path.
RENTAL_SERVICE_URL       = os.getenv("RENTAL_SERVICE_URL",       "http://rental-service:8000").rstrip("/")
REPUTATION_SERVICE_URL   = os.getenv("REPUTATION_SERVICE_URL",   "http://reputation-service:8000").rstrip("/")
PAYMENT_WRAPPER_URL      = os.getenv("PAYMENT_WRAPPER_URL",      "http://payment-wrapper:8000").rstrip("/")
ORCHESTRATOR_URL         = os.getenv("ORCHESTRATOR_URL",         "http://camunda-proxy:3001").rstrip("/")
FRONTEND_URL        = os.getenv("FRONTEND_URL",        "http://localhost:5173").rstrip("/")

STRIPE_SECRET_KEY     = os.getenv("STRIPE_SECRET_KEY",     "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()

# Stripe SDK used only for webhook verification — session creation delegated to payment-wrapper
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

TYPE_RENTAL = "rental"
TYPE_LATE   = "late"
TYPE_DAMAGE = "damage"
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
    Matches camunda_proxy return-workflow: ceil(overdue hours), minimum 1 hour.
    """
    ret = _parse_dt(rental.get("return_timestamp"))
    due = _parse_dt(rental.get("end_time"))
    if ret is None or due is None:
        return False, Decimal("0")
    if ret <= due:
        return False, Decimal("0")
    delta_sec = (ret - due).total_seconds()
    hours_overdue = max(1, math.ceil(delta_sec / 3600.0))
    rate = Decimal(str(rental.get("hourly_rate") or 0))
    amount = (Decimal(str(hours_overdue)) * rate).quantize(Decimal("0.01"))
    return True, amount


def _notify_orchestrator_late_payment(row: Payment) -> None:
    """
    Scenario 2 (docs-compliant path): after marking late-fee payment PAID, notify
    Camunda orchestrator to advance the workflow.

    Camunda /internal/late-payment-confirmed:
      1. Polls payment-service 3× to verify status=paid
      2. If unverified → revert rental to LATE + notify renter to retry
      3. If verified → PUT reputation/deduct → POST rental/complete-after-late-payment → RabbitMQ
    Falls back to _finalize_late_fee_paid if the orchestrator is unreachable.
    """
    try:
        r = httpx.post(
            f"{ORCHESTRATOR_URL}/internal/late-payment-confirmed",
            json={
                "rental_id":  row.rental_id,
                "renter_id":  row.renter_id,
                "payment_id": row.id,
                "amount":     float(row.amount),
            },
            timeout=10.0,
        )
        print(
            f"[late-payment] Orchestrator notified payment_id={row.id} → {r.status_code}",
            flush=True,
        )
    except Exception as exc:
        print(
            f"[late-payment] Orchestrator unreachable ({exc}) — falling back to direct finalize",
            flush=True,
        )
        _finalize_late_fee_paid(row)


def _finalize_late_fee_paid(row: Payment) -> None:
    """
    Scenario 2: late fee row is PAID — complete rental, penalty, SMS.

    Only applies reputation + SMS after LATE → COMPLETED succeeds (or rental already COMPLETED).
    """
    rid = row.rental_id
    uid = row.renter_id
    amt = float(row.amount)
    print(
        f"[late-finalize] rental_id={rid} payment_id={row.id} renter_id={uid}",
        flush=True,
    )

    try:
        rental_data = fetch_rental(rid)
    except Exception as e:
        print(f"[late-finalize] fetch rental failed: {e}", flush=True)
        return

    st = rental_data.get("status")
    if st == "COMPLETED":
        print(f"[late-finalize] rental {rid} already COMPLETED — ok", flush=True)
        return

    if st != "LATE":
        print(
            f"[late-finalize] expected rental LATE, got {st} — cannot complete late flow",
            flush=True,
        )
        return

    try:
        with _rental_client() as c:
            r = c.post(f"/rental/{rid}/complete-after-late-payment")
            if r.status_code >= 400:
                if r.status_code == 409:
                    try:
                        again = fetch_rental(rid)
                        if again.get("status") == "COMPLETED":
                            print(
                                f"[late-finalize] rental {rid} already COMPLETED (race)",
                                flush=True,
                            )
                        else:
                            print(
                                f"[late-finalize] complete 409 but rental still "
                                f"{again.get('status')}: {r.text}",
                                flush=True,
                            )
                            return
                    except Exception as ex:
                        print(f"[late-finalize] after 409 refetch failed: {ex}", flush=True)
                        return
                else:
                    print(
                        f"[late-finalize] complete-after-late-payment HTTP {r.status_code}: {r.text}",
                        flush=True,
                    )
                    return
            else:
                print(f"[late-finalize] rental {rid} → COMPLETED", flush=True)
    except Exception as e:
        print(f"[late-finalize] complete-after-late-payment error: {e}", flush=True)
        return

    try:
        r = httpx.put(
            f"{REPUTATION_SERVICE_URL}/reputation/deduct",
            json={"user_id": uid, "points": 10},
            timeout=10.0,
        )
        if r.is_success:
            print(f"[late-finalize] reputation penalty applied user={uid}", flush=True)
        else:
            print(
                f"[late-finalize] reputation deduct HTTP {r.status_code}: {r.text}",
                flush=True,
            )
    except Exception as e:
        print(f"[late-finalize] reputation deduct error: {e}", flush=True)

    try:
        publish_payment_confirmed(
            {
                "event": "SendPaymentConfirmation",
                "rental_id": rid,
                "renter_id": uid,
                "amount": amt,
                "type": "late",
            }
        )
        print(f"[late-finalize] RabbitMQ SendPaymentConfirmation published", flush=True)
    except Exception as e:
        print(f"[late-finalize] RabbitMQ publish error: {e}", flush=True)


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

    # Delegate Stripe session creation to payment-wrapper
    checkout_url: str
    with httpx.Client(base_url=PAYMENT_WRAPPER_URL, timeout=30.0) as c:
        resp = c.post("/payment/create-checkout-session", json={
            "amount":      float(body.amount),
            "currency":    "sgd",
            "item_name":   item_name,
            "payment_id":  row.id,
            "rental_id":   body.rental_id,
            "kind":        TYPE_RENTAL,
            "success_url": f"{FRONTEND_URL}/confirmation?rental_id={body.rental_id}&payment_id={row.id}",
            "cancel_url":  f"{FRONTEND_URL}/marketplace",
        })
    if resp.is_success:
        data = resp.json()
        row.stripe_session_id = data["session_id"]
        db.commit()
        checkout_url = data["checkout_url"]
    else:
        # Stripe not configured — finalize immediately in mock mode
        now = _now()
        row.status = STATUS_PAID
        row.updated_at = now
        db.commit()
        db.refresh(row)
        print(f"[pay_rental] mock: payment {row.id} marked PAID, finalizing booking", flush=True)
        with _rental_client() as c:
            c.post(f"/rental/{body.rental_id}/finalize-booking")
        try:
            httpx.post(
                f"{ORCHESTRATOR_URL}/internal/payment-confirmed",
                json={"rental_id": body.rental_id, "renter_id": body.renter_id,
                      "amount": float(body.amount), "kind": TYPE_RENTAL},
                timeout=10.0,
            )
        except Exception as e:
            print(f"[pay_rental] mock: orchestrator notify failed: {e}", flush=True)
        checkout_url = f"{FRONTEND_URL}/confirmation?rental_id={body.rental_id}&payment_id={row.id}&mock=1"

    return {
        **payment_to_dict(row),
        "checkout_url": checkout_url,
    }


@app.get("/payment/rental/{rental_id}/late-fee")
def get_late_fee_payment(rental_id: int, db: Session = Depends(get_db)):
    """
    Fetch the current unpaid late-fee payment for a rental.
    Used by the UI when a renter re-enters the app and sees a LATE rental.
    Returns 404 if no unpaid late fee exists.
    """
    row = (
        db.query(Payment)
        .filter(Payment.rental_id == rental_id)
        .filter(Payment.type == TYPE_LATE)
        .filter(Payment.status == STATUS_UNPAID)
        .order_by(Payment.id.desc())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="No unpaid late fee for this rental")
    return {**payment_to_dict(row), "is_late": True}


@app.post("/payment/outstanding", status_code=201)
def record_outstanding(body: OutstandingBody, db: Session = Depends(get_db)):
    """
    Late check is performed here (report Scenario 2 — compare return vs due).
    If not late: 400. If late: payment row type=late, status=unpaid; rental → LATE.

    Dup check runs first so existing records are always returned even if
    the late-check timestamps are borderline.
    """
    rental = fetch_rental(body.rental_id)

    # ── Return existing unpaid row immediately (idempotent) ───────────────────
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

    success_url = (
        f"{FRONTEND_URL}/confirmation?rental_id={row.rental_id}&payment_id={payment_id}"
    )
    print(
        f"[outstanding_checkout] start payment_id={payment_id} rental_id={row.rental_id} "
        f"wrapper={PAYMENT_WRAPPER_URL} success_url={success_url}",
        flush=True,
    )

    # Delegate Stripe session creation to payment-wrapper
    with httpx.Client(base_url=PAYMENT_WRAPPER_URL, timeout=30.0) as c:
        resp = c.post("/payment/create-checkout-session", json={
            "amount":      float(row.amount),
            "currency":    "sgd",
            "item_name":   row.item_name or f"Late fee #{payment_id}",
            "payment_id":  payment_id,
            "rental_id":   row.rental_id,
            "kind":        TYPE_LATE,
            "success_url": success_url,
            "cancel_url":  f"{FRONTEND_URL}/my-rentals?filter=payment-due",
        })
    if resp.is_success:
        data = resp.json()
        row.stripe_session_id = data["session_id"]
        db.commit()
        checkout_url = data["checkout_url"]
        print(
            f"[outstanding_checkout] Stripe session stored session_id={row.stripe_session_id} "
            f"(payment.rental_id={row.rental_id} — source of truth for late finalize)",
            flush=True,
        )
    else:
        print(
            f"[outstanding_checkout] payment-wrapper failed HTTP {resp.status_code} {resp.text[:500]} — mock path",
            flush=True,
        )
        # No Stripe session — dev / missing STRIPE_SECRET_KEY. Webhook will never fire;
        # complete the same path as checkout.session.completed so DB + orchestrator + SMS run.
        checkout_url = f"{FRONTEND_URL}/confirmation?rental_id={row.rental_id}&payment_id={payment_id}&mock=1"
        now = _now()
        row.status = STATUS_PAID
        row.updated_at = now
        db.commit()
        db.refresh(row)
        print(
            f"[outstanding_checkout] mock checkout — payment {payment_id} marked PAID, "
            "finalizing rental + notifications",
            flush=True,
        )
        _finalize_late_fee_paid(row)

    return {**payment_to_dict(row), "checkout_url": checkout_url}


class DamagePaymentBody(BaseModel):
    rental_id: int     = Field(..., ge=1)
    renter_id: int     = Field(..., ge=1)
    claim_id:  int     = Field(..., ge=1)
    amount:    Decimal = Field(..., gt=0)
    item_name: Optional[str] = None


@app.post("/payment/damage", status_code=201)
def pay_damage(body: DamagePaymentBody, db: Session = Depends(get_db)):
    """
    Scenario 3 — called by camunda-proxy after damage claim is APPROVED.
    Creates a Stripe Checkout session for the renter to pay the damage fee.
    Idempotent — returns existing checkout URL if already created.
    """
    existing = (
        db.query(Payment)
        .filter(Payment.rental_id == body.rental_id)
        .filter(Payment.type == TYPE_DAMAGE)
        .filter(Payment.status.in_((STATUS_PAYING, STATUS_PAID)))
        .first()
    )
    if existing and existing.status == STATUS_PAID:
        raise HTTPException(status_code=409, detail="Damage payment already completed")
    if existing and existing.status == STATUS_PAYING:
        # Return existing checkout URL
        checkout_url = f"{FRONTEND_URL}/my-rentals"
        with httpx.Client(base_url=PAYMENT_WRAPPER_URL, timeout=30.0) as c:
            try:
                resp = c.post("/payment/create-checkout-session", json={
                    "amount":      float(existing.amount),
                    "currency":    "sgd",
                    "item_name":   existing.item_name or f"Damage fee #{existing.id}",
                    "payment_id":  existing.id,
                    "rental_id":   existing.rental_id,
                    "kind":        TYPE_DAMAGE,
                    "success_url": f"{FRONTEND_URL}/my-rentals?damage_paid=1",
                    "cancel_url":  f"{FRONTEND_URL}/my-rentals",
                })
                if resp.is_success:
                    checkout_url = resp.json().get("checkout_url", checkout_url)
            except Exception:
                pass
        return {**payment_to_dict(existing), "checkout_url": checkout_url}

    now       = _now()
    item_name = body.item_name or f"Damage fee — claim #{body.claim_id}"
    row = Payment(
        rental_id=body.rental_id,
        renter_id=body.renter_id,
        amount=body.amount,
        type=TYPE_DAMAGE,
        status=STATUS_PAYING,
        item_name=item_name,
        stripe_session_id=None,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    with httpx.Client(base_url=PAYMENT_WRAPPER_URL, timeout=30.0) as c:
        resp = c.post("/payment/create-checkout-session", json={
            "amount":      float(body.amount),
            "currency":    "sgd",
            "item_name":   item_name,
            "payment_id":  row.id,
            "rental_id":   body.rental_id,
            "kind":        TYPE_DAMAGE,
            "success_url": f"{FRONTEND_URL}/my-rentals?damage_paid=1",
            "cancel_url":  f"{FRONTEND_URL}/my-rentals",
        })
    if resp.is_success:
        data = resp.json()
        row.stripe_session_id = data["session_id"]
        db.commit()
        checkout_url = data["checkout_url"]
    else:
        # Mock path — no Stripe configured; mark paid immediately
        print(f"[pay_damage] mock: payment-wrapper unavailable, marking PAID immediately", flush=True)
        row.status = STATUS_PAID
        row.updated_at = _now()
        db.commit()
        db.refresh(row)
        try:
            httpx.post(
                f"{ORCHESTRATOR_URL}/internal/damage-payment-confirmed",
                json={
                    "rental_id":  body.rental_id,
                    "renter_id":  body.renter_id,
                    "payment_id": row.id,
                    "amount":     float(body.amount),
                    "claim_id":   str(body.claim_id),
                },
                timeout=10.0,
            )
        except Exception as e:
            print(f"[pay_damage] mock: proxy notify failed: {e}", flush=True)
        checkout_url = f"{FRONTEND_URL}/my-rentals?damage_paid=1"

    return {**payment_to_dict(row), "checkout_url": checkout_url}


@app.get("/payment/{payment_id}")
def get_payment(payment_id: int, db: Session = Depends(get_db)):
    row = db.query(Payment).filter(Payment.id == payment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment_to_dict(row)


@app.get("/payment/{payment_id}/flow-debug")
def payment_flow_debug(payment_id: int, db: Session = Depends(get_db)):
    """
    Debug: compare DB `rental_id` vs Stripe session metadata (metadata is not required
    for finalize — we always use the payment row). Call via Kong:
    GET /api/payment/{id}/flow-debug
    """
    row = db.query(Payment).filter(Payment.id == payment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Payment not found")
    out: dict[str, Any] = {
        "payment_id": row.id,
        "db_rental_id": row.rental_id,
        "type": row.type,
        "status": row.status,
        "has_stripe_session_id": bool(row.stripe_session_id),
        "stripe_secret_configured": bool(STRIPE_SECRET_KEY),
        "rental_service_url": RENTAL_SERVICE_URL,
    }
    if row.stripe_session_id and STRIPE_SECRET_KEY:
        try:
            s = stripe.checkout.Session.retrieve(row.stripe_session_id)
            md = getattr(s, "metadata", None) or {}
            md = dict(md.items()) if hasattr(md, "items") else {}
            out["stripe_payment_status"] = getattr(s, "payment_status", None)
            out["stripe_metadata"] = md
            out["stripe_client_reference_id"] = getattr(s, "client_reference_id", None)
            out["metadata_rental_id_matches_db"] = (
                str(md.get("rental_id", "")) == str(row.rental_id)
                if md.get("rental_id") is not None
                else None
            )
        except Exception as e:
            out["stripe_retrieve_error"] = str(e)
    elif not row.stripe_session_id:
        out["note"] = "No checkout session yet (mock path or checkout not completed)"
    else:
        out["note"] = "STRIPE_SECRET_KEY not set on payment-service — cannot retrieve session"
    return out


@app.post("/payment/{payment_id}/sync-from-stripe")
def sync_payment_from_stripe(payment_id: int, db: Session = Depends(get_db)):
    """
    After Stripe Checkout redirect: confirm payment_status with Stripe API.
    Local/dev often never receives webhooks — this marks PAID and runs late-fee finalize.
    """
    if not STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=503,
            detail="Stripe not configured — cannot sync session",
        )
    row = db.query(Payment).filter(Payment.id == payment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Payment not found")

    print(
        f"[sync-from-stripe] start payment_id={payment_id} db_rental_id={row.rental_id} "
        f"type={row.type} status={row.status} stripe_session_id={row.stripe_session_id}",
        flush=True,
    )

    if row.status == STATUS_PAID:
        # Already processed — orchestrator already advanced the workflow; don't re-trigger.
        return {**payment_to_dict(row), "synced": False, "message": "already_paid"}

    if not row.stripe_session_id:
        raise HTTPException(
            status_code=400,
            detail="No Stripe checkout session on this payment row",
        )

    try:
        sess = stripe.checkout.Session.retrieve(row.stripe_session_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe retrieve failed: {e}") from e

    smd = getattr(sess, "metadata", None) or {}
    smd = dict(smd.items()) if hasattr(smd, "items") else (smd if isinstance(smd, dict) else {})
    cref = getattr(sess, "client_reference_id", None)
    ps = getattr(sess, "payment_status", None) or ""
    print(
        f"[sync-from-stripe] Stripe API session payment_status={ps} "
        f"metadata={smd} client_reference_id={cref} "
        f"(rental_id for finalize is always DB column={row.rental_id})",
        flush=True,
    )

    if ps != "paid":
        return {
            **payment_to_dict(row),
            "synced": False,
            "stripe_payment_status": ps,
        }

    now = _now()
    row.status = STATUS_PAID
    row.updated_at = now
    db.commit()
    db.refresh(row)
    print(f"[sync-from-stripe] payment {payment_id} marked PAID from Stripe session", flush=True)

    if row.type == TYPE_LATE:
        # Scenario 2: notify Camunda to verify (3 retries), deduct reputation, complete rental, SMS
        _notify_orchestrator_late_payment(row)
    elif row.type == TYPE_DAMAGE:
        # Scenario 3: notify proxy to publish final SMS
        try:
            httpx.post(
                f"{ORCHESTRATOR_URL}/internal/damage-payment-confirmed",
                json={
                    "rental_id":  row.rental_id,
                    "renter_id":  row.renter_id,
                    "payment_id": row.id,
                    "amount":     float(row.amount),
                },
                timeout=10.0,
            )
        except Exception as exc:
            print(f"[sync-from-stripe] damage notify: {exc}", flush=True)
    else:
        with _rental_client() as c:
            if row.type == TYPE_RENTAL:
                c.post(f"/rental/{row.rental_id}/finalize-booking")
        try:
            httpx.post(
                f"{ORCHESTRATOR_URL}/internal/payment-confirmed",
                json={
                    "rental_id": row.rental_id,
                    "renter_id": row.renter_id,
                    "amount": float(row.amount),
                    "kind": TYPE_RENTAL,
                },
                timeout=10.0,
            )
        except Exception as exc:
            print(f"[sync-from-stripe] orchestrator notify: {exc}", flush=True)

    return {**payment_to_dict(row), "synced": True}


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
    print(f"[webhook] event_type={etype}", flush=True)
    if etype != "checkout.session.completed":
        print(f"[webhook] skipping non-checkout event: {etype}", flush=True)
        return {"received": True}

    # Extract session object and session ID
    if hasattr(event, "data") and hasattr(event.data, "object"):
        sess = event.data.object
        session_id = getattr(sess, "id", None)
        meta_raw = getattr(sess, "metadata", None) or {}
    elif isinstance(event, dict):
        sess = event.get("data", {}).get("object") or {}
        session_id = sess.get("id") if isinstance(sess, dict) else None
        meta_raw = sess.get("metadata") or {} if isinstance(sess, dict) else {}
    else:
        sess = {}
        session_id = None
        meta_raw = {}

    # dict(stripe_object) fails with KeyError on integer indices — use .items() instead
    meta = dict(meta_raw.items()) if hasattr(meta_raw, "items") else {}
    client_ref = None
    if isinstance(sess, dict):
        client_ref = sess.get("client_reference_id")
    else:
        client_ref = getattr(sess, "client_reference_id", None)
    print(
        f"[webhook] session_id={session_id} client_reference_id={client_ref} initial_meta={meta}",
        flush=True,
    )

    # Stripe SDK v11+ uses thin events — metadata may be empty in the webhook payload.
    # Retrieve the full session from Stripe to get reliable metadata.
    if (not meta or not meta.get("payment_id")) and session_id and STRIPE_SECRET_KEY:
        try:
            print(f"[webhook] metadata thin/empty — retrieving full session {session_id} from Stripe API", flush=True)
            full_session = stripe.checkout.Session.retrieve(session_id)
            raw = getattr(full_session, "metadata", None) or {}
            meta = dict(raw.items()) if hasattr(raw, "items") else (raw if isinstance(raw, dict) else {})
            cref = getattr(full_session, "client_reference_id", None)
            if cref and not client_ref:
                client_ref = cref
            print(
                f"[webhook] retrieved session metadata={meta} client_reference_id={client_ref}",
                flush=True,
            )
        except Exception as retrieve_err:
            print(f"[webhook] session retrieve failed: {retrieve_err}", flush=True)

    payment_id = meta.get("payment_id")
    kind = meta.get("kind", TYPE_RENTAL)
    rental_id_meta = meta.get("rental_id")

    if not payment_id and client_ref:
        payment_id = str(client_ref)
        print(
            f"[webhook] resolved payment_id from client_reference_id={payment_id}",
            flush=True,
        )

    if not payment_id and session_id:
        row_sess = (
            db.query(Payment)
            .filter(Payment.stripe_session_id == session_id)
            .first()
        )
        if row_sess:
            payment_id = str(row_sess.id)
            print(
                "[webhook] resolved payment_id from DB via stripe_session_id "
                f"(session_id={session_id} payment_id={payment_id} "
                f"db_rental_id={row_sess.rental_id})",
                flush=True,
            )

    print(
        f"[webhook] resolved payment_id={payment_id} kind={kind} rental_id_from_meta={rental_id_meta}",
        flush=True,
    )

    if not payment_id:
        print(
            "[webhook] ABORT: no payment_id (metadata empty, no client_reference_id, "
            "no DB row for session_id) — cannot mark paid. "
            "Check payment-wrapper logs for session create.",
            flush=True,
        )
        return {"received": True}

    row = db.query(Payment).filter(Payment.id == int(payment_id)).first()
    if not row:
        print(f"[webhook] payment row {payment_id} not found — skipping", flush=True)
        return {"received": True}

    print(
        f"[webhook] row loaded id={row.id} rental_id={row.rental_id} type={row.type} "
        f"status={row.status} stripe_session_id={row.stripe_session_id}",
        flush=True,
    )
    if rental_id_meta and str(row.rental_id) != str(rental_id_meta):
        print(
            f"[webhook] WARN: Stripe metadata rental_id={rental_id_meta} != "
            f"DB payment.rental_id={row.rental_id} — using DB (authoritative)",
            flush=True,
        )

    if row.status == STATUS_PAID:
        print(f"[webhook] payment {payment_id} already PAID — idempotent ok", flush=True)
        return {"received": True}

    print(f"[webhook] marking payment {payment_id} as PAID (was {row.status})", flush=True)
    now = _now()
    row.status = STATUS_PAID
    row.updated_at = now
    db.commit()
    print(f"[webhook] payment {payment_id} committed as PAID", flush=True)

    # Notify orchestrator to advance workflow
    print(f"[webhook] Notifying orchestrator — kind={kind} rental_id={row.rental_id} renter_id={row.renter_id} payment_id={row.id}", flush=True)
    if row.type == TYPE_LATE:
        # Scenario 2: Camunda verifies (3 retries), deducts reputation, completes rental, publishes RabbitMQ
        _notify_orchestrator_late_payment(row)
    elif row.type == TYPE_DAMAGE:
        # Scenario 3: notify proxy to publish final SMS confirmation
        try:
            claim_id = meta.get("claim_id") if isinstance(meta, dict) else None
            httpx.post(
                f"{ORCHESTRATOR_URL}/internal/damage-payment-confirmed",
                json={
                    "rental_id":  row.rental_id,
                    "renter_id":  row.renter_id,
                    "payment_id": row.id,
                    "amount":     float(row.amount),
                    "claim_id":   claim_id,
                },
                timeout=10.0,
            )
        except Exception as orch_err:
            print(f"[webhook] damage notify error: {orch_err}", flush=True)
    else:
        # Scenario 1: finalize booking, then Camunda updates equipment status + publishes RabbitMQ
        with _rental_client() as c:
            if row.type == TYPE_RENTAL:
                c.post(f"/rental/{row.rental_id}/finalize-booking")
        try:
            print(f"[webhook] Calling payment-confirmed at {ORCHESTRATOR_URL}", flush=True)
            orchestrator_resp = httpx.post(
                f"{ORCHESTRATOR_URL}/internal/payment-confirmed",
                json={
                    "rental_id": row.rental_id,
                    "renter_id": row.renter_id,
                    "amount":    float(row.amount),
                    "kind":      row.type,
                },
                timeout=10.0,
            )
            print(f"[webhook] payment-confirmed response: {orchestrator_resp.status_code} {orchestrator_resp.text}", flush=True)
        except Exception as orch_err:
            print(f"[webhook] ERROR notifying orchestrator: {orch_err}", flush=True)

    return {"received": True}


# Kong may forward legacy path used by Stripe CLI / older config
@app.post("/webhook/stripe")
async def stripe_webhook_legacy(request: Request, db: Session = Depends(get_db)):
    return await stripe_webhook(request, db)
