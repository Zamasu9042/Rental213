"""
worker_initiate_payment.py
Job type: initiate-payment
Scenario 1: This is where the REAL work happens.

Steps:
  1. Creates the rental record in rental-service (PENDING)
  2. Calls payment-service to create Stripe checkout session
  3. Registers the Stripe URL back to camunda-proxy
     so the frontend polling /api/rentals/:key/stripe-url gets a response

This replaces what the old proxy was doing directly.
Camunda is now the true orchestrator.

FIX (Issue 5):
  process_key was extracted via kwargs.get("__job", {}).get("processInstanceKey", "unknown")
  which always returned "unknown" — pyzeebe does NOT pass the job as kwargs["__job"].
  The correct way is to declare `job: Job` as an explicit parameter; pyzeebe injects it.
  Without this fix every rental maps to the same "unknown" key in the proxy's stripeStore,
  so the frontend polling /stripe-url always gets back the wrong (or a stale) URL.
"""
import asyncio
import os

import httpx
from pyzeebe import Job, ZeebeWorker, create_camunda_cloud_channel

CAMUNDA_CLIENT_ID     = os.environ.get("CAMUNDA_CLIENT_ID",     "")
CAMUNDA_CLIENT_SECRET = os.environ.get("CAMUNDA_CLIENT_SECRET", "")
CAMUNDA_CLUSTER_ID    = os.environ.get("CAMUNDA_CLUSTER_ID",    "")
CAMUNDA_REGION        = os.environ.get("CAMUNDA_REGION",        "sin-2")

RENTAL_SERVICE_URL  = os.environ.get("RENTAL_SERVICE_URL",  "http://rental-service:8000")
PAYMENT_SERVICE_URL = os.environ.get("PAYMENT_SERVICE_URL", "http://payment-service:8000")
PROXY_URL           = os.environ.get("PROXY_URL",           "http://camunda-proxy:3001")
FRONTEND_URL        = os.environ.get("FRONTEND_URL",        "http://localhost:5173")


async def main():
    channel = create_camunda_cloud_channel(
        client_id=CAMUNDA_CLIENT_ID,
        client_secret=CAMUNDA_CLIENT_SECRET,
        cluster_id=CAMUNDA_CLUSTER_ID,
        region=CAMUNDA_REGION,
    )
    worker = ZeebeWorker(channel)

    @worker.task(task_type="initiate-payment")
    async def initiate_payment(
        # FIX (Issue 5): declare `job: Job` explicitly — pyzeebe injects the full
        # job object here. This is the only supported way to get processInstanceKey.
        # The old kwargs.get("__job", {}) pattern always returned "unknown".
        job: Job,
        renterId: str = "",
        equipmentId: str = "",
        startTime: str = "",
        endTime: str = "",
        totalPrice: float = 0,
        pickUpLocation: str = "",
        frontendUrl: str = "",
        **kwargs,
    ):
        # Correct extraction of processInstanceKey from the injected Job object
        process_key = str(job.process_instance_key)
        print(
            f"[initiate-payment] Starting — renterId={renterId} "
            f"equipmentId={equipmentId} processKey={process_key}"
        )

        frontend = frontendUrl or FRONTEND_URL

        async with httpx.AsyncClient(timeout=30.0) as client:

            # ── Step 1: Create rental record (PENDING) in rental-service ──────
            print("[initiate-payment] Creating rental in rental-service")
            rental_resp = await client.post(
                f"{RENTAL_SERVICE_URL}/rental",
                json={
                    "renter_id":     int(renterId),
                    "equipment_id":  int(equipmentId),
                    "start_time":    startTime,
                    "end_time":      endTime,
                    "checkout_mode": "pending_payment",
                },
            )
            if not rental_resp.is_success:
                raise Exception(
                    f"Rental service error {rental_resp.status_code}: {rental_resp.text}"
                )
            rental   = rental_resp.json()
            rentalId = str(rental["id"])
            print(f"[initiate-payment] Rental created: id={rentalId}")

            # ── Step 2: Create Stripe checkout session via payment-service ────
            print("[initiate-payment] Creating Stripe session in payment-service")
            pay_resp = await client.post(
                f"{PAYMENT_SERVICE_URL}/payment/payrental",
                json={
                    "rental_id": int(rentalId),
                    "renter_id": int(renterId),
                    "amount":    float(totalPrice),
                    "item_name": f"Equipment Rental #{rentalId}",
                },
            )
            # 409 = payment row already exists (e.g. worker retried) — the fixed
            # pay_rental endpoint in payment-service now returns the existing
            # checkout_url in this case, so a second POST is no longer needed.
            if not pay_resp.is_success:
                raise Exception(
                    f"Payment service error {pay_resp.status_code}: {pay_resp.text}"
                )

            pay_data   = pay_resp.json()
            payment_id = str(pay_data.get("paymentID", ""))
            stripe_url = pay_data.get("checkout_url") or f"{frontend}/marketplace"
            print(f"[initiate-payment] Stripe session created: paymentId={payment_id}")

            # ── Step 3: Register Stripe URL back to proxy for frontend polling ─
            print("[initiate-payment] Registering Stripe URL to proxy")
            try:
                reg_resp = await client.post(
                    f"{PROXY_URL}/internal/stripe-url",
                    json={
                        "processInstanceKey": process_key,
                        "stripeUrl":          stripe_url,
                        "rentalId":           rentalId,
                    },
                )
                if reg_resp.is_success:
                    print("[initiate-payment] Stripe URL registered OK")
                else:
                    print(
                        f"[initiate-payment] Warning: could not register URL: {reg_resp.text}"
                    )
            except Exception as e:
                print(f"[initiate-payment] Warning: proxy registration failed: {e}")

        print(f"[initiate-payment] Done — rentalId={rentalId} paymentId={payment_id}")
        return {
            "rentalId":          rentalId,
            "paymentSessionId":  payment_id,
            "stripeRedirectUrl": stripe_url,
        }

    print("Worker started: initiate-payment")
    print(f"  Rental service:  {RENTAL_SERVICE_URL}")
    print(f"  Payment service: {PAYMENT_SERVICE_URL}")
    print(f"  Proxy:           {PROXY_URL}")
    await worker.work()


if __name__ == "__main__":
    asyncio.run(main())