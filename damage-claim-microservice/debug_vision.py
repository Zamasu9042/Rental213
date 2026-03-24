"""
Temporary debug script — run this directly to see what labels
Google Vision returns for any image, without going through the API.

Usage:
    python debug_vision.py /path/to/your/image.jpg
"""
import sys
import os
from dotenv import load_dotenv

load_dotenv()

from google.cloud import vision

def debug_image(image_path: str):
    with open(image_path, "rb") as f:
        image_bytes = f.read()

    client = vision.ImageAnnotatorClient()
    image  = vision.Image(content=image_bytes)

    features = [
        {"type_": vision.Feature.Type.LABEL_DETECTION,      "max_results": 30},
        {"type_": vision.Feature.Type.OBJECT_LOCALIZATION,  "max_results": 20},
    ]
    response = client.annotate_image({"image": image, "features": features})

    print("\n=== LABEL DETECTION ===")
    for label in response.label_annotations:
        print(f"  {label.score:.3f}  {label.description}")

    print("\n=== OBJECT LOCALIZATION ===")
    for obj in response.localized_object_annotations:
        print(f"  {obj.score:.3f}  {obj.name}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python debug_vision.py /path/to/image.jpg")
        sys.exit(1)
    debug_image(sys.argv[1])
