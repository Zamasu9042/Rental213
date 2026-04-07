import json
import logging
import os
import time
from typing import Callable

import httpx
import pika
from twilio.rest import Client as TwilioClient

LOG = logging.getLogger("notification_consumer")

AMQP_HOST          = os.getenv("AMQP_HOST", "localhost")
AMQP_PORT          = int(os.getenv("AMQP_PORT", "5672"))
AMQP_EXCHANGE      = os.getenv("AMQP_EXCHANGE", "rental_topic")
QUEUE_NAME         = os.getenv("NOTIFICATION_QUEUE", "notification_SendPaymentConfirmation")
ERROR_QUEUE_NAME   = os.getenv("ERROR_NOTIFICATION_QUEUE", "notification_SendErrorNotification")

TWILIO_SID    = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM   = os.getenv("TWILIO_FROM_NUMBER", "")

ACCOUNT_SERVICE_URL = os.getenv("ACCOUNT_SERVICE_URL", "http://account-service:8000")


def _fetch_phone(renter_id: int) -> str | None:
    """Look up renter phone number from account-service."""
    try:
        r = httpx.get(f"{ACCOUNT_SERVICE_URL}/account/{renter_id}", timeout=10.0)
        if r.status_code == 200:
            return r.json().get("phoneNo")
    except Exception as e:
        LOG.warning("Could not fetch account for renter %s: %s", renter_id, e)
    return None


def _send_sms(to_number: str, body: str) -> None:
    if not TWILIO_SID or not TWILIO_TOKEN or not TWILIO_FROM:
        LOG.warning("Twilio not configured — skipping SMS to %s", to_number)
        return
    client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
    msg = client.messages.create(to=to_number, from_=TWILIO_FROM, body=body)
    LOG.info("SMS sent sid=%s to=%s", msg.sid, to_number)


def _handle_error_notification(payload: dict) -> None:
    """Scenario 2 error paths: contact support or reattempt payment."""
    renter_id    = payload.get("renter_id")
    rental_id    = payload.get("rental_id")
    message_type = payload.get("message_type", "contact_support")
    phone        = payload.get("phone")

    LOG.info("ErrorNotification rental=%s renter=%s type=%s", rental_id, renter_id, message_type)

    if not phone and renter_id:
        phone = _fetch_phone(renter_id)
    if not phone:
        LOG.warning("No phone number for error notification renter=%s — skipping SMS", renter_id)
        return

    if message_type == "reattempt_payment":
        sms_body = (
            f"[Rental213] Action required: Late fee payment could not be verified.\n"
            f"Rental #{rental_id}: Please log in and reattempt your late fee payment."
        )
    else:
        sms_body = (
            f"[Rental213] Action required: We could not process your return.\n"
            f"Rental #{rental_id}: Please contact support for assistance."
        )

    _send_sms(phone, sms_body)


def _handle_payment_confirmation(payload: dict) -> None:
    renter_id  = payload.get("renter_id")
    rental_id  = payload.get("rental_id")
    amount     = payload.get("amount", 0)
    pay_type   = payload.get("type", "rental")

    LOG.info("PaymentConfirmation rental=%s renter=%s type=%s amount=%s",
             rental_id, renter_id, pay_type, amount)

    if not renter_id:
        LOG.warning("No renter_id in payload — cannot send SMS")
        return

    phone = _fetch_phone(renter_id)
    if not phone:
        LOG.warning("No phone number found for renter %s — skipping SMS", renter_id)
        return

    if pay_type == "late":
        sms_body = (
            f"[Rental213] Late fee payment confirmed!\n"
            f"Rental #{rental_id}: SGD {amount:.2f} late fee received.\n"
            f"Your rental is now completed. Thank you."
        )
    else:
        sms_body = (
            f"[Rental213] Payment confirmed!\n"
            f"Rental #{rental_id}: SGD {amount:.2f} received.\n"
            f"Your rental is now active. Enjoy your equipment!"
        )

    _send_sms(phone, sms_body)


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
            # Payment confirmation queue (Scenario 1 & 2 success)
            channel.queue_declare(queue=QUEUE_NAME, durable=True)
            channel.queue_bind(
                exchange=AMQP_EXCHANGE,
                queue=QUEUE_NAME,
                routing_key="SendPaymentConfirmation",
            )
            # Error notification queue (Scenario 2 compensating actions)
            channel.queue_declare(queue=ERROR_QUEUE_NAME, durable=True)
            channel.queue_bind(
                exchange=AMQP_EXCHANGE,
                queue=ERROR_QUEUE_NAME,
                routing_key="SendErrorNotification",
            )
            channel.basic_qos(prefetch_count=10)

            def _on_message(ch, method, _properties, body):
                try:
                    payload = json.loads(body.decode("utf-8"))
                except json.JSONDecodeError:
                    payload = {}
                    LOG.error("Could not parse message body")
                try:
                    _handle_payment_confirmation(payload)
                except Exception as e:
                    LOG.error("Error handling notification: %s", e)
                ch.basic_ack(delivery_tag=method.delivery_tag)

            def _on_error_message(ch, method, _properties, body):
                try:
                    payload = json.loads(body.decode("utf-8"))
                except json.JSONDecodeError:
                    payload = {}
                    LOG.error("Could not parse error message body")
                try:
                    _handle_error_notification(payload)
                except Exception as e:
                    LOG.error("Error handling error notification: %s", e)
                ch.basic_ack(delivery_tag=method.delivery_tag)

            channel.basic_consume(
                queue=QUEUE_NAME, on_message_callback=_on_message, auto_ack=False
            )
            channel.basic_consume(
                queue=ERROR_QUEUE_NAME, on_message_callback=_on_error_message, auto_ack=False
            )
            LOG.info("Consuming queues=%s,%s exchange=%s", QUEUE_NAME, ERROR_QUEUE_NAME, AMQP_EXCHANGE)
            on_ready()
            channel.start_consuming()
        except Exception as e:
            if stop_event.is_set():
                break
            LOG.warning("Consumer reconnecting after error: %s", e)
            time.sleep(3)
