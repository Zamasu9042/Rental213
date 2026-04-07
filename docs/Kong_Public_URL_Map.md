# Kong Public URL Map (localhost)

Assuming **`docker compose`** exposes Kong on **`http://localhost:8000`** and Vite dev server proxies `/api` → Kong.

| Your call | Resolves to |
|-----------|-------------|
| `GET /api/equipment` | Equipment list |
| `GET /api/equipment/{id}` | One item |
| `GET /api/rental/renter/{id}/dashboard` | Renter dashboard |
| `GET /api/rental/{id}` | One rental |
| `POST /api/rentals` | Camunda proxy — start booking + payment |
| `GET /api/rentals/{key}/stripe-url` | Poll checkout URL |
| `POST /api/account/login` | Login |
| `GET /api/account/{id}` | Account |
| `POST /api/reputation/item` | Item rating |
| `POST /api/reputation/user/{id}` | User rating |
| `GET /api/reputation/item/{id}` | Item reputation |
| `POST /api/damage/claim` | Create claim |
| `POST /api/damage/photo` | Upload (multipart) |
| `POST /api/damage/analyze` | Analyze |
| `GET /api/damage/{id}` | Claim |
| `POST /api/payment/payrental` | Pay rental (also invoked from proxy) |
| `POST /api/payment/outstanding` | Late fee record |
| `POST /api/payment/outstanding/{id}/checkout` | Late fee Stripe |
| `GET /api/payment/{id}` | Payment row |
| `POST /webhook/stripe` | **Stripe servers only** (configure Dashboard → webhook URL) |

**Stripe CLI (dev):**  
`stripe listen --forward-to http://localhost:8000/webhook/stripe`
