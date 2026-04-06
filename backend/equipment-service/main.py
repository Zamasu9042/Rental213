import os
import shutil
from typing import List

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import create_tables, get_db
from models import Equipment
from schemas import EquipmentCreate, EquipmentOut, EquipmentUpdate

IMAGES_DIR = "/app/images"
os.makedirs(IMAGES_DIR, exist_ok=True)

create_tables()

app = FastAPI(title="Equipment Service")

app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/equipment", response_model=List[EquipmentOut])
def list_available_equipment(
    db: Session = Depends(get_db),
    include_all: bool = False,
):
    q = db.query(Equipment)
    if not include_all:
        q = q.filter(func.lower(Equipment.status) == "available")
    return q.order_by(Equipment.id).all()


@app.get("/equipment/{equipment_id}", response_model=EquipmentOut)
def get_equipment(equipment_id: int, db: Session = Depends(get_db)):
    row = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return row


@app.post("/equipment", response_model=EquipmentOut, status_code=201)
def add_equipment(payload: EquipmentCreate, db: Session = Depends(get_db)):
    row = Equipment(
        owner_id=payload.owner_id,
        item_name=payload.item_name,
        category=payload.category,
        status=payload.status,
        hourly_rate=payload.hourly_rate,
        pickup_location=payload.pickup_location,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.post("/equipment/{equipment_id}/image", response_model=EquipmentOut)
def upload_equipment_image(
    equipment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    row = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Equipment not found")

    ext = os.path.splitext(file.filename or "image.jpg")[1] or ".jpg"
    filename = f"equipment_{equipment_id}{ext}"
    filepath = os.path.join(IMAGES_DIR, filename)

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    row.image_url = f"/images/{filename}"
    db.commit()
    db.refresh(row)
    return row


@app.put("/equipment/{equipment_id}", response_model=EquipmentOut)
def change_equipment(
    equipment_id: int,
    payload: EquipmentUpdate,
    db: Session = Depends(get_db),
):
    row = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Equipment not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@app.delete("/equipment/{equipment_id}", status_code=204)
def delete_equipment(equipment_id: int, db: Session = Depends(get_db)):
    row = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Equipment not found")
    db.delete(row)
    db.commit()
    return None
