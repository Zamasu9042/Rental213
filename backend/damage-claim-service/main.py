import base64
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import create_tables, get_db
from models import DamageClaim

app = FastAPI(title="Damage Claim Service")

create_tables()

PHOTO_DIR = Path(os.getenv("PHOTO_STORAGE_DIR", "/data/photos"))

VISION_URL = os.getenv("VISION_SERVICE_URL", "http://vision-service:8000").rstrip("/")

STATUS_DRAFT = "DRAFT"
STATUS_PENDING_REVIEW = "PENDING_STAFF_REVIEW"
STATUS_APPROVED = "APPROVED"
STATUS_REJECTED = "REJECTED"


@app.on_event("startup")
def _startup():
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)


app.mount("/damage/files", StaticFiles(directory=str(PHOTO_DIR)), name="damage_files")


@app.get("/health")
def health():
    return {"status": "ok"}


class ClaimCreate(BaseModel):
    rental_id: int = Field(..., ge=1)


def _row_to_api(row: DamageClaim) -> dict[str, Any]:
    conf = row.confidence
    conf_out = float(conf) if conf is not None else None
    return {
        "claimID": str(row.id),
        "rentalID": row.rental_id,
        "photoURL": row.photo_url,   # relative path e.g. /damage/files/filename.jpg
        "damageType": row.damage_type,
        "confidence": conf_out,
        "severity": row.severity,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "analyzed_at": row.analyzed_at.isoformat() if row.analyzed_at else None,
        "analysis": row.analysis_json,
    }


def _parse_claim_id(claim_id: str) -> int:
    try:
        return int(claim_id.strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid claim id") from exc


@app.post("/damage/claim", status_code=201)
def submit_claim(body: ClaimCreate, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    row = DamageClaim(
        rental_id=body.rental_id,
        photo_url=None,
        damage_type=None,
        confidence=None,
        severity=None,
        status=STATUS_DRAFT,
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
    # Store as relative path — frontend will prepend Kong base URL
    rel = f"/damage/files/{name}"
    row.photo_url = rel
    db.commit()
    db.refresh(row)
    return {"claimID": str(cid), "photoURL": rel}


class AnalyzeBody(BaseModel):
    claim_id: str


@app.post("/damage/analyze")
def analyze_claim(body: AnalyzeBody, db: Session = Depends(get_db)):
    cid = _parse_claim_id(body.claim_id)
    row = db.query(DamageClaim).filter(DamageClaim.id == cid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    photo = row.photo_url
    if not photo:
        raise HTTPException(status_code=400, detail="Upload a photo before analyze")

    # Google Vision imageUri must be public; Docker-internal URLs fail. Send bytes as base64 instead.
    vision_json: dict[str, str]
    if photo.startswith("/damage/files/"):
        fname = photo.split("/damage/files/", 1)[-1]
        dest = PHOTO_DIR / fname
        if not dest.is_file():
            raise HTTPException(status_code=400, detail="Photo file missing on disk")
        b64 = base64.b64encode(dest.read_bytes()).decode("ascii")
        vision_json = {"image_base64": b64}
    else:
        vision_json = {"image_url": photo}

    try:
        with httpx.Client(base_url=VISION_URL, timeout=60.0) as client:
            r = client.post("/vision/analyze", json=vision_json)
            if r.status_code >= 400:
                raise HTTPException(
                    status_code=502, detail=f"Vision service error: {r.text}"
                )
            vision_payload = r.json()
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502, detail="Cannot reach vision service"
        ) from exc

    conf = vision_payload.get("confidence")
    row.damage_type = vision_payload.get("damageType")
    row.confidence = Decimal(str(conf)) if conf is not None else None
    row.severity = vision_payload.get("severity")
    row.status = STATUS_PENDING_REVIEW
    row.analysis_json = vision_payload
    row.analyzed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(row)
    return _row_to_api(row)


@app.get("/damage/pending")
def list_pending_staff(db: Session = Depends(get_db)):
    rows = (
        db.query(DamageClaim)
        .filter(DamageClaim.status == STATUS_PENDING_REVIEW)
        .order_by(DamageClaim.created_at.asc())
        .all()
    )
    return [_row_to_api(r) for r in rows]


class ResolveBody(BaseModel):
    action: str  # "approve" or "reject"


@app.post("/damage/{claim_id}/resolve")
def resolve_claim(claim_id: str, body: ResolveBody, db: Session = Depends(get_db)):
    """Staff/owner resolves a damage claim after AI analysis."""
    cid = _parse_claim_id(claim_id)
    row = db.query(DamageClaim).filter(DamageClaim.id == cid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    if row.status not in (STATUS_PENDING_REVIEW,):
        raise HTTPException(
            status_code=400,
            detail=f"Claim must be in {STATUS_PENDING_REVIEW} status to resolve",
        )
    if body.action == "approve":
        row.status = STATUS_APPROVED
    elif body.action == "reject":
        row.status = STATUS_REJECTED
    else:
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")
    db.commit()
    db.refresh(row)
    return _row_to_api(row)


@app.get("/damage/rental/{rental_id}")
def get_claim_by_rental(rental_id: int, db: Session = Depends(get_db)):
    """Get the most recent damage claim for a rental (owner view)."""
    row = (
        db.query(DamageClaim)
        .filter(DamageClaim.rental_id == rental_id)
        .order_by(DamageClaim.created_at.desc())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="No claim found for this rental")
    return _row_to_api(row)


@app.get("/damage/{claim_id}")
def get_claim(claim_id: str, db: Session = Depends(get_db)):
    cid = _parse_claim_id(claim_id)
    row = db.query(DamageClaim).filter(DamageClaim.id == cid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    return _row_to_api(row)
