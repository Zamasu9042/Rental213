from flask import Blueprint, request, jsonify
from ..services.payment_service import pay_rental, process_outstanding_payment, get_transaction

payments_bp = Blueprint("payments", __name__)


@payments_bp.route("/pay-rental", methods=["POST"])
def pay_rental_route():
    """
    POST /payment/pay-rental
    Body: {
        rental_id: int,
        renter_id: int,
        amount: float,         # dollar amount e.g. 49.99
        item_name: str,
        payment_method_id: str # Stripe PaymentMethod ID
        currency: str          # optional, default "usd"
    }
    """
    data = request.get_json()

    rental_id = data.get("rental_id")
    renter_id = data.get("renter_id")
    amount = data.get("amount")
    item_name = data.get("item_name")
    payment_method_id = data.get("payment_method_id")
    currency = data.get("currency", "usd")

    if not all([rental_id, renter_id, amount, item_name, payment_method_id]):
        return jsonify({"error": "rental_id, renter_id, amount, item_name, and payment_method_id are required"}), 400

    if not isinstance(amount, (int, float)) or amount <= 0:
        return jsonify({"error": "amount must be a positive number"}), 400

    try:
        payment = pay_rental(
            rental_id=int(rental_id),
            renter_id=int(renter_id),
            amount_dollars=float(amount),
            item_name=item_name,
            payment_method_id=payment_method_id,
            currency=currency,
        )
        return jsonify(payment.to_dict()), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 502


@payments_bp.route("/outstanding/<int:id>", methods=["PUT"])
def process_outstanding(id):
    """
    PUT /payment/outstanding/{id}
    Processes (retries) an outstanding/failed payment by its payment ID.
    """
    try:
        payment = process_outstanding_payment(id)
        return jsonify(payment.to_dict()), 200
    except ValueError as e:
        error_msg = str(e)
        status_code = 404 if "not found" in error_msg else 502
        return jsonify({"error": error_msg}), status_code


@payments_bp.route("/<int:id>", methods=["GET"])
def get_payment(id):
    """
    GET /payment/{id}
    Returns a single payment transaction record.
    """
    try:
        payment = get_transaction(id)
        return jsonify(payment.to_dict()), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 404