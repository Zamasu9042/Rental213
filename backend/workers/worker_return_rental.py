"""
worker_return_rental.py — Camunda job worker for: initiate-return
Scenario 2: Renter confirms return.

Steps:
  1. Calls rental-service PUT /rental/{rentalId}/return
     → transitions ACTIVE → RETURNED, sets equipment available, records return_timestamp
  2. Compares return_timestamp against end_time to determine if rental is late
  3. Returns { isLate, returnTimestamp, endTime } for the BPMN gateway
"""
import asyncio
import os
from datetime import datetime

import httpx
from pyzeebe import ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = os.environ.get("CAMUNDA_CLIENT_ID",     "AQazmsVXl7idqPlY1pMGm~Zh7Gv3Lgxk")
CAMUNDA_CLIENT_SECRET = os.environ.get("CAMUNDA_CLIENT_SECRET", "uH0.fzO7HfUxQ0FTlEe0DsBRe-WVgbxIq_BD0H8rpw422I.1Ig.jGZ~9JVZiU0R8")
CAMUNDA_CLUSTER_ID    = os.environ.get("CAMUNDA_CLUSTER_ID",    "db920878-5333-4352-b103-0803eb907686")
CAMUNDA_REGION        = os.environ.get("CAMUNDA_REGION",        "sin-2")

RENTAL_SERVICE_URL = os.environ.get("RENTAL_SERVICE_URL", "http://rental-service:8000")


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION,
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="initiate-return")
    async def initiate_return(
        rentalId: str = "",
        **kwargs,
    ):
        print(f"[initiate-return] rentalId={rentalId}")
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Mark rental as returned — rental service records return_timestamp = now
            resp = await client.put(f"{RENTAL_SERVICE_URL}/rental/{rentalId}/return")
            if not resp.is_success:
                raise Exception(
                    f"[initiate-return] Rental service error {resp.status_code}: {resp.text}"
                )
            rental = resp.json()

        return_ts_str = rental.get("return_timestamp")
        end_time_str  = rental.get("end_time")
        ret = _parse_dt(return_ts_str)
        due = _parse_dt(end_time_str)

        is_late = bool(ret and due and ret > due)
        print(f"[initiate-return] done — isLate={is_late} returnTs={return_ts_str} endTime={end_time_str}")
        return {
            "isLate":          is_late,
            "returnTimestamp": return_ts_str or "",
            "endTime":         end_time_str  or "",
        }

    print(f"Worker started: initiate-return → {RENTAL_SERVICE_URL}")
    await worker.work()


if __name__ == "__main__":
    asyncio.run(main())
