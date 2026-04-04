"""
workers/worker_stripe.py
Camunda job worker for: redirect-to-stripe
Writes stripeRedirectUrl to Rental Service DB.
Run with: /opt/homebrew/bin/python3.11 worker_stripe.py
"""

import asyncio
import httpx
from pyzeebe import ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = "YOUR_CLIENT_ID"
CAMUNDA_CLIENT_SECRET = "YOUR_CLIENT_SECRET"
CAMUNDA_CLUSTER_ID    = "YOUR_CLUSTER_ID"
CAMUNDA_REGION        = "ont-1"

RENTAL_SERVICE_URL = "http://localhost:5002"

async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="redirect-to-stripe")
    async def redirect_to_stripe(
        stripeRedirectUrl: str,
        renterId: str,
        orderId: str
    ):
        print(f"[redirect-to-stripe] Writing Stripe URL for orderId: {orderId}")
        async with httpx.AsyncClient() as client:
            resp = await client.put(
                f"{RENTAL_SERVICE_URL}/rentals/{orderId}/stripe-url",
                json={"stripeRedirectUrl": stripeRedirectUrl}
            )
            resp.raise_for_status()
        print(f"[redirect-to-stripe] Stripe URL stored successfully")
        return {}

    print("Starting worker: redirect-to-stripe")
    await worker.work()

if __name__ == "__main__":
    asyncio.run(main())