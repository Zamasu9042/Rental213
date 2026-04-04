"""
rental_service.py — Rental Order Microservice
Runs on: http://localhost:5002
Run with: python rental_service.py
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import mysql.connector
import os
import uuid
from datetime import datetime

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

@app.route("/rentals", methods=["POST"])
def create_rental():
    """
    Creates a rental order in the DB.
    Called by worker_rental.py (create-rental-order job).
    Body: { renterId, equipmentId, startTime, endTime, hourlyRate, pickUpLocation }
    Returns: { orderId, rentalConfirmation }
    """
    body = request.get_json()
    required = ["renterId", "equipmentId", "startTime", "endTime", "hourlyRate", "pickUpLocation"]
    missing = [f for f in required if not body.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        order_id = str(uuid.uuid4())
        db = get_db()
        cursor = db.cursor()
        cursor.execute("""
            INSERT INTO rentals 
            (id, renter_id, equipment_id, start_time, end_time, hourly_rate, pickup_location, status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', %s)
        """, (
            order_id,
            body["renterId"],
            body["equipmentId"],
            body["startTime"],
            body["endTime"],
            body["hourlyRate"],
            body["pickUpLocation"],
            datetime.utcnow().isoformat()
        ))
        db.commit()
        cursor.close()
        db.close()

        return jsonify({
            "orderId": order_id,
            "rentalConfirmation": {
                "orderId":        order_id,
                "renterId":       body["renterId"],
                "equipmentId":    body["equipmentId"],
                "startTime":      body["startTime"],
                "endTime":        body["endTime"],
                "hourlyRate":     body["hourlyRate"],
                "pickUpLocation": body["pickUpLocation"],
                "status":         "pending"
            }
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/rentals/<rental_id>", methods=["GET"])
def get_rental(rental_id):
    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT * FROM rentals WHERE id = %s", (rental_id,))
        rental = cursor.fetchone()
        cursor.close()
        db.close()
        if not rental:
            return jsonify({"error": "Rental not found"}), 404
        return jsonify(rental), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/rentals/<rental_id>/stripe-url", methods=["PUT"])
def update_stripe_url(rental_id):
    """
    Called by worker_stripe.py to store the Stripe redirect URL.
    The proxy polls this to send back to the frontend.
    """
    body = request.get_json()
    stripe_url = body.get("stripeRedirectUrl")
    if not stripe_url:
        return jsonify({"error": "stripeRedirectUrl required"}), 400

    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute(
            "UPDATE rentals SET stripe_redirect_url = %s WHERE id = %s",
            (stripe_url, rental_id)
        )
        db.commit()
        cursor.close()
        db.close()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "rental"}), 200


if __name__ == "__main__":
    app.run(port=5002, debug=True)
