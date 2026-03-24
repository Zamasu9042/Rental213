from pydantic import BaseModel
from typing import List, Optional


class Finding(BaseModel):
    label: str
    confidence: float
    damage_type: str


class DamageReport(BaseModel):
    photo_url: str         
    findings: List[Finding]
    summary: str
    total_issues_found: int


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