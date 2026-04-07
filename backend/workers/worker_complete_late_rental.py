"""
worker_complete_late_rental.py — Camunda job worker for: complete-rental-after-late
Scenario 2: Mark the rental COMPLETED after late fee is paid and reputation updated.

Calls rental-service POST /rental/{rentalId}/complete-after-late-payment
  → transitions LATE → COMPLETED (idempotent: COMPLETED → returns as-is)

This is the final step in the Scenario 2 success path.
"""
import asyncio
import os

import httpx
from pyzeebe import ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = os.environ.get("CAMUNDA_CLIENT_ID",     "AQazmsVXl7idqPlY1pMGm~Zh7Gv3Lgxk")
CAMUNDA_CLIENT_SECRET = os.environ.get("CAMUNDA_CLIENT_SECRET", "uH0.fzO7HfUxQ0FTlEe0DsBRe-WVgbxIq_BD0H8rpw422I.1Ig.jGZ~9JVZiU0R8")
CAMUNDA_CLUSTER_ID    = os.environ.get("CAMUNDA_CLUSTER_ID",    "db920878-5333-4352-b103-0803eb907686")
CAMUNDA_REGION        = os.environ.get("CAMUNDA_REGION",        "sin-2")

RENTAL_SERVICE_URL = os.environ.get("RENTAL_SERVICE_URL", "http://rental-service:8000")


async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION,
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="complete-rental-after-late")
    async def complete_rental_after_late(
        rentalId: str = "",
        **kwargs,
    ):
        print(f"[complete-rental-after-late] rentalId={rentalId}")
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{RENTAL_SERVICE_URL}/rental/{rentalId}/complete-after-late-payment"
            )
            if not resp.is_success:
                # 409 with "already COMPLETED" is acceptable (idempotent)
                body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                detail = body.get("detail", resp.text)
                if resp.status_code == 409 and "COMPLETED" in str(detail):
                    print(f"[complete-rental-after-late] Rental {rentalId} already COMPLETED — idempotent, continuing")
                else:
                    raise Exception(
                        f"[complete-rental-after-late] Rental service error {resp.status_code}: {detail}"
                    )
            else:
                print(f"[complete-rental-after-late] Rental {rentalId} marked COMPLETED")

        return {}

    print(f"Worker started: complete-rental-after-late → {RENTAL_SERVICE_URL}")
    await worker.work()


if __name__ == "__main__":
    asyncio.run(main())
