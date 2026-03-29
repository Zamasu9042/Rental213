from claim import Finding
from typing import List

MINOR_CHARGE = {
    "DENT":         0.20,
    "BREAKAGE":     0.40,
    "MISSING_PART": 0.50,
}

MAJOR_THRESHOLD_CONFIDENCE = 0.85
MAJOR_THRESHOLD_COUNT      = 3


def calculate_severity(findings: List[Finding]) -> str:
    if not findings:
        return "NONE"
    high_confidence = any(f.confidence >= MAJOR_THRESHOLD_CONFIDENCE for f in findings)
    many_damages    = len(findings) >= MAJOR_THRESHOLD_COUNT
    if high_confidence or many_damages:
        return "MAJOR"
    return "MINOR"


def calculate_cost(findings: List[Finding], item_cost: float, severity: str) -> float:
    if severity == "NONE" or not findings:
        return 0.0
    if severity == "MAJOR":
        return round(item_cost, 2)

    max_rate = 0.0
    for finding in findings:
        rate = MINOR_CHARGE.get(finding.damage_type, 0.0)
        if rate > max_rate:
            max_rate = rate

    return round(item_cost * max_rate, 2)