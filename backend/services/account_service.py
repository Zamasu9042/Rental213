"""
account_service.py — Account Info Microservice
Runs on: http://localhost:5001
Run with: python account_service.py
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
    "password": os.environ.get("DB_PASSWORD", "password"),
    "database": os.environ.get("DB_NAME",     "rental_db")
}

def get_db():
    return mysql.connector.connect(**DB_CONFIG)

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/account/<renter_id>", methods=["GET"])
def get_account(renter_id):
    """
    Returns account info for a renter.
    Called by worker_account.py (get-account-info job).
    """
    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, name, email, phone, payment_method FROM users WHERE id = %s",
            (renter_id,)
        )
        user = cursor.fetchone()
        cursor.close()
        db.close()

        if not user:
            return jsonify({"error": f"User {renter_id} not found"}), 404

        return jsonify({
            "accountInfo": {
                "name":          user["name"],
                "email":         user["email"],
                "phone":         user["phone"],
                "paymentMethod": user["payment_method"]
            }
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "account-info"}), 200


if __name__ == "__main__":
    app.run(port=5001, debug=True)
