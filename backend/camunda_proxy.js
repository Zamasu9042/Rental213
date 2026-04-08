/**
 * camunda_proxy.js — External orchestrator (in-process Camunda substitute)
 *
 * Scenario 1: POST /api/rentals → OutSystems account → rental-service (PENDING) → payment (Stripe)
 * Scenario 2: POST /api/return-workflow → late check → mark COMPLETED or record late fee + LATE
 * Late pay: POST /api/late-fee/:paymentId/checkout → payment-service Stripe session
 * Webhook → payment-service; late path notifies POST /internal/late-payment-confirmed here
 */

import express from "express";
import cors from "cors";
import Stripe from "stripe";
import amqplib from "amqplib";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "*" }));

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" }) : null;

const RENTAL_SERVICE_URL     = process.env.RENTAL_SERVICE_URL     || "http://rental-service:8000";
const PAYMENT_SERVICE_URL    = process.env.PAYMENT_SERVICE_URL    || "http://payment-service:8000";
const EQUIPMENT_SERVICE_URL  = process.env.EQUIPMENT_SERVICE_URL  || "http://equipment-service:8000";
const REPUTATION_SERVICE_URL = process.env.REPUTATION_SERVICE_URL || "http://reputation-service:8000";
const FRONTEND_URL           = process.env.FRONTEND_URL           || "http://localhost:5173";

const AMQP_HOST = process.env.AMQP_HOST || "rabbitmq";
const AMQP_PORT = process.env.AMQP_PORT || "5672";
const AMQP_EXCHANGE = process.env.AMQP_EXCHANGE || "rental_topic";

const OUTSYSTEMS_BASE = "https://personal-3jztr7cq.outsystemscloud.com/Account/rest/account";
const DEMO_LOGIN_PASSWORD = process.env.DEMO_LOGIN_PASSWORD || "password123";
// Phone number used for demo accounts (set in .env as DEMO_PHONE_NUMBER=+6512345678)
const DEMO_PHONE_NUMBER = process.env.DEMO_PHONE_NUMBER || "";
const DEMO_BY_EMAIL = {
  "renter@test.com": { id: "1001", name: "Demo Renter", role: "renter" },
  "owner@test.com": { id: "1002", name: "Demo Owner", role: "owner" },
  "staff@test.com": { id: "1003", name: "Demo Staff", role: "staff" },
  "renter2check@gmail.com": { id: "1004", name: "Demo Renter 2", role: "renter" },
};
const DEMO_BY_ID = {
  1001: { accountName: "Demo Renter", email: "renter@test.com" },
  1002: { accountName: "Demo Owner", email: "owner@test.com" },
  1003: { accountName: "Demo Staff", email: "staff@test.com" },
  1004: { accountName: "Demo Renter 2", email: "renter2check@gmail.com" },
};

let keyCounter = 1;
const workflowStore = new Map();
const rentalToKey = new Map();

async function apiFetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${options.method || "GET"} ${url} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return {};
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return {};
  return res.json();
}

async function fetchJsonMaybe404(url) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Match payment-service is_late_return (ceil hours, min 1). */
function lateFeeFromRental(rental) {
  if (!rental?.return_timestamp || !rental?.end_time) return { late: false, amount: 0 };
  const ret = new Date(rental.return_timestamp);
  const due = new Date(rental.end_time);
  if (Number.isNaN(ret.getTime()) || Number.isNaN(due.getTime())) return { late: false, amount: 0 };
  if (ret <= due) return { late: false, amount: 0 };
  const deltaSec = (ret.getTime() - due.getTime()) / 1000;
  const hoursOverdue = Math.max(1, Math.ceil(deltaSec / 3600));
  const rate = Number(rental.hourly_rate || 0);
  const amount = Math.round(hoursOverdue * rate * 100) / 100;
  return { late: true, amount };
}

async function publishAmqp(routingKey, payload) {
  try {
    const conn = await amqplib.connect(`amqp://${AMQP_HOST}:${AMQP_PORT}`);
    const ch = await conn.createChannel();
    await ch.assertExchange(AMQP_EXCHANGE, "topic", { durable: true });
    ch.publish(
      AMQP_EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true, contentType: "application/json" },
    );
    await ch.close();
    await conn.close();
    console.log(`[orchestrator] AMQP ${routingKey} rental_id=${payload.rental_id}`);
  } catch (err) {
    console.error(`[orchestrator] AMQP publish failed: ${err.message}`);
  }
}

// ─── Workers may still register Stripe URL (Camunda path) ─────────────────────
app.post("/internal/stripe-url", express.json(), (req, res) => {
  const { processInstanceKey, stripeUrl, rentalId } = req.body;
  if (!processInstanceKey || !stripeUrl) {
    return res.status(400).json({ error: "processInstanceKey and stripeUrl required" });
  }
  const key = String(processInstanceKey);
  const prev = workflowStore.get(key) || {};
  workflowStore.set(key, { ...prev, stripeUrl, rentalId });
  console.log(`[orchestrator] external stripe-url registered key=${key}`);
  return res.json({ ok: true });
});

// ═══ Scenario 1 — new rental + Stripe ═══════════════════════════════════════

app.post("/api/rentals", express.json(), async (req, res) => {
  const { renterId, equipmentId, startTime, endTime, totalPrice, pickUpLocation } = req.body;
  const missing = ["renterId", "equipmentId", "startTime", "endTime", "totalPrice"].filter(
    (f) => req.body[f] == null,
  );
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const rid = Number(renterId);
  if (!Number.isFinite(rid) || rid <= 0) {
    return res.status(400).json({ error: "Invalid renterId" });
  }

  const processInstanceKey = `local-${keyCounter++}-${Date.now()}`;
  console.log(`[s1] start key=${processInstanceKey} renter=${rid}`);

  (async () => {
    try {
      let accountInfo = {};
      try {
        const account = await apiFetchJson(`${OUTSYSTEMS_BASE}/Account/${rid}`);
        accountInfo = {
          name: account.AccountName || account.accountName || "",
          email: account.email || account.Email || "",
          phone: account.PhoneNo || account.phoneNo || "",
        };
      } catch {
        const d = DEMO_BY_ID[rid];
        if (d) accountInfo = { name: d.accountName, email: d.email, phone: "" };
      }

      const rental = await apiFetchJson(`${RENTAL_SERVICE_URL}/rental`, {
        method: "POST",
        body: JSON.stringify({
          renter_id: rid,
          equipment_id: Number(equipmentId),
          start_time: startTime,
          end_time: endTime,
          checkout_mode: "pending_payment",
        }),
      });
      const rentalId = rental.id;

      const payment = await apiFetchJson(`${PAYMENT_SERVICE_URL}/payment/payrental`, {
        method: "POST",
        body: JSON.stringify({
          rental_id: rentalId,
          renter_id: rid,
          amount: Number(totalPrice),
          item_name: `Equipment Rental #${rentalId}`,
        }),
      });

      workflowStore.set(processInstanceKey, {
        stripeUrl: payment.checkout_url || `${FRONTEND_URL}/marketplace`,
        rentalId,
        equipmentId: Number(equipmentId),
        renterId: rid,
        amount: Number(totalPrice),
        accountInfo,
      });
      rentalToKey.set(String(rentalId), processInstanceKey);
    } catch (err) {
      console.error(`[s1] failed: ${err.message}`);
      workflowStore.set(processInstanceKey, { error: err.message });
    }
  })();

  return res.status(201).json({ processInstanceKey, status: "started" });
});

app.get("/api/rentals/:processInstanceKey/stripe-url", (req, res) => {
  const entry = workflowStore.get(req.params.processInstanceKey);
  if (entry?.error) return res.status(502).json({ error: entry.error });
  if (entry?.stripeUrl) return res.json({ stripeRedirectUrl: entry.stripeUrl });
  return res.status(202).json({ stripeRedirectUrl: null });
});

app.get("/api/rentals", (_req, res) => res.json([]));

// ═══ Scenario 2 — return workflow ═══════════════════════════════════════════

/**
 * After dual confirm-return → RETURNED. Compare return vs due; on-time → COMPLETED;
 * late → payment-service records unpaid late fee + rental LATE.
 */
app.post("/api/return-workflow", express.json(), async (req, res) => {
  const rentalId = Number(req.body.rentalId ?? req.body.rental_id);
  if (!Number.isFinite(rentalId) || rentalId <= 0) {
    return res.status(400).json({ error: "rentalId required" });
  }

  try {
    const rental = await apiFetchJson(`${RENTAL_SERVICE_URL}/rental/${rentalId}`);
    const st = rental.status;

    if (st === "COMPLETED") {
      return res.json({ isLate: false, message: "already_completed" });
    }

    if (st === "LATE") {
      const latePay = await fetchJsonMaybe404(
        `${PAYMENT_SERVICE_URL}/payment/rental/${rentalId}/late-fee`,
      );
      if (latePay) {
        return res.json({
          isLate: true,
          paymentId: latePay.paymentID,
          lateFee: latePay.amount,
        });
      }
      return res.json({ isLate: true, error: "LATE but no unpaid fee row" });
    }

    if (st !== "RETURNED") {
      return res.status(409).json({
        error: `Rental must be RETURNED to run return-workflow (got ${st})`,
      });
    }

    const { late, amount } = lateFeeFromRental(rental);

    if (!late) {
      await apiFetchJson(`${RENTAL_SERVICE_URL}/rental/${rentalId}/mark-completed`, {
        method: "POST",
      });
      console.log(`[s2] on-time return rental=${rentalId} → COMPLETED`);
      return res.json({ isLate: false });
    }

    try {
      let accountInfo = {};
      try {
        const acc = await apiFetchJson(`${OUTSYSTEMS_BASE}/Account/${rental.renter_id}`);
        accountInfo = {
          name: acc.AccountName || acc.accountName || "",
          phone: acc.PhoneNo || acc.phoneNo || "",
          email: acc.email || acc.Email || "",
        };
      } catch {
        const d = DEMO_BY_ID[rental.renter_id];
        if (d) accountInfo = { name: d.accountName, phone: "", email: d.email };
      }
      console.log(`[s2] late return rental=${rentalId} account=${JSON.stringify(accountInfo)}`);

      const pay = await apiFetchJson(`${PAYMENT_SERVICE_URL}/payment/outstanding`, {
        method: "POST",
        body: JSON.stringify({ rental_id: rentalId }),
      });

      return res.json({
        isLate: true,
        paymentId: pay.paymentID,
        lateFee: pay.amount,
      });
    } catch (err) {
      console.error(`[s2] record late fee failed rental=${rentalId}: ${err.message}`);
      try {
        await apiFetchJson(`${RENTAL_SERVICE_URL}/rental/${rentalId}/revert-to-active`, {
          method: "POST",
        });
      } catch (revErr) {
        console.error(`[s2] revert-to-active failed: ${revErr.message}`);
      }
      await publishAmqp("SendPaymentConfirmation", {
        event: "SendPaymentConfirmation",
        rental_id: rentalId,
        renter_id: rental.renter_id,
        amount: 0,
        type: "support",
        sms_body:
          `[Rental213] We could not record your late fee for rental #${rentalId}. ` +
          `Your booking was restored to active. Please contact support if you need help.`,
      });
      return res.json({
        isLate: false,
        reverted: true,
        error: "Late fee could not be recorded; rental reverted to ACTIVE. Support notified.",
      });
    }
  } catch (e) {
    console.error(`[s2] return-workflow: ${e.message}`);
    return res.status(502).json({ error: e.message });
  }
});

/** Kong: /api/late-fee/:id/checkout → payment-service outstanding checkout */
app.post("/api/late-fee/:paymentId/checkout", async (req, res) => {
  const paymentId = req.params.paymentId;
  try {
    const data = await apiFetchJson(
      `${PAYMENT_SERVICE_URL}/payment/outstanding/${paymentId}/checkout`,
      { method: "POST" },
    );
    return res.json(data);
  } catch (err) {
    console.error(`[s2] late-fee checkout: ${err.message}`);
    return res.status(502).json({ error: err.message });
  }
});

// ═══ Internal — payment-service webhook follow-up ═════════════════════════════

app.post("/internal/payment-confirmed", express.json(), async (req, res) => {
  const { rental_id, renter_id, amount, kind } = req.body;
  if (rental_id == null || renter_id == null) {
    return res.status(400).json({ error: "rental_id and renter_id required" });
  }
  const payType = kind === "late" ? "late" : "rental";
  await publishAmqp("SendPaymentConfirmation", {
    event: "SendPaymentConfirmation",
    rental_id,
    renter_id,
    amount: Number(amount) || 0,
    type: payType,
  });
  return res.json({ ok: true });
});

/**
 * Late fee Stripe webhook → payment PAID → payment-service calls here.
 * Poll payment 3×; if unpaid → revert rental + SMS retry; else complete + reputation + SMS.
 */
app.post("/internal/late-payment-confirmed", express.json(), async (req, res) => {
  const rentalId = req.body.rental_id;
  const renterId = req.body.renter_id;
  const paymentId = req.body.payment_id;
  const amount = Number(req.body.amount) || 0;

  if (rentalId == null || paymentId == null) {
    return res.status(400).json({ error: "rental_id and payment_id required" });
  }

  let paid = false;
  for (let i = 0; i < 3; i++) {
    try {
      const p = await apiFetchJson(`${PAYMENT_SERVICE_URL}/payment/${paymentId}`);
      if (String(p.status || "").toLowerCase() === "paid") {
        paid = true;
        break;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!paid) {
    console.warn(`[s2] late payment unverified after 3 polls payment_id=${paymentId}`);
    try {
      await apiFetchJson(`${RENTAL_SERVICE_URL}/rental/${rentalId}/revert-to-active`, {
        method: "POST",
      });
    } catch (e) {
      console.error(`[s2] revert after unverified payment: ${e.message}`);
    }
    await publishAmqp("SendPaymentConfirmation", {
      event: "SendPaymentConfirmation",
      rental_id: rentalId,
      renter_id: renterId,
      amount: 0,
      type: "payment_retry",
      sms_body:
        `[Rental213] We could not verify your late fee payment for rental #${rentalId}. ` +
        `Please open the app and try paying again. Contact support if this continues.`,
    });
    return res.json({ ok: false, verified: false });
  }

  try {
    await apiFetchJson(`${RENTAL_SERVICE_URL}/rental/${rentalId}/complete-after-late-payment`, {
      method: "POST",
    });
  } catch (e) {
    console.error(`[s2] complete-after-late-payment: ${e.message}`);
  }

  try {
    const r = await fetch(`${REPUTATION_SERVICE_URL}/reputation/deduct`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: renterId, points: 10 }),
    });
    if (!r.ok) console.error(`[s2] reputation deduct: ${await r.text()}`);
  } catch (e) {
    console.error(`[s2] reputation deduct: ${e.message}`);
  }

  await publishAmqp("SendPaymentConfirmation", {
    event: "SendPaymentConfirmation",
    rental_id: rentalId,
    renter_id: renterId,
    amount,
    type: "late",
  });

  return res.json({ ok: true, verified: true });
});

// ═══ Stripe (forward full event to payment-service) ══════════════════════════

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
        return res.status(400).json({ error: err.message });
      }
    } else {
      try {
        event = JSON.parse(req.body.toString());
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }
    if (event.type === "checkout.session.completed") {
      try {
        await fetch(`${PAYMENT_SERVICE_URL}/payment/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "stripe-signature": sig || "" },
          body: JSON.stringify(event),
        });
      } catch (e) {
        console.error(`[webhook] forward: ${e.message}`);
      }
    }
    return res.sendStatus(200);
  },
);

// ═══ Account (OutSystems + demo) ═════════════════════════════════════════════

app.post("/api/account/login", express.json(), async (req, res) => {
  const password = req.body.password ?? req.body.Password;
  const email = String(req.body.email ?? req.body.Email ?? "").trim();
  let data = {};
  try {
    data = await apiFetchJson(`${OUTSYSTEMS_BASE}/postmethod`, {
      method: "POST",
      body: JSON.stringify({ email, Password: password }),
    });
  } catch (err) {
    console.warn(`[account] OutSystems: ${err.message}`);
    data = {};
  }
  const pickId =
    data.AccountId ??
    data.accountId ??
    data.accountid ??
    data.accountID ??
    data.Id ??
    data.id;
  let id = "";
  if (pickId != null && pickId !== "") {
    const n = Number(pickId);
    if (!Number.isNaN(n) && n > 0) id = String(n);
  }
  let name = data.AccountName || data.name || data.Name || "";
  let role = String(data.Role || data.role || "renter").toLowerCase();
  if (!id && password === DEMO_LOGIN_PASSWORD) {
    const demo = DEMO_BY_EMAIL[email.toLowerCase()];
    if (demo) {
      id = demo.id;
      name = demo.name;
      role = demo.role;
    }
  }
  if (!id) return res.status(401).json({ error: "Invalid email or password" });
  return res.json({
    id,
    name,
    email: email || data.Email || data.email || "",
    phone: data.PhoneNo || data.phone || "",
    role,
  });
});

app.get("/api/account/:accountId", async (req, res) => {
  const paramId = Number(req.params.accountId);
  try {
    const data = await apiFetchJson(`${OUTSYSTEMS_BASE}/Account/${req.params.accountId}`);
    return res.json({
      id: String(data.Id ?? data.id ?? paramId),
      accountID: Number(data.AccountID ?? data.accountID ?? paramId) || paramId,
      accountName: data.AccountName ?? data.accountName ?? "",
      phoneNo: data.PhoneNo ?? data.phoneNo ?? "",
      email: data.email ?? data.Email ?? "",
    });
  } catch (err) {
    const demo = DEMO_BY_ID[paramId];
    if (demo) {
      return res.json({
        id: String(paramId),
        accountID: paramId,
        accountName: demo.accountName,
        phoneNo: DEMO_PHONE_NUMBER,
        email: demo.email,
      });
    }
    return res.status(404).json({ error: "Account not found" });
  }
});

// ═══ Debug / Demo helpers ════════════════════════════════════════════════════

/**
 * POST /api/debug/seed-late-return
 * Creates a COLLECTED rental with a past due date for Scenario 2 demo.
 * Body: { renter_id, equipment_id? }
 * Proxies to rental-service POST /rental/demo/seed-collected
 */
app.post("/api/debug/seed-late-return", express.json(), async (req, res) => {
  const { renter_id, equipment_id = 1 } = req.body;
  if (!renter_id) {
    return res.status(400).json({ error: "renter_id required" });
  }
  try {
    const data = await apiFetchJson(
      `${RENTAL_SERVICE_URL}/rental/demo/seed-collected?renter_id=${renter_id}&equipment_id=${equipment_id}`,
      { method: "POST" },
    );
    return res.status(201).json({
      rental_id: data.id,
      renter_id: data.renter_id,
      end_time: data.end_time,
      status: data.status,
    });
  } catch (err) {
    console.error(`[debug] seed-late-return: ${err.message}`);
    return res.status(502).json({ error: err.message });
  }
});

// ═══ Scenario 3 — Damage Claim Workflow ════════════════════════════════════

/**
 * POST /api/damage-workflow
 * Called by damage-claim-service after staff gives final approval on the damage amount.
 * Body: { claimId, equipmentId, renterId, rentalId, damageAmount }
 *
 * Step 1: Mark equipment under_repair
 * Step 2: Create Stripe Checkout for renter via payment-service
 * Step 3: Publish SendDamageNotification → RabbitMQ → SMS to renter
 */
app.post("/api/damage-workflow", express.json(), async (req, res) => {
  const { claimId, equipmentId, renterId, rentalId, damageAmount } = req.body;
  const missing = ["claimId", "equipmentId", "renterId", "rentalId", "damageAmount"]
    .filter(f => req.body[f] == null);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }

  console.log(`[damage-workflow] claimId=${claimId} equipId=${equipmentId} renterId=${renterId} rental=${rentalId} amount=${damageAmount}`);
  res.json({ ok: true }); // respond immediately so damage-claim-service doesn't block

  (async () => {
    try {
      // Step 1: Mark equipment under_repair
      try {
        await apiFetchJson(`${EQUIPMENT_SERVICE_URL}/equipment/${equipmentId}`, {
          method: "PUT",
          body: JSON.stringify({ status: "under_repair" }),
        });
        console.log(`[damage-workflow] equipment ${equipmentId} → under_repair`);
      } catch (err) {
        console.error(`[damage-workflow] equipment update failed: ${err.message}`);
      }

      // Step 2: Create damage payment → Stripe Checkout for renter
      let checkoutUrl = `${FRONTEND_URL}/my-rentals`;
      try {
        const pay = await apiFetchJson(`${PAYMENT_SERVICE_URL}/payment/damage`, {
          method: "POST",
          body: JSON.stringify({
            rental_id:  Number(rentalId),
            renter_id:  Number(renterId),
            claim_id:   Number(claimId),
            amount:     Number(damageAmount),
            item_name:  `Damage fee — claim #${claimId}`,
          }),
        });
        checkoutUrl = pay.checkout_url || checkoutUrl;
        console.log(`[damage-workflow] payment created paymentId=${pay.paymentID} url=${checkoutUrl}`);
      } catch (err) {
        console.error(`[damage-workflow] payment creation failed: ${err.message}`);
      }

      // Step 3: Notify renter via RabbitMQ → SMS
      await publishAmqp("SendDamageNotification", {
        event:        "SendDamageNotification",
        claim_id:     claimId,
        rental_id:    rentalId,
        renter_id:    renterId,
        amount:       damageAmount,
        checkout_url: checkoutUrl,
      });
      console.log(`[damage-workflow] Steps 1-3 complete — waiting for renter payment`);

    } catch (err) {
      console.error(`[damage-workflow] Unhandled error: ${err.message}`);
    }
  })();
});

/**
 * POST /internal/damage-payment-confirmed
 * Called by payment-service after Stripe webhook confirms damage fee payment.
 * Publishes final SMS confirmation to renter.
 */
app.post("/internal/damage-payment-confirmed", express.json(), async (req, res) => {
  const { rental_id, renter_id, payment_id, amount, claim_id } = req.body;
  res.json({ ok: true });

  console.log(`[damage-payment] Confirmed rentalId=${rental_id} claimId=${claim_id}`);

  // Deduct reputation from the renter who caused the damage (same as Scenario 2 late return)
  try {
    const r = await fetch(`${REPUTATION_SERVICE_URL}/reputation/deduct`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: renter_id, points: 10 }),
    });
    if (r.ok) {
      console.log(`[damage-payment] Reputation deducted for renter_id=${renter_id}`);
    } else {
      console.error(`[damage-payment] Reputation deduct failed: ${await r.text()}`);
    }
  } catch (err) {
    console.error(`[damage-payment] Reputation deduct error: ${err.message}`);
  }

  await publishAmqp("SendPaymentConfirmation", {
    event:     "SendPaymentConfirmation",
    rental_id,
    renter_id,
    amount,
    type:      "damage",
    claim_id,
  });

  console.log(`[damage-workflow] Scenario 3 complete — claimId=${claim_id}`);
});

app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    service: "orchestrator-proxy",
    mode: "scenario-1-2-3",
    stripe: stripe ? "yes" : "no",
  }),
);

app.listen(PORT, () => {
  console.log(`Orchestrator http://localhost:${PORT}`);
  console.log(`  rental=${RENTAL_SERVICE_URL} payment=${PAYMENT_SERVICE_URL}`);
});
