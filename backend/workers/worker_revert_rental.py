"""
worker_revert_rental.py — Camunda job worker for: revert-rental-status
Scenario 2 compensating actions:

  Case A — late fee recording failed:
    RETURNED → ACTIVE (rental-service POST /rental/{id}/revert-to-active)
    Equipment is also marked 'rented' again.

  Case B — payment not verified after polling:
    Rental stays LATE (renter must still pay).
    Worker is a no-op for rental state; notification handled by worker_notify_error.py.

targetStatus variable (from BPMN) controls behaviour:
  "active"  → case A (revert RETURNED → ACTIVE)
  "late"    → case B (no-op, just log)
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

    @worker.task(task_type="revert-rental-status")
    async def revert_rental_status(
        rentalId:     str = "",
        targetStatus: str = "active",
        **kwargs,
    ):
        print(f"[revert-rental-status] rentalId={rentalId} targetStatus={targetStatus}")

        if targetStatus == "active":
            # Compensation: late fee recording failed → revert RETURNED → ACTIVE
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{RENTAL_SERVICE_URL}/rental/{rentalId}/revert-to-active"
                )
                if not resp.is_success:
                    # Log but do not fail — we've already failed on the main path
                    print(
                        f"[revert-rental-status] Warning: revert failed "
                        f"{resp.status_code}: {resp.text}"
                    )
                else:
                    print(f"[revert-rental-status] Rental {rentalId} reverted to ACTIVE")
        else:
            # Case B: rental stays LATE; nothing to revert
            print(f"[revert-rental-status] targetStatus={targetStatus} — no rental state change")

        return {}

    print(f"Worker started: revert-rental-status → {RENTAL_SERVICE_URL}")
    await worker.work()


if __name__ == "__main__":
    asyncio.run(main())
