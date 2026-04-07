# IS213 Enterprise Solution Development — Project Report (Main Body Draft)

**Title:** Peer-to-Peer Equipment Rental Platform  
**Module:** IS213  
**Team:** G3-T2 — Cham Shin Ron, Cher Zhi Rui Joshua, Chim Ge Jun, Seah Shi Han, Yusei Miyaji  

*Trim this draft to **≤6 pages** (excluding cover and appendix) per course requirements. Font size ≥10.*

---

## 1. Introduction

Many people need tools or devices only occasionally; buying new equipment for one-off use is costly and wasteful. Owners of under-used items, conversely, may prefer short-term rental income over disposal. Our solution is a **peer-to-peer (P2P) rental web platform** that connects renters with owners, supports **secure online payment**, **rental lifecycle tracking** (pickup, return, reviews), **late return fees**, and **damage claims** with **AI-assisted** image assessment.

**Assumptions:** Users are trusted for handover in person; we simplify insurance to a “damage claim” workflow. **OutSystems** is not deployed in this repository; the required **web-based GUI** is implemented as a **React** single-page application. If the course still mandates one OutSystems atomic service, our team will clarify with the instructor whether a thin OutSystems façade is required in addition to this submission.

**Sustainability angle:** Extending product life through sharing reduces unnecessary purchases.

---

## 2. Technical architecture

We follow **Service-Oriented Architecture (SOA)** with **microservices**: each core business capability is deployed as an independently deployable service with **HTTP (REST/JSON)** on the synchronous path and **AMQP (RabbitMQ)** for asynchronous side effects (e.g. payment confirmation → notification).

**API Gateway:** **Kong** exposes a single origin (`http://localhost:8000` in local deployment) and routes `/api/*` to the appropriate service. **Stripe webhooks** are exposed at `/webhook/stripe` and forwarded to the **Payment Service**, which verifies the **Stripe signature** before updating state.

**Data isolation:** Each microservice that persists data uses its **own MySQL database** (separate Docker volume), satisfying the requirement that no two services share the same physical schema.

**Deployment:** **Docker Compose** builds and runs services, databases, RabbitMQ, Kong, and a **Camunda proxy** (Node) that starts a **Camunda Cloud (Zeebe)** process where credentials are available and orchestrates rental creation together with the Payment Service.

**External services:** **Stripe** (payments), **Google Cloud Vision** (image labels for damage assessment), and optionally **Twilio** via the Notification Service consumer.

*See appendix for SOA diagram and full API tables.*

---

## 3. User Scenario 1 — Rent an item and pay

**Story:** A renter discovers available equipment, creates a booking, pays through **Stripe Checkout**, and after webhook confirmation the rental becomes active; later the renter and owner confirm pickup, return, and reviews until the rental is **completed**.

**Steps (implementation-aligned):**

1. The renter opens the app; the UI calls **`GET /api/rental/renter/{id}/dashboard`**. If any rental is **PENDING** (unpaid) or **LATE**, browsing more equipment is blocked until resolved.
2. The UI loads listings via **`GET /api/equipment`** through Kong to the Equipment Service.
3. The renter selects dates and starts checkout: **`POST /api/rentals`** hits the **Camunda proxy**, which creates a **PENDING** rental in the Rental Service and invokes the **Payment Service** (`POST /payment/payrental`) to obtain a **checkout URL** (or a mock URL if Stripe keys are absent in development).
4. The browser redirects to **Stripe Hosted Checkout**. On success, Stripe sends **`checkout.session.completed`** to **`POST /webhook/stripe`**. The Payment Service verifies the signature, marks the payment **paid**, and calls **`POST /rental/{id}/finalize-booking`** so the rental becomes **ACTIVE** and equipment is marked **rented**.
5. The Payment Service publishes a message to **RabbitMQ**; the Notification Service consumes it (SMS if Twilio is configured).
6. The renter and owner progress through **collect**, **confirm return**, and **confirm review** endpoints until status is **COMPLETED**.

**Orchestration:** The Camunda proxy coordinates rental creation and payment URL retrieval. **Choreography:** Stripe webhook → Payment → Rental finalize; Payment → RabbitMQ → Notification.

*See appendix: Scenario 1 sequence diagram.*

---

## 4. User Scenario 2 — Late return and late fee

**Story:** If the item is returned **after** the scheduled end time, the platform records an **unpaid late fee**, moves the rental to **LATE**, and the renter pays the fee through the same Stripe pattern; after payment the rental can be completed according to the implemented rules.

**Late logic:** The **Payment Service** implements **`POST /payment/outstanding`**: it loads the rental, compares **`return_timestamp`** to **`end_time`**, and computes a fee from **extra hours × hourly rate**. If the return is not late, the request fails with a clear error. If late, it inserts a payment row **type = late**, **status = unpaid**, and calls Rental Service **`POST /rental/{id}/mark-late`**. The UI or operator can then call **`POST /payment/outstanding/{id}/checkout`** to obtain a Stripe session. After webhook, **`POST /rental/{id}/complete-after-late-payment`** sets the rental to **COMPLETED**.

This centralizes **fairness** (same rule for all renters) and **auditability** (payment rows in the Payment DB).

*See appendix: Scenario 2 sequence diagram.*

---

## 5. User Scenario 3 — Damage claim with AI assessment

**Story:** After a rental, **the owner** submits a damage claim with a photo. The **Damage Claim Service** rejects invalid uploads, stores the image, and calls the **Vision Wrapper**, which invokes **Google Cloud Vision** (label detection). A structured assessment (damage type, severity, confidence) is stored for staff review.

**Engineering note:** Images are sent as **base64** to Vision so Google’s servers do not need to fetch private Docker-internal URLs.

*See appendix: Scenario 3 sequence diagram.*

---

## 6. Beyond the labs

We implement several capabilities not covered by standard lab exercises, each justified by **risk** or **scalability** in a rental marketplace:

1. **Stripe webhook signature verification** — Ensures payment state changes only on cryptographically verified events from Stripe, not on client claims.
2. **Dedicated Payment microservice with own database** — Separates monetary transactions from rental state; supports late-fee rules without duplicating logic in the UI.
3. **RabbitMQ topic messaging** — Decouples payment confirmation from SMS delivery so payment latency stays low.
4. **Google Vision integration** — External ML API; **base64** submission path avoids production pitfalls with non-public image URLs.
5. **Kong API gateway** — Single entry point and CORS for the browser; production-like edge routing.

*Expanded justifications in appendix `BTL_Justifications.md`.*

---

## 7. Conclusion

This project demonstrates a **microservices-based P2P rental system** with **clear service boundaries**, **HTTP and message-based integration**, **external payment and AI providers**, and **Dockerized deployment**. The three scenarios showcase **orchestration** (rental + payment start), **choreography** (webhook-driven downstream effects), and **domain-specific** late-fee handling in the Payment Service.

---

## References (if required)

- Stripe Checkout & Webhooks — https://stripe.com/docs  
- Google Cloud Vision API — https://cloud.google.com/vision/docs  
- Kong Gateway — https://docs.konghq.com  
- RabbitMQ — https://www.rabbitmq.com/documentation.html  

---

## Appendix (not counted in 6-page limit)

- Technical overview / SOA diagrams — `docs/Diagrams_Mermaid_All.md`  
- Full API documentation — `docs/API_Appendix_Full.md`  
- Team contribution table — `docs/Team_Contribution_Table.md`  
