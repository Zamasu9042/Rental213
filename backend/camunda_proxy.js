/**
 * camunda_proxy.js  —  Scenario 1 orchestrator
 *
 * Flow (Scenario 1 — Renting an item):
 *   1. POST /api/rentals        → create rental (PENDING) in rental-service
 *                                 → create Stripe Checkout Session
 *                                 → start Camunda rental-workflow
 *                                 → return { processInstanceKey }
 *   2. GET  /api/rentals/:key/stripe-url  → return the checkout URL (polled by frontend)
 *   3. POST /webhook/stripe     → Stripe calls this after payment
 *                                 → finalize rental (PENDING→ACTIVE) in rental-service
 *                                 → rental-service marks equipment rented + publishes AMQP event
 *
 * Local dev:  node camunda_proxy.js           (listens on PORT, defaults to 3001)
 * Docker:     built via Dockerfile.proxy, PORT=3001
 *
 * Stripe webhook local testing:
 *   stripe listen --forward-to http://localhost:8000/webhook/stripe
 *   (set STRIPE_WEBHOOK_SECRET to the secret printed by that command)
 */

import express from "express";
import cors from "cors";
import Stripe from "stripe";

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));

// ─── Stripe ───────────────────────────────────────────────────────────────────
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" })
  : null;

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// ─── Camunda 8 SaaS credentials ───────────────────────────────────────────────
const CAMUNDA_CLIENT_ID     = process.env.CAMUNDA_CLIENT_ID     || "";
const CAMUNDA_CLIENT_SECRET = process.env.CAMUNDA_CLIENT_SECRET || "";
const CAMUNDA_CLUSTER_ID    = process.env.CAMUNDA_CLUSTER_ID    || "";
const CAMUNDA_REGION        = process.env.CAMUNDA_REGION        || "sin-2";
const CAMUNDA_BASE_URL      = `https://${CAMUNDA_REGION}.zeebe.camunda.io:443/${CAMUNDA_CLUSTER_ID}/v2`;
const TOKEN_URL             = "https://login.cloud.camunda.io/oauth/token";

// ─── Service URLs (injected via Docker env, fallback for local dev) ───────────
const RENTAL_SERVICE_URL = process.env.RENTAL_SERVICE_URL || "http://localhost:8002";
const FRONTEND_URL       = process.env.FRONTEND_URL       || "http://localhost:5173";

// ─── In-memory Stripe URL store keyed by processInstanceKey ──────────────────
// Map<processInstanceKey, { stripeUrl: string, rentalId: number }>
const stripeStore = new Map();

// ─── Camunda OAuth token cache ────────────────────────────────────────────────
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

async function startCamundaProcess(variables) {
  if (!CAMUNDA_CLIENT_ID || !CAMUNDA_CLUSTER_ID) {
    console.warn("[Camunda] credentials not set — skipping process start");
    return `mock-${Date.now()}`;
  }
  const token = await getAccessToken();
  const resp = await fetch(`${CAMUNDA_BASE_URL}/process-instances`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      processDefinitionId: "rental-workflow",
      variables,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Camunda start process failed: ${text}`);
  }
  const data = await resp.json();
  return String(data.processInstanceKey);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/rentals
 * Body: { renterId, equipmentId, startTime, endTime, totalPrice, pickUpLocation }
 *
 * 1. Creates a PENDING rental in rental-service
 * 2. Creates a Stripe Checkout Session for the total amount
 * 3. Starts the Camunda rental-workflow process
 * 4. Returns { processInstanceKey }
 */
app.post("/api/rentals", express.json(), async (req, res) => {
  const { renterId, equipmentId, startTime, endTime, totalPrice, pickUpLocation } = req.body;

  const missing = ["renterId", "equipmentId", "startTime", "endTime", "totalPrice"]
    .filter(f => req.body[f] == null);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }

  try {
    // ── Step 1: Create PENDING rental in rental-service ───────────────────────
    const rentalResp = await fetch(`${RENTAL_SERVICE_URL}/rental`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        renter_id:     Number(renterId),
        equipment_id:  Number(equipmentId),
        start_time:    startTime,
        end_time:      endTime,
        checkout_mode: "pending_payment",
      }),
    });

    if (!rentalResp.ok) {
      const err = await rentalResp.json().catch(() => ({}));
      return res.status(rentalResp.status).json({
        error: err.detail || "Rental service error",
      });
    }

    const rental = await rentalResp.json();
    const rentalId = rental.id;

    // ── Step 2: Create Stripe Checkout Session ────────────────────────────────
    let stripeUrl = null;

    if (stripe) {
      const amountCents = Math.round(Number(totalPrice) * 100);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "sgd",
              product_data: { name: `Equipment Rental #${rentalId}` },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${FRONTEND_URL}/confirmation?rental_id=${rentalId}`,
        cancel_url:  `${FRONTEND_URL}/marketplace`,
        metadata: {
          rental_id: String(rentalId),
          renter_id: String(renterId),
        },
      });
      stripeUrl = session.url;
    } else {
      console.warn("[Stripe] STRIPE_SECRET_KEY not set — using mock checkout URL");
      stripeUrl = `${FRONTEND_URL}/confirmation?rental_id=${rentalId}&mock=1`;
    }

    // ── Step 3: Start Camunda process ─────────────────────────────────────────
    const processKey = await startCamundaProcess({
      renterId:       String(renterId),
      equipmentId:    String(equipmentId),
      rentalId:       String(rentalId),
      startTime,
      endTime,
      totalPrice:     Number(totalPrice),
      pickUpLocation: pickUpLocation || "",
      stripeRedirectUrl: stripeUrl,
    }).catch(err => {
      console.warn("[Camunda] process start error (non-fatal):", err.message);
      return `local-${rentalId}`;
    });

    // ── Store URL for polling ─────────────────────────────────────────────────
    stripeStore.set(processKey, { stripeUrl, rentalId });
    console.log(`[proxy] processKey=${processKey} rentalId=${rentalId} stripeUrl set`);

    return res.status(201).json({ processInstanceKey: processKey, status: "started" });

  } catch (err) {
    console.error("[proxy] POST /api/rentals error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/rentals/:processInstanceKey/stripe-url
 * Polled by frontend every 2 s until a URL is ready.
 */
app.get("/api/rentals/:processInstanceKey/stripe-url", (req, res) => {
  const entry = stripeStore.get(req.params.processInstanceKey);
  if (entry?.stripeUrl) {
    return res.json({ stripeRedirectUrl: entry.stripeUrl });
  }
  return res.status(202).json({ stripeRedirectUrl: null });
});

/**
 * POST /webhook/stripe
 * Stripe calls this after checkout.session.completed.
 * Must receive the raw body (not parsed) for signature verification.
 *
 * Local testing:
 *   stripe listen --forward-to http://localhost:8000/webhook/stripe
 */
app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    if (stripe && STRIPE_WEBHOOK_SECRET) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.error("[webhook] Signature verification failed:", err.message);
        return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
      }
    } else {
      // Dev mode: trust the raw body without verification
      try {
        event = JSON.parse(req.body.toString());
      } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    }

    if (event.type === "checkout.session.completed") {
      const session  = event.data.object;
      const rentalId = session.metadata?.rental_id;

      if (!rentalId) {
        console.warn("[webhook] checkout.session.completed missing rental_id in metadata");
        return res.sendStatus(200);
      }

      console.log(`[webhook] Payment completed — finalizing rental ${rentalId}`);

      // Finalize rental: PENDING → ACTIVE + equipment marked rented
      try {
        const finalizeResp = await fetch(
          `${RENTAL_SERVICE_URL}/rental/${rentalId}/finalize-booking`,
          { method: "POST", headers: { "Content-Type": "application/json" } }
        );
        if (!finalizeResp.ok) {
          const err = await finalizeResp.json().catch(() => ({}));
          console.error("[webhook] finalize-booking failed:", err);
        } else {
          console.log(`[webhook] Rental ${rentalId} finalized (ACTIVE)`);
        }
      } catch (err) {
        console.error("[webhook] finalize-booking network error:", err.message);
      }
    }

    return res.sendStatus(200);
  }
);

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", service: "camunda-proxy" }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Camunda proxy running on http://localhost:${PORT}`);
  console.log(`  Rental service: ${RENTAL_SERVICE_URL}`);
  console.log(`  Stripe: ${stripe ? "configured" : "NOT configured (mock mode)"}`);
  console.log(`  Camunda: ${CAMUNDA_CLIENT_ID ? "configured" : "NOT configured (skip)"}`);
});
