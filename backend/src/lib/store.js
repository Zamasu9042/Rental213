import { addDays } from "./time.js";

export function createStore() {
  const now = new Date();

  return {
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
        startTime: addDays(now, 1, 10, 0),
        endTime: addDays(now, 1, 12, 0),
        hourlyRate: 6,
        pickupLocation: "Subang Jaya",
        status: "Confirmed",
        paymentStatus: "Completed",
        workflowId: "wf-seed-01",
        ownerId: "owner-002",
        ownerName: "Marcus Lee",
        ownerPhone: "+60120000002",
        createdAt: now.toISOString(),
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
        createdAt: now.toISOString()
      }
    ],
    claims: [],
    workflowRuns: []
  };
}
