"""
worker_rabbitmq.py — Camunda job worker for: publish-payment-event
Publishes payment confirmation to RabbitMQ so notification service can consume it.
"""
import asyncio, os, json
import pika
from pyzeebe import ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = os.environ.get("CAMUNDA_CLIENT_ID",     "AQazmsVXl7idqPlY1pMGm~Zh7Gv3Lgxk")
CAMUNDA_CLIENT_SECRET = os.environ.get("CAMUNDA_CLIENT_SECRET", "uH0.fzO7HfUxQ0FTlEe0DsBRe-WVgbxIq_BD0H8rpw422I.1Ig.jGZ~9JVZiU0R8")
CAMUNDA_CLUSTER_ID    = os.environ.get("CAMUNDA_CLUSTER_ID",    "db920878-5333-4352-b103-0803eb907686")
CAMUNDA_REGION        = os.environ.get("CAMUNDA_REGION",        "sin-2")

RABBITMQ_HOST     = os.environ.get("AMQP_HOST",     "rabbitmq")
RABBITMQ_PORT     = int(os.environ.get("AMQP_PORT", "5672"))
RABBITMQ_EXCHANGE = os.environ.get("AMQP_EXCHANGE", "rental_topic")

def publish_to_rabbitmq(message: dict):
    connection = pika.BlockingConnection(pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        heartbeat=300
    ))
    ch = connection.channel()
    ch.exchange_declare(exchange=RABBITMQ_EXCHANGE, exchange_type="topic", durable=True)
    ch.basic_publish(
        exchange=RABBITMQ_EXCHANGE,
        routing_key="ChangeStatusEvent",
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
        renterId: str = "",
        orderId: str = "",
        paymentStatus: str = "paid",
        accountInfo: dict = {},
        **kwargs
    ):
        print(f"[publish-payment-event] orderId={orderId}")
        message = {
            "event":         "ChangeStatusEvent",
            "rental_id":     orderId,
            "renter_id":     renterId,
            "paymentStatus": paymentStatus,
            "accountInfo":   accountInfo,
        }
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, publish_to_rabbitmq, message)
        return {}

    print(f"Worker started: publish-payment-event → {RABBITMQ_HOST}:{RABBITMQ_PORT}")
    await worker.work()

if __name__ == "__main__":
    asyncio.run(main())