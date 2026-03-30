/**
 * api.js  —  wired to real Flask backend (camunda_proxy.py on port 8000)
 * Set VITE_USE_MOCKS=false in your .env to use the real backend.
 */

const useMocks   = import.meta.env.VITE_USE_MOCKS !== "false";
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Mock DB (only used when VITE_USE_MOCKS=true) ─────────────────────────────

const mockDb = {
  profiles: [
    { id: "owner-001",          fullName: "Alicia Tan",         phone: "+60120000001", role: "owner"  },
    { id: "owner-002",          fullName: "Marcus Lee",         phone: "+60120000002", role: "owner"  },
    { id: "owner-003",          fullName: "Farah Amin",         phone: "+60120000003", role: "owner"  },
    { id: "demo-renter-001",    fullName: "Demo Renter",        phone: "+60195550001", role: "renter" },
    { id: "seed-renter-001",    fullName: "Seed Booking User",  phone: "+60195550002", role: "renter" },
    { id: "blocked-renter-001", fullName: "Blocked Demo User",  phone: "+60195550003", role: "renter" }
  ],
  equipment: [
    {
      id: "eq-1001", ownerId: "owner-001", name: "DJI Drone Mini",
      category: "Drone", hourlyRate: 12, location: "Kuala Lumpur",
      status: "Available", description: "Lightweight drone for photography and short shoots."
    },
    {
      id: "eq-1002", ownerId: "owner-002", name: "Bosch Power Drill",
      category: "Tools", hourlyRate: 6, location: "Subang Jaya",
      status: "Available", description: "Cordless drill with charger and two batteries."
    },
    {
      id: "eq-1003", ownerId: "owner-003", name: "Sony Mirrorless Camera",
      category: "Camera", hourlyRate: 18, location: "Petaling Jaya",
      status: "UnderRepair", description: "Camera body only, ideal for creators and hobbyists."
    }
  ],
  rentals: [
    {
      id: "rent-seed-01", renterId: "seed-renter-001", equipmentId: "eq-1002",
      startTime: buildSeedStart(1, 10, 0), endTime: buildSeedStart(1, 12, 0),
      hourlyRate: 6, pickupLocation: "Subang Jaya", status: "Confirmed",
      paymentStatus: "Completed", workflowId: "wf-seed-01", ownerId: "owner-002",
      createdAt: new Date().toISOString(),
      processNotes: ["Seed reservation created to demonstrate overlap checking."]
    }
  ],
  payments: [
    {
      id: "pay-late-seed-01", renterId: "blocked-renter-001", rentalId: "rent-old-01",
      amount: 25, type: "late_fee", status: "unpaid", createdAt: new Date().toISOString()
    }
  ],
  claims: []
};

const assumptions = [
  "User profile data lives in a separate service; equipment only stores ownerId.",
  "The browser calls the Flask proxy — never Camunda directly.",
  "Camunda credentials are kept server-side in camunda_proxy.py."
];

function getProfile(userId) {
  const profile = mockDb.profiles.find((p) => p.id === userId);
  if (!profile) throw new Error(`Profile ${userId} not found.`);
  return profile;
}

function getEquipmentReservations(equipmentId) {
  return mockDb.rentals
    .filter((r) =>
      r.equipmentId === equipmentId &&
      ["Created","PendingPayment","Confirmed","InUse","ReturnRequested","PendingInspection","Late"].includes(r.status)
    )
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .map((r) => ({ rentalId: r.id, startTime: r.startTime, endTime: r.endTime, status: r.status }));
}

function getDerivedEquipmentStatus(equipment) {
  if (["UnderRepair","Unavailable"].includes(equipment.status)) return equipment.status;
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

// ─── Public API functions ──────────────────────────────────────────────────────

export async function getEquipment() {
  if (!useMocks) return request("/api/equipment");
  await sleep();
  return mockDb.equipment.map(hydrateEquipment);
}

/**
 * createRental — starts the Camunda rental-workflow process.
 *
 * REAL MODE: POSTs to Flask proxy → Camunda 8
 * Returns { processInstanceKey, status }
 * Then call pollStripeUrl(processInstanceKey) to get the Stripe redirect URL.
 *
 * MOCK MODE: simulates the full flow locally.
 */
export async function createRental(payload) {
  const normalisedPayload = {
    ...payload,
    startTime: normaliseDateInput(payload.startTime),
    endTime:   normaliseDateInput(payload.endTime)
  };

  if (!useMocks) {
    // Real mode — hits Flask proxy which starts Camunda process
    return request("/api/rentals", {
      method: "POST",
      body: JSON.stringify(normalisedPayload)
    });
  }

  // ── Mock mode ──
  await sleep();

  const equipment = mockDb.equipment.find((e) => e.id === normalisedPayload.equipmentId);
  if (!equipment) throw new Error("Equipment not found.");

  if (["UnderRepair","Unavailable"].includes(equipment.status)) {
    throw new Error(`Equipment ${equipment.id} cannot be rented: ${equipment.status}.`);
  }

  const unpaidFees = mockDb.payments.filter(
    (p) => p.renterId === normalisedPayload.renterId && p.status === "unpaid"
  );
  if (unpaidFees.length > 0) {
    const total = unpaidFees.reduce((s, p) => s + Number(p.amount || 0), 0);
    throw new Error(`Renter has outstanding unpaid fees: $${total.toFixed(2)}.`);
  }

  const overlapping = mockDb.rentals.find((r) =>
    r.equipmentId === normalisedPayload.equipmentId &&
    ["Created","PendingPayment","Confirmed","InUse","ReturnRequested","PendingInspection","Late"].includes(r.status) &&
    hasOverlap(r.startTime, r.endTime, normalisedPayload.startTime, normalisedPayload.endTime)
  );
  if (overlapping) throw new Error(`Time overlaps with existing rental ${overlapping.id}.`);

  const owner   = getProfile(equipment.ownerId);
  const start   = new Date(normalisedPayload.startTime);
  const end     = new Date(normalisedPayload.endTime);
  const hours   = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60)));
  const wfId    = makeId("wf");

  const rental = {
    id: makeId("rent"),
    renterId:        normalisedPayload.renterId,
    equipmentId:     normalisedPayload.equipmentId,
    ownerId:         equipment.ownerId,
    ownerName:       owner.fullName,
    ownerPhone:      owner.phone,
    startTime:       normalisedPayload.startTime,
    endTime:         normalisedPayload.endTime,
    hourlyRate:      equipment.hourlyRate,
    pickupLocation:  equipment.location,
    status:          "Confirmed",
    paymentId:       makeId("pay"),
    paymentStatus:   "Completed",
    workflowId:      wfId,
    createdAt:       new Date().toISOString(),
    processNotes: [
      "Mock mode: Camunda process would start here in real mode.",
      "In real mode, poll /api/rentals/{processInstanceKey}/stripe-url for redirect."
    ]
  };

  mockDb.payments.unshift({
    id: rental.paymentId, renterId: rental.renterId, rentalId: rental.id,
    amount: hours * equipment.hourlyRate, type: "rental",
    status: "completed", createdAt: new Date().toISOString()
  });
  mockDb.rentals.unshift(rental);
  return rental;
}

/**
 * pollStripeUrl — call this after createRental() in real mode.
 * Polls every 2 seconds until the redirect-to-stripe worker
 * has written the Stripe URL to your DB.
 *
 * Usage:
 *   const { processInstanceKey } = await createRental(form);
 *   const stripeUrl = await pollStripeUrl(processInstanceKey);
 *   window.location.href = stripeUrl;
 */
export async function pollStripeUrl(processInstanceKey, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);
    const data = await request(`/api/rentals/${processInstanceKey}/stripe-url`);
    if (data.stripeRedirectUrl) return data.stripeRedirectUrl;
  }
  throw new Error("Timed out waiting for Stripe redirect URL. Check your Python workers are running.");
}

export async function listRentals() {
  if (!useMocks) return request("/api/rentals");
  await sleep();
  return mockDb.rentals.map(hydrateRental);
}

export async function requestReturn(rentalId) {
  if (!useMocks) return request(`/api/rentals/${rentalId}/request-return`, { method: "PUT" });
  await sleep();
  const rental = mockDb.rentals.find((r) => r.id === rentalId);
  if (!rental) throw new Error("Rental not found.");
  if (rental.status === "Completed") throw new Error("Already completed.");
  rental.status = "PendingInspection";
  return hydrateRental(rental);
}

export async function completeInspection(rentalId, outcome = "NoDamage") {
  if (!useMocks) {
    return request(`/api/rentals/${rentalId}/inspection-complete`, {
      method: "PUT",
      body: JSON.stringify({ outcome })
    });
  }
  await sleep();
  const rental = mockDb.rentals.find((r) => r.id === rentalId);
  if (!rental) throw new Error("Rental not found.");
  if (rental.status !== "PendingInspection") throw new Error("Must be pending inspection first.");
  rental.status = "Completed";
  return hydrateRental(rental);
}

export async function submitDamageClaim(payload) {
  if (!useMocks) {
    return request("/api/damage-claims", { method: "POST", body: JSON.stringify(payload) });
  }
  await sleep();
  const rental = mockDb.rentals.find((r) => r.id === payload.rentalId);
  if (!rental) throw new Error("Rental not found for claim.");
  const claim = {
    id: makeId("claim"), rentalId: payload.rentalId,
    damageType: payload.damageType, notes: payload.notes,
    status: "Verified", severity: "medium", confidence: 0.88,
    estimateAmount: 15, createdAt: new Date().toISOString()
  };
  const equipment = mockDb.equipment.find((e) => e.id === rental.equipmentId);
  if (equipment) equipment.status = "UnderRepair";
  mockDb.claims.unshift(claim);
  return claim;
}

export async function listClaims() {
  if (!useMocks) return request("/api/damage-claims");
  await sleep();
  return mockDb.claims;
}

export async function getAssumptions() {
  if (!useMocks) {
    const response = await request("/api/system/assumptions");
    return response.assumptions || assumptions;
  }
  await sleep(100);
  return assumptions;
}

export function getConfig() {
  return { useMocks, apiBaseUrl };
}
