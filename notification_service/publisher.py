"""
Publish payment status to RabbitMQ. Payment Service uses this after processing payment.
Flow: Post Payment Details {ID, RentalID, Amount, Type} → Payment Service
      → Sends message on the status of the payment {Status, Timestamp} → RabbitMQ → Notification Service.
"""
import json
import logging
from datetime import datetime, timezone

import pika

from config import (
    RABBITMQ_HOST,
    RABBITMQ_PORT,
    RABBITMQ_USER,
    RABBITMQ_PASSWORD,
    RABBITMQ_VHOST,
    PAYMENT_EXCHANGE,
)

ROUTING_KEY_STATUS = "payment.status"
ROUTING_KEY_COMPLETED = "payment.completed"
logger = logging.getLogger(__name__)


def _publish(payload: dict, routing_key: str = ROUTING_KEY_STATUS) -> None:
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        virtual_host=RABBITMQ_VHOST,
        credentials=credentials,
    )
    conn = pika.BlockingConnection(parameters)
    ch = conn.channel()
    ch.exchange_declare(exchange=PAYMENT_EXCHANGE, exchange_type="topic", durable=True)
    ch.basic_publish(
        exchange=PAYMENT_EXCHANGE,
        routing_key=routing_key,
        body=json.dumps(payload),
        properties=pika.BasicProperties(delivery_mode=2),
    )
    conn.close()


def publish_payment_status(
    status: str,
    *,
    timestamp: str | None = None,
    payment_id: str | None = None,
    rental_id: str | None = None,
    amount: float | None = None,
    type: str | None = None,
    user_email: str | None = None,
    user_phone: str | None = None,
    **extra,
) -> None:
    """
    Publish message on the status of the payment {Status, Timestamp}.
    Notification Service consumes this and sends confirmation / reconciliation.

    Example (from Payment Service after processing POST Payment Details):
        publish_payment_status(
            "success",
            payment_id="pay-123",
            rental_id="R-456",
            amount=99.00,
            type="rental",
            user_email="customer@example.com",
        )
    """
    ts = timestamp or datetime.now(timezone.utc).isoformat()
    payload = {
        "Status": status,
        "Timestamp": ts,
        **({"ID": payment_id} if payment_id is not None else {}),
        **({"RentalID": rental_id} if rental_id is not None else {}),
        **({"Amount": amount} if amount is not None else {}),
        **({"Type": type} if type is not None else {}),
        **({"user_email": user_email} if user_email is not None else {}),
        **({"user_phone": user_phone} if user_phone is not None else {}),
        **extra,
    }
    _publish(payload, ROUTING_KEY_STATUS)
    logger.info("Published payment.status: Status=%s Timestamp=%s", status, ts)


def publish_payment_completed(
    payment_id: str,
    amount: float,
    user_email: str,
    *,
    currency: str = "USD",
    booking_ref: str | None = None,
    **extra,
) -> None:
    """Legacy: publish payment.completed (also consumed by Notification Service)."""
    payload = {
        "Status": "completed",
        "Timestamp": datetime.now(timezone.utc).isoformat(),
        "payment_id": payment_id,
        "id": payment_id,
        "amount": amount,
        "currency": currency,
        "user_email": user_email,
        "booking_ref": booking_ref,
        **extra,
    }
    _publish(payload, ROUTING_KEY_COMPLETED)
    logger.info("Published payment.completed: %s", payment_id)
