# Notification Service (ESD – Rental213)

**No HTTP endpoints.** This service only **subscribes to RabbitMQ**. When it receives a payment status message, it **sends SMS** (and optionally reconciliation). No database.

## Flow

1. **Order/Booking service** → POST Payment Details `{ID, RentalID, Amount, Type}` → **Payment Service**
2. **Payment Service** → publishes `{Status, Timestamp, ...}` → **RabbitMQ**
3. **RabbitMQ** → delivers message → **Notification Service** (this app)
4. **Notification Service** → sends SMS to the customer (and optionally reconciliation to another service)

## What it receives (from RabbitMQ only)

Messages on queue `payment.confirmations` (exchange `payments`, routing key `payment.status` or `payment.completed`). Payload: `{Status, Timestamp}` and optional `ID`, `RentalID`, `Amount`, `Type`, `user_email`, `user_phone`.

## What it does

- **Sends SMS** to `user_phone` (if Twilio is configured and phone is in the payload) – success or failure message.
- **Reconciliation:** If `RECONCILIATION_URL` is set, POSTs `{item, Rev, Status, Amount}` to that URL.

## Setup

1. Install dependencies:

   ```bash
   cd notification_service
   pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env`. Set `RABBITMQ_HOST` if the broker is on another machine. Set `TWILIO_*` to send SMS.

3. Ensure RabbitMQ is running.

## Run

```bash
python main.py
```

The service listens on queue `payment.confirmations` and sends SMS when it receives a message with `user_phone`.

## Payment Service: how to trigger notifications

Publish to RabbitMQ (exchange `payments`, routing key `payment.status`) from your Payment Service after processing payment. Example using the included publisher:

```python
from publisher import publish_payment_status

publish_payment_status(
    "success",
    payment_id="pay-123",
    rental_id="R-456",
    amount=99.00,
    type="rental",
    user_email="customer@example.com",
    user_phone="+6591234567",  # include for SMS
)
```

## Test

```bash
# Terminal 1: start the service
python main.py

# Terminal 2: publish a test payment status (add user_phone in publish_test_event.py to test SMS)
python publish_test_event.py
```

## SMS (Twilio)

1. Sign up at [twilio.com/try-twilio](https://www.twilio.com/try-twilio).
2. In `.env` set: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.
3. Include `user_phone` in the payload (e.g. `+6591234567`). The service sends SMS to that number on success/failure.

Without Twilio configured, the service still runs and only logs; SMS is skipped.
