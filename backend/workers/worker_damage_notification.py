"""
worker_damage_notification.py
Job type: publish-damage-notification

Scenario 3 — Task 3 in damage-claim-workflow.
Publishes a damage notification event to RabbitMQ so notification-service
can send an SMS to the renter informing them of the damage fee.
"""
import asyncio
import json
import os

import pika
from pyzeebe import Job, ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = os.environ.get("CAMUNDA_CLIENT_ID",     "")
CAMUNDA_CLIENT_SECRET = os.environ.get("CAMUNDA_CLIENT_SECRET", "")
CAMUNDA_CLUSTER_ID    = os.environ.get("CAMUNDA_CLUSTER_ID",    "")
CAMUNDA_REGION        = os.environ.get("CAMUNDA_REGION",        "sin-2")

RABBITMQ_HOST     = os.environ.get("AMQP_HOST",     "rabbitmq")
RABBITMQ_PORT     = int(os.environ.get("AMQP_PORT", "5672"))
RABBITMQ_EXCHANGE = os.environ.get("AMQP_EXCHANGE", "rental_topic")


def _publish(message: dict) -> None:
    connection = pika.BlockingConnection(pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        heartbeat=300,
    ))
    ch = connection.channel()
    ch.exchange_declare(exchange=RABBITMQ_EXCHANGE, exchange_type="topic", durable=True)
    ch.basic_publish(
        exchange=RABBITMQ_EXCHANGE,
        routing_key="SendDamageNotification",
        body=json.dumps(message),
        properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
    )
    connection.close()
    print(f"[publish-damage-notification] published: {message}")


async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION,
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="publish-damage-notification")
    async def publish_damage_notification(
        job: Job,
        claimId: str = "",
        renterId: str = "",
        rentalId: str = "",
        damageAmount: float = 0.0,
        damageCheckoutUrl: str = "",
        **kwargs,
    ):
        print(f"[publish-damage-notification] claimId={claimId} renterId={renterId}")
        message = {
            "event":        "SendDamageNotification",
            "claim_id":     claimId,
            "rental_id":    rentalId,
            "renter_id":    renterId,
            "amount":       damageAmount,
            "checkout_url": damageCheckoutUrl,
        }
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _publish, message)
        return {}

    print("Worker started: publish-damage-notification")
    print(f"  RabbitMQ: {RABBITMQ_HOST}:{RABBITMQ_PORT}")
    await worker.work()


if __name__ == "__main__":
    asyncio.run(main())
