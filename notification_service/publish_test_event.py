"""Publish a test payment status to RabbitMQ (for testing the Notification Service)."""
from publisher import publish_payment_status

# Flow: Payment Service sends message on the status of the payment {Status, Timestamp}
# Optional: ID, RentalID, Amount, Type (from Post Payment Details)
publish_payment_status(
    "success",
    payment_id="pay-test-001",
    rental_id="R-001",
    amount=99.00,
    type="rental",
    user_email="customer@example.com",
)
print("Published test event: Status=success, Timestamp=<now>, ID=pay-test-001, RentalID=R-001, Amount=99.00, Type=rental")
