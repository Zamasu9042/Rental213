import strawberry
from strawberry.file_uploads import Upload
from typing import List
from enum import Enum
from vision_service import analyze_image
from cost_service import calculate_severity, calculate_cost
import uuid

@strawberry.enum
class DamageType(Enum):
    BREAKAGE = "BREAKAGE"
    DENT = "DENT"
    MISSING_PART = "MISSING_PART"

@strawberry.type
class FindingType:
    label: str
    confidence: float
    damage_type: str

@strawberry.type
class DamageReportType:
    image_name: str
    findings: List[FindingType]
    summary: str
    total_issues_found: int

@strawberry.type
class ClaimType:
    claim_id: str
    item_id: str
    item_cost: float
    severity: str
    estimated_cost: float
    status: str
    damage_report: DamageReportType

@strawberry.type
class Query:
    @strawberry.field
    def hello(self) -> str:
        return "Hello World"

@strawberry.type
class Mutation:
    @strawberry.mutation
    def analyze_damage(
        self,
        image: Upload,
        damage_types: List[DamageType],
        item_id: str,
        item_cost: float,
    ) -> ClaimType:
        # analyse image
        image_bytes = image.file.read()
        requested = [d.value for d in damage_types]
        report = analyze_image(image_bytes, image.filename, requested)

        # calculate severity and cost
        severity = calculate_severity(report.findings)
        estimated_cost = calculate_cost(report.findings, item_cost, severity)

        # generate a claim ID
        claim_id = str(uuid.uuid4())

        return ClaimType(
            claim_id=claim_id,
            item_id=item_id,
            item_cost=item_cost,
            severity=severity,
            estimated_cost=estimated_cost,
            status="PENDING",
            damage_report=DamageReportType(
                image_name=report.image_name,
                findings=[
                    FindingType(
                        label=f.label,
                        confidence=f.confidence,
                        damage_type=f.damage_type,
                    )
                    for f in report.findings
                ],
                summary=report.summary,
                total_issues_found=report.total_issues_found,
            ),
        )

    @strawberry.mutation
    def approve_claim(
        self,
        claim_id: str,
        item_id: str,
        item_cost: float,
        severity: str,
        estimated_cost: float,
        total_issues_found: int,
        summary: str,
        image_name: str,
    ) -> ClaimType:
        return ClaimType(
            claim_id=claim_id,
            item_id=item_id,
            item_cost=item_cost,
            severity=severity,
            estimated_cost=estimated_cost,
            status="APPROVED",
            damage_report=DamageReportType(
                image_name=image_name,
                findings=[],
                summary=summary,
                total_issues_found=total_issues_found,
            ),
        )

    @strawberry.mutation
    def reject_claim(
        self,
        claim_id: str,
        item_id: str,
        item_cost: float,
        severity: str,
        estimated_cost: float,
        total_issues_found: int,
        summary: str,
        image_name: str,
    ) -> ClaimType:
        return ClaimType(
            claim_id=claim_id,
            item_id=item_id,
            item_cost=item_cost,
            severity=severity,
            estimated_cost=estimated_cost,
            status="REJECTED",
            damage_report=DamageReportType(
                image_name=image_name,
                findings=[],
                summary=summary,
                total_issues_found=total_issues_found,
            ),
        )

schema = strawberry.Schema(query=Query, mutation=Mutation)