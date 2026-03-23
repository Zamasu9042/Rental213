from flask import Blueprint, request, jsonify
from ..services.payment_service import create_payment_intent, retrieve_payment_intent

payments_bp = Blueprint("payments", __name__)


@payments_bp.route("/create-intent", methods=["POST"])
def create_intent():
    data = request.get_json()
    amount = data.get("amount")
    currency = data.get("currency", "usd")

    if not amount or not isinstance(amount, int) or amount <= 0:
        return jsonify({"error": "amount must be a positive integer (cents)"}), 400

    try:
        result = create_payment_intent(amount, currency, data.get("metadata"))
        return jsonify(result), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 502


@payments_bp.route("/intent/<intent_id>", methods=["GET"])
def get_intent(intent_id):
    try:
        result = retrieve_payment_intent(intent_id)
        return jsonify(result), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 502