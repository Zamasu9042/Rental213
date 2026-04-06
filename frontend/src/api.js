/**
 * API layer: mock mode OR Python microservices (no Camunda / no monolithic /api).
 * With VITE_USE_MOCKS=false, requests go to /services/* (Vite proxies to ports 8001,8002,8004,8006).
 */

const useMocks = import.meta.env.VITE_USE_MOCKS !== "false";

// ─── Microservice HTTP (relative URLs → vite.config.js proxy) ─────────────────

async function msFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body != null && !(options.body instanceof FormData)) {
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  const response = await fetch(path, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    let msg = text || `Request failed: ${response.status}`;
    try {
      const j = JSON.parse(text);
      if (typeof j.detail === "string") {
        msg = j.detail;
      } else if (Array.isArray(j.detail)) {
        msg = j.detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
      }
    } catch {
      /* keep msg */
    }
    throw new Error(msg);
  }

  const ct = response.headers.get("content-type") || "";
  if (response.status === 204) return null;
  return ct.includes("application/json") ? response.json() : response.text();
}

function titleCaseStatus(s) {
  const x = (s || "").toLowerCase();
  if (x === "available") return "Available";
  if (x === "rented") return "Rented";
  if (x === "underrepair" || x === "under_repair") return "UnderRepair";
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Unknown";
}

export function normalizeRenterId(renterId) {
  if (typeof renterId === "number" && !Number.isNaN(renterId)) {
    return renterId;
  }
  const s = String(renterId ?? "").trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const map = {
    "demo-renter-001": 1001,
    "seed-renter-001": 1002,
    "blocked-renter-001": 1003,
    "owner-001": 1002,
    "owner-002": 1002,
    "owner-003": 1002
  };
  if (map[s] != null) return map[s];
  throw new Error(
    `Unknown renter id "${s}". Use a numeric account id (e.g. 1001) or a known demo key.`
  );
}

export function normalizeEquipmentId(equipmentId) {
  const s = String(equipmentId ?? "").trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  throw new Error(
    `Equipment id must be numeric (pick an item from the catalog). Got: "${s}"`
  );
}

function mapRentalFromBackend(r) {
  const st = (r.status || "").toUpperCase();
  let uiStatus = r.status;
  if (st === "ACTIVE") uiStatus = "Active";
  else if (st === "PENDING") uiStatus = "PendingPayment";
  else if (st === "RETURNED" || st === "COMPLETED") uiStatus = "Completed";
  else if (st === "LATE") uiStatus = "Late";

  return {
    id: String(r.id),
    renterId: String(r.renter_id),
    equipmentId: String(r.equipment_id),
    startTime: r.start_time,
    endTime: r.end_time,
    status: uiStatus,
    paymentStatus: "—",
    workflowId: null,
    ownerName: "",
    ownerPhone: "",
    hourlyRate: r.hourly_rate,
    pickupLocation: r.pickup_location
  };
}

async function enrichRentalWithOwner(rental) {
  try {
    const eq = await msFetch(`/services/equipment/equipment/${rental.equipmentId}`);
    const acc = await msFetch(`/services/account/account/${eq.owner_id}`);
    return {
      ...rental,
      ownerName: acc.accountName || `Owner #${eq.owner_id}`,
      ownerPhone: acc.phoneNo || "—"
    };
  } catch {
    return rental;
  }
}

async function enrichEquipmentRow(row) {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 90);
  const ds = today.toISOString().slice(0, 10);
  const de = end.toISOString().slice(0, 10);

  let reservedWindows = [];
  try {
    const cal = await msFetch(
      `/services/rental/rental/${row.id}/calendar/${ds}/${de}`
    );
    reservedWindows = (cal || []).map((r) => ({
      rentalId: String(r.id),
      startTime: r.start_time,
      endTime: r.end_time,
      status: r.status
    }));
  } catch {
    /* calendar optional */
  }

  let ownerName = `Owner #${row.owner_id}`;
  let ownerPhone = "—";
  try {
    const acc = await msFetch(`/services/account/account/${row.owner_id}`);
    ownerName = acc.accountName || ownerName;
    ownerPhone = acc.phoneNo || ownerPhone;
  } catch {
    /* account optional */
  }

  return {
    id: String(row.id),
    name: row.item_name,
    category: row.category,
    status: titleCaseStatus(row.status),
    hourlyRate: Number(row.hourly_rate),
    location: row.pickup_location,
    description: `${row.item_name} — ${row.category} · ${row.pickup_location}`,
    ownerId: String(row.owner_id),
    ownerName,
    ownerPhone,
    reservedWindows
  };
}

// ─── Helpers (shared) ─────────────────────────────────────────────────────────

function buildSeedStart(daysFromNow, hour, minute = 0) {
  const value = new Date();
  value.setDate(value.getDate() + daysFromNow);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
}

function sleep(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normaliseDateInput(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

function hasOverlap(aStart, aEnd, bStart, bEnd) {
  const aS = new Date(aStart).getTime();
  const aE = new Date(aEnd).getTime();
  const bS = new Date(bStart).getTime();
  const bE = new Date(bEnd).getTime();
  if ([aS, aE, bS, bE].some(Number.isNaN)) return false;
  return aS < bE && aE > bS;
}

async function request(path, options = {}) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body);
      throw new Error(parsed.message || parsed.error || `Request failed: ${response.status}`);
    } catch {
      throw new Error(body || `Request failed: ${response.status}`);
    }
  }

  const ct = response.headers.get("content-type") || "";
  return ct.includes("application/json") ? response.json() : response.text();
}

// ─── Mock DB ─────────────────────────────────────────────────────────────────

const mockDb = {
  profiles: [
    { id: "owner-001", fullName: "Alicia Tan", phone: "+60120000001", role: "owner" },
    { id: "owner-002", fullName: "Marcus Lee", phone: "+60120000002", role: "owner" },
    { id: "owner-003", fullName: "Farah Amin", phone: "+60120000003", role: "owner" },
    { id: "demo-renter-001", fullName: "Demo Renter", phone: "+60195550001", role: "renter" },
    { id: "seed-renter-001", fullName: "Seed Booking User", phone: "+60195550002", role: "renter" },
    { id: "blocked-renter-001", fullName: "Blocked Demo User", phone: "+60195550003", role: "renter" }
  ],
  equipment: [
    {
      id: "eq-1001",
      ownerId: "owner-001",
      name: "DJI Drone Mini",
      category: "Drone",
      hourlyRate: 12,
      location: "Kuala Lumpur",
      status: "Available",
      description: "Lightweight drone for photography and short shoots."
    },
    {
      id: "eq-1002",
      ownerId: "owner-002",
      name: "Bosch Power Drill",
      category: "Tools",
      hourlyRate: 6,
      location: "Subang Jaya",
      status: "Available",
      description: "Cordless drill with charger and two batteries."
    },
    {
      id: "eq-1003",
      ownerId: "owner-003",
      name: "Sony Mirrorless Camera",
      category: "Camera",
      hourlyRate: 18,
      location: "Petaling Jaya",
      status: "UnderRepair",
      description: "Camera body only, ideal for creators and hobbyists."
    }
  ],
  rentals: [
    {
      id: "rent-seed-01",
      renterId: "seed-renter-001",
      equipmentId: "eq-1002",
      startTime: buildSeedStart(1, 10, 0),
      endTime: buildSeedStart(1, 12, 0),
      hourlyRate: 6,
      pickupLocation: "Subang Jaya",
      status: "Confirmed",
      paymentStatus: "Completed",
      workflowId: "wf-seed-01",
      ownerId: "owner-002",
      createdAt: new Date().toISOString(),
      processNotes: ["Seed reservation created to demonstrate overlap checking."]
    }
  ],
  payments: [
    {
      id: "pay-late-seed-01",
      renterId: "blocked-renter-001",
      rentalId: "rent-old-01",
      amount: 25,
      type: "late_fee",
      status: "unpaid",
      createdAt: new Date().toISOString()
    }
  ],
  claims: []
};

const assumptionsMock = [
  "User profile data lives in a separate service; equipment only stores ownerId.",
  "The browser calls the Flask proxy — never Camunda directly.",
  "Camunda credentials are kept server-side in camunda_proxy.py."
];

const assumptionsMicroservices = [
  "Python microservices via Docker Compose (equipment 8001, rental 8002, damage 8004, account 8006).",
  "Vite dev server proxies /services/* → localhost; no Camunda from the browser.",
  "Use renter id 1001 / 1002 (see account-service seed) and pick numeric equipment ids from the catalog.",
  "Returns: one step — Request return calls PUT /rental/{id}/return (no separate inspection endpoint)."
];

function getProfile(userId) {
  const profile = mockDb.profiles.find((p) => p.id === userId);
  if (!profile) throw new Error(`Profile ${userId} not found.`);
  return profile;
}

function getEquipmentReservations(equipmentId) {
  return mockDb.rentals
    .filter(
      (r) =>
        r.equipmentId === equipmentId &&
        [
          "Created",
          "PendingPayment",
          "Confirmed",
          "InUse",
          "ReturnRequested",
          "PendingInspection",
          "Late"
        ].includes(r.status)
    )
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .map((r) => ({
      rentalId: r.id,
      startTime: r.startTime,
      endTime: r.endTime,
      status: r.status
    }));
}

function getDerivedEquipmentStatus(equipment) {
  if (["UnderRepair", "Unavailable"].includes(equipment.status)) return equipment.status;
  const now = Date.now();
  const inUse = getEquipmentReservations(equipment.id).some((r) => {
    const s = new Date(r.startTime).getTime();
    const e = new Date(r.endTime).getTime();
    return s <= now && e > now;
  });
  return inUse ? "Rented" : "Available";
}

function hydrateEquipment(equipment) {
  const owner = getProfile(equipment.ownerId);
  return {
    ...equipment,
    status: getDerivedEquipmentStatus(equipment),
    ownerName: owner.fullName,
    ownerPhone: owner.phone,
    reservedWindows: getEquipmentReservations(equipment.id)
  };
}

function hydrateRental(rental) {
  const owner = getProfile(rental.ownerId);
  return { ...rental, ownerName: owner.fullName, ownerPhone: owner.phone };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getEquipment() {
  if (!useMocks) {
    const rows = await msFetch("/services/equipment/equipment");
    const list = Array.isArray(rows) ? rows : [];
    const enriched = [];
    for (const row of list) {
      enriched.push(await enrichEquipmentRow(row));
    }
    return enriched;
  }
  await sleep();
  return mockDb.equipment.map(hydrateEquipment);
}

/**
 * Rentals for dashboard (renter-scoped). Pass renter id string or number.
 */
export async function listRentals(renterId) {
  if (!useMocks) {
    const rid = normalizeRenterId(renterId);
    const dash = await msFetch(`/services/rental/rental/renter/${rid}/dashboard`);
    const raw = dash.rentals || [];
    const mapped = raw.map((r) => mapRentalFromBackend(r));
    const out = [];
    for (const m of mapped) {
      out.push(await enrichRentalWithOwner(m));
    }
    return out;
  }
  await sleep();
  return mockDb.rentals.map(hydrateRental);
}

export async function getRenterDashboard(renterId) {
  if (!useMocks) {
    const rid = normalizeRenterId(renterId);
    return msFetch(`/services/rental/rental/renter/${rid}/dashboard`);
  }
  await sleep();
  return {
    renter_id: renterId,
    should_show_equipment_browse: true,
    rentals: mockDb.rentals
  };
}

export async function createRental(payload) {
  const normalisedPayload = {
    ...payload,
    startTime: normaliseDateInput(payload.startTime),
    endTime: normaliseDateInput(payload.endTime)
  };

  if (!useMocks) {
    const mode =
      import.meta.env.VITE_CHECKOUT_MODE === "pending_payment"
        ? "pending_payment"
        : "immediate";
    const body = {
      renter_id: normalizeRenterId(normalisedPayload.renterId),
      equipment_id: normalizeEquipmentId(normalisedPayload.equipmentId),
      start_time: normalisedPayload.startTime,
      end_time: normalisedPayload.endTime,
      checkout_mode: mode
    };
    const raw = await msFetch("/services/rental/rental", {
      method: "POST",
      body: JSON.stringify(body)
    });
    const mapped = mapRentalFromBackend(raw);
    return enrichRentalWithOwner(mapped);
  }

  await sleep();

  const equipment = mockDb.equipment.find((e) => e.id === normalisedPayload.equipmentId);
  if (!equipment) throw new Error("Equipment not found.");

  if (["UnderRepair", "Unavailable"].includes(equipment.status)) {
    throw new Error(`Equipment ${equipment.id} cannot be rented: ${equipment.status}.`);
  }

  const unpaidFees = mockDb.payments.filter(
    (p) => p.renterId === normalisedPayload.renterId && p.status === "unpaid"
  );
  if (unpaidFees.length > 0) {
    const total = unpaidFees.reduce((s, p) => s + Number(p.amount || 0), 0);
    throw new Error(`Renter has outstanding unpaid fees: $${total.toFixed(2)}.`);
  }

  const overlapping = mockDb.rentals.find(
    (r) =>
      r.equipmentId === normalisedPayload.equipmentId &&
      [
        "Created",
        "PendingPayment",
        "Confirmed",
        "InUse",
        "ReturnRequested",
        "PendingInspection",
        "Late"
      ].includes(r.status) &&
      hasOverlap(
        r.startTime,
        r.endTime,
        normalisedPayload.startTime,
        normalisedPayload.endTime
      )
  );
  if (overlapping) throw new Error(`Time overlaps with existing rental ${overlapping.id}.`);

  const owner = getProfile(equipment.ownerId);
  const start = new Date(normalisedPayload.startTime);
  const end = new Date(normalisedPayload.endTime);
  const hours = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60)));
  const wfId = makeId("wf");

  const rental = {
    id: makeId("rent"),
    renterId: normalisedPayload.renterId,
    equipmentId: normalisedPayload.equipmentId,
    ownerId: equipment.ownerId,
    ownerName: owner.fullName,
    ownerPhone: owner.phone,
    startTime: normalisedPayload.startTime,
    endTime: normalisedPayload.endTime,
    hourlyRate: equipment.hourlyRate,
    pickupLocation: equipment.location,
    status: "Confirmed",
    paymentId: makeId("pay"),
    paymentStatus: "Completed",
    workflowId: wfId,
    createdAt: new Date().toISOString(),
    processNotes: [
      "Mock mode: Camunda process would start here in real mode.",
      "In real mode, poll /api/rentals/{processInstanceKey}/stripe-url for redirect."
    ]
  };

  mockDb.payments.unshift({
    id: rental.paymentId,
    renterId: rental.renterId,
    rentalId: rental.id,
    amount: hours * equipment.hourlyRate,
    type: "rental",
    status: "completed",
    createdAt: new Date().toISOString()
  });
  mockDb.rentals.unshift(rental);
  return rental;
}

export async function pollStripeUrl(processInstanceKey, maxAttempts = 20) {
  if (!useMocks) {
    throw new Error(
      "Stripe / Camunda polling is not used with the Python microservice stack."
    );
  }
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);
    const data = await request(`/api/rentals/${processInstanceKey}/stripe-url`);
    if (data.stripeRedirectUrl) return data.stripeRedirectUrl;
  }
  throw new Error("Timed out waiting for Stripe redirect URL. Check your Python workers are running.");
}

export async function requestReturn(rentalId) {
  if (!useMocks) {
    const id = String(rentalId).trim();
    return msFetch(`/services/rental/rental/${encodeURIComponent(id)}/return`, {
      method: "PUT",
      body: JSON.stringify({})
    }).then((raw) => enrichRentalWithOwner(mapRentalFromBackend(raw)));
  }
  await sleep();
  const rental = mockDb.rentals.find((r) => r.id === rentalId);
  if (!rental) throw new Error("Rental not found.");
  if (rental.status === "Completed") throw new Error("Already completed.");
  rental.status = "PendingInspection";
  return hydrateRental(rental);
}

export async function completeInspection(rentalId, outcome = "NoDamage") {
  if (!useMocks) {
    throw new Error(
      "The rental microservice completes return in one step (Request return). No separate inspection endpoint."
    );
  }
  await sleep();
  const rental = mockDb.rentals.find((r) => r.id === rentalId);
  if (!rental) throw new Error("Rental not found.");
  if (rental.status !== "PendingInspection") {
    throw new Error("Must be pending inspection first.");
  }
  rental.status = "Completed";
  return hydrateRental(rental);
}

export async function submitDamageClaim(payload) {
  if (!useMocks) {
    const rentalId = parseInt(String(payload.rentalId).trim(), 10);
    if (Number.isNaN(rentalId)) {
      throw new Error("Rental id must be numeric for the damage service.");
    }
    const claim = await msFetch("/services/damage/damage/claim", {
      method: "POST",
      body: JSON.stringify({ rental_id: rentalId })
    });
    if (payload.photoFile instanceof File) {
      const fd = new FormData();
      fd.append("claim_id", claim.claimID);
      fd.append("file", payload.photoFile);
      await msFetch("/services/damage/damage/photo", {
        method: "POST",
        body: fd
      });
      if (payload.autoAnalyze !== false) {
        await msFetch("/services/damage/damage/analyze", {
          method: "POST",
          body: JSON.stringify({ claim_id: claim.claimID })
        });
        const updated = await msFetch(`/services/damage/damage/${claim.claimID}`);
        return mapClaimFromBackend(updated);
      }
    }
    return mapClaimFromBackend(claim);
  }
  await sleep();
  const rental = mockDb.rentals.find((r) => r.id === payload.rentalId);
  if (!rental) throw new Error("Rental not found for claim.");
  const claim = {
    id: makeId("claim"),
    rentalId: payload.rentalId,
    damageType: payload.damageType,
    notes: payload.notes,
    status: "Verified",
    severity: "medium",
    confidence: 0.88,
    estimateAmount: 15,
    createdAt: new Date().toISOString()
  };
  const equipment = mockDb.equipment.find((e) => e.id === rental.equipmentId);
  if (equipment) equipment.status = "UnderRepair";
  mockDb.claims.unshift(claim);
  return claim;
}

function mapClaimFromBackend(c) {
  return {
    id: c.claimID || String(c.id ?? ""),
    rentalId: String(c.rentalID ?? ""),
    damageType: c.damageType || "—",
    notes: "",
    status: c.status || "—",
    severity: c.severity ?? "—",
    confidence: c.confidence ?? "—",
    estimateAmount: null,
    createdAt: c.created_at || null
  };
}

export async function listClaims() {
  if (!useMocks) {
    const rows = await msFetch("/services/damage/damage/pending");
    const list = Array.isArray(rows) ? rows : [];
    return list.map(mapClaimFromBackend);
  }
  await sleep();
  return mockDb.claims;
}

export async function getAssumptions() {
  if (!useMocks) {
    return assumptionsMicroservices;
  }
  try {
    if (import.meta.env.VITE_API_BASE_URL) {
      const response = await request("/api/system/assumptions");
      return response.assumptions || assumptionsMock;
    }
  } catch {
    /* fall through */
  }
  await sleep(100);
  return assumptionsMock;
}

export function getConfig() {
  return {
    useMocks,
    microserviceMode: !useMocks,
    apiBaseUrl: useMocks ? import.meta.env.VITE_API_BASE_URL || "http://localhost:4000" : "(Vite proxy /services/*)"
  };
}
