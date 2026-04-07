"""
workers/worker_account.py
Camunda job worker for: get-account-info
Calls: Account Info Service (http://localhost:5001)
Run with: /opt/homebrew/bin/python3.11 worker_account.py
"""

import asyncio
import httpx
from pyzeebe import ZeebeWorker, create_camunda_cloud_channel
import grpc

CAMUNDA_CLIENT_ID     = "AQazmsVXl7idqPlY1pMGm~Zh7Gv3Lgxk"
CAMUNDA_CLIENT_SECRET = "uH0.fzO7HfUxQ0FTlEe0DsBRe-WVgbxIq_BD0H8rpw422I.1Ig.jGZ~9JVZiU0R8"
CAMUNDA_CLUSTER_ID    = "db920878-5333-4352-b103-0803eb907686"
CAMUNDA_REGION        = "sin-2"

ACCOUNT_SERVICE_URL = "http://localhost:8006"

async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION 
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="get-account-info")
    async def get_account_info(renterId: str):
        print(f"[get-account-info] Fetching account for renterId: {renterId}")
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{ACCOUNT_SERVICE_URL}/account/{renterId}")
            resp.raise_for_status()
            data = resp.json()
        print(f"[get-account-info] Got account: {data}")
        return {"accountInfo": data["accountInfo"]}

    print("Starting worker: get-account-info")
    await worker.work()

if __name__ == "__main__":
    asyncio.run(main())