"""
workers/worker_rabbitmq.py
Camunda job worker for: publish-payment-event
Publishes payment confirmation event to RabbitMQ.
Run with: /opt/homebrew/bin/python3.11 worker_rabbitmq.py
"""

import asyncio
import json
import pika
from pyzeebe import ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = "YOUR_CLIENT_ID"
CAMUNDA_CLIENT_SECRET = "YOUR_CLIENT_SECRET"
CAMUNDA_CLUSTER_ID    = "YOUR_CLUSTER_ID"
CAMUNDA_REGION        = "ont-1"

RABBITMQ_HOST     = "localhost"
RABBITMQ_PORT     = 5672
RABBITMQ_USER     = "guest"
RABBITMQ_PASSWORD = "guest"
RABBITMQ_EXCHANGE = "payment_events"

def publish_to_rabbitmq(message: dict):
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
    connection = pika.BlockingConnection(pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        credentials=credentials
    ))
    ch = connection.channel()
    ch.exchange_declare(exchange=RABBITMQ_EXCHANGE, exchange_type="fanout", durable=True)
    ch.basic_publish(
        exchange=RABBITMQ_EXCHANGE,
        routing_key="",
        body=json.dumps(message),
        properties=pika.BasicProperties(delivery_mode=2, content_type="application/json")
    )
    connection.close()
    print(f"[publish-payment-event] Published: {message}")

async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION" 
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="publish-payment-event")
    async def publish_payment_event(
        renterId: str,
        orderId: str,
        paymentStatus: str,
        stripePaymentId: str,
        accountInfo: dict
    ):
        print(f"[publish-payment-event] Publishing event for orderId: {orderId}")
        message = {
            "event":           "payment_confirmed",
            "renterId":        renterId,
            "orderId":         orderId,
            "paymentStatus":   paymentStatus,
            "stripePaymentId": stripePaymentId,
            "accountInfo":     accountInfo
        }
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, publish_to_rabbitmq, message)
        return {}

    print("Starting worker: publish-payment-event")
    await worker.work()

if __name__ == "__main__":
    asyncio.run(main())