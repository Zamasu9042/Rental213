# Rental213 — P2P Equipment Rental (IS213 G3-T2)

## Documentation (report, appendix, diagrams)

All course documentation is under **`docs/`**. Start here: **[`docs/README.md`](docs/README.md)**

| Deliverable | File |
|-------------|------|
| Report main body (draft) | [`docs/IS213_Report_Main_Body_Draft.md`](docs/IS213_Report_Main_Body_Draft.md) |
| API appendix | [`docs/API_Appendix_Full.md`](docs/API_Appendix_Full.md) |
| Mermaid diagrams | [`docs/Diagrams_Mermaid_All.md`](docs/Diagrams_Mermaid_All.md) |
| BTL text | [`docs/BTL_Justifications.md`](docs/BTL_Justifications.md) |
| Team table | [`docs/Team_Contribution_Table.md`](docs/Team_Contribution_Table.md) |
| Demo / video script | [`docs/Demo_And_Video_Script.md`](docs/Demo_And_Video_Script.md) |
| Requirements checklist | [`docs/REQUIREMENTS_CHECKLIST_IS213.md`](docs/REQUIREMENTS_CHECKLIST_IS213.md) |

**Video URL:** put your YouTube link in **`video.txt`** (course requirement).

## Quick run (development)

1. **Backend:** from `backend/`, run Docker Compose (see `backend/compose.yaml`). Kong listens on **8000**.
2. **Frontend:** from `frontend/`, `npm install` && `npm run dev` (Vite proxies `/api` to Kong).

## Repositories layout

- `frontend/` — React + Vite SPA  
- `backend/` — Microservices, Kong, Compose, camunda-proxy  
