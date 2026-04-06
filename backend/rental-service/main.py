import os
from datetime import date, datetime, time, timezone
from typing import List, Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query
from sqlalchemy.orm import Session

from database import create_tables, get_db
from messaging import publish_json
from models import Rental
from schemas import RentalCreate, RentalOut, RentalReturnBody, RenterDashboardOut

create_tables()

app = FastAPI(title="Rental Service")

EQUIPMENT_SERVICE_URL = os.getenv(
    "EQUIPMENT_SERVICE_URL", "http://localhost:8001"
).rstrip("/")

STATUS_PENDING = "PENDING"
STATUS_ACTIVE = "ACTIVE"
STATUS_LATE = "LATE"
STATUS_RETURNED = "RETURNED"
STATUS_COMPLETED = "COMPLETED"

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
