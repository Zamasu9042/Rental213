# Demo & Video Script (≤ 3 minutes)

**Course requirement:** Video max **3 minutes**; place YouTube URL in **`video.txt`** for eLearn.

**Prerequisites:** `docker compose up` (from `backend/`), frontend `npm run dev`, Kong on **8000**, Stripe CLI forwarding webhooks if testing real payments (`stripe listen --forward-to localhost:8000/webhook/stripe`).

---

## 0:00–0:20 — Introduction

- **Say:** “This is our peer-to-peer equipment rental platform: renters browse listings, pay through Stripe, complete pickup and return, and owners can file damage claims with AI-assisted assessment.”
- **Show:** Home or Marketplace page.

---

## 0:20–1:10 — Scenario 1 (Rent + pay)

1. **Login** as renter (seed account from your `LoginPage` / DB).
2. Open **Marketplace** → pick equipment → **dates** → **Proceed to payment**.
3. **Either:** Redirect to Stripe test card (4242…) **or** mock confirmation URL if no Stripe key.
4. **Show** **My Rentals** / Confirmation: rental **ACTIVE** or **PENDING** → **ACTIVE** after webhook.
5. **One sentence:** “Payment is confirmed by **Stripe webhook** to our Payment Service, not by the browser alone.”

---

## 1:10–1:50 — Scenario 2 (Late fee) — if you have seed data

1. **Show** a rental in **LATE** or walk through **POST** outstanding (Postman) if no UI button yet.
2. **Say:** “Late return is detected by comparing return time to due time in the **Payment Service**; an unpaid late fee row is created before checkout.”
3. Optional: open **payment** row in Swagger on port **8009** for proof.

*If you cannot demo live:* show **screenshot** in slides + say “see video appendix.”

---

## 1:50–2:40 — Scenario 3 (Damage claim)

1. As owner, open **My Listings** / completed rental → **File damage claim**.
2. Upload image → **Submit** → show **result** page with damage type / confidence.
3. **Say:** “Images are analyzed by **Google Vision** through our Vision Wrapper; invalid files are rejected before calling Google.”

---

## 2:40–3:00 — Architecture closing

- **Show** one slide: **Kong diagram** or **SOA** from `Diagrams_Mermaid_All.md`.
- **Say:** “Services are deployed with **Docker Compose**; each owns its database; RabbitMQ notifies the user after payment.”

---

## Backup if live demo fails in class

- Play this **same** pre-recorded video.
- Keep **screenshots** of Swagger `/docs` for Payment, Rental, Damage on a USB slide deck.

---

## Checklist before recording

- [ ] `docker compose ps` — all healthy  
- [ ] `curl http://localhost:8000/api/equipment` — returns JSON  
- [ ] Test user credentials written on sticky note  
- [ ] Stripe CLI running if using real webhooks  
- [ ] Microphone clear; 1080p window capture of browser  
