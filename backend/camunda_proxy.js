/**
 * camunda_proxy.js  —  Express proxy between React frontend and Camunda 8 SaaS
 * Run with:  node camunda_proxy.js
 * Listens on: http://localhost:8000
 */

import express from "express";
import cors    from "cors";



const app = express();
app.use(cors());
app.use(express.json());

// ─── Camunda 8 credentials ────────────────────────────────────────────────────
// Fill these in directly, or use a .env file with dotenv
const CAMUNDA_CLIENT_ID     = process.env.CAMUNDA_CLIENT_ID     || "l5VppjADZepJz67o7AvsL~f.pM-hvXDN";
const CAMUNDA_CLIENT_SECRET = process.env.CAMUNDA_CLIENT_SECRET || "1Y8gprouHo9ozFXeu3IYo-xX.I4~8lARMjYS6QDHR0ASVuCwsDoBLM5LEgDM6X6l";
const CAMUNDA_CLUSTER_ID    = process.env.CAMUNDA_CLUSTER_ID    || "cc8b905a-8761-43e5-a6a2-75794703ea7a";
const CAMUNDA_REGION        = process.env.CAMUNDA_REGION        || "ont-1";

const CAMUNDA_BASE_URL = `https://${CAMUNDA_REGION}.zeebe.camunda.io:443/${CAMUNDA_CLUSTER_ID}/v2`;
const TOKEN_URL        = "https://login.cloud.camunda.io/oauth/token";

// ─── Token cache (simple in-memory) ───────────────────────────────────────────
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
  console.log("Token response status:", tokenResp.status);
  console.log("Token response body:", text);

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
 * Called by React when user clicks Confirm.
 * Starts the Camunda rental-workflow process.
 */
app.post("/api/rentals", async (req, res) => {
  const { renterId, equipmentId, startTime, endTime, hourlyRate, pickUpLocation } = req.body;

  // Validate required fields
  const missing = ["renterId","equipmentId","startTime","endTime","hourlyRate","pickUpLocation"]
    .filter((f) => !req.body[f]);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }

  try {
    const headers = await camundaHeaders();
    const resp = await fetch(`https://ont-1.zeebe.camunda.io:443/${CAMUNDA_CLUSTER_ID}/v2/process-instances`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        processDefinitionId: "rental-workflow", // must match your BPMN process id
        variables: { renterId, equipmentId, startTime, endTime, hourlyRate, pickUpLocation }
      })
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return res.status(502).json({ error: "Failed to start Camunda process", detail });
    }

    const data = await resp.json();
console.log("Camunda response:", JSON.stringify(data)); // temporary log
return res.status(201).json({ processInstanceKey: data.processInstanceKey, status: "started"
    });

  } catch (err) {
    console.error("Camunda error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/rentals/:processInstanceKey/stripe-url
 * React polls this every 2 seconds after starting the process.
 * Your redirect-to-stripe Python worker writes the stripeRedirectUrl
 * to a DB table keyed by processInstanceKey.
 *
 * TODO: replace the body with your actual DB lookup.
 */
app.get("/api/rentals/:processInstanceKey/stripe-url", async (req, res) => {
  const { processInstanceKey } = req.params;

  // TODO: replace with real DB lookup, e.g:
  // const row = await db.query("SELECT stripe_url FROM rentals WHERE process_key = ?", [processInstanceKey]);
  // if (row) return res.json({ stripeRedirectUrl: row.stripe_url });

  // Placeholder — not ready yet
  return res.status(202).json({ stripeRedirectUrl: null });
});

/**
 * GET /api/rentals
 * Returns rentals list — replace with your real DB query.
 */
app.get("/api/rentals", async (req, res) => {
  // TODO: query your DB
  return res.json([]);
});

/**
 * GET /api/system/assumptions
 */
app.get("/api/system/assumptions", (req, res) => {
  res.json({
    assumptions: [
      "Frontend calls this Express proxy — never Camunda directly.",
      "Camunda credentials are kept server-side only.",
      "Python workers connect to Camunda independently via pyzeebe."
    ]
  });
});

// ─── Run ──────────────────────────────────────────────────────────────────────
app.listen(8000, () => {
  console.log("Camunda proxy running on http://localhost:8000");
});
