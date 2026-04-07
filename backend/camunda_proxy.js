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
 *                           → tells payment-service to finalize rental
 *
 * The KEY difference from before:
 *   - Proxy NO LONGER creates the rental itself
 *   - Proxy NO LONGER creates the Stripe session itself
 *   - Camunda workers do all of that
 *   - Proxy just starts the process and returns processInstanceKey
 */

import express from "express";
import cors from "cors";
import Stripe from "stripe";

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "*" }));

// ─── Stripe (for webhook verification only) ───────────────────────────────────
const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY     || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" }) : null;

// ─── Service URLs ─────────────────────────────────────────────────────────────
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || "http://payment-service:8000";
const FRONTEND_URL        = process.env.FRONTEND_URL        || "http://localhost:5173";

// ─── Camunda credentials ──────────────────────────────────────────────────────
const CAMUNDA_CLIENT_ID     = process.env.CAMUNDA_CLIENT_ID     || "AQazmsVXl7idqPlY1pMGm~Zh7Gv3Lgxk";
const CAMUNDA_CLIENT_SECRET = process.env.CAMUNDA_CLIENT_SECRET || "uH0.fzO7HfUxQ0FTlEe0DsBRe-WVgbxIq_BD0H8rpw422I.1Ig.jGZ~9JVZiU0R8";
const CAMUNDA_CLUSTER_ID    = process.env.CAMUNDA_CLUSTER_ID    || "db920878-5333-4352-b103-0803eb907686";
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

/**
 * POST /webhook/stripe
 * Stripe calls this after checkout.session.completed.
 * Forwards to payment-service to finalize the rental.
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
        return res.status(400).json({ error: `Webhook error: ${err.message}` });
      }
    } else {
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
          const r = await fetch(
            `${PAYMENT_SERVICE_URL}/payment/webhook`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "stripe-signature": sig || "" },
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

// ─── Service URLs ────────────────────────────────────────────────────────────
const RENTAL_SERVICE_URL = process.env.RENTAL_SERVICE_URL || "http://rental-service:8000";

async function createStripeSession({ rentalId, amount, description, successPath }) {
  const successUrl = `${FRONTEND_URL}${successPath}`;
  const cancelUrl  = `${FRONTEND_URL}/my-rentals`;

  if (stripe) {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "sgd",
          product_data: { name: description },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { rental_id: String(rentalId) },
    });
    return session.url;
  } else {
    return successUrl;
  }
}

/**
 * POST /api/retry-payment
 * Creates a new Stripe session for a PENDING rental.
 */
app.post("/api/retry-payment", express.json(), async (req, res) => {
  const { rentalId } = req.body;
  if (!rentalId) return res.status(400).json({ error: "rentalId required" });

  try {
    const r = await fetch(`${RENTAL_SERVICE_URL}/rental/${rentalId}`);
    if (!r.ok) return res.status(404).json({ error: "Rental not found" });
    const rental = await r.json();

    const start  = new Date(rental.start_time);
    const end    = new Date(rental.end_time);
    const hours  = Math.max((end - start) / 3_600_000, 0);
    const amount = Math.ceil(hours) * (rental.hourly_rate || 0);

    const url = await createStripeSession({
      rentalId,
      amount,
      description: `Rental payment (rental #${rentalId})`,
      successPath: `/confirmation?rental_id=${rentalId}`,
    });

    stripeStore.set(`retry-${rentalId}-${Date.now()}`, { stripeUrl: url, rentalId });
    return res.json({ stripeRedirectUrl: url });
  } catch (err) {
    console.error("[proxy] /api/retry-payment error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/late-payment
 * Creates a Stripe session for paying a late fee.
 */
app.post("/api/late-payment", express.json(), async (req, res) => {
  const { rentalId, feeAmount } = req.body;
  if (!rentalId || !feeAmount) return res.status(400).json({ error: "rentalId and feeAmount required" });

  try {
    const url = await createStripeSession({
      rentalId,
      amount: feeAmount,
      description: `Late fee (rental #${rentalId})`,
      successPath: `/confirmation?rental_id=${rentalId}&fee_paid=1`,
    });

    stripeStore.set(`late-${rentalId}-${Date.now()}`, { stripeUrl: url, rentalId });
    return res.json({ stripeRedirectUrl: url });
  } catch (err) {
    console.error("[proxy] /api/late-payment error:", err);
    return res.status(500).json({ error: err.message });
  }
});

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
