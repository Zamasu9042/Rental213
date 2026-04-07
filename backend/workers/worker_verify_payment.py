"""
worker_verify_payment.py — Camunda job worker for: verify-late-payment
Scenario 2: Verify that the late fee payment has been confirmed by Stripe.

This task runs AFTER the Camunda Intermediate Message Catch Event
"LatePaymentConfirmed" fires (triggered by payment-service via proxy).
It polls payment-service GET /payment/{latePaymentId} up to 3 times
to confirm status == "paid".

Returns { paymentVerified: true/false }.
The BPMN Exclusive Gateway uses paymentVerified to decide:
  - true  → apply reputation penalty → complete rental
  - false → revert rental to PENDING-state + notify renter to reattempt
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
MAX_POLL_ATTEMPTS   = 3
POLL_DELAY_SEC      = 2.0


async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION,
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="verify-late-payment")
    async def verify_late_payment(
        latePaymentId: str = "",
        **kwargs,
    ):
        print(f"[verify-late-payment] Polling payment status for paymentId={latePaymentId}")
        verified = False

        async with httpx.AsyncClient(timeout=15.0) as client:
            for attempt in range(1, MAX_POLL_ATTEMPTS + 1):
                try:
                    resp = await client.get(
                        f"{PAYMENT_SERVICE_URL}/payment/{latePaymentId}"
                    )
                    if resp.is_success:
                        data   = resp.json()
                        status = data.get("status", "")
                        print(f"[verify-late-payment] Attempt {attempt}/{MAX_POLL_ATTEMPTS}: status={status}")
                        if status == "paid":
                            verified = True
                            break
                    else:
                        print(f"[verify-late-payment] Attempt {attempt}: service error {resp.status_code}")
                except Exception as e:
                    print(f"[verify-late-payment] Attempt {attempt}: exception {e}")

                if attempt < MAX_POLL_ATTEMPTS:
                    await asyncio.sleep(POLL_DELAY_SEC)

        print(f"[verify-late-payment] Done — paymentVerified={verified}")
        return {"paymentVerified": verified}

    print(f"Worker started: verify-late-payment → {PAYMENT_SERVICE_URL}")
    await worker.work()


if __name__ == "__main__":
    asyncio.run(main())
