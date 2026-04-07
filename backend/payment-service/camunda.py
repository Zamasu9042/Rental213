"""
camunda.py — sends a Camunda message to resume a waiting process instance.

After Stripe webhook confirms payment, payment-service publishes a
"PaymentConfirmed" message correlated by rental_id so the BPMN
intermediate catch event can resume and proceed to Update equipment status.
"""
import logging
import os

import httpx

LOG = logging.getLogger("payment_camunda")

CAMUNDA_CLIENT_ID     = os.getenv("CAMUNDA_CLIENT_ID", "")
CAMUNDA_CLIENT_SECRET = os.getenv("CAMUNDA_CLIENT_SECRET", "")
CAMUNDA_CLUSTER_ID    = os.getenv("CAMUNDA_CLUSTER_ID", "")
CAMUNDA_REGION        = os.getenv("CAMUNDA_REGION", "sin-2")

TOKEN_URL    = "https://login.cloud.camunda.io/oauth/token"
CAMUNDA_BASE = f"https://{CAMUNDA_REGION}.zeebe.camunda.io:443/{CAMUNDA_CLUSTER_ID}/v2"

_token_cache: dict = {}


def _get_token() -> str | None:
    if not CAMUNDA_CLIENT_ID or not CAMUNDA_CLIENT_SECRET:
        return None
    import time
    if _token_cache.get("token") and time.time() < _token_cache.get("expires_at", 0) - 30:
        return _token_cache["token"]
    resp = httpx.post(TOKEN_URL, data={
        "grant_type":    "client_credentials",
        "client_id":     CAMUNDA_CLIENT_ID,
        "client_secret": CAMUNDA_CLIENT_SECRET,
        "audience":      "zeebe.camunda.io",
    }, timeout=10.0)
    if not resp.is_success:
        LOG.warning("Camunda token fetch failed: %s", resp.text)
        return None
    data = resp.json()
    import time
    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = time.time() + data.get("expires_in", 300)
    return _token_cache["token"]


def publish_payment_confirmed_message(rental_id: int) -> None:
    """
    Publishes a 'PaymentConfirmed' message to Camunda correlated by rental_id.
    The BPMN intermediate catch event with correlationKey = rentalId will resume.
    """
    token = _get_token()
    if not token:
        LOG.warning("Camunda not configured — skipping message publish for rental %s", rental_id)
        return

    try:
        resp = httpx.post(
            f"{CAMUNDA_BASE}/messages/publication",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "messageName":    "PaymentConfirmed",
                "correlationKey": str(rental_id),
                "timeToLive":     300000,  # 5 minutes TTL
            },
            timeout=10.0,
        )
        if resp.is_success:
            LOG.info("Camunda PaymentConfirmed message sent for rental %s", rental_id)
        else:
            LOG.warning("Camunda message publish failed for rental %s: %s", rental_id, resp.text)
    except Exception as e:
        LOG.warning("Could not send Camunda message for rental %s: %s", rental_id, e)
