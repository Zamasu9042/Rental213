import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

async function main() {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const equipmentResponse = await fetch(`${base}/api/equipment`);
    assert.equal(equipmentResponse.status, 200);
    const equipment = await equipmentResponse.json();
    assert.ok(Array.isArray(equipment));
    const drill = equipment.find((item) => item.id === "eq-1002");
    assert.ok(drill);
    assert.ok(Array.isArray(drill.reservedWindows));
    assert.ok(drill.reservedWindows.length >= 1);

    const reservation = drill.reservedWindows[0];
    const overlapResponse = await fetch(`${base}/api/rentals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        renterId: "demo-renter-001",
        equipmentId: "eq-1002",
        startTime: reservation.startTime,
        endTime: reservation.endTime
      })
    });
    assert.equal(overlapResponse.status, 409);

    const createRentalResponse = await fetch(`${base}/api/rentals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        renterId: "demo-renter-001",
        equipmentId: "eq-1001",
        startTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
      })
    });
    assert.equal(createRentalResponse.status, 201);
    const rental = await createRentalResponse.json();
    assert.ok(rental.workflowId);
    assert.equal(rental.ownerName, "Alicia Tan");
    assert.equal(rental.paymentStatus, "Completed");

    const blockedResponse = await fetch(`${base}/api/rentals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        renterId: "blocked-renter-001",
        equipmentId: "eq-1001",
        startTime: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString()
      })
    });
    assert.equal(blockedResponse.status, 409);

    console.log("Smoke test passed.");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
