# Rental213 — Equipment Rental Platform

A microservices-based equipment rental marketplace.

## Quick start

```bash
cp .env.example .env        # fill in your Stripe + Camunda keys
docker compose up --build   # starts infra → backend → frontend in order
```

| URL | What |
|-----|------|
| http://localhost:3000 | Frontend (React / Vite) |
| http://localhost:8000 | Kong API Gateway |
| http://localhost:3001 | Camunda proxy |
| http://localhost:15672 | RabbitMQ management UI (guest/guest) |

## Structure

```
Rental213/
├── docker-compose.yml          ← root orchestrator (includes all three)
├── .env.example                ← copy to .env and fill in secrets
├── infra/                      ← databases, RabbitMQ, Kong, AMQP setup
│   ├── docker-compose.infra.yml
│   ├── kong.yml
│   ├── amqp-setup/
│   ├── rabbitmq/
│   └── scripts/
├── backend/                    ← all Python microservices + Camunda proxy
│   ├── docker-compose.backend.yml
│   ├── account-service/
│   ├── rental-service/
│   ├── equipment-service/
│   ├── damage-claim-service/
│   ├── reputation-microservice/
│   ├── notification-service/
│   ├── vision-service/
│   ├── payment-wrapper/
│   ├── workers/
│   └── camunda_proxy.js
└── frontend/                   ← React + Vite SPA
    ├── docker-compose.frontend.yml
    └── src/
```

## Startup order

1. **infra** — MySQL databases, RabbitMQ, Kong, AMQP exchange setup
2. **backend** — all microservices (wait for infra healthchecks)
3. **frontend** — Vite dev server (waits for backend)

## Stripe (simulated payments)

Uses **Stripe Hosted Checkout** in test mode. No real card data ever touches your server.

1. Set `STRIPE_SECRET_KEY=sk_test_...` and `STRIPE_WEBHOOK_SECRET` in `.env`
2. For local webhook testing: `stripe listen --forward-to http://localhost:8000/webhook/stripe`

Test card: `4242 4242 4242 4242` · any future expiry · any CVC
