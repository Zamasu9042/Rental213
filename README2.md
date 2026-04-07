# EquipShare — Equipment Rental Marketplace

A microservices-based peer-to-peer equipment rental platform built with React, Python (FastAPI), Node.js, Kong, RabbitMQ, Stripe, and Camunda 8.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [External Services Setup](#external-services-setup)
   - [Camunda Cloud](#1-camunda-cloud)
   - [Stripe](#2-stripe)
3. [Environment Configuration](#environment-configuration)
4. [Running the Application](#running-the-application)
5. [Setting Up Stripe Webhooks (Required)](#setting-up-stripe-webhooks-required)
6. [Accessing the Application](#accessing-the-application)
7. [Making a Test Payment](#making-a-test-payment)
8. [Stopping the Application](#stopping-the-application)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Make sure the following are installed before you begin:

- **Docker Desktop** — [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
- **Stripe CLI** — [https://stripe.com/docs/stripe-cli#install](https://stripe.com/docs/stripe-cli#install)
  - On macOS: `brew install stripe/stripe-cli/stripe`
- **Git** (to clone the repo if needed)

---

## External Services Setup

### 1. Camunda Cloud

Camunda orchestrates the rental workflow (payment confirmation, notifications, etc.).

1. Go to [https://camunda.io](https://camunda.io) and sign up or log in
2. Create a new **cluster** (Trial Cluster is fine):
   - Region: **Singapore, Asia (ap-southeast-1)** → Region ID: `sin-2`
3. Wait for the cluster status to show 🟢 **Healthy**
4. Go to your cluster → **API** tab → click **Create new credentials**
5. Copy the following values — you will need them for `.env`:
   - `Client ID`
   - `Client Secret`
   - `Cluster ID`
   - `Region` (should be `sin-2`)
6. Deploy your BPMN workflow files to the cluster using Camunda Web Modeler:
   - `rental-workflow.bpmn`
   - `damage-claim-workflow.bpmn`
   - `late-return-workflow.bpmn`

> **Important:** Camunda Trial clusters auto-pause after ~30 minutes of inactivity. If workers start failing with `502`/`504` errors, go to [camunda.io](https://camunda.io), find your cluster, and click **Resume**.

---

### 2. Stripe

Stripe handles payment processing in test mode.

1. Go to [https://dashboard.stripe.com](https://dashboard.stripe.com) and sign up or log in
2. Make sure you are in **Test mode** (toggle in the top-right)
3. Go to **Developers → API Keys**
4. Copy your **Secret key** (starts with `sk_test_...`)
5. The webhook secret will be generated in a later step when you run the Stripe CLI

---

## Environment Configuration

1. Copy the example env file:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and fill in your values:
   ```env
   # Stripe
   STRIPE_SECRET_KEY=sk_test_your_key_here
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here   # generated in the next section

   # Camunda
   CAMUNDA_CLIENT_ID=your_client_id
   CAMUNDA_CLIENT_SECRET=your_client_secret
   CAMUNDA_CLUSTER_ID=your_cluster_id
   CAMUNDA_REGION=sin-2

   # Frontend URL (do not change for local dev)
   FRONTEND_URL=http://localhost:5173
   ```

---

## Running the Application

1. Make sure Docker Desktop is running

2. From the project root, build and start all services:
   ```bash
   docker compose up --build
   ```

   This starts everything in the correct order:
   - **Infrastructure** — MySQL databases, RabbitMQ, Kong API Gateway
   - **Backend** — all microservices (account, equipment, rental, payment, damage-claim, notification, vision, reputation) + Camunda proxy
   - **Frontend** — React/Vite dev server

3. Wait until you see this in the logs:
   ```
   frontend-1  |   VITE v6.x.x  ready in XXX ms
   frontend-1  |   ➜  Local:   http://localhost:3000/
   camunda-proxy-1  | Camunda proxy running on http://localhost:3001
   ```
   All services take about 30–60 seconds to fully start.

---

## Setting Up Stripe Webhooks (Required)

> **This step is required every time you start the application.** Without it, payments will complete on Stripe but rentals will stay stuck on "Pending Payment" forever.

Open a **new terminal** (keep Docker running in the other one) and run:

```bash
stripe listen --forward-to http://localhost:3001/webhook/stripe
```

You will see output like:
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Copy this `whsec_...` value** and paste it as `STRIPE_WEBHOOK_SECRET` in your `.env` file, then restart the proxy:

```bash
docker compose restart camunda-proxy
```

> Keep this terminal running for as long as you want payments to work. If you close it, webhook forwarding stops.

---

## Accessing the Application

| URL | Service |
|-----|---------|
| http://localhost:5173 | Frontend (main app) |
| http://localhost:8000 | Kong API Gateway |
| http://localhost:3001 | Camunda Proxy |
| http://localhost:15672 | RabbitMQ Management UI (login: `guest` / `guest`) |
| http://localhost:8001 | Equipment Service (direct) |
| http://localhost:8002 | Rental Service (direct) |
| http://localhost:8006 | Account Service (direct) |
| http://localhost:8008 | Payment Wrapper (direct) |

---

## Making a Test Payment

Use Stripe's test card details on the checkout page:

| Field | Value |
|-------|-------|
| Card number | `4242 4242 4242 4242` |
| Expiry | Any future date (e.g. `12/29`) |
| CVC | Any 3 digits (e.g. `123`) |
| Name | Any name |

After a successful payment, you should see in the Stripe CLI terminal:
```
--> checkout.session.completed
<-- [200] POST http://localhost:3001/webhook/stripe
```

And the rental status will update from **Pending Payment** → **Awaiting pickup**.

---

## Stopping the Application

To stop all containers:
```bash
docker compose down
```

To stop and also delete all database data (full reset):
```bash
docker compose down -v
```

---

## Troubleshooting

### Rental stuck on "Pending Payment" after successful payment

The Stripe webhook did not reach the proxy. Make sure the Stripe CLI is running:
```bash
stripe listen --forward-to http://localhost:3001/webhook/stripe
```

To manually fix a stuck rental, find the rental ID and its equipment ID, then run:
```bash
# 1. Check the rental to find equipment_id
curl http://localhost:8002/rental/<rental_id>

# 2. Reset the equipment status to available
curl -X PUT http://localhost:8001/equipment/<equipment_id> \
  -H "Content-Type: application/json" \
  -d '{"status": "available"}'

# 3. Finalize the rental manually
curl -X POST http://localhost:8002/rental/<rental_id>/finalize-booking
```

---

### Workers failing with 502/504 errors (Camunda)

Your Camunda cluster is likely paused. Go to [camunda.io](https://camunda.io), find your cluster, and click **Resume**. Once it shows 🟢 Healthy, restart the workers:

```bash
docker restart rental213-worker-rabbitmq-1 rental213-worker-rental-1 rental213-worker-stripe-1
```

---

### "No equipment available yet" on homepage

The equipment database may not have been seeded. Check if the equipment service is healthy:
```bash
curl http://localhost:8001/equipment
```

If it returns an empty array `[]`, the seed data didn't load. Restart the equipment DB and service:
```bash
docker compose restart equipment-db equipment-service
```

---

### Port already in use

If a port is already in use, stop the conflicting process or change the port mapping in `docker-compose.yml`. Common conflicts:
- Port `5173` — another Vite app
- Port `5672` / `15672` — another RabbitMQ instance
- Port `3306` / `3307–3311` — another MySQL instance

---

### Checking service logs

```bash
# All services
docker compose logs -f

# Specific service
docker logs rental213-camunda-proxy-1 --tail=50 -f
docker logs rental213-worker-stripe-1 --tail=50 -f
docker logs rental213-rental-service-1 --tail=50 -f
```

---

## Project Structure

```
Rental213/
├── docker-compose.yml              ← root orchestrator
├── .env.example                    ← copy to .env and fill in secrets
├── infra/
│   ├── docker-compose.infra.yml    ← databases, RabbitMQ, Kong
│   ├── kong.yml                    ← Kong API Gateway config
│   └── amqp-setup/                 ← RabbitMQ exchange/queue setup
├── backend/
│   ├── account-service/            ← user account management
│   ├── rental-service/             ← rental lifecycle (PENDING→ACTIVE→etc)
│   ├── equipment-service/          ← equipment listings
│   ├── damage-claim-service/       ← damage claim submissions
│   ├── notification-service/       ← SMS/email notifications via RabbitMQ
│   ├── payment-wrapper/            ← Stripe payment intent creation
│   ├── reputation-microservice/    ← ratings and reviews
│   ├── vision-service/             ← image analysis for damage claims
│   ├── workers/                    ← Camunda job workers
│   │   ├── worker_stripe.py        ← handles Stripe payment confirmation
│   │   ├── worker_rental.py        ← creates rental order in Camunda flow
│   │   ├── worker_rabbitmq.py      ← publishes payment events to RabbitMQ
│   │   └── worker_account.py       ← fetches account info for notifications
│   └── camunda_proxy.js            ← orchestrator: rental creation + Stripe + Camunda
└── frontend/
    └── src/
        ├── app/pages/              ← React page components
        ├── app/components/         ← shared UI components
        ├── app/context/            ← app-wide state (user session)
        └── lib/api.ts              ← all API calls to backend
```
