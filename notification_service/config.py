"""Configuration for Notification Service (no database)."""
import os
from dotenv import load_dotenv

load_dotenv()

# RabbitMQ - use different host when running on another machine
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", "5672"))
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "guest")
RABBITMQ_PASSWORD = os.getenv("RABBITMQ_PASSWORD", "guest")
RABBITMQ_VHOST = os.getenv("RABBITMQ_VHOST", "/")

# Queue / exchange used for payment events (must match publisher)
PAYMENT_QUEUE = os.getenv("PAYMENT_QUEUE", "payment.confirmations")
PAYMENT_EXCHANGE = os.getenv("PAYMENT_EXCHANGE", "payments")

# Reconciliation: Notification Service sends to another service (optional URL)
RECONCILIATION_URL = os.getenv("RECONCILIATION_URL", "")

# SMS via Twilio (optional – get credentials at twilio.com; add phone to payload as user_phone)
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")  # Your Twilio number, e.g. +1234567890
