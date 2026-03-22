from google.cloud import vision
from models import Finding, DamageReport
from typing import List

DAMAGE_KEYWORDS = {
    "BREAKAGE": ["crack", "broken", "shatter", "fracture", "chip", "split",
                 "wreck", "wrecked", "smash", "smashed", "collision", "crushed",
                 "debris", "wreckage", "accident", "glass", "windshield"],
    "DENT":     ["dent", "dented", "deform", "buckle", "indent", "bend",
                 "bent", "crumple", "crumpled", "damage", "damaged",
                 "bumper", "car door", "fender", "hood", "panel"],
    "MISSING_PART": ["missing", "absent", "detached", "loose", "separated",
                     "broken off", "displaced", "tire", "wheel", "headlight",
                     "taillight", "mirror"],
}

def analyze_image(image_bytes: bytes, image_name: str, requested_types: List[str]) -> DamageReport:
    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)

    # Use multiple detection features for better accuracy
    features = [
        {"type_": vision.Feature.Type.LABEL_DETECTION, "max_results": 20},
        {"type_": vision.Feature.Type.OBJECT_LOCALIZATION, "max_results": 20},
    ]
    request = {"image": image, "features": features}
    response = client.annotate_image(request)

    # Collect all labels from both detections
    all_labels = []
    for label in response.label_annotations:
        all_labels.append((label.description, label.score))
    for obj in response.localized_object_annotations:
        all_labels.append((obj.name, obj.score))

    #print("All detected labels:", [(name, round(score, 3)) for name, score in all_labels])

    findings = []
    seen = set()

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
                        label=name,
                        confidence=round(score, 3),
                        damage_type=damage_type,
                    ))

    return DamageReport(
        image_name=image_name,
        findings=findings,
        summary=f"Found {len(findings)} damage indicator(s).",
        total_issues_found=len(findings),
    )

# DAMAGE_KEYWORDS: A dictionary mapping damage types (e.g., "BREAKAGE", "DENT", "MISSING_PART") to lists of related keywords for matching.
# analyze_image function:
# Initializes a Vision client and processes the image bytes.
# Uses label detection and object localization features to extract labels and scores.
# Matches detected labels against requested damage types using keywords.
# Returns a DamageReport with findings, summary, and total issues found.