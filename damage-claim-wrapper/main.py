from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from typing import List
import os

from vision import analyze_image
from cost import calculate_severity, calculate_cost
from claim import WrapperResult

load_dotenv()

app = FastAPI(
    title="Damage Claim Wrapper",
    description="Calls Google Vision, calculates severity and cost, returns structured result to the UI. Never touches the database.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this in production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "damage-claim-wrapper"}


@app.post("/analyze", response_model=WrapperResult, tags=["Analysis"])
async def analyze(
    item_cost:    float      = Form(...),              # needed to calculate estimated_cost
    damage_types: str        = Form(...),              # comma-separated: "DENT,BREAKAGE"
    photo:        UploadFile = File(...),
):
    """
    Called by the UI when a user submits a damage claim photo.

    Steps:
      1. Read photo bytes
      2. Run Google Vision label + object detection
      3. Match labels against DAMAGE_KEYWORDS for the requested damage types
      4. Calculate severity (NONE / MINOR / MAJOR)
      5. Calculate estimated cost using item_cost
      6. Return WrapperResult — the UI will forward this to the microservice

    The wrapper never writes to a database.
    """
    image_bytes = await photo.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded photo is empty.")

    requested_types = [d.strip().upper() for d in damage_types.split(",")]

    # Use filename as a stand-in photo_url; in production the UI should
    # upload the photo to S3/GCS and pass back a real public URL.
    photo_url = photo.filename or "uploaded_photo"

    report   = analyze_image(image_bytes, photo_url, requested_types)
    severity = calculate_severity(report.findings)
    cost     = calculate_cost(report.findings, item_cost, severity)

    top = max(report.findings, key=lambda f: f.confidence) if report.findings else None

    return WrapperResult(
        photo_url          = report.photo_url,
        damage_type        = top.damage_type if top else None,
        confidence         = top.confidence  if top else None,
        severity           = severity,
        estimated_cost     = cost,
        summary            = report.summary,
        total_issues_found = report.total_issues_found,
        findings           = report.findings,
    )