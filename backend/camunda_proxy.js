/**
 * camunda_proxy.js — Scenario 1 orchestrator
 *
 * Flow:
 *   1. POST /api/rentals        → create rental in rental-service (PENDING)
 *                                 → create Stripe Checkout Session
 *                                 → start Camunda rental-workflow
 *                                 → return { processInstanceKey }
 *   2. GET  /api/rentals/:key/stripe-url → return Stripe checkout URL (polled by frontend)
 *   3. POST /webhook/stripe     → Stripe calls this after payment
 *                                 → finalize rental (PENDING→ACTIVE) in rental-service
 *
 * Run locally:  node camunda_proxy.js   (port 3001)
 * Run in Docker: built via Dockerfile.proxy
 *
 * Stripe webhook local testing:
 *   stripe listen --forward-to http://localhost:3001/webhook/stripe
 */

import express from "express";
import cors from "cors";
import Stripe from "stripe";

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));

// ─── Stripe ───────────────────────────────────────────────────────────────────
const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY     || "sk_test_51TE5GTFlvJEYjHSMjf7fXWWG6umxqLd7XAjMW8YG9eHwwCtw109sFqXtt1QCmGRbjnJwJyx8vAxUNKeIDUEb8DVN00eDCsGVeE";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });

// ─── Service URLs ─────────────────────────────────────────────────────────────
// In Docker: use service name. Locally: use localhost
const RENTAL_SERVICE_URL = process.env.RENTAL_SERVICE_URL || "http://rental-service:8000";
const FRONTEND_URL       = process.env.FRONTEND_URL       || "http://localhost:5173";

// ─── Camunda 8 SaaS credentials ───────────────────────────────────────────────
const CAMUNDA_CLIENT_ID     = process.env.CAMUNDA_CLIENT_ID     || "AQazmsVXl7idqPlY1pMGm~Zh7Gv3Lgxk";
const CAMUNDA_CLIENT_SECRET = process.env.CAMUNDA_CLIENT_SECRET || "uH0.fzO7HfUxQ0FTlEe0DsBRe-WVgbxIq_BD0H8rpw422I.1Ig.jGZ~9JVZiU0R8";
const CAMUNDA_CLUSTER_ID    = process.env.CAMUNDA_CLUSTER_ID    || "db920878-5333-4352-b103-0803eb907686";
const CAMUNDA_REGION        = process.env.CAMUNDA_REGION        || "sin-2";

const CAMUNDA_BASE_URL = `https://${CAMUNDA_REGION}.zeebe.camunda.io:443/${CAMUNDA_CLUSTER_ID}/v2`;
const TOKEN_URL        = "https://login.cloud.camunda.io/oauth/token";

// ─── In-memory Stripe URL store keyed by processInstanceKey ──────────────────
const stripeStore = new Map();

// ─── Camunda OAuth token cache ────────────────────────────────────────────────
let tokenCache = { accessToken: null, expiresAt: 0 };

async function getAccessToken() {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 30_000) {
    return tokenCache.accessToken;
  }
  const params = new URLSearchParams();
  params.append("grant_type",    "client_credentials");
  params.append("client_id",     CAMUNDA_CLIENT_ID);
  params.append("client_secret", CAMUNDA_CLIENT_SECRET);
  params.append("audience",      "zeebe.camunda.io");

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
  const token = await getAccessToken();
  const resp = await fetch(`${CAMUNDA_BASE_URL}/process-instances`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ processDefinitionId: "rental-workflow", variables }),
  });
  if (!resp.ok) throw new Error(`Camunda start process failed: ${await resp.text()}`);
  const data = await resp.json();
  return String(data.processInstanceKey);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/rentals
 * Body: { renterId, equipmentId, startTime, endTime, totalPrice, pickUpLocation }
 *
 * 1. Creates PENDING rental in rental-service
 * 2. Creates Stripe Checkout Session
 * 3. Starts Camunda rental-workflow
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
    console.log(`[proxy] Creating rental in rental-service: ${RENTAL_SERVICE_URL}`);
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
      console.error("[proxy] Rental service error:", err);
      return res.status(rentalResp.status).json({
        error: err.detail || "Rental service error",
      });
    }

    const rental   = await rentalResp.json();
    const rentalId = rental.id;
    console.log(`[proxy] Rental created: ${rentalId}`);

    // ── Step 2: Create Stripe Checkout Session ────────────────────────────────
    const amountCents = Math.round(Number(totalPrice) * 100);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency:     "sgd",
          product_data: { name: `Equipment Rental #${rentalId}` },
          unit_amount:  amountCents,
        },
        quantity: 1,
      }],
      mode:        "payment",
      success_url: `${FRONTEND_URL}/confirmation?rental_id=${rentalId}`,
      cancel_url:  `${FRONTEND_URL}/marketplace`,
      metadata: {
        rental_id: String(rentalId),
        renter_id: String(renterId),
      },
    });
    const stripeUrl = session.url;
    console.log(`[proxy] Stripe session created: ${session.id}`);

    // ── Step 3: Start Camunda process ─────────────────────────────────────────
    const processKey = await startCamundaProcess({
      renterId:         String(renterId),
      equipmentId:      String(equipmentId),
      rentalId:         String(rentalId),
      startTime,
      endTime,
      totalPrice:       Number(totalPrice),
      pickUpLocation:   pickUpLocation || "",
      stripeRedirectUrl: stripeUrl,
    }).catch(err => {
      console.warn("[proxy] Camunda start error (non-fatal):", err.message);
      return `local-${rentalId}`;
    });

    // ── Store URL for polling ─────────────────────────────────────────────────
    stripeStore.set(processKey, { stripeUrl, rentalId });
    console.log(`[proxy] processKey=${processKey} stripeUrl stored`);

    return res.status(201).json({ processInstanceKey: processKey, status: "started" });

  } catch (err) {
    console.error("[proxy] POST /api/rentals error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/rentals/:processInstanceKey/stripe-url
 * Polled by frontend every 2s until URL is ready.
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
 * Must receive raw body for signature verification.
 */
app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    if (STRIPE_WEBHOOK_SECRET) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.error("[webhook] Signature verification failed:", err.message);
        return res.status(400).json({ error: `Webhook error: ${err.message}` });
      }
    } else {
      // Dev mode — no signature verification
      try { event = JSON.parse(req.body.toString()); }
      catch { return res.status(400).json({ error: "Invalid JSON" }); }
    }

    if (event.type === "checkout.session.completed") {
      const session  = event.data.object;
      const rentalId = session.metadata?.rental_id;
      if (!rentalId) return res.sendStatus(200);

      console.log(`[webhook] Payment completed — finalizing rental ${rentalId}`);
      try {
        const finalizeResp = await fetch(
          `${RENTAL_SERVICE_URL}/rental/${rentalId}/finalize-booking`,
          { method: "POST", headers: { "Content-Type": "application/json" } }
        );
        if (finalizeResp.ok) {
          console.log(`[webhook] Rental ${rentalId} finalized (ACTIVE)`);
        } else {
          console.error("[webhook] finalize-booking failed:", await finalizeResp.text());
        }
      } catch (err) {
        console.error("[webhook] finalize-booking error:", err.message);
      }
    }

    return res.sendStatus(200);
  }
);

/**
 * GET /api/rentals
 * Returns rentals list — replace with real DB query if needed.
 */
app.get("/api/rentals", async (req, res) => {
  return res.json([]);
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({
  status: "ok",
  service: "camunda-proxy",
  rentalService: RENTAL_SERVICE_URL,
  stripe: STRIPE_SECRET_KEY !== "YOUR_STRIPE_SECRET_KEY" ? "configured" : "NOT configured",
  camunda: CAMUNDA_CLIENT_ID ? "configured" : "NOT configured",
}));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Camunda proxy running on http://localhost:${PORT}`);
  console.log(`  Rental service: ${RENTAL_SERVICE_URL}`);
  console.log(`  Stripe: ${STRIPE_SECRET_KEY !== "YOUR_STRIPE_SECRET_KEY" ? "configured" : "NOT configured"}`);
  console.log(`  Camunda: ${CAMUNDA_CLIENT_ID ? "configured" : "NOT configured"}`);
});