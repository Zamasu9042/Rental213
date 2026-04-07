"""
worker_reputation_penalty.py — Camunda job worker for: apply-reputation-penalty
Scenario 2: Deduct reputation points from the renter for a late return.

Calls reputation-service PUT /reputation/deduct with:
  - user_id: the renter
  - points:  deduction amount (default 5 points for late return)

This runs AFTER payment is verified and BEFORE the rental is marked COMPLETED.
"""
import asyncio
import os

import httpx
from pyzeebe import ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = os.environ.get("CAMUNDA_CLIENT_ID",     "AQazmsVXl7idqPlY1pMGm~Zh7Gv3Lgxk")
CAMUNDA_CLIENT_SECRET = os.environ.get("CAMUNDA_CLIENT_SECRET", "uH0.fzO7HfUxQ0FTlEe0DsBRe-WVgbxIq_BD0H8rpw422I.1Ig.jGZ~9JVZiU0R8")
CAMUNDA_CLUSTER_ID    = os.environ.get("CAMUNDA_CLUSTER_ID",    "db920878-5333-4352-b103-0803eb907686")
CAMUNDA_REGION        = os.environ.get("CAMUNDA_REGION",        "sin-2")

REPUTATION_SERVICE_URL = os.environ.get("REPUTATION_SERVICE_URL", "http://reputation-microservice:8000")
LATE_RETURN_PENALTY    = float(os.environ.get("LATE_RETURN_PENALTY", "5"))


async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION,
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="apply-reputation-penalty")
    async def apply_reputation_penalty(
        renterId: str = "",
        rentalId: str = "",
        **kwargs,
    ):
        print(f"[apply-reputation-penalty] renterId={renterId} rentalId={rentalId} points={LATE_RETURN_PENALTY}")
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.put(
                f"{REPUTATION_SERVICE_URL}/reputation/deduct",
                json={"user_id": int(renterId), "points": LATE_RETURN_PENALTY},
            )
            if not resp.is_success:
                # Non-fatal: log and continue — reputation update should not block rental completion
                print(
                    f"[apply-reputation-penalty] Warning: reputation service error "
                    f"{resp.status_code}: {resp.text}"
                )
            else:
                print(f"[apply-reputation-penalty] Penalty applied — renterId={renterId} points={LATE_RETURN_PENALTY}")

        return {}

    print(f"Worker started: apply-reputation-penalty → {REPUTATION_SERVICE_URL}")
    await worker.work()


if __name__ == "__main__":
    asyncio.run(main())
