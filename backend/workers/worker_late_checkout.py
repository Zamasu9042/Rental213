"""
worker_late_checkout.py — Camunda job worker for: initiate-late-fee-checkout
Scenario 2: Create a Stripe checkout session for the unpaid late fee.

Steps:
  1. Calls payment-service POST /payment/outstanding/{latePaymentId}/checkout
     → creates a Stripe Checkout session
  2. Registers the checkout URL to camunda-proxy
     → frontend polls GET /api/return/:processInstanceKey/checkout-url until URL is ready
  3. Returns { lateCheckoutUrl } so it's also stored as a Camunda process variable

Uses job.process_instance_key (like worker_initiate_payment.py) to register the URL
against the correct process instance in the proxy's in-memory store.
"""
import asyncio
import os

import httpx
from pyzeebe import Job, ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = os.environ.get("CAMUNDA_CLIENT_ID",     "AQazmsVXl7idqPlY1pMGm~Zh7Gv3Lgxk")
CAMUNDA_CLIENT_SECRET = os.environ.get("CAMUNDA_CLIENT_SECRET", "uH0.fzO7HfUxQ0FTlEe0DsBRe-WVgbxIq_BD0H8rpw422I.1Ig.jGZ~9JVZiU0R8")
CAMUNDA_CLUSTER_ID    = os.environ.get("CAMUNDA_CLUSTER_ID",    "db920878-5333-4352-b103-0803eb907686")
CAMUNDA_REGION        = os.environ.get("CAMUNDA_REGION",        "sin-2")

PAYMENT_SERVICE_URL = os.environ.get("PAYMENT_SERVICE_URL", "http://payment-service:8000")
PROXY_URL           = os.environ.get("PROXY_URL",           "http://camunda-proxy:3001")
FRONTEND_URL        = os.environ.get("FRONTEND_URL",        "http://localhost:5173")


async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION,
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="initiate-late-fee-checkout")
    async def initiate_late_fee_checkout(
        job: Job,
        latePaymentId: str = "",
        rentalId:      str = "",
        **kwargs,
    ):
        process_key = str(job.process_instance_key)
        print(f"[initiate-late-fee-checkout] latePaymentId={latePaymentId} processKey={process_key}")

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Create Stripe checkout session for the late fee
            resp = await client.post(
                f"{PAYMENT_SERVICE_URL}/payment/outstanding/{latePaymentId}/checkout"
            )
            if not resp.is_success:
                raise Exception(
                    f"[initiate-late-fee-checkout] Payment service error {resp.status_code}: {resp.text}"
                )
            data = resp.json()
            checkout_url = data.get("checkout_url") or f"{FRONTEND_URL}/my-rentals?filter=payment-due"
            print(f"[initiate-late-fee-checkout] Stripe session created: url={checkout_url[:60]}...")

            # Register the checkout URL to the proxy for frontend polling
            try:
                reg_resp = await client.post(
                    f"{PROXY_URL}/internal/late-checkout-url",
                    json={
                        "processInstanceKey": process_key,
                        "checkoutUrl":        checkout_url,
                        "rentalId":           rentalId,
                    },
                )
                if reg_resp.is_success:
                    print("[initiate-late-fee-checkout] Checkout URL registered to proxy OK")
                else:
                    print(f"[initiate-late-fee-checkout] Warning: could not register URL: {reg_resp.text}")
            except Exception as e:
                print(f"[initiate-late-fee-checkout] Warning: proxy registration failed: {e}")

        print(f"[initiate-late-fee-checkout] Done — lateCheckoutUrl registered")
        return {"lateCheckoutUrl": checkout_url}

    print(f"Worker started: initiate-late-fee-checkout → {PAYMENT_SERVICE_URL}")
    await worker.work()


if __name__ == "__main__":
    asyncio.run(main())
