import logging
from google.cloud import vision
from claim import Finding, DamageReport
from typing import List

logger = logging.getLogger(__name__)

# ── Keyword map ───────────────────────────────────────────────────────────────
# Maps each damage type to Vision labels that indicate it.
# Add or remove keywords here to tune detection accuracy.

DAMAGE_KEYWORDS = {
    "BREAKAGE": [
        "crack", "cracked", "cracking", "broken", "shatter", "shattered",
        "fracture", "chip", "chipped", "split", "splinter",
        "screen", "display", "touchscreen", "lcd", "glass",
        "smartphone", "mobile phone", "phone", "mobile device",
        "gadget", "communication device", "portable communications device",
        "telephony", "tablet", "device",
        "wreck", "wrecked", "smash", "smashed", "collision", "crushed",
        "debris", "wreckage", "accident", "windshield",
    ],
    "DENT": [
        "dent", "dented", "deform", "buckle", "indent", "bend",
        "bent", "crumple", "crumpled", "damage", "damaged",
        "bumper", "car door", "fender", "hood", "panel",
        "scratch", "scratched",
    ],
    "MISSING_PART": [
        "missing", "absent", "detached", "loose", "separated",
        "broken off", "displaced", "tire", "wheel", "headlight",
        "taillight", "mirror",
    ],
}


def analyze_image(
    image_bytes: bytes,
    photo_url: str,
    requested_types: List[str],
) -> DamageReport:
    """
    Sends image bytes to Google Vision, matches returned labels against
    DAMAGE_KEYWORDS for the requested damage types, and returns a DamageReport.
    """
    client = vision.ImageAnnotatorClient()
    image  = vision.Image(content=image_bytes)

    features = [
        {"type_": vision.Feature.Type.LABEL_DETECTION,     "max_results": 30},
        {"type_": vision.Feature.Type.OBJECT_LOCALIZATION, "max_results": 20},
    ]
    response = client.annotate_image({"image": image, "features": features})

    all_labels = []
    for label in response.label_annotations:
        all_labels.append((label.description, label.score))
    for obj in response.localized_object_annotations:
        all_labels.append((obj.name, obj.score))

    logger.info("=== Google Vision labels ===")
    for name, score in all_labels:
        logger.info("  label: %-40s score: %.3f", name, score)
    logger.info("  requested_types: %s", requested_types)

    findings = []
    seen     = set()

    for name, score in all_labels:
        description = name.lower()
        for damage_type, keywords in DAMAGE_KEYWORDS.items():
            if damage_type not in requested_types:
                continue
            if any(kw in description for kw in keywords):
                key = (name, damage_type)
                if key not in seen:
                    seen.add(key)
                    findings.append(Finding(
                        label       = name,
                        confidence  = round(score, 3),
                        damage_type = damage_type,
                    ))
                    logger.info("  MATCH: %s → %s (%.3f)", name, damage_type, score)

    return DamageReport(
        photo_url          = photo_url,
        findings           = findings,
        summary            = f"Found {len(findings)} damage indicator(s).",
        total_issues_found = len(findings),
    )