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
 *   POST /api/damage/*           → damage-claim-service
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
    const msg = e instanceof Error ? e.message : "Network error";
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

export function mapEquipment(item: ApiEquipment) {
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

export async function getEquipment() {
  const items = await request<ApiEquipment[]>("/api/equipment");
  return items.map(mapEquipment);
}

export async function getAllEquipment() {
  const items = await request<ApiEquipment[]>("/api/equipment?include_all=true");
  return items.map(mapEquipment);
}

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
  status: string;
  return_timestamp: string | null;
  hourly_rate: number;
  pickup_location: string;
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

export async function getRenterDashboard(renterId: number): Promise<RenterDashboard> {
  return request<RenterDashboard>(`/api/rental/renter/${renterId}/dashboard`);
}

export async function getRental(rentalId: number): Promise<ApiRental> {
  return request<ApiRental>(`/api/rental/${rentalId}`);
}

export async function markCollected(rentalId: number, accountId: number): Promise<ApiRental> {
  return request<ApiRental>(`/api/rental/${rentalId}/collect`, {
    method: "PUT",
    body: JSON.stringify({ account_id: accountId }),
  });
}

export async function confirmReturn(rentalId: number, accountId: number): Promise<ApiRental> {
  return request<ApiRental>(`/api/rental/${rentalId}/confirm-return`, {
    method: "PUT",
    body: JSON.stringify({ account_id: accountId }),
  });
}

export async function confirmReview(rentalId: number, accountId: number): Promise<ApiRental> {
  return request<ApiRental>(`/api/rental/${rentalId}/confirm-review`, {
    method: "PUT",
    body: JSON.stringify({ account_id: accountId }),
  });
}

// ─── Payment ──────────────────────────────────────────────────────────────────

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

// ─── Reputation ───────────────────────────────────────────────────────────────

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

// ─── Rental workflow (camunda-proxy) ─────────────────────────────────────────

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

export async function startRentalProcess(payload: StartRentalPayload): Promise<StartRentalResponse> {
  return request<StartRentalResponse>("/api/rentals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function pollStripeUrl(processInstanceKey: string, maxAttempts = 15): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const data = await request<StripeUrlResponse>(`/api/rentals/${processInstanceKey}/stripe-url`);
    if (data.stripeRedirectUrl) return data.stripeRedirectUrl;
  }
  throw new Error("Timed out waiting for Stripe redirect URL. Make sure the backend services are running.");
}

// ─── Equipment Rentals (owner view) ──────────────────────────────────────────

export async function getRentalsForEquipment(equipmentId: string | number): Promise<ApiRental[]> {
  return request<ApiRental[]>(`/api/rental/equipment/${equipmentId}/rentals`);
}

// ─── Damage Claims ────────────────────────────────────────────────────────────

export interface ApiDamageClaim {
  claimID: string;
  rentalID: number;
  equipmentID: number | null;
  renterID: number | null;
  photoURL: string | null;
  damageType: string | null;
  confidence: number | null;
  severity: string | null;
  /**
   * DRAFT
   * PENDING_STAFF_REVIEW     — staff reviews AI result
   * PENDING_OWNER_AMOUNT     — staff approved AI, owner must enter amount
   * PENDING_STAFF_APPROVAL   — owner submitted amount, staff reviews it
   * AMOUNT_REJECTED          — staff rejected amount, owner re-enters
   * APPROVED                 — fully approved, Camunda started
   * REJECTED                 — claim rejected by staff
   */
  status: string;
  damageAmount: number | null;
  created_at: string | null;
  analyzed_at: string | null;
  analysis: Record<string, unknown> | null;
}

/** Create a new claim in DRAFT status. */
export async function createDamageClaim(rentalId: number): Promise<ApiDamageClaim> {
  return request<ApiDamageClaim>("/api/damage/claim", {
    method: "POST",
    body: JSON.stringify({ rental_id: rentalId }),
  });
}

/** Upload a damage photo. Uses multipart/form-data. */
export async function uploadDamagePhoto(
  claimId: string,
  file: File
): Promise<{ claimID: string; photoURL: string }> {
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

/** Trigger Google Vision AI analysis. Moves claim to PENDING_STAFF_REVIEW. */
export async function analyzeDamageClaim(claimId: string): Promise<ApiDamageClaim> {
  return request<ApiDamageClaim>("/api/damage/analyze", {
    method: "POST",
    body: JSON.stringify({ claim_id: claimId }),
  });
}

/** Get a single claim by ID. */
export async function getDamageClaim(claimId: string): Promise<ApiDamageClaim> {
  return request<ApiDamageClaim>(`/api/damage/${claimId}`);
}

/** Get all claims requiring staff attention. */
export async function getPendingDamageClaims(): Promise<ApiDamageClaim[]> {
  return request<ApiDamageClaim[]>("/api/damage/pending");
}

/** Get the most recent damage claim for a rental. Throws 404 if none. */
export async function getDamageClaimByRental(rentalId: number): Promise<ApiDamageClaim> {
  return request<ApiDamageClaim>(`/api/damage/rental/${rentalId}`);
}

/**
 * Staff Step 1 — review AI result.
 * action=approve → PENDING_OWNER_AMOUNT
 * action=reject  → REJECTED
 */
export async function resolveDamageClaim(
  claimId: string,
  action: "approve" | "reject"
): Promise<ApiDamageClaim> {
  return request<ApiDamageClaim>(`/api/damage/${claimId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

/**
 * Owner step — submit damage amount.
 * Moves claim from PENDING_OWNER_AMOUNT (or AMOUNT_REJECTED) → PENDING_STAFF_APPROVAL.
 */
export async function submitDamageAmount(
  claimId: string,
  damageAmount: number
): Promise<ApiDamageClaim> {
  return request<ApiDamageClaim>(`/api/damage/${claimId}/submit-amount`, {
    method: "POST",
    body: JSON.stringify({ damage_amount: damageAmount }),
  });
}

/**
 * Staff Step 2 — review owner's submitted amount.
 * action=approve → APPROVED + starts Camunda damage-claim-workflow
 * action=reject  → AMOUNT_REJECTED (owner can re-submit)
 */
export async function reviewDamageAmount(
  claimId: string,
  action: "approve" | "reject"
): Promise<ApiDamageClaim> {
  return request<ApiDamageClaim>(`/api/damage/${claimId}/review-amount`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

/**
 * Build the full URL for a damage photo.
 * Stored: /damage/files/filename.jpg
 * Kong strips /damage prefix → service gets /files/filename.jpg
 * Frontend must use /api/damage/files/filename.jpg
 */
export function damagePhotoUrl(relPath: string): string {
  const withoutDamagePrefix = relPath.replace(/^\/damage/, "");
  return `${API_BASE}/api/damage${withoutDamagePrefix}`;
}