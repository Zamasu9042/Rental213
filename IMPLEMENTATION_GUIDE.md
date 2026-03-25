# P2P Rental Platform - Implemented Assumptions Ver

This version of the pack contains an actual runnable reference system, but with a lot of assumptions, please change as you see fit

## Assumptions I made (ignore later)

### Fix 1 - Missing Account Info Service
I added a separate UserProfile API to the backend:

- `GET /api/profiles/:userId`

The canonical owner data now lives in the profile service. Equipment records only store `ownerId`. The UI receives owner contact details by joining through the backend, not by hardcoding them into the equipment record.

### Assumption 2 - Browser must not call Camunda directly
The frontend only calls:

- `POST /api/rentals`
- `PUT /api/rentals/:id/request-return`
- `PUT /api/rentals/:id/inspection-complete`

Inside the backend, the rental service starts a **server-side workflow adapter**. This simulates the boundary where OutSystems would call Camunda internally. The browser never sees or calls workflow endpoints.

### Assumption 3 - Availability must use time-window overlap
Rental creation now rejects bookings when this condition is true:

`requestedStart < existingEnd AND requestedEnd > existingStart`

This is implemented in both:
- the frontend mock layer, and
- the backend reference API.

A seeded reservation already exists for `eq-1002`, so you can test the overlap protection immediately.

## Assumptions I used

1. This backend is a **reference implementation** meant to be ported to OutSystems later.
2. Equipment `status` represents **physical readiness** such as `Available` or `UnderRepair`.
3. Booking conflicts are controlled by the rental schedule, not by setting every future-booked item to a single global `Pending` value.
4. Data is in memory only and resets when the backend restarts.
5. The workflow layer is in `mock` mode because there is no live Camunda tenant in this environment.

## Included folders

- `frontend/` - React UI
- `backend/` - runnable reference API
- `infra/` - Kong files
- `IMPLEMENTATION_GUIDE.md` - this guide

## Backend endpoints in this pack

- `GET /health`
- `GET /api/system/assumptions`
- `GET /api/equipment`
- `GET /api/profiles/:userId`
- `GET /api/rentals`
- `POST /api/rentals`
- `PUT /api/rentals/:id/request-return`
- `PUT /api/rentals/:id/inspection-complete`
- `GET /api/damage-claims`
- `POST /api/damage-claims`
- `GET /api/payments/unpaid-fees?renterId=...`

## Recommended OutSystems mapping later

- `UserProfile` route group -> `UserProfile_Service`
- `Equipment` route group -> `Equipment_Service`
- `Rentals` route group -> `Rental_Service`
- `Payments` route group -> `Payment_Service`
- `DamageClaims` route group -> `DamageClaims_Service`

## Run summary

### Fastest possible run
Use the frontend in mock mode:

```bash
cd frontend
npm install
npm run dev
```

### Full local run
Start the backend first:

```bash
cd backend
npm install
npm run start
```

Then start the frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Optional smoke test

```bash
cd backend
npm install
npm run smoke
```

The smoke test checks:
- equipment list is returned,
- the overlap block works,
- a normal rental succeeds,
- a blocked renter with unpaid fees is rejected.

## Optional Kong setup

The folder `infra/` now includes a local Kong file that forwards all `/api` traffic to the backend reference service on port `4000`. You only need this if you want to demo the gateway in front of the backend.

## What to test

- Use `eq-1001` with renter `demo-renter-001` for a successful booking.
- Click **Load first reserved slot** on the drill to trigger the overlap protection.
- Change renter ID to `blocked-renter-001` to trigger the unpaid-fee block.

## Important note

The backend is a **reference implementation** so you can demo and validate the logic now. The route groups are intentionally split by concern so you can port them into separate OutSystems services later.


## npm install troubleshooting

If `npm install` times out while trying to download packages from a non-public registry host, delete `node_modules` and reinstall in the project directory. This pack now includes a project-level `.npmrc` that forces the public npm registry and writes future lockfiles without pinned registry tarball URLs.

Recommended recovery commands on Windows PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

If you want to keep the shipped lockfile, use:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

To confirm what registry npm will use in this folder:

```powershell
npm config get registry
```
