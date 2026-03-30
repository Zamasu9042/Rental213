"""Send payment confirmation from payment status. No database."""
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def _send_sms(to_phone: str, body: str, from_phone: str | None = None) -> bool:
    """Send SMS via Twilio. Returns True if sent, False if skipped or failed."""
    from config import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
    sender_phone = from_phone or TWILIO_PHONE_NUMBER
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and sender_phone):
        logger.debug("SMS skipped: Twilio not configured (set TWILIO_* in .env).")
        return False
    try:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        client.messages.create(body=body, from_=sender_phone, to=to_phone)
        logger.info("SMS sent to %s", to_phone)
        return True
    except Exception as e:
        logger.warning("SMS failed: %s", e)
        return False


def _reconciliation(item_rev: dict) -> None:
    """Reconciliation of logic {item Rev} – send to reconciliation service if configured."""
    from config import RECONCILIATION_URL
    if not RECONCILIATION_URL:
        logger.debug("Reconciliation: no RECONCILIATION_URL set; skipping.")
        return
    try:
        import urllib.request
        import json as _json
        req = urllib.request.Request(
            RECONCILIATION_URL,
            data=_json.dumps(item_rev).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            logger.info("Reconciliation sent: %s", resp.status)
    except Exception as e:
        logger.warning("Reconciliation request failed: %s", e)


def send_payment_confirmation(payload: dict) -> None:
    """
    Notify based on payment status. Receives {Status, Timestamp} and optional context.

    Flow: Payment Service sends message on the status of the payment {Status, Timestamp}.
    Optional: ID, RentalID, Amount, Type, user_email for notification content.
    """
    try:
        status = payload.get("Status") or payload.get("status")
        timestamp = payload.get("Timestamp") or payload.get("timestamp")
        if not timestamp:
            timestamp = datetime.utcnow().isoformat() + "Z"

        # Optional context (from Payment Details: ID, RentalID, Amount, Type)
        payment_id = payload.get("ID") or payload.get("id") or payload.get("payment_id")
        rental_id = payload.get("RentalID") or payload.get("rental_id")
        renter_id = payload.get("RenterID") or payload.get("renter_id")
        amount = payload.get("Amount") or payload.get("amount")
        payment_type = payload.get("Type") or payload.get("type")
        user_email = payload.get("user_email") or payload.get("email")
        user_phone = (
            payload.get("user_phone")
            or payload.get("phone")
            or payload.get("phone_number")
            or payload.get("PhoneNo")
            or payload.get("phoneNo")
            or payload.get("PhoneNumber")
        )
        sender_phone = (
            payload.get("from_phone")
            or payload.get("sender_phone")
            or payload.get("FromPhoneNo")
            or payload.get("FromPhoneNumber")
            or payload.get("SenderPhoneNo")
        )

        # Notify status of payment
        if status and str(status).lower() in ("success", "completed", "paid", "ok"):
            logger.info(
                "SendPaymentConfirmation [success]: Status=%s Timestamp=%s id=%s RentalID=%s Amount=%s Type=%s email=%s",
                status,
                timestamp,
                payment_id,
                rental_id,
                amount,
                payment_type,
                user_email,
            )
            if user_phone:
                sms_body = (
                    f"Payment for {payment_type or 'unknown type'} by renter "
                    f"{renter_id or 'unknown renter'} for rental {rental_id or 'unknown rental'} "
                    f"of amount {amount if amount is not None else 'unknown amount'} has been paid."
                )
                _send_sms(
                    user_phone,
                    sms_body,
                    from_phone=sender_phone,
                )
        elif status and str(status).lower() in ("failed", "error", "rejected"):
            logger.info(
                "Notify payment failed: Status=%s Timestamp=%s id=%s",
                status,
                timestamp,
                payment_id,
            )
            if user_phone:
                _send_sms(
                    user_phone,
                    f"Rental213: Payment failed. Ref: {payment_id or rental_id or 'N/A'}.",
                    from_phone=sender_phone,
                )
        else:
            logger.info(
                "Notify payment status: Status=%s Timestamp=%s payload=%s",
                status,
                timestamp,
                payload,
            )

        # Reconciliation of logic {item Rev}
        item_rev = {
            "item": payment_id or rental_id,
            "Rev": timestamp,
            "Status": status,
            "Amount": amount,
        }
        _reconciliation(item_rev)

    except Exception as e:
        logger.exception("SendPaymentConfirmation failed: %s", e)
        raise
