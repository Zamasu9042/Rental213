# Appendix — API Documentation (All Microservices)

**Base URL (via Kong):** `http://localhost:8000`  
**Convention:** Public paths below are what the **React UI** and external clients call. Internal Docker hostnames differ (`http://equipment-service:8000`, etc.).

---

## 1. Kong gateway (entry point)

| Public prefix | Upstream | Notes |
|---------------|----------|--------|
| `/api/equipment` | equipment-service `/equipment` | strip `/api/equipment` |
| `/api/equipment-images` | equipment-service `/images` | static images |
| `/api/rental` | rental-service `/rental` | strip `/api/rental` |
| `/api/rentals` | camunda-proxy `:3001` | **no** strip |
| `/api/account` | account-service `/account` | strip `/api/account` |
| `/api/reputation` | reputation-service `/reputation` | strip `/api/reputation` |
| `/api/damage` | damage-claim-service `/damage` | strip `/api/damage` |
| `/api/payment` | payment-service `/payment` | strip `/api/payment` |
| `/webhook/stripe` | payment-service `/webhook/stripe` | Stripe raw body, `stripe-signature` header |

---

## 2. Equipment Service (`/equipment/*` internal)

| Method | Internal path | Purpose |
|--------|---------------|---------|
| GET | `/health` | Health |
| GET | `/equipment` | List all equipment |
| GET | `/equipment/{id}` | Get one |
| POST | `/equipment` | Create |
| POST | `/equipment/{id}/image` | Upload image |
| PUT | `/equipment/{id}` | Update (incl. status) |
| DELETE | `/equipment/{id}` | Delete |

**Kong public:** `GET/POST/PUT/DELETE http://localhost:8000/api/equipment` … (path after strip matches internal under `/equipment`).

**DB:** `equipment_db` (MySQL).

---

## 3. Rental Service (`/rental/*`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/rental/active` | Active rentals (optional `?renter_id=`) |
| GET | `/rental/renter/{renter_id}/dashboard` | All rentals + `should_show_equipment_browse` |
| GET | `/rental/renter/{renter_id}` | List renter’s rentals |
| GET | `/rental/equipment/{equipment_id}/rentals` | Owner / equipment rentals |
| GET | `/rental/{equipment_id}/calendar/{start}/{end}` | Calendar window |
| GET | `/rental/{rental_id}` | Single rental |
| POST | `/rental` | Create (`checkout_mode: pending_payment` for Stripe flow) |
| POST | `/rental/{id}/finalize-booking` | PENDING → ACTIVE after payment |
| PUT | `/rental/{id}/return` | Legacy return |
| PUT | `/rental/{id}/collect` | Pickup confirmation |
| PUT | `/rental/{id}/confirm-return` | Return confirmation |
| PUT | `/rental/{id}/confirm-review` | Reviews → COMPLETED |
| POST | `/rental/{id}/mark-late` | RETURNED → LATE (after late fee row) |
| POST | `/rental/{id}/complete-after-late-payment` | LATE → COMPLETED after late fee paid |

**Kong public:** `http://localhost:8000/api/rental/...`

**DB:** `rental_db`.

---

## 4. Account Service (`/account/*`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health |
| POST | `/account/login` | Login |
| GET | `/account/{account_id}` | Public profile |

**Kong:** `/api/account/...`

**DB:** `account_db`.

---

## 5. Payment Service (`/payment/*`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health |
| POST | `/payment/payrental` | Initial checkout; creates row `paying`, Stripe session |
| POST | `/payment/outstanding` | **Late check** + unpaid late fee + `mark-late` |
| POST | `/payment/outstanding/{id}/checkout` | Stripe for late fee |
| GET | `/payment/{payment_id}` | Get transaction |
| POST | `/payment/webhook` | Stripe webhook (JSON) |
| POST | `/webhook/stripe` | Same handler (Kong) |

**Kong:** `/api/payment/...`, `/webhook/stripe`

**DB:** `payment_db`.

**External:** Stripe API (Checkout + webhooks).

---

## 6. Damage Claim Service (`/damage/*`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health |
| POST | `/damage/claim` | Create claim (DRAFT) |
| POST | `/damage/photo` | Upload photo |
| POST | `/damage/analyze` | Vision analysis |
| GET | `/damage/pending` | Staff queue |
| POST | `/damage/{claim_id}/resolve` | Approve/reject |
| GET | `/damage/rental/{rental_id}` | Claim by rental |
| GET | `/damage/{claim_id}` | Claim details |

**Static files:** `/damage/files/...` served by service (via Kong `/api/damage` routing for API; file URLs may be relative).

**DB:** `damage_claims_db`.

---

## 7. Reputation Service (`/reputation/*`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health |
| POST | `/reputation/item` | Rate equipment |
| POST | `/reputation/user/{user_id}` | Rate user |
| GET | `/reputation/user/{user_id}` | User scores |
| GET | `/reputation/item/{equipment_id}` | Item reputation |
| PUT | `/reputation/deduct` | Penalty |

**DB:** `reputation_db`.

---

## 8. Vision Wrapper (`/vision/*`) — internal only (not on Kong)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health |
| POST | `/vision/analyze` | `image_url` or `image_base64` → labels / damage heuristic |

**Called by:** Damage Claim Service (Docker network).  
**External:** Google Cloud Vision API.

---

## 9. Camunda Proxy (Node)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health |
| POST | `/api/rentals` | Create PENDING rental + call Payment `payrental` + start Zeebe (optional) |
| GET | `/api/rentals/{processInstanceKey}/stripe-url` | Poll `stripeRedirectUrl` |

**Kong:** `http://localhost:8000/api/rentals` (same paths).

---

## 10. Notification Service

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health |

**Async:** Consumes RabbitMQ queue bound to `SendPaymentConfirmation` on `rental_topic`.

---

## 11. Payment Wrapper (optional lab service)

| Method | Path | Note |
|--------|------|------|
| POST | `/payment/create-intent` | Direct Stripe PaymentIntent — **not** main production path |

Exposed on host **8008** if compose service running; **not** routed through Kong in default `kong.yml`.

---

## 12. JSON examples (report snippets)

**Login:** `POST /api/account/login`  
`{ "email": "...", "password": "..." }`

**Start rental:** `POST /api/rentals`  
`{ "renterId", "equipmentId", "startTime", "endTime", "totalPrice", "pickUpLocation" }`

**Record late fee:** `POST /api/payment/outstanding`  
`{ "rental_id": 1 }`

**Damage claim:** `POST /api/damage/claim`  
`{ "rental_id": 1 }`
