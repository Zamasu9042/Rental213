#!/usr/bin/env python3
"""Declare rental_topic exchange and service queues (idempotent)."""

import os
import sys
import time

import pika

AMQP_HOST = os.getenv("AMQP_HOST", "localhost")
AMQP_PORT = int(os.getenv("AMQP_PORT", "5672"))
EXCHANGE = os.getenv("AMQP_EXCHANGE", "rental_topic")

# queue name -> routing key(s) to bind
BINDINGS = [
    ("notification_SendPaymentConfirmation", ["SendPaymentConfirmation"]),
    ("notification_SendErrorNotification",   ["SendErrorNotification"]),
]


def wait_for_broker(max_attempts: int = 30, delay_sec: float = 2.0) -> pika.BlockingConnection:
    last_err = None
    for attempt in range(1, max_attempts + 1):
        try:
            return pika.BlockingConnection(
                pika.ConnectionParameters(
                    host=AMQP_HOST,
                    port=AMQP_PORT,
                    heartbeat=300,
                    blocked_connection_timeout=300,
                )
            )
        except pika.exceptions.AMQPConnectionError as e:
            last_err = e
            print(f"AMQP not ready ({attempt}/{max_attempts}): {e}", flush=True)
            time.sleep(delay_sec)
    print(f"Giving up connecting to RabbitMQ: {last_err}", flush=True)
    sys.exit(1)


def main() -> None:
    connection = wait_for_broker()
    try:
        channel = connection.channel()
        channel.exchange_declare(exchange=EXCHANGE, exchange_type="topic", durable=True)
        for queue_name, keys in BINDINGS:
            channel.queue_declare(queue=queue_name, durable=True)
            for rk in keys:
                channel.queue_bind(
                    exchange=EXCHANGE, queue=queue_name, routing_key=rk
                )
                print(f"Bound queue {queue_name} <- {EXCHANGE} rk={rk}", flush=True)
        print("AMQP setup complete", flush=True)
    finally:
        connection.close()


if __name__ == "__main__":
    main()
