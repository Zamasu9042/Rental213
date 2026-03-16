from pydantic import BaseModel
from typing import List

class Finding(BaseModel):
    label: str
    confidence: float
    damage_type: str

class DamageReport(BaseModel):
    image_name: str
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