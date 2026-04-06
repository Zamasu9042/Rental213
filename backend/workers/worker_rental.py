"""
workers/worker_rental.py
Camunda job worker for: create-rental-order
Calls: Rental Service (http://localhost:5002)
Run with: /opt/homebrew/bin/python3.11 worker_rental.py
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
        region=CAMUNDA_REGION" 
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="create-rental-order")
    async def create_rental_order(
        renterId: str,
        equipmentId: str,
        startTime: str,
        endTime: str,
        hourlyRate: float,
        pickUpLocation: str
    ):
        print(f"[create-rental-order] Creating order for renterId: {renterId}")
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{RENTAL_SERVICE_URL}/rentals",
                json={
                    "renterId":       renterId,
                    "equipmentId":    equipmentId,
                    "startTime":      startTime,
                    "endTime":        endTime,
                    "hourlyRate":     hourlyRate,
                    "pickUpLocation": pickUpLocation
                }
            )
            resp.raise_for_status()
            data = resp.json()
        print(f"[create-rental-order] Order created: {data['orderId']}")
        return {
            "orderId":            data["orderId"],
            "rentalConfirmation": data["rentalConfirmation"]
        }

    print("Starting worker: create-rental-order")
    await worker.work()

if __name__ == "__main__":
    asyncio.run(main())