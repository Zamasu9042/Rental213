import sqlite3
import uuid
import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from vision_service import analyze_image
from cost_service import calculate_severity, calculate_cost

router = APIRouter(prefix="/damage", tags=["Damage Claims"])

DB_PATH = os.getenv("DB_PATH", "damage_claims.db")

# ─── DB helpers ───────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ─── Request / Response models ────────────────────────────────────────────────

class SubmitClaimRequest(BaseModel):
    item_id: int
    rental_id: int
    damage_types: List[str]  # e.g. ["DENT", "BREAKAGE"]


class ClaimResponse(BaseModel):
    claim_id: str
    item_id: int
    rental_id: Optional[int]
    image_name: Optional[str]
    damage_type: Optional[str]
    confidence: Optional[float]
    severity: str
    estimated_cost: float
    status: str
    summary: Optional[str]
    total_issues_found: Optional[int]


# ─── Endpoints ────────────────────────────────────────────────────────────────

# POST /damage/claim — Submit a new claim (no photo yet)
@router.post("/claim", response_model=ClaimResponse, status_code=201)
def submit_claim(body: SubmitClaimRequest):
    """
    Create a new damage claim for an item.
    Photo and AI analysis can be added separately via /damage/photo and /damage/analyze.
    """
    conn = get_db()
    try:
        # Verify item exists and fetch its cost
        item = conn.execute(
            "SELECT * FROM items WHERE id = ?", (body.item_id,)
        ).fetchone()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {body.item_id} not found")

        claim_id = str(uuid.uuid4())

        conn.execute(
            """
            INSERT INTO claims (id, item_id, rental_id, image_name, severity, estimated_cost, status, summary, total_issues_found)
            VALUES (?, ?, ?, NULL, 'PENDING', 0.0, 'PENDING', NULL, 0)
            """,
            (claim_id, body.item_id, body.rental_id),
        )
        conn.commit()

        return ClaimResponse(
            claim_id=claim_id,
            item_id=body.item_id,
            rental_id=body.rental_id,
            image_name=None,
            damage_type=None,
            confidence=None,
            severity="PENDING",
            estimated_cost=0.0,
            status="PENDING",
            summary=None,
            total_issues_found=0,
        )
    finally:
        conn.close()


# POST /damage/photo — Upload a photo and attach it to a claim
@router.post("/photo", response_model=ClaimResponse)
async def upload_photo(
    claim_id: str,
    photo: UploadFile = File(...),
):
    """
    Upload a damage photo and associate it with an existing claim.
    Run /damage/analyze afterward to trigger AI analysis.
    """
    conn = get_db()
    try:
        claim = conn.execute(
            "SELECT * FROM claims WHERE id = ?", (claim_id,)
        ).fetchone()
        if not claim:
            raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")

        conn.execute(
            "UPDATE claims SET image_name = ? WHERE id = ?",
            (photo.filename, claim_id),
        )
        conn.commit()

        updated = conn.execute(
            "SELECT * FROM claims WHERE id = ?", (claim_id,)
        ).fetchone()

        return _claim_row_to_response(updated)
    finally:
        conn.close()


# GET /damage/{id} — Retrieve a single claim by ID
@router.get("/pending", response_model=List[ClaimResponse])
def get_pending_claims():
    """
    Return all claims with status PENDING.
    """
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM claims WHERE status = 'PENDING'"
        ).fetchall()
        return [_claim_row_to_response(r) for r in rows]
    finally:
        conn.close()


# GET /damage/{id} — Retrieve a single claim by ID
@router.get("/{claim_id}", response_model=ClaimResponse)
def get_claim(claim_id: str):
    """
    Retrieve the full details of a damage claim by its ID.
    """
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM claims WHERE id = ?", (claim_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")
        return _claim_row_to_response(row)
    finally:
        conn.close()


# POST /damage/analyze — Run AI analysis on a claim that already has a photo
@router.post("/analyze", response_model=ClaimResponse)
async def analyze_claim(
    claim_id: str,
    damage_types: List[str],
    photo: UploadFile = File(...),
):
    """
    Run Google Vision AI analysis on the uploaded photo.
    Updates the claim's severity, cost, and findings in the DB.
    """
    conn = get_db()
    try:
        claim = conn.execute(
            "SELECT * FROM claims WHERE id = ?", (claim_id,)
        ).fetchone()
        if not claim:
            raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")

        item = conn.execute(
            "SELECT * FROM items WHERE id = ?", (claim["item_id"],)
        ).fetchone()
        if not item:
            raise HTTPException(status_code=404, detail="Associated item not found")

        # Run Vision AI
        image_bytes = await photo.read()
        report = analyze_image(image_bytes, photo.filename, damage_types)

        severity = calculate_severity(report.findings)
        estimated_cost = calculate_cost(report.findings, item["cost"], severity)

        # Pick the highest-confidence finding for the top-level damage_type / confidence columns
        top_finding = max(report.findings, key=lambda f: f.confidence) if report.findings else None

        conn.execute(
            """
            UPDATE claims
            SET image_name = ?, severity = ?, estimated_cost = ?,
                summary = ?, total_issues_found = ?, status = 'PENDING'
            WHERE id = ?
            """,
            (
                photo.filename,
                severity,
                estimated_cost,
                report.summary,
                report.total_issues_found,
                claim_id,
            ),
        )
        conn.commit()

        updated = conn.execute(
            "SELECT * FROM claims WHERE id = ?", (claim_id,)
        ).fetchone()

        response = _claim_row_to_response(updated)
        if top_finding:
            response.damage_type = top_finding.damage_type
            response.confidence = top_finding.confidence
        return response
    finally:
        conn.close()


# ─── Helper ───────────────────────────────────────────────────────────────────

def _claim_row_to_response(row: sqlite3.Row) -> ClaimResponse:
    d = dict(row)
    return ClaimResponse(
        claim_id=str(d.get("id", "")),
        item_id=d.get("item_id", 0),
        rental_id=d.get("rental_id"),
        image_name=d.get("image_name"),
        damage_type=d.get("damage_type"),
        confidence=d.get("confidence"),
        severity=d.get("severity", "UNKNOWN"),
        estimated_cost=d.get("estimated_cost", 0.0),
        status=d.get("status", "UNKNOWN"),
        summary=d.get("summary"),
        total_issues_found=d.get("total_issues_found", 0),
    )
