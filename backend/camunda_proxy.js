/**
 * camunda_proxy.js — Lean orchestration proxy
 *
 * Responsibility:
 *   1. POST /api/rentals  → starts Camunda rental-workflow with variables
 *                           Workers do ALL the actual work:
 *                           - worker_account.py    → get account info
 *                           - worker_initiate_payment.py → create rental + Stripe session
 *                           - worker_equipment.py  → mark equipment rented
 *                           - worker_rabbitmq.py   → publish to RabbitMQ → Twilio SMS
 *
 *   2. GET /api/rentals/:key/stripe-url
 *                         → frontend polls this until Stripe URL is ready
 *                           (worker_initiate_payment.py writes it here after
 *                            calling payment-service)
 *
 *   3. POST /webhook/stripe → Stripe calls this after payment
 *                           → verifies signature here, then forwards the raw
 *                             event to payment-service/payment/internal-webhook
 *                             (no re-verification needed there)
 *
 * The KEY difference from before:
 *   - Proxy NO LONGER creates the rental itself
 *   - Proxy NO LONGER creates the Stripe session itself
 *   - Camunda workers do all of that
 *   - Proxy just starts the process and returns processInstanceKey
 *
 * FIXES applied vs original:
 *   1. Added: import Stripe from "stripe"  (was missing — ReferenceError on startup)
 *   2. Webhook now forwards to /payment/internal-webhook instead of /payment/webhook
 *      to avoid double signature verification (proxy verifies; payment-service trusts)
 */

import express from "express";
import cors from "cors";
// FIX 1: Stripe must be imported — it is a class, not a global.
import Stripe from "stripe";

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "*" }));

// ─── Stripe (for webhook verification only) ───────────────────────────────────
const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY     || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
// FIX 1 (continued): new Stripe(...) now works because the import exists above.
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" }) : null;

// ─── Service URLs ─────────────────────────────────────────────────────────────
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || "http://payment-service:8000";
const FRONTEND_URL        = process.env.FRONTEND_URL        || "http://localhost:5173";

// ─── Camunda credentials ──────────────────────────────────────────────────────
const CAMUNDA_CLIENT_ID     = process.env.CAMUNDA_CLIENT_ID     || "";
const CAMUNDA_CLIENT_SECRET = process.env.CAMUNDA_CLIENT_SECRET || "";
const CAMUNDA_CLUSTER_ID    = process.env.CAMUNDA_CLUSTER_ID    || "";
const CAMUNDA_REGION        = process.env.CAMUNDA_REGION        || "sin-2";
const CAMUNDA_BASE_URL      = `https://${CAMUNDA_REGION}.zeebe.camunda.io:443/${CAMUNDA_CLUSTER_ID}/v2`;
const TOKEN_URL             = "https://login.cloud.camunda.io/oauth/token";

// ─── Token cache ──────────────────────────────────────────────────────────────
let tokenCache = { accessToken: null, expiresAt: 0 };

async function getAccessToken() {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 30_000) {
    return tokenCache.accessToken;
  }
  const params = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     CAMUNDA_CLIENT_ID,
    client_secret: CAMUNDA_CLIENT_SECRET,
    audience:      "zeebe.camunda.io",
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!resp.ok) throw new Error(`Camunda token fetch failed: ${await resp.text()}`);
  const data = await resp.json();
  tokenCache.accessToken = data.access_token;
  tokenCache.expiresAt   = Date.now() + (data.expires_in || 300) * 1000;
  return tokenCache.accessToken;
}

// ─── In-memory store: processInstanceKey → { stripeUrl, rentalId } ───────────
// worker_initiate_payment.py writes here after creating the Stripe session
const stripeStore = new Map();

// Allow workers to register the Stripe URL after they create it
app.post("/internal/stripe-url", express.json(), (req, res) => {
  const { processInstanceKey, stripeUrl, rentalId } = req.body;
  if (!processInstanceKey || !stripeUrl) {
    return res.status(400).json({ error: "processInstanceKey and stripeUrl required" });
  }
  stripeStore.set(String(processInstanceKey), { stripeUrl, rentalId });
  console.log(`[proxy] Stripe URL registered for key=${processInstanceKey}`);
  return res.json({ ok: true });
});

// ─── Scenario 2: in-memory stores for return workflow ─────────────────────────
// processInstanceKey → { checkoutUrl, rentalId }
const lateCheckoutStore = new Map();
// rentalId (string) → processInstanceKey (string)
const rentalToProcessKey = new Map();

// Worker registers the late-fee Stripe checkout URL
app.post("/internal/late-checkout-url", express.json(), (req, res) => {
  const { processInstanceKey, checkoutUrl, rentalId } = req.body;
  if (!processInstanceKey || !checkoutUrl) {
    return res.status(400).json({ error: "processInstanceKey and checkoutUrl required" });
  }
  lateCheckoutStore.set(String(processInstanceKey), { checkoutUrl, rentalId });
  if (rentalId) rentalToProcessKey.set(String(rentalId), String(processInstanceKey));
  console.log(`[proxy] Late checkout URL registered for key=${processInstanceKey}`);
  return res.json({ ok: true });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/rentals
 * Called by frontend when user confirms rental.
 * Just starts the Camunda process — workers do all the work.
 *
 * Body: { renterId, equipmentId, startTime, endTime, totalPrice, pickUpLocation }
 * Returns: { processInstanceKey, status: "started" }
 */
app.post("/api/rentals", express.json(), async (req, res) => {
  const { renterId, equipmentId, startTime, endTime, totalPrice, pickUpLocation } = req.body;

  const missing = ["renterId", "equipmentId", "startTime", "endTime", "totalPrice"]
    .filter(f => req.body[f] == null);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }

  try {
    // Start Camunda process — pass all variables workers will need
    const token = await getAccessToken();
    const resp = await fetch(`${CAMUNDA_BASE_URL}/process-instances`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        processDefinitionId: "rental-workflow",
        variables: {
          renterId:       String(renterId),
          equipmentId:    String(equipmentId),
          startTime,
          endTime,
          totalPrice:     Number(totalPrice),
          pickUpLocation: pickUpLocation || "",
          frontendUrl:    FRONTEND_URL,
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("[proxy] Camunda start failed:", err);
      return res.status(502).json({ error: "Failed to start Camunda process", detail: err });
    }

    const data = await resp.json();
    const processInstanceKey = String(data.processInstanceKey || data.key);
    console.log(`[proxy] Camunda process started: key=${processInstanceKey}`);

    return res.status(201).json({
      processInstanceKey,
      status: "started",
    });

  } catch (err) {
    console.error("[proxy] POST /api/rentals error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/rentals/:processInstanceKey/stripe-url
 * Frontend polls this every 2s waiting for worker_initiate_payment.py
 * to finish creating the Stripe session and register the URL.
 */
app.get("/api/rentals/:processInstanceKey/stripe-url", (req, res) => {
  const entry = stripeStore.get(req.params.processInstanceKey);
  if (entry?.stripeUrl) {
    return res.json({ stripeRedirectUrl: entry.stripeUrl });
  }
  return res.status(202).json({ stripeRedirectUrl: null });
});

/**
 * GET /api/rentals
 * Returns empty list — rental data lives in rental-service.
 */
app.get("/api/rentals", (_req, res) => res.json([]));

// ─── Scenario 2: Return workflow ──────────────────────────────────────────────

/**
 * POST /api/return
 * Called by frontend when renter confirms item return.
 * Starts the Camunda return-workflow. Workers do all the work:
 *   - worker_return_rental.py    → mark rental returned, detect if late
 *   - worker_account.py          → get renter account info
 *   - worker_record_late_fee.py  → record late fee in payment service
 *   - worker_late_checkout.py    → create Stripe checkout for late fee
 *   - worker_verify_payment.py   → verify payment confirmed (after webhook)
 *   - worker_reputation_penalty.py → apply late return penalty
 *   - worker_complete_late_rental.py → mark rental completed
 *
 * Body: { renterId, rentalId, equipmentId }
 * Returns: { processInstanceKey, status: "started" }
 */
app.post("/api/return", express.json(), async (req, res) => {
  const { renterId, rentalId, equipmentId } = req.body;
  const missing = ["renterId", "rentalId"].filter(f => req.body[f] == null);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }

  try {
    const token = await getAccessToken();
    const resp = await fetch(`${CAMUNDA_BASE_URL}/process-instances`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        processDefinitionId: "return-workflow",
        variables: {
          renterId:    String(renterId),
          rentalId:    String(rentalId),
          equipmentId: String(equipmentId || ""),
          frontendUrl: FRONTEND_URL,
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("[proxy] Camunda return-workflow start failed:", err);
      return res.status(502).json({ error: "Failed to start return workflow", detail: err });
    }

    const data = await resp.json();
    const processInstanceKey = String(data.processInstanceKey || data.key);
    rentalToProcessKey.set(String(rentalId), processInstanceKey);
    console.log(`[proxy] Return workflow started: key=${processInstanceKey} rentalId=${rentalId}`);

    return res.status(201).json({ processInstanceKey, status: "started" });
  } catch (err) {
    console.error("[proxy] POST /api/return error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/return/:processInstanceKey/checkout-url
 * Frontend polls this after the return workflow is started, waiting for
 * worker_late_checkout.py to register the Stripe URL for the late fee.
 */
app.get("/api/return/:processInstanceKey/checkout-url", (req, res) => {
  const entry = lateCheckoutStore.get(req.params.processInstanceKey);
  if (entry?.checkoutUrl) {
    return res.json({ checkoutUrl: entry.checkoutUrl });
  }
  return res.status(202).json({ checkoutUrl: null });
});

/**
 * POST /api/messages/late-payment-confirmed
 * Called by payment-service after Stripe webhook confirms late fee payment.
 * Publishes a Camunda message to advance the return-workflow past its
 * Intermediate Message Catch Event ("LatePaymentConfirmed").
 *
 * Body: { rental_id, payment_id }
 */
app.post("/api/messages/late-payment-confirmed", express.json(), async (req, res) => {
  const { rental_id, payment_id } = req.body;
  if (!rental_id) {
    return res.status(400).json({ error: "rental_id required" });
  }

  try {
    const token = await getAccessToken();
    const msgResp = await fetch(`${CAMUNDA_BASE_URL}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messageName:     "LatePaymentConfirmed",
        correlationKey:  String(rental_id),
        variables: {
          paymentConfirmed:    true,
          confirmedPaymentId:  String(payment_id || ""),
        },
      }),
    });

    if (!msgResp.ok) {
      const err = await msgResp.text();
      console.error("[proxy] Camunda message publish failed:", err);
      return res.status(502).json({ error: "Failed to publish Camunda message", detail: err });
    }

    console.log(`[proxy] LatePaymentConfirmed published for rentalId=${rental_id}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[proxy] POST /api/messages/late-payment-confirmed error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /webhook/stripe
 * Stripe CLI forwards events here after checkout.session.completed.
 *
 * This proxy is the ONLY place that verifies the Stripe signature.
 * Once verified, the raw event JSON is forwarded to payment-service via
 * POST /payment/internal-webhook — a trusted internal endpoint that skips
 * re-verification (re-verifying against re-serialised JSON would always fail).
 *
 * FIX 2: changed forwarding target from /payment/webhook → /payment/internal-webhook
 */
app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    if (stripe && STRIPE_WEBHOOK_SECRET) {
      try {
        // Signature verified against the original raw bytes — correct.
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.error("[webhook] Signature verification failed:", err.message);
        return res.status(400).json({ error: `Webhook error: ${err.message}` });
      }
    } else {
      // Dev / no-Stripe mode: parse JSON directly
      try { event = JSON.parse(req.body.toString()); }
      catch { return res.status(400).json({ error: "Invalid JSON" }); }
    }

    if (event.type === "checkout.session.completed") {
      const session  = event.data?.object || event.data;
      const meta     = session.metadata || {};
      const rentalId = meta.rental_id;

      if (rentalId) {
        console.log(`[webhook] Payment completed — finalizing rental ${rentalId}`);
        try {
          // FIX 2: forward to /payment/internal-webhook (trusted, no re-verification).
          const r = await fetch(
            `${PAYMENT_SERVICE_URL}/payment/internal-webhook`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(event),
            }
          );
          if (r.ok) {
            console.log(`[webhook] Payment service notified OK`);
          } else {
            console.error("[webhook] Payment service error:", await r.text());
          }
        } catch (err) {
          console.error("[webhook] Payment service unreachable:", err.message);
        }
      }
    }

    return res.sendStatus(200);
  }
);

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({
  status:  "ok",
  service: "camunda-proxy",
  mode:    "camunda-orchestrated",
  camunda: CAMUNDA_CLIENT_ID ? "configured" : "NOT configured",
  stripe:  stripe ? "configured" : "not configured",
}));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Camunda proxy running on http://localhost:${PORT}`);
  console.log(`  Mode: Camunda-orchestrated (workers do all the work)`);
  console.log(`  Camunda: ${CAMUNDA_CLIENT_ID ? "configured" : "NOT configured"}`);
  console.log(`  Stripe webhook: ${stripe ? "configured" : "NOT configured (dev mode)"}`);
});