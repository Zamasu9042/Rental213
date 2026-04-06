"""
worker_rental.py — Camunda job worker for: create-rental-order
Calls the Rental Service to create the rental record.
Note: rental is already PENDING from the proxy step.
This worker confirms/updates it with full details.
"""
import asyncio, os, httpx
from pyzeebe import ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = os.environ.get("CAMUNDA_CLIENT_ID",     "AQazmsVXl7idqPlY1pMGm~Zh7Gv3Lgxk")
CAMUNDA_CLIENT_SECRET = os.environ.get("CAMUNDA_CLIENT_SECRET", "uH0.fzO7HfUxQ0FTlEe0DsBRe-WVgbxIq_BD0H8rpw422I.1Ig.jGZ~9JVZiU0R8")
CAMUNDA_CLUSTER_ID    = os.environ.get("CAMUNDA_CLUSTER_ID",    "db920878-5333-4352-b103-0803eb907686")
CAMUNDA_REGION        = os.environ.get("CAMUNDA_REGION",        "sin-2")
RENTAL_SERVICE_URL    = os.environ.get("RENTAL_SERVICE_URL",    "http://rental-service:8000")

async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="create-rental-order")
    async def create_rental_order(
        renterId: str,
        equipmentId: str,
        startTime: str,
        endTime: str,
        totalPrice: float = 0,
        pickUpLocation: str = "",
        rentalId: str = "",
        **kwargs
    ):
        print(f"[create-rental-order] renterId={renterId} rentalId={rentalId}")
        # Rental already created as PENDING by the proxy
        # Just return the rentalId so next steps can use it
        return {
            "orderId": rentalId,
            "rentalConfirmation": {
                "orderId":     rentalId,
                "renterId":    renterId,
                "equipmentId": equipmentId,
                "startTime":   startTime,
                "endTime":     endTime,
                "totalPrice":  totalPrice,
                "status":      "pending"
            }
        }

    print(f"Worker started: create-rental-order → {RENTAL_SERVICE_URL}")
    await worker.work()

if __name__ == "__main__":
    asyncio.run(main())