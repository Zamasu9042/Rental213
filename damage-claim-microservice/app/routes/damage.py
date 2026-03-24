import os
import uuid
import sqlite3
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import List
 
from app.db.database import get_db
from app.models.claim import ClaimResponse
from app.services.vision import analyze_image
from app.services.cost import calculate_severity, calculate_cost
 
router = APIRouter(prefix="/damage", tags=["Damage Claims"])
 
# ─── Where uploaded photos are saved locally ──────────────────────────────────
# In production replace this with an S3/GCS upload that returns a public URL.
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
BASE_URL    = os.getenv("BASE_URL", "http://localhost:8000")   # served as static files
os.makedirs(UPLOAD_DIR, exist_ok=True)
 
 
# ─── Helper ───────────────────────────────────────────────────────────────────
 
def _save_photo(photo: UploadFile, photo_bytes: bytes) -> str:
    """
    Persist the uploaded file to UPLOAD_DIR and return a URL string.
    The filename is prefixed with a UUID to avoid collisions.
    Replace this function body with an S3/GCS upload for production.
    """
    ext       = os.path.splitext(photo.filename or "photo.jpg")[1] or ".jpg"
    filename  = f"{uuid.uuid4().hex}{ext}"
    dest      = os.path.join(UPLOAD_DIR, filename)
    with open(dest, "wb") as f:
        f.write(photo_bytes)
    # Returns e.g. "http://localhost:8000/uploads/abc123.jpg"
    return f"{BASE_URL}/uploads/{filename}"
 
 
def _row_to_response(row: sqlite3.Row) -> ClaimResponse:
    d = dict(row)
    return ClaimResponse(
        claim_id          = str(d.get("id", "")),
        item_id           = d.get("item_id", 0),
        rental_id         = d.get("rental_id"),
        photoURL          = d.get("photoURL"),          # ← read from DB column
        damage_type       = d.get("damage_type"),
        confidence        = d.get("confidence"),
        severity          = d.get("severity", "UNKNOWN"),
        estimated_cost    = d.get("estimated_cost", 0.0),
        status            = d.get("status", "UNKNOWN"),
        summary           = d.get("summary"),
        total_issues_found= d.get("total_issues_found", 0),
    )
 
 
# ─── PRIMARY ENDPOINT ─────────────────────────────────────────────────────────
 
@router.post("/submit", response_model=ClaimResponse, status_code=201)
async def submit_damage_claim(
    item_id:      int        = Form(...),
    rental_id:    int        = Form(...),
    damage_types: str        = Form(...),   # comma-separated, e.g. "DENT,BREAKAGE"
    photo:        UploadFile = File(...),
):
    """
    Submit a new damage claim.
    Accepts: item_id, rental_id, damage_types (comma-separated), photo file.
    Returns: full ClaimResponse with photoURL pointing to the stored image.
    """
    conn = get_db()
    try:
        # 1. Verify item exists
        item = conn.execute(
            "SELECT * FROM items WHERE id = ?", (item_id,)
        ).fetchone()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {item_id} not found")
 
        # 2. Read photo bytes once (UploadFile is a stream — read it here)
        image_bytes = await photo.read()
 
        # 3. Save photo → get back the URL written to DB
        photo_url = _save_photo(photo, image_bytes)
 
        # 4. Parse requested damage types
        requested_types = [d.strip().upper() for d in damage_types.split(",")]
 
        # 5. Run Google Vision (passes photo_url into the report)
        report = analyze_image(image_bytes, photo_url, requested_types)
 
        # 6. Calculate severity + cost
        severity       = calculate_severity(report.findings)
        estimated_cost = calculate_cost(report.findings, item["cost"], severity)
 
        # 7. Top finding (highest confidence)
        top = max(report.findings, key=lambda f: f.confidence) if report.findings else None
 
        # 8. Persist claim
        claim_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO claims (
                id, item_id, rental_id, photoURL,
                damage_type, confidence,
                severity, estimated_cost, status,
                summary, total_issues_found
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
            """,
            (
                claim_id, item_id, rental_id, photo_url,   # ← photoURL stored here
                top.damage_type if top else None,
                top.confidence  if top else None,
                severity, estimated_cost,
                report.summary, report.total_issues_found,
            ),
        )
        conn.commit()
 
        # 9. Return response
        return ClaimResponse(
            claim_id          = claim_id,
            item_id           = item_id,
            rental_id         = rental_id,
            photoURL          = photo_url,          # ← URL in response
            damage_type       = top.damage_type if top else None,
            confidence        = top.confidence  if top else None,
            severity          = severity,
            estimated_cost    = estimated_cost,
            status            = "PENDING",
            summary           = report.summary,
            total_issues_found= report.total_issues_found,
        )
    finally:
        conn.close()
 
 
# ─── SUPPORTING ENDPOINTS ─────────────────────────────────────────────────────
 
@router.get("/pending", response_model=List[ClaimResponse])
def get_pending_claims():
    """Return all PENDING claims."""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM claims WHERE status = 'PENDING'"
        ).fetchall()
        return [_row_to_response(r) for r in rows]
    finally:
        conn.close()
 
 
@router.get("/{claim_id}", response_model=ClaimResponse)
def get_claim(claim_id: str):
    """Get a single claim by ID."""
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM claims WHERE id = ?", (claim_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")
        return _row_to_response(row)
    finally:
        conn.close()
 
 
@router.patch("/{claim_id}/status", response_model=ClaimResponse)
def update_claim_status(claim_id: str, status: str = Form(...)):
    """
    Update claim status. Accepted values: APPROVED, REJECTED.
    """
    allowed = {"APPROVED", "REJECTED"}
    if status.upper() not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of {allowed}")
 
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM claims WHERE id = ?", (claim_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")
 
        conn.execute(
            "UPDATE claims SET status = ? WHERE id = ?",
            (status.upper(), claim_id),
        )
        conn.commit()
 
        updated = conn.execute(
            "SELECT * FROM claims WHERE id = ?", (claim_id,)
        ).fetchone()
        return _row_to_response(updated)
    finally:
        conn.close()