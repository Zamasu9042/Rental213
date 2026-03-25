import sqlite3
import uuid
from fastapi import APIRouter, HTTPException, Form
from typing import List

from app.db.database import get_db
from app.models.claim import ClaimCreateRequest, ClaimResponse

router = APIRouter(prefix="/damage", tags=["Damage Claims"])


# ── Helper ────────────────────────────────────────────────────────────────────

def _row_to_response(row: sqlite3.Row) -> ClaimResponse:
    d = dict(row)
    return ClaimResponse(
        claim_id           = str(d.get("id", "")),
        item_id            = d.get("item_id", 0),
        rental_id          = d.get("rental_id"),
        photoURL           = d.get("photoURL"),
        damage_type        = d.get("damage_type"),
        confidence         = d.get("confidence"),
        severity           = d.get("severity", "UNKNOWN"),
        estimated_cost     = d.get("estimated_cost", 0.0),
        status             = d.get("status", "UNKNOWN"),
        summary            = d.get("summary"),
        total_issues_found = d.get("total_issues_found", 0),
    )


# ── CREATE ────────────────────────────────────────────────────────────────────

@router.post("/claims", response_model=ClaimResponse, status_code=201)
def create_claim(body: ClaimCreateRequest):
    """
    Called by the UI AFTER it has already received the wrapper's analysis result.
    The UI merges item_id + rental_id with the WrapperResult and posts it here.
    This endpoint only stores — it never calls Google Vision.

    Expected JSON body:
    {
        "item_id":            1,
        "rental_id":          42,
        "photo_url":          "https://...",
        "damage_type":        "DENT",
        "confidence":         0.91,
        "severity":           "MINOR",
        "estimated_cost":     40.00,
        "summary":            "Found 1 damage indicator(s).",
        "total_issues_found": 1
    }
    """
    conn = get_db()
    try:
        # Verify item exists
        item = conn.execute(
            "SELECT id FROM items WHERE id = ?", (body.item_id,)
        ).fetchone()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {body.item_id} not found")

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
                claim_id,
                body.item_id,
                body.rental_id,
                body.photo_url,
                body.damage_type,
                body.confidence,
                body.severity,
                body.estimated_cost,
                body.summary,
                body.total_issues_found,
            ),
        )
        conn.commit()

        return ClaimResponse(
            claim_id           = claim_id,
            item_id            = body.item_id,
            rental_id          = body.rental_id,
            photoURL           = body.photo_url,
            damage_type        = body.damage_type,
            confidence         = body.confidence,
            severity           = body.severity,
            estimated_cost     = body.estimated_cost,
            status             = "PENDING",
            summary            = body.summary,
            total_issues_found = body.total_issues_found,
        )
    finally:
        conn.close()


# ── READ ALL ──────────────────────────────────────────────────────────────────

@router.get("/claims", response_model=List[ClaimResponse])
def list_claims():
    """Return all claims ordered newest first."""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM claims ORDER BY rowid DESC"
        ).fetchall()
        return [_row_to_response(r) for r in rows]
    finally:
        conn.close()


@router.get("/claims/pending", response_model=List[ClaimResponse])
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


# ── READ ONE ──────────────────────────────────────────────────────────────────

@router.get("/claims/{claim_id}", response_model=ClaimResponse)
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


# ── UPDATE STATUS ─────────────────────────────────────────────────────────────

@router.patch("/claims/{claim_id}/status", response_model=ClaimResponse)
def update_claim_status(claim_id: str, status: str = Form(...)):
    """
    Update claim status. Accepted values: APPROVED, REJECTED.
    """
    allowed = {"APPROVED", "REJECTED"}
    if status.upper() not in allowed:
        raise HTTPException(
            status_code=400, detail=f"Status must be one of {allowed}"
        )

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


# ── DELETE ────────────────────────────────────────────────────────────────────

@router.delete("/claims/{claim_id}")
def delete_claim(claim_id: str):
    """Delete a claim by ID."""
    conn = get_db()
    try:
        result = conn.execute(
            "DELETE FROM claims WHERE id = ?", (claim_id,)
        )
        conn.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")
        return {"deleted": True, "id": claim_id}
    finally:
        conn.close()