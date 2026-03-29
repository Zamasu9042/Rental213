"""RabbitMQ event subscriber for payment confirmations."""
import json
import logging

import pika

from config import (
    RABBITMQ_HOST,
    RABBITMQ_PORT,
    RABBITMQ_USER,
    RABBITMQ_PASSWORD,
    RABBITMQ_VHOST,
    PAYMENT_QUEUE,
    PAYMENT_EXCHANGE,
)
from send_confirmation import send_payment_confirmation

logger = logging.getLogger(__name__)


def on_message(channel, method, properties, body):
    """Handle incoming payment event and send confirmation."""
    try:
        payload = json.loads(body)
        send_payment_confirmation(payload)
        channel.basic_ack(delivery_tag=method.delivery_tag)
    except json.JSONDecodeError as e:
        logger.error("Invalid JSON: %s", e)
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    except Exception as e:
        logger.exception("Message handling failed: %s", e)
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=True)


def run_consumer():
    """Connect to RabbitMQ and consume payment events (runs on different laptop IP)."""
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        virtual_host=RABBITMQ_VHOST,
        credentials=credentials,
    )

    connection = pika.BlockingConnection(parameters)
    channel = connection.channel()

    # Ensure exchange and queue exist (idempotent)
    channel.exchange_declare(exchange=PAYMENT_EXCHANGE, exchange_type="topic", durable=True)
    channel.queue_declare(queue=PAYMENT_QUEUE, durable=True)
    # Payment Service sends message on status of payment {Status, Timestamp}
    channel.queue_bind(queue=PAYMENT_QUEUE, exchange=PAYMENT_EXCHANGE, routing_key="payment.status")
    channel.queue_bind(queue=PAYMENT_QUEUE, exchange=PAYMENT_EXCHANGE, routing_key="payment.completed")

    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=PAYMENT_QUEUE, on_message_callback=on_message)

    logger.info("Notification Service listening on queue=%s (RabbitMQ @ %s)", PAYMENT_QUEUE, RABBITMQ_HOST)
    channel.start_consuming()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_consumer()
