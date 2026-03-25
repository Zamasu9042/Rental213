from pydantic import BaseModel
from typing import List, Optional


# ── Vision layer models (used inside the wrapper) ─────────────────────────────

class Finding(BaseModel):
    label: str
    confidence: float
    damage_type: str


class DamageReport(BaseModel):
    photo_url: str
    findings: List[Finding]
    summary: str
    total_issues_found: int


# ── What the wrapper returns to the UI ────────────────────────────────────────

class WrapperResult(BaseModel):
    """
    Returned by POST /analyze on the wrapper.
    The UI holds onto this and forwards it to the microservice.
    """
    photo_url: str
    damage_type: Optional[str]       # top finding's damage_type
    confidence: Optional[float]      # top finding's confidence
    severity: str                    # NONE | MINOR | MAJOR
    estimated_cost: float
    summary: str
    total_issues_found: int
    findings: List[Finding]


# ── What the UI sends to the microservice ─────────────────────────────────────

class ClaimCreateRequest(BaseModel):
    """
    Posted by the UI to POST /claims on the microservice.
    Contains item/rental context + the full WrapperResult payload.
    """
    item_id: int
    rental_id: Optional[int]

    # Forwarded directly from WrapperResult
    photo_url: str
    damage_type: Optional[str]
    confidence: Optional[float]
    severity: str
    estimated_cost: float
    summary: Optional[str]
    total_issues_found: Optional[int]


# ── What the microservice returns ─────────────────────────────────────────────

class ClaimResult(BaseModel):
    claim_id: str
    item_id: str
    item_cost: float
    severity: str
    estimated_cost: float
    status: str
    damage_report: DamageReport


class ClaimResponse(BaseModel):
    claim_id: str
    item_id: int
    rental_id: Optional[int]
    photoURL: Optional[str]
    damage_type: Optional[str]
    confidence: Optional[float]
    severity: str
    estimated_cost: float
    status: str
    summary: Optional[str]
    total_issues_found: Optional[int]