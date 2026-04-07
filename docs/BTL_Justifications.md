# Beyond the Labs (BTL) — Slide + Report Wording

**Rubric:** Up to **3 marks** — justify **business benefit**, not technology for its own sake.

Use **3–5 bullets** in the main report; keep **1 slide** in presentation with the table below expanded verbally.

---

## 1. Stripe Checkout + webhook signature verification

| For slides | For report |
|------------|------------|
| **What:** Payment Service creates Stripe Checkout Sessions; **only** verified `checkout.session.completed` webhooks mark payments **paid** and trigger rental finalization. | **Why BTL:** Labs focus on synchronous REST “request–response.” Real payments require **async, server-to-server** confirmation. Signature verification ensures we never trust the browser or a forged callback. |
| **Benefit:** Prevents fraudulent or premature rental activation; matches how production SaaS integrates Stripe. | **Tie to scenario:** Scenario 1 (initial rent) and Scenario 2 (late fee) both depend on trustworthy payment state. |

---

## 2. Dedicated Payment microservice + isolated database

| For slides | For report |
|------------|------------|
| **What:** `payment` table (amount, type `rental`/`late`, status, rental_id); **late-fee rule** implemented in Payment Service (`return_timestamp` vs `end_time`, hourly rate). | **Why BTL:** Separates **money** from **booking** concerns; supports audit trail and independent scaling. Domain logic for “is it late?” is centralized, not duplicated in UI. |
| **Benefit:** Aligns with microservices “bounded context”; easier to extend (e.g. damage penalties). | **Tie to scenario:** Scenario 2 explicitly requires recording unpaid late fees before charging. |

---

## 3. Kong API Gateway

| For slides | For report |
|------------|------------|
| **What:** Single entry `http://localhost:8000`; routes `/api/*` to services; exposes `/webhook/stripe` with CORS and `stripe-signature` header. | **Why BTL:** Labs often call services directly; a gateway mirrors industry practice for **routing, CORS, and operational concern** separation. |
| **Benefit:** UI only learns one origin; services stay internal to Docker network. | **Tie to scenario:** All three scenarios use Kong for HTTP. |

---

## 4. RabbitMQ + Notification consumer

| For slides | For report |
|------------|------------|
| **What:** Topic exchange `rental_topic`; Payment Service publishes **`SendPaymentConfirmation`** after successful webhook; Notification Service consumes (Twilio when configured). | **Why BTL:** **Choreography** — payment completion triggers downstream notification without synchronous coupling. Message durability supports retries. |
| **Benefit:** Payment path stays fast; SMS failure does not block DB commit. | **Tie to scenario:** Report narrative “SMS after payment” (Scenarios 1–2). |

---

## 5. Google Cloud Vision via Vision Wrapper + base64 path

| For slides | For report |
|------------|------------|
| **What:** Damage Claim Service sends **image bytes as base64** to Vision Wrapper; wrapper calls Google Vision **Label Detection**; heuristic maps labels to damage type/severity. | **Why BTL:** External ML API integration; **engineering constraint**: Google cannot fetch private Docker URLs — base64 avoids silent Vision failures. |
| **Benefit:** Structured assessment for staff review; reduces manual triage. | **Tie to scenario:** Scenario 3 (damage claim). |

---

## 6. Docker Compose multi-DB deployment

| For slides | For report |
|------------|------------|
| **What:** One MySQL instance per bounded context (equipment, rental, account, payment, damage, reputation); Compose orchestrates services + RabbitMQ + Kong. | **Why BTL:** Meets course requirement for Docker; demonstrates **data isolation per microservice** in a reproducible demo environment. |
| **Benefit:** Graders can `docker compose up` and run the same stack as the video. | **Tie to scenario:** Whole solution. |

---

## 7. (Optional) Camunda Cloud / Zeebe process start

| For slides | For report |
|------------|------------|
| **What:** `camunda-proxy` may start a Zeebe process after rental creation. | **Only claim if your demo shows process instances** or you explain graceful degradation when Camunda is unavailable. |
| **Benefit:** External orchestration for long-running rental workflows. | **Honesty:** If process start fails non-fatally, state that rental + payment URL still succeed. |

---

## What does **not** count as strong BTL (avoid over-claiming)

- Plain CRUD without extra integration  
- “We used React” (required GUI)  
- Login/session unless you implemented OAuth/JWT beyond lab  

---

## Suggested 1-slide layout (presentation)

**Title:** Beyond the Labs — Why it matters for P2P rental  

1. **Stripe webhooks** — Trust boundary for money  
2. **Payment microservice** — Late rules + own DB  
3. **RabbitMQ** — Async payment → SMS  
4. **Google Vision** — Evidence + ML API  
5. **Kong + Docker** — Deployable, single entry  

**Closing line:** *Each item addresses a real risk: fraud, inconsistent fees, blocking I/O, subjective damage, operational complexity.*
