"""
worker_stripe.py — Camunda job worker for: redirect-to-stripe
The stripeRedirectUrl is already stored in the proxy's in-memory store.
This worker just confirms the step is complete.
"""
import asyncio, os
from pyzeebe import ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = os.environ.get("CAMUNDA_CLIENT_ID",     "AQazmsVXl7idqPlY1pMGm~Zh7Gv3Lgxk")
CAMUNDA_CLIENT_SECRET = os.environ.get("CAMUNDA_CLIENT_SECRET", "uH0.fzO7HfUxQ0FTlEe0DsBRe-WVgbxIq_BD0H8rpw422I.1Ig.jGZ~9JVZiU0R8")
CAMUNDA_CLUSTER_ID    = os.environ.get("CAMUNDA_CLUSTER_ID",    "db920878-5333-4352-b103-0803eb907686")
CAMUNDA_REGION        = os.environ.get("CAMUNDA_REGION",        "sin-2")

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
        stripeRedirectUrl: str = "",
        renterId: str = "",
        orderId: str = "",
        **kwargs
    ):
        print(f"[redirect-to-stripe] orderId={orderId} url={stripeRedirectUrl}")
        # URL already stored in proxy memory — just complete the step
        return {}

    print("Worker started: redirect-to-stripe")
    await worker.work()

if __name__ == "__main__":
    asyncio.run(main())