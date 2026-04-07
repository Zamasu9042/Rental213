# IS213 Minimum Requirements — Self-check (Project)

Use before submission. Source: course **Project Requirements** PDF.

| # | Requirement | Evidence in this repo |
|---|-------------|------------------------|
| 1 | **3 interesting user scenarios** | Rent+pay (§1), Late fee (§2), Damage+Vision (§3) — `docs/IS213_Report_Main_Body_Draft.md` |
| 2 | **≥3 atomic microservices, 3 data entities** | Equipment, Rental, Payment (+ Account, Damage, Reputation) — `backend/*-service/` |
| 3 | **≥1 OutSystems atomic service** | **Gap:** React UI only — confirm with instructor or add OS module |
| 4 | **One microservice reused across ≥2 scenarios** | Rental Service; Payment Service — `docs/IS213_Report_Scenarios_Diagrams_BTL.md` §2 |
| 5 | **≥1 external service** | Stripe; Google Vision — optional Twilio |
| 6 | **≥2 scenarios with orchestration or choreography** | Orchestration: camunda-proxy + rental + payment; Choreography: webhook + RabbitMQ |
| 7 | **Each service exclusive data store** | Separate MySQL per service in `compose.yaml` |
| 8 | **≥1 microservice uses DB** | All main services use MySQL |
| 9 | **HTTP between microservices** | Payment→Rental, Damage→Vision, etc. |
| 10 | **Message-based communication** | RabbitMQ `rental_topic` |
| 11 | **Web GUI** | `frontend/` React + Vite |
| 12 | **JSON** | REST APIs |
| 13 | **Docker** | Dockerfiles per service |
| 14 | **Docker Compose local** | `backend/compose.yaml` |
| 15 | **Beyond the labs (up to 3 marks)** | `docs/BTL_Justifications.md` |
| 16 | **README for setup** | Add pointer: `docs/README.md` + `backend/compose` instructions |
| 17 | **Video ≤3 min + video.txt** | `docs/Demo_And_Video_Script.md`; create **`video.txt`** at submission root with YouTube URL |
| 18 | **Report ≤6 pages + appendix** | Main body draft in `docs/IS213_Report_Main_Body_Draft.md` |

**Penalty risks:** Missing appendix items; late submission; poor proposal (separate milestone).
