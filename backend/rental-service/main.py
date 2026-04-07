import os
from datetime import date, datetime, time, timezone
from typing import List, Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query
from sqlalchemy.orm import Session

from database import create_tables, ensure_columns, get_db
from messaging import publish_json
from models import Rental
from schemas import ActorBody, RentalCreate, RentalOut, RentalReturnBody, RenterDashboardOut

create_tables()
ensure_columns()

app = FastAPI(title="Rental Service")

EQUIPMENT_SERVICE_URL = os.getenv(
    "EQUIPMENT_SERVICE_URL", "http://localhost:8001"
).rstrip("/")

STATUS_PENDING   = "PENDING"
STATUS_ACTIVE    = "ACTIVE"
STATUS_COLLECTED = "COLLECTED"
STATUS_RETURNED  = "RETURNED"
STATUS_COMPLETED = "COMPLETED"
STATUS_LATE      = "LATE"

BLOCKING_RENTAL_STATUSES = frozenset({STATUS_PENDING, STATUS_LATE})


def _equipment_client() -> httpx.Client:
    return httpx.Client(base_url=EQUIPMENT_SERVICE_URL, timeout=15.0)


def _fetch_equipment(client: httpx.Client, equipment_id: int) -> dict:
    r = client.get(f"/equipment/{equipment_id}")
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Equipment not found")
    if r.status_code >= 400:
        raise HTTPException(
            status_code=502, detail="Equipment service error fetching item"
        )
    return r.json()


def _put_equipment(client: httpx.Client, equipment_id: int, body: dict) -> None:
    r = client.put(f"/equipment/{equipment_id}", json=body)
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Equipment not found")
    if r.status_code >= 400:
        raise HTTPException(
            status_code=502, detail="Equipment service error updating item"
        )


def _publish_change_status(
    rental_id: int,
    equipment_id: int,
    renter_id: int,
    old_status: str,
    new_status: str,
) -> None:
    publish_json(
        "ChangeStatusEvent",
        {
            "event": "ChangeStatusEvent",
            "rental_id": rental_id,
            "equipment_id": equipment_id,
            "renter_id": renter_id,
            "old_status": old_status,
            "new_status": new_status,
        },
    )


def _overlapping_booking_exists(
    db: Session,
    equipment_id: int,
    start_time: datetime,
    end_time: datetime,
    exclude_rental_id: int | None = None,
) -> bool:
    q = (
        db.query(Rental)
        .filter(Rental.equipment_id == equipment_id)
        .filter(Rental.status.in_((STATUS_PENDING, STATUS_ACTIVE)))
        .filter(Rental.start_time < end_time)
        .filter(Rental.end_time > start_time)
    )
    if exclude_rental_id is not None:
        q = q.filter(Rental.id != exclude_rental_id)
    return q.first() is not None


def _publish_late_fee(
    rental_id: int,
    equipment_id: int,
    renter_id: int,
    due_at: datetime,
    returned_at: datetime,
) -> None:
    publish_json(
        "LateFeeEvent",
        {
            "event": "LateFeeEvent",
            "rental_id": rental_id,
            "equipment_id": equipment_id,
            "renter_id": renter_id,
            "due_at": due_at,
            "returned_at": returned_at,
        },
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/rental/active", response_model=List[RentalOut])
def list_active_rentals(
    db: Session = Depends(get_db),
    renter_id: Optional[int] = Query(
        default=None,
        description="If set, only ACTIVE rentals for this renter (Scenario 1 UI).",
    ),
):
    q = db.query(Rental).filter(Rental.status == STATUS_ACTIVE)
    if renter_id is not None:
        q = q.filter(Rental.renter_id == renter_id)
    return q.order_by(Rental.id).all()


@app.get("/rental/renter/{renter_id}/dashboard", response_model=RenterDashboardOut)
def renter_dashboard(renter_id: int, db: Session = Depends(get_db)):
    """Scenario 1: all rentals for renter + whether UI should show equipment browse (no PENDING/LATE)."""
    rows = (
        db.query(Rental)
        .filter(Rental.renter_id == renter_id)
        .order_by(Rental.id.desc())
        .all()
    )
    blocking = any(r.status in BLOCKING_RENTAL_STATUSES for r in rows)
    return RenterDashboardOut(
        renter_id=renter_id,
        rentals=[RentalOut.model_validate(r) for r in rows],
        should_show_equipment_browse=not blocking,
    )


@app.get("/rental/renter/{renter_id}", response_model=List[RentalOut])
def list_rentals_for_renter(renter_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(Rental)
        .filter(Rental.renter_id == renter_id)
        .order_by(Rental.id.desc())
        .all()
    )
    return rows


@app.get("/rental/equipment/{equipment_id}/rentals", response_model=List[RentalOut])
def list_rentals_for_equipment(equipment_id: int, db: Session = Depends(get_db)):
    """Return all rentals for a given equipment (owner view — for filing damage claims)."""
    rows = (
        db.query(Rental)
        .filter(Rental.equipment_id == equipment_id)
        .order_by(Rental.id.desc())
        .all()
    )
    return rows


@app.get("/rental/{equipment_id}/calendar/{start}/{end}", response_model=List[RentalOut])
def rental_calendar(
    equipment_id: int,
    start: str,
    end: str,
    db: Session = Depends(get_db),
):
    try:
        start_d = date.fromisoformat(start)
        end_d = date.fromisoformat(end)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail="start and end must be YYYY-MM-DD"
        ) from exc
    if start_d > end_d:
        raise HTTPException(status_code=400, detail="start must be on or before end")
    window_start = datetime.combine(start_d, time.min)
    window_end = datetime.combine(end_d, time.max)
    rows = (
        db.query(Rental)
        .filter(Rental.equipment_id == equipment_id)
        .filter(Rental.status.in_((STATUS_PENDING, STATUS_ACTIVE)))
        .filter(Rental.start_time < window_end)
        .filter(Rental.end_time > window_start)
        .order_by(Rental.start_time)
        .all()
    )
    return rows


@app.get("/rental/{rental_id}", response_model=RentalOut)
def get_rental(rental_id: int, db: Session = Depends(get_db)):
    row = db.query(Rental).filter(Rental.id == rental_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rental not found")
    return row


@app.post("/rental", response_model=RentalOut, status_code=201)
def create_rental(payload: RentalCreate, db: Session = Depends(get_db)):
    if payload.start_time >= payload.end_time:
        raise HTTPException(
            status_code=400, detail="start_time must be before end_time"
        )
    with _equipment_client() as client:
        try:
            eq = _fetch_equipment(client, payload.equipment_id)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502, detail="Cannot reach equipment service"
            ) from exc
    status_val = (eq.get("status") or "").lower()
    if status_val != "available":
        raise HTTPException(status_code=409, detail="Equipment is not available")

    blocking_rental = (
        db.query(Rental)
        .filter(Rental.renter_id == payload.renter_id)
        .filter(Rental.status.in_(BLOCKING_RENTAL_STATUSES))
        .first()
    )
    if blocking_rental:
        raise HTTPException(
            status_code=409,
            detail=f"You have an outstanding {blocking_rental.status.lower()} payment (rental #{blocking_rental.id}). Please resolve it before renting again.",
        )

    if _overlapping_booking_exists(
        db, payload.equipment_id, payload.start_time, payload.end_time
    ):
        raise HTTPException(
            status_code=409,
            detail="Equipment already has a PENDING or ACTIVE booking in that window",
        )

    pending_flow = payload.checkout_mode == "pending_payment"
    row = Rental(
        renter_id=payload.renter_id,
        equipment_id=payload.equipment_id,
        start_time=payload.start_time,
        end_time=payload.end_time,
        status=STATUS_PENDING if pending_flow else STATUS_ACTIVE,
        return_timestamp=None,
        hourly_rate=eq["hourly_rate"],
        pickup_location=eq["pickup_location"],
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    if not pending_flow:
        with _equipment_client() as client:
            try:
                _put_equipment(client, payload.equipment_id, {"status": "rented"})
            except httpx.RequestError as exc:
                raise HTTPException(
                    status_code=502, detail="Cannot reach equipment service for checkout"
                ) from exc

        try:
            _publish_change_status(
                row.id,
                row.equipment_id,
                row.renter_id,
                "",
                STATUS_ACTIVE,
            )
        except Exception:
            pass

    return row


@app.post("/rental/{rental_id}/finalize-booking", response_model=RentalOut)
def finalize_booking_after_payment(rental_id: int, db: Session = Depends(get_db)):
    """After payment (Camunda / OutSystems): PENDING -> ACTIVE and mark equipment rented."""
    row = db.query(Rental).filter(Rental.id == rental_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rental not found")
    if row.status != STATUS_PENDING:
        raise HTTPException(
            status_code=409,
            detail="Rental is not awaiting payment (expected PENDING)",
        )
    with _equipment_client() as client:
        try:
            eq = _fetch_equipment(client, row.equipment_id)
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502, detail="Cannot reach equipment service"
            ) from exc
    if (eq.get("status") or "").lower() != "available":
        raise HTTPException(
            status_code=409,
            detail="Equipment is no longer available; cannot finalize booking",
        )

    row.status = STATUS_ACTIVE
    db.commit()
    db.refresh(row)

    with _equipment_client() as client:
        try:
            _put_equipment(client, row.equipment_id, {"status": "rented"})
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502, detail="Cannot reach equipment service for checkout"
            ) from exc

    try:
        _publish_change_status(
            row.id,
            row.equipment_id,
            row.renter_id,
            STATUS_PENDING,
            STATUS_ACTIVE,
        )
    except Exception:
        pass

    return row


@app.put("/rental/{rental_id}/return", response_model=RentalOut)
def mark_return(
    rental_id: int,
    body: RentalReturnBody | None = None,
    db: Session = Depends(get_db),
):
    row = db.query(Rental).filter(Rental.id == rental_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rental not found")
    if row.status != STATUS_ACTIVE:
        raise HTTPException(status_code=409, detail="Rental is not active")

    old_status = row.status
    ret_ts = (
        body.return_timestamp
        if body and body.return_timestamp
        else datetime.now(timezone.utc).replace(tzinfo=None)
    )
    row.return_timestamp = ret_ts
    row.status = STATUS_RETURNED
    db.commit()
    db.refresh(row)

    with _equipment_client() as client:
        try:
            _put_equipment(client, row.equipment_id, {"status": "available"})
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502, detail="Cannot reach equipment service for return"
            ) from exc

    try:
        _publish_change_status(
            row.id,
            row.equipment_id,
            row.renter_id,
            old_status,
            STATUS_RETURNED,
        )
        if ret_ts > row.end_time:
            _publish_late_fee(
                row.id,
                row.equipment_id,
                row.renter_id,
                row.end_time,
                ret_ts,
            )
    except Exception:
        pass

    return row


# ── New lifecycle endpoints ──────────────────────────────────────────────────

@app.put("/rental/{rental_id}/collect", response_model=RentalOut)
def mark_collected(rental_id: int, body: ActorBody, db: Session = Depends(get_db)):
    """
    Renter OR owner confirms pickup.
    When BOTH have confirmed: ACTIVE → COLLECTED.
    """
    row = db.query(Rental).filter(Rental.id == rental_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rental not found")
    if row.status != STATUS_ACTIVE:
        raise HTTPException(status_code=409, detail="Rental must be ACTIVE to collect")

    is_renter = body.account_id == row.renter_id
    is_owner = False
    try:
        with _equipment_client() as client:
            eq = _fetch_equipment(client, row.equipment_id)
            is_owner = body.account_id == eq.get("owner_id")
    except Exception:
        pass

    if not is_renter and not is_owner:
        raise HTTPException(status_code=403, detail="Only renter or owner can confirm pickup")

    if is_renter:
        row.renter_collected = True
    if is_owner:
        row.owner_collected = True

    # Both confirmed → advance to COLLECTED
    if row.renter_collected and row.owner_collected:
        row.status = STATUS_COLLECTED

    db.commit()
    db.refresh(row)
    return row


@app.put("/rental/{rental_id}/confirm-return", response_model=RentalOut)
def confirm_return(rental_id: int, body: ActorBody, db: Session = Depends(get_db)):
    """
    Renter OR owner confirms the return.
    When BOTH have confirmed: COLLECTED → RETURNED and equipment marked available.
    """
    row = db.query(Rental).filter(Rental.id == rental_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rental not found")
    if row.status != STATUS_COLLECTED:
        raise HTTPException(status_code=409, detail="Rental must be COLLECTED to confirm return")

    # Determine actor — must be renter or owner (owner looked up via equipment)
    is_renter = body.account_id == row.renter_id
    # For owner check we need equipment owner_id — fetch from equipment service
    is_owner = False
    try:
        with _equipment_client() as client:
            eq = _fetch_equipment(client, row.equipment_id)
            is_owner = body.account_id == eq.get("owner_id")
    except Exception:
        pass

    if not is_renter and not is_owner:
        raise HTTPException(status_code=403, detail="Only renter or owner can confirm return")

    if is_renter:
        row.renter_returned = True
    if is_owner:
        row.owner_returned = True

    # Both confirmed → advance to RETURNED
    if row.renter_returned and row.owner_returned:
        ret_ts = datetime.now(timezone.utc).replace(tzinfo=None)
        row.return_timestamp = ret_ts
        row.status = STATUS_RETURNED
        # Mark equipment available again
        try:
            with _equipment_client() as client:
                _put_equipment(client, row.equipment_id, {"status": "available"})
        except Exception:
            pass
        try:
            _publish_change_status(row.id, row.equipment_id, row.renter_id, STATUS_COLLECTED, STATUS_RETURNED)
            if ret_ts > row.end_time:
                _publish_late_fee(row.id, row.equipment_id, row.renter_id, row.end_time, ret_ts)
        except Exception:
            pass

    db.commit()
    db.refresh(row)
    return row


@app.put("/rental/{rental_id}/confirm-review", response_model=RentalOut)
def confirm_review(rental_id: int, body: ActorBody, db: Session = Depends(get_db)):
    """
    Renter OR owner leaves their review.
    When BOTH have reviewed: RETURNED → COMPLETED.
    """
    row = db.query(Rental).filter(Rental.id == rental_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rental not found")
    if row.status != STATUS_RETURNED:
        raise HTTPException(status_code=409, detail="Rental must be RETURNED to review")

    is_renter = body.account_id == row.renter_id
    is_owner = False
    try:
        with _equipment_client() as client:
            eq = _fetch_equipment(client, row.equipment_id)
            is_owner = body.account_id == eq.get("owner_id")
    except Exception:
        pass

    if not is_renter and not is_owner:
        raise HTTPException(status_code=403, detail="Only renter or owner can leave a review")

    if is_renter:
        row.renter_reviewed = True
    if is_owner:
        row.owner_reviewed = True

    if row.renter_reviewed and row.owner_reviewed:
        row.status = STATUS_COMPLETED
        try:
            _publish_change_status(row.id, row.equipment_id, row.renter_id, STATUS_RETURNED, STATUS_COMPLETED)
        except Exception:
            pass

    db.commit()
    db.refresh(row)
    return row


@app.post("/rental/{rental_id}/mark-late", response_model=RentalOut)
def mark_late_for_payment_service(rental_id: int, db: Session = Depends(get_db)):
    """
    Called by Payment Service after late fee is recorded (Scenario 2).
    RETURNED + return after due → LATE (blocks browsing until fee paid).
    """
    row = db.query(Rental).filter(Rental.id == rental_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rental not found")
    if row.status == STATUS_LATE:
        return row
    if row.status != STATUS_RETURNED:
        raise HTTPException(
            status_code=409,
            detail="Rental must be RETURNED to transition to LATE",
        )
    if not row.return_timestamp or row.return_timestamp <= row.end_time:
        raise HTTPException(status_code=400, detail="Rental is not late")
    old = row.status
    row.status = STATUS_LATE
    db.commit()
    db.refresh(row)
    try:
        _publish_change_status(
            row.id, row.equipment_id, row.renter_id, old, STATUS_LATE
        )
    except Exception:
        pass
    return row


@app.post("/rental/{rental_id}/complete-after-late-payment", response_model=RentalOut)
def complete_after_late_payment(rental_id: int, db: Session = Depends(get_db)):
    """After late fee Stripe webhook (Scenario 2 step 21)."""
    row = db.query(Rental).filter(Rental.id == rental_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Rental not found")
    if row.status != STATUS_LATE:
        raise HTTPException(
            status_code=409,
            detail="Rental must be LATE to complete after late fee payment",
        )
    old = row.status
    row.status = STATUS_COMPLETED
    db.commit()
    db.refresh(row)
    try:
        _publish_change_status(
            row.id, row.equipment_id, row.renter_id, old, STATUS_COMPLETED
        )
    except Exception:
        pass
    return row
