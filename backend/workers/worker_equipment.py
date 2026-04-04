"""
workers/worker_equipment.py
Camunda job worker for: update-equipment-status
Calls: Equipment Service (http://localhost:5003)
Run with: /opt/homebrew/bin/python3.11 worker_equipment.py
"""

import asyncio
import httpx
from pyzeebe import ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = "YOUR_CLIENT_ID"
CAMUNDA_CLIENT_SECRET = "YOUR_CLIENT_SECRET"
CAMUNDA_CLUSTER_ID    = "YOUR_CLUSTER_ID"
CAMUNDA_REGION        = "ont-1"

EQUIPMENT_SERVICE_URL = "http://localhost:5003"

async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="update-equipment-status")
    async def update_equipment_status(equipmentId: str):
        print(f"[update-equipment-status] Marking equipment {equipmentId} as Pending")
        async with httpx.AsyncClient() as client:
            resp = await client.put(
                f"{EQUIPMENT_SERVICE_URL}/equipment/{equipmentId}/status",
                json={"status": "Pending"}
            )
            resp.raise_for_status()
        print(f"[update-equipment-status] Equipment {equipmentId} updated")
        return {}

    print("Starting worker: update-equipment-status")
    await worker.work()

if __name__ == "__main__":
    asyncio.run(main())