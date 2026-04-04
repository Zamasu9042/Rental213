"""
equipment_service.py — Equipment Microservice
Runs on: http://localhost:5003
Run with: python equipment_service.py
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import mysql.connector
import os

app = Flask(__name__)
CORS(app)

# ─── DB config ────────────────────────────────────────────────────────────────
DB_CONFIG = {
    "host":     os.environ.get("DB_HOST",     "localhost"),
    "port":     int(os.environ.get("DB_PORT", 3306)),
    "user":     os.environ.get("DB_USER",     "root"),
    "password": os.environ.get("DB_PASSWORD", ""),
    "database": os.environ.get("DB_NAME",     "rental_db")
}

def get_db():
    return mysql.connector.connect(**DB_CONFIG)

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/equipment", methods=["GET"])
def list_equipment():
    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT * FROM equipment")
        items = cursor.fetchall()
        cursor.close()
        db.close()
        return jsonify(items), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/equipment/<equipment_id>", methods=["GET"])
def get_equipment(equipment_id):
    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT * FROM equipment WHERE id = %s", (equipment_id,))
        item = cursor.fetchone()
        cursor.close()
        db.close()
        if not item:
            return jsonify({"error": "Equipment not found"}), 404
        return jsonify(item), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/equipment/<equipment_id>/status", methods=["PUT"])
def update_equipment_status(equipment_id):
    """
    Updates equipment status to Pending.
    Called by worker_equipment.py (update-equipment-status job).
    """
    body = request.get_json()
    status = body.get("status", "Pending")

    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute(
            "UPDATE equipment SET status = %s WHERE id = %s",
            (status, equipment_id)
        )
        db.commit()
        cursor.close()
        db.close()
        return jsonify({"success": True, "equipmentId": equipment_id, "status": status}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "equipment"}), 200


if __name__ == "__main__":
    app.run(port=5003, debug=True)
