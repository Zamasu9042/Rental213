/**
 * test-token.js  —  run with: node test-token.js
 * Tests that your Camunda credentials work correctly.
 */

import fetch from "node-fetch";

// ── Paste your credentials here ──
const CAMUNDA_CLIENT_ID     = "VZP5yobc1Akw.JO8-RuCFvMT4MWdVTJ~";
const CAMUNDA_CLIENT_SECRET = "l2ukWpN~NrO45-bKVYn0-8TiYpu9mFwQ.ZkM6~3Np76o9ox_7ycl7aNCtDmiXzQC";
const CAMUNDA_CLUSTER_ID    = "YOUR_";
const CAMUNDA_REGION        = "ont-1"; // e.g. bru-2, dsm-1, syd-1

// ─────────────────────────────────

console.log("Testing token fetch...");
console.log("Client ID:", CAMUNDA_CLIENT_ID);
console.log("Cluster ID:", CAMUNDA_CLUSTER_ID);
console.log("Region:", CAMUNDA_REGION);

const resp = await fetch("https://login.cloud.camunda.io/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    grant_type:    "client_credentials",
    client_id:     CAMUNDA_CLIENT_ID,
    client_secret: CAMUNDA_CLIENT_SECRET,
    audience:      "zeebe.camunda.io"
  })
});

const text = await resp.text();

if (resp.ok) {
  const data = JSON.parse(text);
  console.log("\n✅ Token fetch SUCCESS");
  console.log("Access token (first 40 chars):", data.access_token?.slice(0, 40) + "...");
  console.log("Expires in:", data.expires_in, "seconds");

  // Now test starting a process instance
  console.log("\nTesting process instance start...");
  const processResp = await fetch(
    `https://${CAMUNDA_REGION}.zeebe.camunda.io/${CAMUNDA_CLUSTER_ID}/v1/process-instances`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${data.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        bpmnProcessId: "rental-workflow",
        variables: {
          renterId:       "test-renter-001",
          equipmentId:    "eq-1001",
          startTime:      "2026-04-01T10:00:00.000Z",
          endTime:        "2026-04-01T12:00:00.000Z",
          hourlyRate:     12,
          pickUpLocation: "Kuala Lumpur"
        }
      })
    }
  );

  const processText = await processResp.text();
  if (processResp.ok) {
    const processData = JSON.parse(processText);
    console.log("✅ Process started! Key:", processData.key);
  } else {
    console.log("❌ Process start failed:", processText);
  }

} else {
  console.log("\n❌ Token fetch FAILED");
  console.log("Status:", resp.status);
  console.log("Response:", text);
  console.log("\nCommon fixes:");
  console.log("  - Double check Client ID and Secret have no extra spaces");
  console.log("  - Make sure you copied the full secret (it's long)");
  console.log("  - Check your region matches what's in the Camunda console");
}
