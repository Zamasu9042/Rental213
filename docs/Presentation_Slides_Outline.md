# Presentation Slides Outline (15 min — IS213)

**Submit:** PPT or PDF before deadline. **Reserve ≥5–7 minutes for live demo.**

---

## Slide 1 — Title
- Project name, team, module IS213

## Slide 2 — Problem & value
- P2P rental, sustainability, who rents / who lists

## Slide 3 — Scope (3 scenarios)
1. Rent + pay + lifecycle  
2. Late return + late fee  
3. Damage claim + Vision  

## Slide 4 — Architecture (SOA)
- Diagram from `Diagrams_Mermaid_All.md` (SOA flowchart)
- Kong + Docker + multiple DBs (one line each)

## Slide 5 — Microservices list
- Table: Service | Entity | DB  
- **Reuse:** Rental + Payment across scenarios 1–2

## Slide 6 — Scenario 1 (diagram thumbnail)
- 3 bullets: browse → POST /api/rentals → Stripe → webhook → ACTIVE

## Slide 7 — Scenario 2
- **Key sentence:** Late check in **Payment Service** (`/api/payment/outstanding`)
- Small sequence or bullet flow

## Slide 8 — Scenario 3
- Upload → analyze → staff; Google Vision

## Slide 9 — Beyond the labs (required if claiming BTL)
- Copy 3–5 bullets from `BTL_Justifications.md`
- **Why it matters** (fraud, decoupling, fairness)

## Slide 10 — Demo script
- Login → marketplace → pay → my rentals  
- Optional: damage claim path

## Slide 11 — Q&A backup
- Swagger `/docs` screenshots  
- Repository + README location  

---

**Timing tip:** If demo is long, **do Scenario 1 fully** and **show Scenario 3 screenshot** for Vision.
