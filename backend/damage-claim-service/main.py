"""
Damage Claim Service — full multi-step approval flow (Scenario 3)

Status lifecycle:
  DRAFT
    → PENDING_STAFF_REVIEW    POST /damage/analyze
    → PENDING_OWNER_AMOUNT    POST /damage/:id/resolve  action=approve  (staff approves AI)
    → PENDING_STAFF_APPROVAL  POST /damage/:id/submit-amount            (owner enters amount)
    → AMOUNT_REJECTED         POST /damage/:id/review-amount action=reject (staff rejects amount)
    → APPROVED                POST /damage/:id/review-amount action=approve
                                → starts Camunda damage-claim-workflow
                                → Task 1: update-equipment-status-damage  (under_repair)
                                → Task 2: create-damage-payment           (Stripe for renter)
                                → Task 3: publish-damage-notification     (RabbitMQ → SMS)
    → REJECTED                POST /damage/:id/resolve  action=reject   (staff rejects claim)

Endpoints:
  POST /damage/claim
  POST /damage/photo
  POST /damage/analyze
  GET  /damage/pending                    staff queue (PENDING_STAFF_REVIEW + PENDING_STAFF_APPROVAL)
  POST /damage/:id/resolve                staff: approve AI → PENDING_OWNER_AMOUNT | reject → REJECTED
  POST /damage/:id/submit-amount          owner: enter damage amount → PENDING_STAFF_APPROVAL
  POST /damage/:id/review-amount          staff: approve → APPROVED + start Camunda | reject → AMOUNT_REJECTED
  GET  /damage/rental/:rental_id
  GET  /damage/:claim_id
"""

import base64
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import create_tables, get_db
from models import DamageClaim

app = FastAPI(title="Damage Claim Service")
create_tables()

# ── Config ────────────────────────────────────────────────────────────────────

PHOTO_DIR          = Path(os.getenv("PHOTO_STORAGE_DIR", "/data/photos"))
DAMAGE_PUBLIC_BASE = os.getenv("DAMAGE_PUBLIC_BASE", "http://damage-claim-service:8000").rstrip("/")
VISION_URL         = os.getenv("VISION_SERVICE_URL",   "http://vision-service:8000").rstrip("/")
RENTAL_URL         = os.getenv("RENTAL_SERVICE_URL",   "http://rental-service:8000").rstrip("/")

# Camunda — used to start damage-claim-workflow after final approval
CAMUNDA_CLIENT_ID     = os.getenv("CAMUNDA_CLIENT_ID",     "")
CAMUNDA_CLIENT_SECRET = os.getenv("CAMUNDA_CLIENT_SECRET", "")
CAMUNDA_CLUSTER_ID    = os.getenv("CAMUNDA_CLUSTER_ID",    "")
CAMUNDA_REGION        = os.getenv("CAMUNDA_REGION",        "sin-2")
CAMUNDA_TOKEN_URL     = "https://login.cloud.camunda.io/oauth/token"
CAMUNDA_BASE_URL      = f"https://{CAMUNDA_REGION}.zeebe.camunda.io:443/{CAMUNDA_CLUSTER_ID}/v2"

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

# ── Status constants ──────────────────────────────────────────────────────────

STATUS_DRAFT                = "DRAFT"
STATUS_PENDING_REVIEW       = "PENDING_STAFF_REVIEW"
STATUS_PENDING_OWNER_AMOUNT = "PENDING_OWNER_AMOUNT"
STATUS_PENDING_STAFF_APPROVAL = "PENDING_STAFF_APPROVAL"
STATUS_AMOUNT_REJECTED      = "AMOUNT_REJECTED"
STATUS_APPROVED             = "APPROVED"
STATUS_REJECTED             = "REJECTED"

# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def _startup():
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/damage/files", StaticFiles(directory=str(PHOTO_DIR)), name="damage_files")

# ── Helpers ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


def _row_to_api(row: DamageClaim) -> dict[str, Any]:
    conf = row.confidence
    return {
        "claimID":      str(row.id),
        "rentalID":     row.rental_id,
        "equipmentID":  row.equipment_id,
        "renterID":     row.renter_id,
        "photoURL":     row.photo_url,
        "damageType":   row.damage_type,
        "confidence":   float(conf) if conf is not None else None,
        "severity":     row.severity,
        "status":       row.status,
        "damageAmount": float(row.damage_amount) if row.damage_amount is not None else None,
        "created_at":   row.created_at.isoformat() if row.created_at else None,
        "analyzed_at":  row.analyzed_at.isoformat() if row.analyzed_at else None,
        "analysis":     row.analysis_json,
    }


def _parse_claim_id(claim_id: str) -> int:
    try:
        return int(claim_id.strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid claim id") from exc


def _fetch_rental(rental_id: int) -> dict[str, Any]:
    """Look up rental to get equipment_id and renter_id."""
    try:
        with httpx.Client(base_url=RENTAL_URL, timeout=10.0) as c:
            r = c.get(f"/rental/{rental_id}")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return {}


def _get_camunda_token() -> str:
    resp = httpx.post(
        CAMUNDA_TOKEN_URL,
        data={
            "grant_type":    "client_credentials",
            "client_id":     CAMUNDA_CLIENT_ID,
            "client_secret": CAMUNDA_CLIENT_SECRET,
            "audience":      "zeebe.camunda.io",
        },
        timeout=15.0,
    )
    if not resp.is_success:
        raise HTTPException(status_code=502, detail=f"Camunda token error: {resp.text[:200]}")
    return resp.json()["access_token"]


def _start_damage_workflow(claim: DamageClaim) -> None:
    """
    Start the Camunda damage-claim-workflow process.
    Variables passed to workers:
      claimId, equipmentId, renterId, rentalId, damageAmount, frontendUrl
    """
    if not CAMUNDA_CLIENT_ID or not CAMUNDA_CLUSTER_ID:
        print("[damage-claim] Camunda not configured — skipping workflow start")
        return
    try:
        token = _get_camunda_token()
        resp = httpx.post(
            f"{CAMUNDA_BASE_URL}/process-instances",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "processDefinitionId": "damage-claim-workflow",
                "variables": {
                    "claimId":      str(claim.id),
                    "equipmentId":  str(claim.equipment_id or ""),
                    "renterId":     str(claim.renter_id or ""),
                    "rentalId":     str(claim.rental_id),
                    "damageAmount": float(claim.damage_amount or 0),
                    "frontendUrl":  FRONTEND_URL,
                },
            },
            timeout=15.0,
        )
        if resp.is_success:
            data = resp.json()
            print(f"[damage-claim] Camunda process started: key={data.get('processInstanceKey') or data.get('key')}")
        else:
            print(f"[damage-claim] Camunda start failed: {resp.text[:300]}")
    except Exception as exc:
        print(f"[damage-claim] Camunda error: {exc}")


# ── Endpoints ─────────────────────────────────────────────────────────────────

class ClaimCreate(BaseModel):
    rental_id: int = Field(..., ge=1)


@app.post("/damage/claim", status_code=201)
def submit_claim(body: ClaimCreate, db: Session = Depends(get_db)):
    """Create a new claim in DRAFT status. Also caches equipment_id and renter_id from rental."""
    rental = _fetch_rental(body.rental_id)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    row = DamageClaim(
        rental_id=body.rental_id,
        equipment_id=rental.get("equipment_id"),
        renter_id=rental.get("renter_id"),
        photo_url=None,
        damage_type=None,
        confidence=None,
        severity=None,
        status=STATUS_DRAFT,
        damage_amount=None,
        analysis_json=None,
        created_at=now,
        analyzed_at=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_api(row)


@app.post("/damage/photo", status_code=201)
async def upload_photo(
    claim_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    cid = _parse_claim_id(claim_id)
    row = db.query(DamageClaim).filter(DamageClaim.id == cid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    ext = Path(file.filename or "upload").suffix or ".bin"
    if ext.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".bin"}:
        ext = ".bin"
    name = f"{cid}_{uuid.uuid4().hex}{ext}"
    dest = PHOTO_DIR / name
    content = await file.read()
    dest.write_bytes(content)
    rel = f"/damage/files/{name}"
    row.photo_url = rel
    db.commit()
    db.refresh(row)
    return {"claimID": str(cid), "photoURL": rel}


class AnalyzeBody(BaseModel):
    claim_id: str


@app.post("/damage/analyze")
def analyze_claim(body: AnalyzeBody, db: Session = Depends(get_db)):
    """Run Google Vision AI on uploaded photo. Moves claim to PENDING_STAFF_REVIEW."""
    cid = _parse_claim_id(body.claim_id)
    row = db.query(DamageClaim).filter(DamageClaim.id == cid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    if not row.photo_url:
        raise HTTPException(status_code=400, detail="Upload a photo before analyze")

    # Read from disk and send as base64 — Docker URLs not reachable by Google
    if row.photo_url.startswith("/damage/files/"):
        filename = row.photo_url.removeprefix("/damage/files/")
        file_path = PHOTO_DIR / filename
        if not file_path.exists():
            raise HTTPException(status_code=400, detail="Photo file not found on disk")
        image_b64 = base64.b64encode(file_path.read_bytes()).decode()
        vision_req = {"image_base64": image_b64}
    else:
        vision_req = {"image_url": row.photo_url}

    try:
        with httpx.Client(base_url=VISION_URL, timeout=60.0) as client:
            r = client.post("/vision/analyze", json=vision_req)
            if r.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Vision service error: {r.text}")
            vision_payload = r.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="Cannot reach vision service") from exc

    conf = vision_payload.get("confidence")
    row.damage_type   = vision_payload.get("damageType")
    row.confidence    = Decimal(str(conf)) if conf is not None else None
    row.severity      = vision_payload.get("severity")
    row.status        = STATUS_PENDING_REVIEW
    row.analysis_json = vision_payload
    row.analyzed_at   = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(row)
    return _row_to_api(row)


@app.get("/damage/pending")
def list_pending_staff(db: Session = Depends(get_db)):
    """
    Returns all claims that need staff attention:
      PENDING_STAFF_REVIEW    — staff needs to approve/reject AI result
      PENDING_STAFF_APPROVAL  — owner submitted amount, staff needs to review
      AMOUNT_REJECTED         — included so staff can see history (optional filter on frontend)
    """
    rows = (
        db.query(DamageClaim)
        .filter(DamageClaim.status.in_([
            STATUS_PENDING_REVIEW,
            STATUS_PENDING_STAFF_APPROVAL,
            STATUS_AMOUNT_REJECTED,
        ]))
        .order_by(DamageClaim.created_at.asc())
        .all()
    )
    return [_row_to_api(r) for r in rows]


class ResolveBody(BaseModel):
    action: str  # "approve" | "reject"


@app.post("/damage/{claim_id}/resolve")
def resolve_claim(claim_id: str, body: ResolveBody, db: Session = Depends(get_db)):
    """
    Staff Step 1 — review AI analysis result.
      approve → PENDING_OWNER_AMOUNT  (owner must now enter damage amount)
      reject  → REJECTED              (claim closed)
    """
    cid = _parse_claim_id(claim_id)
    row = db.query(DamageClaim).filter(DamageClaim.id == cid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    if row.status != STATUS_PENDING_REVIEW:
        raise HTTPException(
            status_code=400,
            detail=f"Expected {STATUS_PENDING_REVIEW}, got {row.status}",
        )
    if body.action == "approve":
        row.status = STATUS_PENDING_OWNER_AMOUNT
    elif body.action == "reject":
        row.status = STATUS_REJECTED
    else:
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")
    db.commit()
    db.refresh(row)
    return _row_to_api(row)


class SubmitAmountBody(BaseModel):
    damage_amount: Decimal = Field(..., gt=0, description="Amount in SGD the owner is claiming")


@app.post("/damage/{claim_id}/submit-amount")
def submit_amount(claim_id: str, body: SubmitAmountBody, db: Session = Depends(get_db)):
    """
    Owner Step — enter the damage amount to claim.
    Allowed from PENDING_OWNER_AMOUNT or AMOUNT_REJECTED (owner re-submits).
    Moves claim to PENDING_STAFF_APPROVAL.
    """
    cid = _parse_claim_id(claim_id)
    row = db.query(DamageClaim).filter(DamageClaim.id == cid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    if row.status not in (STATUS_PENDING_OWNER_AMOUNT, STATUS_AMOUNT_REJECTED):
        raise HTTPException(
            status_code=400,
            detail=f"Expected {STATUS_PENDING_OWNER_AMOUNT} or {STATUS_AMOUNT_REJECTED}, got {row.status}",
        )
    row.damage_amount = body.damage_amount
    row.status        = STATUS_PENDING_STAFF_APPROVAL
    db.commit()
    db.refresh(row)
    return _row_to_api(row)


class ReviewAmountBody(BaseModel):
    action: str  # "approve" | "reject"


@app.post("/damage/{claim_id}/review-amount")
def review_amount(claim_id: str, body: ReviewAmountBody, db: Session = Depends(get_db)):
    """
    Staff Step 2 — review the amount the owner entered.
      approve → APPROVED + starts Camunda damage-claim-workflow
      reject  → AMOUNT_REJECTED (owner can re-enter)
    """
    cid = _parse_claim_id(claim_id)
    row = db.query(DamageClaim).filter(DamageClaim.id == cid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    if row.status != STATUS_PENDING_STAFF_APPROVAL:
        raise HTTPException(
            status_code=400,
            detail=f"Expected {STATUS_PENDING_STAFF_APPROVAL}, got {row.status}",
        )
    if body.action == "approve":
        row.status = STATUS_APPROVED
        db.commit()
        db.refresh(row)
        # Start Camunda — workers handle equipment status, payment, notification
        _start_damage_workflow(row)
    elif body.action == "reject":
        row.status = STATUS_AMOUNT_REJECTED
        db.commit()
        db.refresh(row)
    else:
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")
    return _row_to_api(row)


@app.get("/damage/rental/{rental_id}")
def get_claim_by_rental(rental_id: int, db: Session = Depends(get_db)):
    row = (
        db.query(DamageClaim)
        .filter(DamageClaim.rental_id == rental_id)
        .order_by(DamageClaim.created_at.desc())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="No damage claim for this rental")
    return _row_to_api(row)


@app.get("/damage/{claim_id}")
def get_claim(claim_id: str, db: Session = Depends(get_db)):
    cid = _parse_claim_id(claim_id)
    row = db.query(DamageClaim).filter(DamageClaim.id == cid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    return _row_to_api(row)