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
    
# Finding: Represents a detected issue with a label, confidence score, and damage type.
# DamageReport: Contains an image name, a list of findings, a summary, and total issues found.
# ClaimResult: Includes claim details like ID, item info, costs, severity, status, and an associated damage report.