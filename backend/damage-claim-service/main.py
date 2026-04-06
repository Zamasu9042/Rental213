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
DAMAGE_PUBLIC_BASE = os.getenv(
    "DAMAGE_PUBLIC_BASE", "http://damage-claim-service:8000"
).rstrip("/")

VISION_URL = os.getenv("VISION_SERVICE_URL", "http://vision-service:8000").rstrip("/")

STATUS_DRAFT = "DRAFT"
STATUS_PENDING_REVIEW = "PENDING_STAFF_REVIEW"


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
        "photoURL": row.photo_url,
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
    rel = f"/damage/files/{name}"
    photo_url = f"{DAMAGE_PUBLIC_BASE}{rel}"
    row.photo_url = photo_url
    db.commit()
    db.refresh(row)
    return {"claimID": str(cid), "photoURL": photo_url}


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

    image_url = photo
    if photo.startswith("/damage/files/"):
        image_url = f"{DAMAGE_PUBLIC_BASE}{photo}"

    try:
        with httpx.Client(base_url=VISION_URL, timeout=60.0) as client:
            r = client.post("/vision/analyze", json={"image_url": image_url})
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


@app.get("/damage/{claim_id}")
def get_claim(claim_id: str, db: Session = Depends(get_db)):
    cid = _parse_claim_id(claim_id)
    row = db.query(DamageClaim).filter(DamageClaim.id == cid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    return _row_to_api(row)
