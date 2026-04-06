/**
 * src/lib/api.ts
 * All backend API calls.
 *
 * All requests go through Kong on port 8000:
 *   GET  /api/equipment          → equipment-service
 *   GET  /api/equipment/:id      → equipment-service
 *   GET  /api/rental/renter/:id/dashboard → rental-service
 *   GET  /api/rental/:id         → rental-service
 *   POST /api/rentals            → camunda-proxy (starts workflow)
 *   GET  /api/rentals/:key/stripe-url → camunda-proxy (polls for Stripe URL)
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
      throw new Error(parsed.detail || parsed.error || parsed.message || `Request failed: ${resp.status}`);
    } catch {
      throw new Error(body || `Request failed: ${resp.status}`);
    }
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
  // Build full image URL via Kong's equipment-images route
  const imageUrl = item.image_url
    ? `${API_BASE}/api/equipment-images${item.image_url.replace(/^\/images/, "")}`
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
  status: string;
  return_timestamp: string | null;
  hourly_rate: number;
  pickup_location: string;
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

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export async function loginUser(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/account/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
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
