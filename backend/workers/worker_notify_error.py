"""
worker_notify_error.py — Camunda job worker for: notify-renter-error
Scenario 2 compensating notifications:

  message_type = "contact_support"
    → Late fee recording failed. Renter is notified to contact support.
    → Rental was reverted to ACTIVE so the renter is not locked out.

  message_type = "reattempt_payment"
    → Payment not verified after 3 polls. Renter is notified to log in
      and reattempt late fee payment. Rental stays LATE until paid.

Publishes to RabbitMQ exchange 'rental_topic' with routing key 'SendErrorNotification'.
notification-service/consumer.py consumes this and calls Twilio to send SMS.

The accountInfo Camunda variable (set by worker_account.py / get-account-info) is used
to pass the phone number directly so the notification service does not need to re-fetch it.
"""
import asyncio
import json
import os

import pika
from pyzeebe import ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = os.environ.get("CAMUNDA_CLIENT_ID",     "AQazmsVXl7idqPlY1pMGm~Zh7Gv3Lgxk")
CAMUNDA_CLIENT_SECRET = os.environ.get("CAMUNDA_CLIENT_SECRET", "uH0.fzO7HfUxQ0FTlEe0DsBRe-WVgbxIq_BD0H8rpw422I.1Ig.jGZ~9JVZiU0R8")
CAMUNDA_CLUSTER_ID    = os.environ.get("CAMUNDA_CLUSTER_ID",    "db920878-5333-4352-b103-0803eb907686")
CAMUNDA_REGION        = os.environ.get("CAMUNDA_REGION",        "sin-2")

AMQP_HOST     = os.environ.get("AMQP_HOST",     "rabbitmq")
AMQP_PORT     = int(os.environ.get("AMQP_PORT", "5672"))
AMQP_EXCHANGE = os.environ.get("AMQP_EXCHANGE", "rental_topic")


def _publish_error_notification(payload: dict) -> None:
    connection = pika.BlockingConnection(pika.ConnectionParameters(
        host=AMQP_HOST,
        port=AMQP_PORT,
        heartbeat=300,
        blocked_connection_timeout=300,
    ))
    try:
        channel = connection.channel()
        channel.exchange_declare(exchange=AMQP_EXCHANGE, exchange_type="topic", durable=True)
        channel.basic_publish(
            exchange=AMQP_EXCHANGE,
            routing_key="SendErrorNotification",
            body=json.dumps(payload).encode("utf-8"),
            properties=pika.BasicProperties(
                content_type="application/json",
                delivery_mode=2,
            ),
        )
        print(f"[notify-renter-error] Published SendErrorNotification: {payload}")
    finally:
        connection.close()


async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION,
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="notify-renter-error")
    async def notify_renter_error(
        renterId:    str  = "",
        rentalId:    str  = "",
        messageType: str  = "contact_support",
        accountInfo: dict = {},
        **kwargs,
    ):
        print(f"[notify-renter-error] renterId={renterId} rentalId={rentalId} type={messageType}")

        phone = (accountInfo or {}).get("phone", "")
        payload = {
            "event":        "SendErrorNotification",
            "renter_id":    renterId,
            "rental_id":    rentalId,
            "message_type": messageType,
            "phone":        phone,
        }

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _publish_error_notification, payload)
        print(f"[notify-renter-error] Done — messageType={messageType}")
        return {}

    print(f"Worker started: notify-renter-error → {AMQP_HOST}:{AMQP_PORT}")
    await worker.work()


if __name__ == "__main__":
    asyncio.run(main())
