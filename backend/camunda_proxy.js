/**
 * camunda_proxy.js  —  Express proxy between React frontend and Camunda 8 SaaS
 * Run with:  node camunda_proxy.js
 * Listens on: http://localhost:8000
 */

import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ─── Camunda 8 credentials ────────────────────────────────────────────────────
const CAMUNDA_CLIENT_ID     = process.env.CAMUNDA_CLIENT_ID     || "AQazmsVXl7idqPlY1pMGm~Zh7Gv3Lgxk";
const CAMUNDA_CLIENT_SECRET = process.env.CAMUNDA_CLIENT_SECRET || "uH0.fzO7HfUxQ0FTlEe0DsBRe-WVgbxIq_BD0H8rpw422I.1Ig.jGZ~9JVZiU0R8";
const CAMUNDA_CLUSTER_ID    = process.env.CAMUNDA_CLUSTER_ID    || "db920878-5333-4352-b103-0803eb907686";
const CAMUNDA_REGION        = process.env.CAMUNDA_REGION        || "sin-2";

const CAMUNDA_BASE_URL = `https://${CAMUNDA_REGION}.zeebe.camunda.io:443/${CAMUNDA_CLUSTER_ID}/v2`;
const TOKEN_URL        = "https://login.cloud.camunda.io/oauth/token";

// ─── Token cache ──────────────────────────────────────────────────────────────
let tokenCache = { accessToken: null, expiresAt: 0 };

async function getAccessToken() {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 30000) {
    return tokenCache.accessToken;
  }

  const params = new URLSearchParams();
  params.append("grant_type",    "client_credentials");
  params.append("client_id",     CAMUNDA_CLIENT_ID);
  params.append("client_secret", CAMUNDA_CLIENT_SECRET);
  params.append("audience",      "zeebe.camunda.io");

  const tokenResp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });

  const text = await tokenResp.text();
  if (!tokenResp.ok) throw new Error(`Token fetch failed: ${text}`);

  const data = JSON.parse(text);
  tokenCache.accessToken = data.access_token;
  tokenCache.expiresAt   = Date.now() + (data.expires_in || 300) * 1000;
  return tokenCache.accessToken;
}

async function camundaHeaders() {
  const token = await getAccessToken();
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type":  "application/json"
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/rentals
 * Called by React PaymentPage when user confirms rental.
 * Starts the Camunda rental-workflow process.
 * Body: { renterId, equipmentId, startTime, endTime, hourlyRate, pickUpLocation }
 * Returns: { processInstanceKey, status }
 */
app.post("/api/rentals", async (req, res) => {
  const { renterId, equipmentId, startTime, endTime, hourlyRate, pickUpLocation } = req.body;

  const missing = ["renterId", "equipmentId", "startTime", "endTime", "hourlyRate", "pickUpLocation"]
    .filter((f) => !req.body[f]);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }

  try {
    const headers = await camundaHeaders();
    const resp = await fetch(`${CAMUNDA_BASE_URL}/process-instances`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        processDefinitionId: "rental-workflow",
        variables: { renterId, equipmentId, startTime, endTime, hourlyRate, pickUpLocation }
      })
    });

    const text = await resp.text();
    if (!resp.ok) {
      console.error("Camunda process start failed:", text);
      return res.status(502).json({ error: "Failed to start Camunda process", detail: text });
    }

    const data = JSON.parse(text);
    console.log("Process started, key:", data.processInstanceKey);
    return res.status(201).json({
      processInstanceKey: data.processInstanceKey,
      status: "started"
    });

  } catch (err) {
    console.error("Camunda error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/rentals/:processInstanceKey/stripe-url
 * React polls this every 2 seconds after starting the process.
 * Your redirect-to-stripe Python worker writes stripeRedirectUrl
 * to a DB table keyed by processInstanceKey.
 * TODO: replace with your real DB lookup.
 */
app.get("/api/rentals/:processInstanceKey/stripe-url", async (req, res) => {
  const { processInstanceKey } = req.params;
  console.log("Polling stripe URL for:", processInstanceKey);

  // TODO: replace with real DB lookup e.g:
  // const row = await db.query("SELECT stripe_url FROM rentals WHERE process_key = ?", [processInstanceKey]);
  // if (row?.stripe_url) return res.json({ stripeRedirectUrl: row.stripe_url });

  return res.status(202).json({ stripeRedirectUrl: null });
});

/**
 * GET /api/rentals
 * Returns rentals list — replace with your real DB query.
 */
app.get("/api/rentals", async (req, res) => {
  return res.json([]);
});

// ─── Run ──────────────────────────────────────────────────────────────────────
app.listen(8000, () => {
  console.log("Camunda proxy running on http://localhost:8000");
});
