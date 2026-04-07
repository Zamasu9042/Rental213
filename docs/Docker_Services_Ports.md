# Docker Compose — Services & Host Ports

**Compose file:** `backend/compose.yaml`  
**Network:** `esd-net` (bridge)

## Application services (HTTP)

| Service | Host port | Container |
|---------|-----------|-------------|
| Kong (API gateway) | **8000** | 8000 |
| equipment-service | 8001 | 8000 |
| rental-service | 8002 | 8000 |
| reputation-service | 8003 | 8000 |
| damage-claim-service | 8004 | 8000 |
| vision-service | 8005 | 8000 |
| account-service | 8006 | 8000 |
| notification-service | 8007 | 8000 |
| payment-wrapper (optional) | 8008 | 8000 |
| **payment-service** | **8009** | 8000 |
| **camunda-proxy** | **3001** | 3001 |

**Direct access (bypass Kong):** use `http://localhost:<port>` for debugging FastAPI `/docs`.

## Databases (MySQL)

| Volume / DB | Host port |
|-------------|-----------|
| equipment-db | 3307 |
| rental-db | 3308 |
| reputation-db | 3309 |
| account-db | 3310 |
| damage-db | 3311 |
| **payment-db** | **3312** |

## Messaging

| Service | Host port |
|---------|-----------|
| RabbitMQ AMQP | 5672 |
| RabbitMQ Management UI | 15672 |

## Environment variables (common)

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | payment-service, payment-wrapper |
| `STRIPE_WEBHOOK_SECRET` | payment-service (must match Stripe CLI / Dashboard) |
| `GOOGLE_VISION_API_KEY` | vision-service |
| `FRONTEND_URL` | success/cancel URLs in Stripe Checkout |

## Health checks

Most services: `GET /health` on their container port. Kong: proxy `http://localhost:8000` (no `/health` on Kong by default — hit a service via Kong or use service port).
