/**
 * src/lib/api.ts
 * All API calls to the backend proxy (camunda_proxy.js).
 * Never calls Camunda directly — credentials stay server-side.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (!resp.ok) {
    const body = await resp.text();
    try {
      const parsed = JSON.parse(body);
      throw new Error(parsed.error || parsed.message || `Request failed: ${resp.status}`);
    } catch {
      throw new Error(body || `Request failed: ${resp.status}`);
    }
  }

  return resp.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StartRentalPayload {
  renterId: string;
  equipmentId: string;
  startTime: string;   // ISO string
  endTime: string;     // ISO string
  hourlyRate: number;
  pickUpLocation: string;
}

export interface StartRentalResponse {
  processInstanceKey: string;
  status: string;
}

export interface StripeUrlResponse {
  stripeRedirectUrl: string | null;
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Starts the Camunda rental-workflow process.
 * Call this when the user confirms their rental on PaymentPage.
 * Returns a processInstanceKey to use for polling.
 */
export async function startRentalProcess(
  payload: StartRentalPayload
): Promise<StartRentalResponse> {
  return request<StartRentalResponse>("/api/rentals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Polls for the Stripe redirect URL.
 * Call this after startRentalProcess() — it polls every 2s until the
 * redirect-to-stripe Python worker has written the URL to the DB.
 * Throws an error if it times out after maxAttempts.
 */
export async function pollStripeUrl(
  processInstanceKey: string,
  maxAttempts = 20
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const data = await request<StripeUrlResponse>(
      `/api/rentals/${processInstanceKey}/stripe-url`
    );
    if (data.stripeRedirectUrl) return data.stripeRedirectUrl;
  }
  throw new Error(
    "Timed out waiting for Stripe redirect URL. Make sure your Python workers are running."
  );
}
