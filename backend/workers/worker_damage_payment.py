"""
worker_damage_payment.py
Job type: create-damage-payment

Scenario 3 — Task 2 in damage-claim-workflow.
Calls payment-service to create a Stripe Checkout session for the renter
to pay the approved damage fee.
"""
import asyncio
import os

import httpx
from pyzeebe import Job, ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = os.environ.get("CAMUNDA_CLIENT_ID",     "")
CAMUNDA_CLIENT_SECRET = os.environ.get("CAMUNDA_CLIENT_SECRET", "")
CAMUNDA_CLUSTER_ID    = os.environ.get("CAMUNDA_CLUSTER_ID",    "")
CAMUNDA_REGION        = os.environ.get("CAMUNDA_REGION",        "sin-2")
PAYMENT_SERVICE_URL   = os.environ.get("PAYMENT_SERVICE_URL",   "http://payment-service:8000")
FRONTEND_URL          = os.environ.get("FRONTEND_URL",          "http://localhost:5173")


async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION,
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="create-damage-payment")
    async def create_damage_payment(
        job: Job,
        claimId: str = "",
        renterId: str = "",
        rentalId: str = "",
        damageAmount: float = 0.0,
        **kwargs,
    ):
        print(
            f"[create-damage-payment] "
            f"claimId={claimId} renterId={renterId} "
            f"rentalId={rentalId} amount={damageAmount}"
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{PAYMENT_SERVICE_URL}/payment/damage",
                json={
                    "rental_id":    int(rentalId),
                    "renter_id":    int(renterId),
                    "claim_id":     int(claimId),
                    "amount":       float(damageAmount),
                    "item_name":    f"Damage fee — claim #{claimId}",
                },
            )
            if not resp.is_success:
                raise Exception(
                    f"Payment service error {resp.status_code}: {resp.text}"
                )

        pay_data   = resp.json()
        payment_id = str(pay_data.get("paymentID", ""))
        checkout_url = pay_data.get("checkout_url", "")
        print(f"[create-damage-payment] done — paymentId={payment_id}")
        return {
            "damagePaymentId":  payment_id,
            "damageCheckoutUrl": checkout_url,
        }

    print("Worker started: create-damage-payment")
    print(f"  Payment service: {PAYMENT_SERVICE_URL}")
    await worker.work()


if __name__ == "__main__":
    asyncio.run(main())
