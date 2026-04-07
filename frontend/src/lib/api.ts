/**
 * src/lib/api.ts
 * All backend API calls.
 *
 * All requests go through Kong on port 8000:
 *   GET  /api/equipment          → equipment-service
 *   GET  /api/equipment/:id      → equipment-service
 *   GET  /api/rental/renter/:id/dashboard → rental-service
 *   GET  /api/rental/:id         → rental-service
 *   POST /api/reputation/item, /api/reputation/user/:id → reputation-service
 *   POST /api/rentals            → camunda-proxy (starts workflow)
 *   GET  /api/rentals/:key/stripe-url → camunda-proxy (polls for Stripe URL)
 *   POST /api/payment/payrental, /api/payment/outstanding → payment-service
 *
 * Base URL: set VITE_API_BASE_URL for a full origin (e.g. deployed Kong). In dev, leave it
 * unset so requests are same-origin and vite.config.ts proxies /api → Kong (avoids CORS).
 */

const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
const API_BASE =
  typeof envBase === "string" && envBase.trim() !== ""
    ? envBase.replace(/\/$/, "")
    : import.meta.env.DEV
      ? ""
      : "http://localhost:8000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Network error";
    throw new Error(
      `${msg}. Is Docker Compose up with Kong on :8000? (Try: empty VITE_API_BASE_URL in dev + restart Vite.)`
    );
  }

  if (!resp.ok) {
    const body = await resp.text();
    let msg = `Request failed: ${resp.status}`;
    try {
      const parsed = JSON.parse(body) as {
        detail?: string | Array<{ msg?: string }>;
        error?: string;
        message?: string;
      };
      const d = parsed.detail;
      if (typeof d === "string") msg = d;
      else if (Array.isArray(d) && d[0]?.msg) msg = String(d[0].msg);
      else if (parsed.error) msg = parsed.error;
      else if (parsed.message) msg = parsed.message;
      else if (body) msg = body;
    } catch {
      if (body) msg = body;
    }
    throw new Error(msg);
  }

  return resp.json();
}

// ─── Equipment ────────────────────────────────────────────────────────────────

export interface ApiEquipment {
  id: number;
  owner_id: number;
  item_name: string;
  category: string;
  status: string;
  hourly_rate: number;
  pickup_location: string;
  image_url?: string | null;
}

/** Map equipment-service schema → frontend Equipment shape */
export function mapEquipment(item: ApiEquipment) {
  // Build full image URL — absolute URLs (public/seeded) used as-is;
  // relative /images/... paths are served via Kong's equipment-images route
  const imageUrl = item.image_url
    ? item.image_url.startsWith("http")
      ? item.image_url
      : `${API_BASE}/api/equipment-images${item.image_url.replace(/^\/images/, "")}`
    : null;

  return {
    id: String(item.id),
    name: item.item_name,
    description: `Available for pickup at: ${item.pickup_location}`,
    category: item.category,
    price: Number(item.hourly_rate),
    condition: "Good",
    images: imageUrl ? [imageUrl] : [] as string[],
    ownerId: String(item.owner_id),
    ownerName: `Owner #${item.owner_id}`,
    available: item.status.toLowerCase() === "available",
    pickup_location: item.pickup_location,
  };
}

/** Fetch all available equipment from equipment-service via Kong */
export async function getEquipment() {
  const items = await request<ApiEquipment[]>("/api/equipment");
  return items.map(mapEquipment);
}

/** Fetch ALL equipment regardless of status (for owner views — includes rented/under_repair) */
export async function getAllEquipment() {
  const items = await request<ApiEquipment[]>("/api/equipment?include_all=true");
  return items.map(mapEquipment);
}

/** Fetch a single piece of equipment by ID */
export async function getEquipmentById(id: string | number) {
  const item = await request<ApiEquipment>(`/api/equipment/${id}`);
  return mapEquipment(item);
}

// ─── Rentals ─────────────────────────────────────────────────────────────────

export interface ApiRental {
  id: number;
  renter_id: number;
  equipment_id: number;
  start_time: string;
  end_time: string;
  status: string;  // PENDING | ACTIVE | COLLECTED | RETURNED | COMPLETED | LATE
  return_timestamp: string | null;
  hourly_rate: number;
  pickup_location: string;
  // Dual-confirm flags
  renter_collected: boolean;
  owner_collected: boolean;
  renter_returned: boolean;
  owner_returned: boolean;
  renter_reviewed: boolean;
  owner_reviewed: boolean;
}

export interface RenterDashboard {
  renter_id: number;
  rentals: ApiRental[];
  should_show_equipment_browse: boolean;
}

/** Fetch the renter dashboard (active rentals + browse flag) from rental-service via Kong */
export async function getRenterDashboard(renterId: number): Promise<RenterDashboard> {
  return request<RenterDashboard>(`/api/rental/renter/${renterId}/dashboard`);
}

/** Fetch a single rental by ID */
export async function getRental(rentalId: number): Promise<ApiRental> {
  return request<ApiRental>(`/api/rental/${rentalId}`);
}

/** Renter marks equipment as collected (ACTIVE → COLLECTED) */
export async function markCollected(rentalId: number, accountId: number): Promise<ApiRental> {
  return request<ApiRental>(`/api/rental/${rentalId}/collect`, {
    method: "PUT",
    body: JSON.stringify({ account_id: accountId }),
  });
}

/** Renter or Owner confirms the return (COLLECTED → RETURNED when both done) */
export async function confirmReturn(rentalId: number, accountId: number): Promise<ApiRental> {
  return request<ApiRental>(`/api/rental/${rentalId}/confirm-return`, {
    method: "PUT",
    body: JSON.stringify({ account_id: accountId }),
  });
}

/** Renter or Owner confirms their review (RETURNED → COMPLETED when both done) */
export async function confirmReview(rentalId: number, accountId: number): Promise<ApiRental> {
  return request<ApiRental>(`/api/rental/${rentalId}/confirm-review`, {
    method: "PUT",
    body: JSON.stringify({ account_id: accountId }),
  });
}

export interface StripeSessionResponse {
  stripeRedirectUrl: string;
}

/** Create a fresh Stripe session for a PENDING rental whose payment was lost */
export async function retryPayment(rentalId: number): Promise<StripeSessionResponse> {
  return request<StripeSessionResponse>("/api/retry-payment", {
    method: "POST",
    body: JSON.stringify({ rentalId }),
  });
}

/** Create a Stripe session to pay a late fee on a returned/late rental */
export async function startLateFeePayment(payload: {
  rentalId: number;
  renterId: number;
  feeAmount: number;
}): Promise<StripeSessionResponse> {
  return request<StripeSessionResponse>("/api/late-payment", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Payment (payment-service via Kong — report / technical diagram) ─────────

export interface ApiPayment {
  paymentID: number;
  rentalID: number;
  renterID: number;
  amount: number;
  type: string;
  status: string;
  itemName?: string | null;
  checkout_url?: string;
  is_late?: boolean;
  message?: string;
}

/** Scenario 2: late check + unpaid late-fee row (logic in payment-service). */
export async function recordOutstandingLateFee(rentalId: number): Promise<ApiPayment> {
  return request<ApiPayment>("/api/payment/outstanding", {
    method: "POST",
    body: JSON.stringify({ rental_id: rentalId }),
  });
}

export async function checkoutOutstandingLateFee(
  paymentId: number
): Promise<ApiPayment & { checkout_url: string }> {
  return request<ApiPayment & { checkout_url: string }>(
    `/api/payment/outstanding/${paymentId}/checkout`,
    { method: "POST" }
  );
}

export async function getPayment(paymentId: number): Promise<ApiPayment> {
  return request<ApiPayment>(`/api/payment/${paymentId}`);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
}

export async function loginUser(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/account/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/** Public account fields (no password) — for displaying owner/renter contact on rentals */
export interface ApiAccountPublic {
  id: string;
  accountID: number;
  accountName: string;
  phoneNo: string;
  email: string;
}

export async function getAccount(accountId: number): Promise<ApiAccountPublic> {
  return request<ApiAccountPublic>(`/api/account/${accountId}`);
}

// ─── Reputation (reputation-microservice via Kong) ──────────────────────────

export interface ReputationEntryResponse {
  id: number;
  user_id: number;
  target_id: number;
  target_type: string;
  score: number;
  review_text: string | null;
  rater_id: number | null;
  rental_id: number | null;
  timestamp: string | null;
}

/** Rate equipment (rater ≠ owner). Score 0–5. */
export async function submitItemRating(body: {
  rater_id: number;
  equipment_id: number;
  owner_id: number;
  rental_id: number;
  score: number;
  review_text?: string | null;
}): Promise<ReputationEntryResponse> {
  return request<ReputationEntryResponse>("/api/reputation/item", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Rate the other party (RENTER or OWNER). `ratedUserId` is the account being rated. */
export async function submitUserRating(
  ratedUserId: number,
  body: {
    rater_id: number;
    rental_id: number;
    target_type: "RENTER" | "OWNER";
    score: number;
    review_text?: string | null;
  }
): Promise<ReputationEntryResponse> {
  return request<ReputationEntryResponse>(`/api/reputation/user/${ratedUserId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** ITEM ratings for an equipment listing (browse / detail page) via Kong → reputation-service */
export interface ItemReputationSummary {
  equipment_id: number;
  average_score: number | null;
  total_entries: number;
  entries: Array<{
    id: number;
    score: number;
    review_text: string | null;
    rater_id: number | null;
    rental_id: number | null;
    created_at: string | null;
  }>;
}

export async function getEquipmentItemReputation(equipmentId: number): Promise<ItemReputationSummary> {
  return request<ItemReputationSummary>(`/api/reputation/item/${equipmentId}`);
}

// ─── Start rental workflow (through camunda-proxy) ───────────────────────────

export interface StartRentalPayload {
  renterId: string;
  equipmentId: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  pickUpLocation?: string;
}

export interface StartRentalResponse {
  processInstanceKey: string;
  status: string;
}

export interface StripeUrlResponse {
  stripeRedirectUrl: string | null;
}

/** Starts the Camunda rental-workflow process (creates rental + Stripe session). */
export async function startRentalProcess(payload: StartRentalPayload): Promise<StartRentalResponse> {
  return request<StartRentalResponse>("/api/rentals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Polls every 2 s until the Stripe redirect URL is ready.
 * Throws if it times out after maxAttempts × 2 s.
 */
export async function pollStripeUrl(processInstanceKey: string, maxAttempts = 15): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const data = await request<StripeUrlResponse>(`/api/rentals/${processInstanceKey}/stripe-url`);
    if (data.stripeRedirectUrl) return data.stripeRedirectUrl;
  }
  throw new Error("Timed out waiting for Stripe redirect URL. Make sure the backend services are running.");
}

// ─── Equipment Rentals (owner view) ──────────────────────────────────────────

/** Fetch all rentals for a given equipment (owner can see who rented and file damage claims). */
export async function getRentalsForEquipment(equipmentId: string | number): Promise<ApiRental[]> {
  return request<ApiRental[]>(`/api/rental/equipment/${equipmentId}/rentals`);
}

// ─── Damage Claims ────────────────────────────────────────────────────────────

export interface ApiDamageClaim {
  claimID: string;
  rentalID: number;
  photoURL: string | null;   // relative path e.g. /damage/files/filename.jpg
  damageType: string | null;
  confidence: number | null;
  severity: string | null;
  status: string;            // DRAFT | PENDING_STAFF_REVIEW | APPROVED | REJECTED
  created_at: string | null;
  analyzed_at: string | null;
  analysis: Record<string, unknown> | null;
}

/** Create a new damage claim record for a rental. Returns claim in DRAFT status. */
export async function createDamageClaim(rentalId: number): Promise<ApiDamageClaim> {
  return request<ApiDamageClaim>("/api/damage/claim", {
    method: "POST",
    body: JSON.stringify({ rental_id: rentalId }),
  });
}

/** Upload a damage photo for an existing claim. Uses multipart/form-data. */
export async function uploadDamagePhoto(claimId: string, file: File): Promise<{ claimID: string; photoURL: string }> {
  const form = new FormData();
  form.append("claim_id", claimId);
  form.append("file", file);
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}/api/damage/photo`, { method: "POST", body: form });
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Network error uploading photo");
  }
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(body || `Upload failed: ${resp.status}`);
  }
  return resp.json();
}

/** Trigger AI analysis on the uploaded photo. Returns updated claim with Vision results. */
export async function analyzeDamageClaim(claimId: string): Promise<ApiDamageClaim> {
  return request<ApiDamageClaim>("/api/damage/analyze", {
    method: "POST",
    body: JSON.stringify({ claim_id: claimId }),
  });
}

/** Fetch a single damage claim by ID. */
export async function getDamageClaim(claimId: string): Promise<ApiDamageClaim> {
  return request<ApiDamageClaim>(`/api/damage/${claimId}`);
}

/** Get all claims pending staff review. */
export async function getPendingDamageClaims(): Promise<ApiDamageClaim[]> {
  return request<ApiDamageClaim[]>("/api/damage/pending");
}

/** Get the most recent damage claim for a rental (owner view). Throws 404 if none. */
export async function getDamageClaimByRental(rentalId: number): Promise<ApiDamageClaim> {
  return request<ApiDamageClaim>(`/api/damage/rental/${rentalId}`);
}

/** Resolve a claim — action: 'approve' | 'reject' */
export async function resolveDamageClaim(claimId: string, action: "approve" | "reject"): Promise<ApiDamageClaim> {
  return request<ApiDamageClaim>(`/api/damage/${claimId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

/**
 * Build the full URL for a damage photo.
 * Stored path: /damage/files/filename.jpg
 * Kong route: /api/damage (strip_path:true) → service gets /damage/files/filename.jpg
 * So frontend URL must be /api/damage/files/filename.jpg (strip leading /damage from stored path).
 */
export function damagePhotoUrl(relPath: string): string {
  const withoutDamagePrefix = relPath.replace(/^\/damage/, '');
  return `${API_BASE}/api/damage${withoutDamagePrefix}`;
}
