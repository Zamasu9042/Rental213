"""
worker_record_late_fee.py — Camunda job worker for: record-late-fee
Scenario 2: Record the late fee and mark the rental LATE.

Calls payment-service POST /payment/outstanding which:
  - Calculates late fee amount (hours_late × hourly_rate)
  - Creates an 'unpaid' payment row of type 'late'
  - Calls rental-service POST /rental/{id}/mark-late (RETURNED → LATE)

Returns { latePaymentId, lateAmount } for downstream tasks.

On failure, the BPMN should route to the compensation flow:
  worker_revert_rental.py → worker_notify_error.py
"""
import asyncio
import os

import httpx
from pyzeebe import ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = os.environ.get("CAMUNDA_CLIENT_ID",     "AQazmsVXl7idqPlY1pMGm~Zh7Gv3Lgxk")
CAMUNDA_CLIENT_SECRET = os.environ.get("CAMUNDA_CLIENT_SECRET", "uH0.fzO7HfUxQ0FTlEe0DsBRe-WVgbxIq_BD0H8rpw422I.1Ig.jGZ~9JVZiU0R8")
CAMUNDA_CLUSTER_ID    = os.environ.get("CAMUNDA_CLUSTER_ID",    "db920878-5333-4352-b103-0803eb907686")
CAMUNDA_REGION        = os.environ.get("CAMUNDA_REGION",        "sin-2")

PAYMENT_SERVICE_URL = os.environ.get("PAYMENT_SERVICE_URL", "http://payment-service:8000")


async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION,
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="record-late-fee")
    async def record_late_fee(
        rentalId:        str = "",
        returnTimestamp: str = "",
        **kwargs,
    ):
        print(f"[record-late-fee] rentalId={rentalId} returnTimestamp={returnTimestamp}")
        async with httpx.AsyncClient(timeout=30.0) as client:
            body: dict = {"rental_id": int(rentalId)}
            if returnTimestamp:
                body["return_timestamp"] = returnTimestamp

            resp = await client.post(
                f"{PAYMENT_SERVICE_URL}/payment/outstanding",
                json=body,
            )
            if not resp.is_success:
                raise Exception(
                    f"[record-late-fee] Payment service error {resp.status_code}: {resp.text}"
                )
            data = resp.json()

        late_payment_id = str(data.get("paymentID", ""))
        late_amount     = float(data.get("amount", 0))
        print(f"[record-late-fee] done — latePaymentId={late_payment_id} amount={late_amount}")
        return {
            "latePaymentId": late_payment_id,
            "lateAmount":    late_amount,
        }

    print(f"Worker started: record-late-fee → {PAYMENT_SERVICE_URL}")
    await worker.work()


if __name__ == "__main__":
    asyncio.run(main())
