import json
import logging
import os
import time
from typing import Callable

import pika

LOG = logging.getLogger("notification_consumer")

AMQP_HOST = os.getenv("AMQP_HOST", "localhost")
AMQP_PORT = int(os.getenv("AMQP_PORT", "5672"))
AMQP_EXCHANGE = os.getenv("AMQP_EXCHANGE", "rental_topic")
QUEUE_NAME = os.getenv(
    "NOTIFICATION_QUEUE", "notification_SendPaymentConfirmation"
)


def run_consumer(stop_event, on_ready: Callable[[], None]) -> None:
    while not stop_event.is_set():
        try:
            params = pika.ConnectionParameters(
                host=AMQP_HOST,
                port=AMQP_PORT,
                heartbeat=300,
                blocked_connection_timeout=300,
            )
            connection = pika.BlockingConnection(params)
            channel = connection.channel()
            channel.exchange_declare(
                exchange=AMQP_EXCHANGE, exchange_type="topic", durable=True
            )
            channel.queue_declare(queue=QUEUE_NAME, durable=True)
            channel.queue_bind(
                exchange=AMQP_EXCHANGE,
                queue=QUEUE_NAME,
                routing_key="SendPaymentConfirmation",
            )
            channel.basic_qos(prefetch_count=10)

            def _on_message(ch, method, _properties, body):
                try:
                    payload = json.loads(body.decode("utf-8"))
                except json.JSONDecodeError:
                    payload = {"raw": body.decode("utf-8", errors="replace")}
                LOG.info(
                    "SendPaymentConfirmation rk=%s payload=%s",
                    method.routing_key,
                    payload,
                )
                ch.basic_ack(delivery_tag=method.delivery_tag)

            channel.basic_consume(
                queue=QUEUE_NAME, on_message_callback=_on_message, auto_ack=False
            )
            LOG.info("Consuming queue=%s exchange=%s", QUEUE_NAME, AMQP_EXCHANGE)
            on_ready()
            channel.start_consuming()
        except Exception as e:
            if stop_event.is_set():
                break
            LOG.warning("Consumer reconnecting after error: %s", e)
            time.sleep(3)
