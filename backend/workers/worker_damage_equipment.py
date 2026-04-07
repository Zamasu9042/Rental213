"""
worker_damage_equipment.py
Job type: update-equipment-status-damage

Scenario 3 — Task 1 in damage-claim-workflow.
Updates equipment status to under_repair after claim is fully approved.
"""
import asyncio
import os

import httpx
from pyzeebe import Job, ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = os.environ.get("CAMUNDA_CLIENT_ID",     "")
CAMUNDA_CLIENT_SECRET = os.environ.get("CAMUNDA_CLIENT_SECRET", "")
CAMUNDA_CLUSTER_ID    = os.environ.get("CAMUNDA_CLUSTER_ID",    "")
CAMUNDA_REGION        = os.environ.get("CAMUNDA_REGION",        "sin-2")
EQUIPMENT_SERVICE_URL = os.environ.get("EQUIPMENT_SERVICE_URL", "http://equipment-service:8000")


async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION,
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="update-equipment-status-damage")
    async def update_equipment_status_damage(
        job: Job,
        equipmentId: str = "",
        claimId: str = "",
        **kwargs,
    ):
        print(
            f"[update-equipment-status-damage] "
            f"claimId={claimId} equipmentId={equipmentId} → under_repair"
        )
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.put(
                f"{EQUIPMENT_SERVICE_URL}/equipment/{equipmentId}",
                json={"status": "under_repair"},
            )
            resp.raise_for_status()
        print(f"[update-equipment-status-damage] done")
        return {"equipmentStatus": "under_repair"}

    print("Worker started: update-equipment-status-damage")
    print(f"  Equipment service: {EQUIPMENT_SERVICE_URL}")
    await worker.work()


if __name__ == "__main__":
    asyncio.run(main())
