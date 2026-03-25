import json
import pika
import logging
from flask import current_app

logger = logging.getLogger(__name__)


def publish_payment_status_event(payment_id: int, rental_id: int, renter_id: int, status: str, amount: float, item_name: str):
    """
    Publishes a payment status event to RabbitMQ.
    Exchange: payment.events
    Routing key: payment.status
    """
    try:
        rabbitmq_url = current_app.config["RABBITMQ_URL"]
        params = pika.URLParameters(rabbitmq_url)
        connection = pika.BlockingConnection(params)
        channel = connection.channel()

        channel.exchange_declare(exchange="payment.events", exchange_type="topic", durable=True)

        payload = {
            "event": "payment.status",
            "payment_id": payment_id,
            "rental_id": rental_id,
            "renter_id": renter_id,
            "status": status,
            "amount": amount,
            "item_name": item_name,
        }

        channel.basic_publish(
            exchange="payment.events",
            routing_key="payment.status",
            body=json.dumps(payload),
            properties=pika.BasicProperties(
                delivery_mode=2,  # persistent
                content_type="application/json",
            ),
        )

        connection.close()
        logger.info(f"Published payment status event for payment_id={payment_id}, status={status}")

    except Exception as e:
        # Non-fatal: log and continue — don't crash the request if RabbitMQ is down
        logger.error(f"Failed to publish payment status event: {e}")
