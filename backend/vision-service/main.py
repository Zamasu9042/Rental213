import os
from typing import Any, Optional

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Vision Wrapper Service")

GOOGLE_VISION_KEY = os.getenv("GOOGLE_VISION_API_KEY", "").strip()
VISION_ANNOTATE = "https://vision.googleapis.com/v1/images:annotate"


class VisionRequest(BaseModel):
    image_url: Optional[str] = None
    image_base64: Optional[str] = Field(
        default=None, description="Raw base64 without data: prefix"
    )


def _mock_assessment() -> dict[str, Any]:
    return {
        "damageType": "unspecified_surface_damage",
        "confidence": 0.72,
        "severity": "medium",
        "labels": ["mock", "no_api_key"],
        "source": "mock",
    }


def _assess_from_labels(labels: list[dict]) -> dict[str, Any]:
    text = " ".join(
        (l.get("description") or "").lower() for l in labels[:15]
    )
    damage_kw = (
        "crack",
        "break",
        "broken",
        "damage",
        "damaged",
        "scratch",
        "scratched",
        "dent",
        "dented",
        "tear",
        "torn",
        "stain",
        "fracture",
        "shatter",
        "bent",
        "snap",
        "propeller",   # drone-specific
        "rotor",       # drone-specific
        "debris",
        "fragment",
    )
    hit = next((k for k in damage_kw if k in text), "general_wear")
    max_score = max((float(l.get("score") or 0) for l in labels), default=0.5)
    conf = round(min(max_score, 0.99), 2)
    sev = "low" if conf < 0.6 else "medium" if conf < 0.85 else "high"
    return {
        "damageType": hit,
        "confidence": conf,
        "severity": sev,
        "labels": [l.get("description") for l in labels[:10]],
        "source": "google_vision",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/vision/analyze")
def analyze(body: VisionRequest):
    if not body.image_url and not body.image_base64:
        raise HTTPException(
            status_code=400, detail="Provide image_url or image_base64"
        )

    if not GOOGLE_VISION_KEY:
        return _mock_assessment()

    if body.image_base64:
        img_obj: dict = {"content": body.image_base64}
    else:
        assert body.image_url is not None
        img_obj = {"source": {"imageUri": body.image_url}}

    req_body = {
        "requests": [
            {
                "image": img_obj,
                "features": [
                    {"type": "LABEL_DETECTION", "maxResults": 25},
                ],
            }
        ]
    }
    try:
        with httpx.Client(timeout=60.0) as client:
            r = client.post(
                VISION_ANNOTATE,
                params={"key": GOOGLE_VISION_KEY},
                json=req_body,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502, detail="Google Vision unreachable"
        ) from exc

    if r.status_code >= 400:
        raise HTTPException(
            status_code=502, detail=f"Vision API error: {r.text[:500]}"
        )
    data = r.json()
    try:
        labels = (
            data["responses"][0]
            .get("labelAnnotations", [])
        )
    except (KeyError, IndexError):
        labels = []
    if not labels:
        return {
            "damageType": "unknown",
            "confidence": 0.4,
            "severity": "low",
            "labels": [],
            "source": "google_vision_empty",
        }
    return _assess_from_labels(labels)
