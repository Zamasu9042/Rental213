const useMocks = import.meta.env.VITE_USE_MOCKS !== "false";
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

function buildSeedStart(daysFromNow, hour, minute = 0) {
  const value = new Date();
  value.setDate(value.getDate() + daysFromNow);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
}

const mockDb = {
  profiles: [
    {
      id: "owner-001",
      fullName: "Alicia Tan",
      phone: "+60120000001",
      role: "owner"
    },
    {
      id: "owner-002",
      fullName: "Marcus Lee",
      phone: "+60120000002",
      role: "owner"
    },
    {
      id: "owner-003",
      fullName: "Farah Amin",
      phone: "+60120000003",
      role: "owner"
    },
    {
      id: "demo-renter-001",
      fullName: "Demo Renter",
      phone: "+60195550001",
      role: "renter"
    },
    {
      id: "seed-renter-001",
      fullName: "Seed Booking User",
      phone: "+60195550002",
      role: "renter"
    },
    {
      id: "blocked-renter-001",
      fullName: "Blocked Demo User",
      phone: "+60195550003",
      role: "renter"
    }
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
      processNotes: [
        "Seed reservation created to demonstrate overlap checking."
      ]
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

const assumptions = [
  "User profile data lives in a separate service; equipment only stores ownerId.",
  "The browser only talks to the backend rental API; a server-side workflow adapter simulates Camunda.",
  "Equipment status represents physical readiness while booking conflicts are enforced by rental time-window overlap."
];

function sleep(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normaliseDateInput(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}

function hasOverlap(aStart, aEnd, bStart, bEnd) {
  const aStartMs = new Date(aStart).getTime();
  const aEndMs = new Date(aEnd).getTime();
  const bStartMs = new Date(bStart).getTime();
  const bEndMs = new Date(bEnd).getTime();

  if ([aStartMs, aEndMs, bStartMs, bEndMs].some(Number.isNaN)) {
    return false;
  }

  return aStartMs < bEndMs && aEndMs > bStartMs;
}

function getProfile(userId) {
  const profile = mockDb.profiles.find((item) => item.id === userId);
  if (!profile) {
    throw new Error(`Profile ${userId} not found.`);
  }
  return profile;
}

function getEquipmentReservations(equipmentId) {
  return mockDb.rentals
    .filter((rental) =>
      rental.equipmentId === equipmentId &&
      ["Created", "PendingPayment", "Confirmed", "InUse", "ReturnRequested", "PendingInspection", "Late"].includes(rental.status)
    )
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .map((rental) => ({
      rentalId: rental.id,
      startTime: rental.startTime,
      endTime: rental.endTime,
      status: rental.status
    }));
}

function getDerivedEquipmentStatus(equipment) {
  if (equipment.status === "UnderRepair" || equipment.status === "Unavailable") {
    return equipment.status;
  }

  const now = Date.now();
  const inUse = getEquipmentReservations(equipment.id).some((reservation) => {
    const start = new Date(reservation.startTime).getTime();
    const end = new Date(reservation.endTime).getTime();
    return start <= now && end > now;
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
  return {
    ...rental,
    ownerName: owner.fullName,
    ownerPhone: owner.phone
  };
}

function startWorkflowServerSide(payload) {
  return {
    id: makeId("wf"),
    mode: "mock",
    currentStep: "PaymentCompleted",
    history: [
      {
        step: "StartRentalWorkflow",
        note: "Frontend called backend rental API; backend started workflow server-side."
      },
      {
        step: "ValidateEligibility",
        note: "Backend checked outstanding fees and overlapping reservation windows."
      },
      {
        step: "CreateRentalAndTakePayment",
        note: "Backend completed orchestration without exposing Camunda to the browser."
      }
    ]
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "x-correlation-id": crypto.randomUUID(),
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body);
      throw new Error(parsed.message || parsed.error || `Request failed with ${response.status}`);
    } catch {
      throw new Error(body || `Request failed with ${response.status}`);
    }
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export async function getEquipment() {
  if (!useMocks) {
    return request("/api/equipment");
  }
  await sleep();
  return mockDb.equipment.map(hydrateEquipment);
}

export async function createRental(payload) {
  const normalisedPayload = {
    ...payload,
    startTime: normaliseDateInput(payload.startTime),
    endTime: normaliseDateInput(payload.endTime)
  };

  if (!useMocks) {
    return request("/api/rentals", {
      method: "POST",
      body: JSON.stringify(normalisedPayload)
    });
  }

  await sleep();

  const equipment = mockDb.equipment.find((item) => item.id === normalisedPayload.equipmentId);
  if (!equipment) {
    throw new Error("Equipment not found.");
  }

  if (["UnderRepair", "Unavailable"].includes(equipment.status)) {
    throw new Error(`Equipment ${equipment.id} cannot be rented because it is ${equipment.status}.`);
  }

  const unpaidFees = mockDb.payments.filter(
    (payment) =>
      payment.renterId === normalisedPayload.renterId && payment.status === "unpaid"
  );

  if (unpaidFees.length > 0) {
    const total = unpaidFees.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    throw new Error(
      `Renter ${normalisedPayload.renterId} has outstanding unpaid fees totaling $${total.toFixed(2)}.`
    );
  }

  const overlapping = mockDb.rentals.find((rental) => {
    if (rental.equipmentId !== normalisedPayload.equipmentId) {
      return false;
    }
    if (!["Created", "PendingPayment", "Confirmed", "InUse", "ReturnRequested", "PendingInspection", "Late"].includes(rental.status)) {
      return false;
    }
    return hasOverlap(
      rental.startTime,
      rental.endTime,
      normalisedPayload.startTime,
      normalisedPayload.endTime
    );
  });

  if (overlapping) {
    throw new Error(
      `Requested time overlaps with existing rental ${overlapping.id}.`
    );
  }

  const workflow = startWorkflowServerSide(normalisedPayload);
  const owner = getProfile(equipment.ownerId);
  const start = new Date(normalisedPayload.startTime);
  const end = new Date(normalisedPayload.endTime);
  const durationHours = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60)));

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
    workflowId: workflow.id,
    createdAt: new Date().toISOString(),
    processNotes: [
      "Owner contact came from the profile service.",
      "Workflow started server-side, so the browser never called Camunda.",
      "Availability was enforced by overlapping rental windows."
    ]
  };

  mockDb.payments.unshift({
    id: rental.paymentId,
    renterId: rental.renterId,
    rentalId: rental.id,
    amount: durationHours * equipment.hourlyRate,
    type: "rental",
    status: "completed",
    createdAt: new Date().toISOString()
  });
  mockDb.rentals.unshift(rental);
  return rental;
}

export async function listRentals() {
  if (!useMocks) {
    return request("/api/rentals");
  }
  await sleep();
  return mockDb.rentals.map(hydrateRental);
}

export async function requestReturn(rentalId) {
  if (!useMocks) {
    return request(`/api/rentals/${rentalId}/request-return`, {
      method: "PUT"
    });
  }

  await sleep();
  const rental = mockDb.rentals.find((item) => item.id === rentalId);
  if (!rental) {
    throw new Error("Rental not found.");
  }
  if (rental.status === "Completed") {
    throw new Error("Rental is already completed.");
  }
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
  const rental = mockDb.rentals.find((item) => item.id === rentalId);
  if (!rental) {
    throw new Error("Rental not found.");
  }
  if (rental.status !== "PendingInspection") {
    throw new Error("Rental must be pending inspection first.");
  }

  rental.status = "Completed";
  return hydrateRental(rental);
}

export async function submitDamageClaim(payload) {
  if (!useMocks) {
    return request("/api/damage-claims", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  await sleep();
  const rental = mockDb.rentals.find((item) => item.id === payload.rentalId);
  if (!rental) {
    throw new Error("Rental not found for claim.");
  }

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

  const equipment = mockDb.equipment.find((item) => item.id === rental.equipmentId);
  if (equipment) {
    equipment.status = "UnderRepair";
  }
  mockDb.claims.unshift(claim);
  return claim;
}

export async function listClaims() {
  if (!useMocks) {
    return request("/api/damage-claims");
  }
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
  return {
    useMocks,
    apiBaseUrl
  };
}
