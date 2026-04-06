import json
import os
from datetime import datetime
from decimal import Decimal

import pika

AMQP_HOST = os.getenv("AMQP_HOST", "localhost")
AMQP_PORT = int(os.getenv("AMQP_PORT", "5672"))
AMQP_EXCHANGE = os.getenv("AMQP_EXCHANGE", "rental_topic")


def _json_default(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


def publish_payment_confirmed(payload: dict) -> None:
    """Scenario 1 & 2: notify Notification Service via RabbitMQ (report §16–18)."""
    body = json.dumps(payload, default=_json_default).encode("utf-8")
    params = pika.ConnectionParameters(
        host=AMQP_HOST,
        port=AMQP_PORT,
        heartbeat=300,
        blocked_connection_timeout=300,
    )
    connection = pika.BlockingConnection(params)
    try:
        channel = connection.channel()
        channel.exchange_declare(
            exchange=AMQP_EXCHANGE, exchange_type="topic", durable=True
        )
        channel.basic_publish(
            exchange=AMQP_EXCHANGE,
            routing_key="SendPaymentConfirmation",
            body=body,
            properties=pika.BasicProperties(
                content_type="application/json", delivery_mode=2
            ),
        )
    finally:
        connection.close()
