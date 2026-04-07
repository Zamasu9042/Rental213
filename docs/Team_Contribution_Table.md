# Appendix — Team Members’ Technical Contribution

**Instructions:** Replace rows with your real team (5 members). Keep one **primary owner** per microservice area to avoid overlap confusion in Q&A.

| Team member | Primary responsibilities (services / features) | Integration / infra | Report / doc sections | Demo / video segment |
|-------------|-----------------------------------------------|---------------------|------------------------|----------------------|
| *Name 1* | e.g. Payment Service, Stripe webhook, Kong routes | Docker Compose payment-db | §Architecture, §BTL payment | Scenario 1 pay flow |
| *Name 2* | e.g. Rental Service, lifecycle, RabbitMQ events | — | §Scenario 1–2 | My Rentals / return |
| *Name 3* | e.g. Damage Claim + Vision integration | — | §Scenario 3 | Damage claim demo |
| *Name 4* | e.g. Frontend React, `api.ts`, UI flows | Vite proxy | §UI | Marketplace / login |
| *Name 5* | e.g. Account, Reputation, Equipment | Seed data | — | Listings / reviews |
| *Name 6 (if any)* | e.g. Camunda proxy, notification consumer | — | §Orchestration | Optional |

**Sign-off:** We confirm the above reflects actual work done and matches the submitted repository.

---

## Optional: Git / folder ownership (for internal use)

| Area | Path hint |
|------|-----------|
| Gateway | `backend/kong.yml` |
| Payment | `backend/payment-service/` |
| Rental | `backend/rental-service/` |
| Equipment | `backend/equipment-service/` |
| Damage | `backend/damage-claim-service/`, `backend/vision-service/` |
| UI | `frontend/src/` |
| Orchestrator | `backend/camunda_proxy.js` |
