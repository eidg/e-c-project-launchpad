# E C Project Launchpad Cleanup Plan (Foundation Preservation)

Goal: Preserve the platform architecture (containers, integrations, auth, chat, persistence) while removing property-listing specific functionality (Audit UI, audit/web-search graph, Airbnb robot, CSV/property-specific code). No breaking changes. If removal risks breakage, provide safe placeholders (e.g., simple chat graph) to keep UX working.

## Objectives
- Keep: `frontend/` chat + status, `backend-api/` auth + conversations + health, `langgraph-service/` chat endpoints, `mcp-service/`, `postgres` + migrations, `adminer`, `rpa` service shell.
- Remove: Property-listing/Audit functionality, Airbnb robot, audit graph and web-search graph, property CSV dependencies, pricing logic.
- Avoid breaking the main chat experience. Provide a minimal placeholder graph if necessary.

## Inventory (What to Remove vs Preserve)

- Frontend (`frontend/src/components/`)
  - Remove: `AuditPanel.jsx`, Audit tab from `Dashboard.jsx`.
  - Preserve: `ChatPanel.jsx`, `ChatSidebar.jsx`, `ChatRoom.jsx`, `Dashboard.jsx` (minus Audit tab), auth components.

- Backend API (`backend-api/src/`)
  - Remove: Routes `routes/audit.js`, `routes/properties.js` and their registrations in `index.js`.
  - Remove: Services `services/airbnbClient.js`, `services/pricing.js`, `services/quintessMock.js`.
  - Preserve: `routes/auth.js`, `routes/chat.js`, `routes/conversations.js`, health endpoints `/health`, `/ai/health`, `/mcp/health`.
  - Adjust health features list in `backend-api/src/index.js` to stop advertising removed features. Change:
    - `features: ["auth", "conversations", "audit", "properties"]` → `features: ["auth", "conversations"]`.
  - Tests: If there are tests referencing pricing (e.g., `backend-api/src/tests/pricing.test.js`), delete or replace them with a deprecation stub after removing `services/pricing.js`.
  - Dependencies: Remove `csv-parse` from `backend-api/package.json` if only used by `quintessMock.js`.

- LangGraph Service (`langgraph-service/app.py`)
  - Remove: Audit/web-search graph: `_node_*` for property search, RPA extract/parse, reverse lookup; endpoints `/graphs/audit/health`, `/graphs/audit/run`.
  - Remove: External search deps (Tavily, SearXNG/DDG) if only used by audit.
  - Preserve: `/chat` endpoint and AI client selection; `/healthz` and root. If removing graphs causes frontend to break, add a minimal placeholder graph (simple chat flow) with `/graphs/chat/health` for future use.
  - Update root endpoint payload to stop advertising `graphs.audit` under `endpoints`.
  - Optional: add `/health` that mirrors `/healthz` so backend probe (`/api/ai/health`) doesn’t fall back to `/`.
  - pyproject cleanup: Remove `tavily-python`, `duckduckgo-search`, `langgraph`, `langchain-core` if no longer used post-cleanup.

- RPA Service (`rpa/`)
  - Remove: `robots/ec_airbnb_extractor_v2.robot`, Airbnb-specific code/README sections.
  - Preserve: service container, `app/` and health endpoints as a generic RPA shell for future robots. Keep Dockerfile and entrypoint.

- Data (`/data`)
  - Remove: `data/source_quintess_property_data.csv` from app usage (do not commit large CSVs going forward). Keep directory for future datasets.

- Database / Migrations (`scripts/migrate/`)
  - Preserve (for now): Auth, conversations/messages tables, and existing audit-related tables for stability and rollback.
  - Plan to drop audit tables after post-cleanup validation confirms no references remain (see Phase 10). Until then, no destructive drops.
  - Optional: Add a migration that marks audit tables deprecated or creates views/placeholders to avoid runtime references.

- Docker Compose (`docker-compose.yml`)
  - Preserve: `postgres`, `adminer`, `backend-api`, `frontend`, `langgraph-service`, `mcp-service`.
  - Decide RPA: keep `airbnb-rpa` container as a generic `rpa` container for now (no Airbnb robot). In a later step, you may rename service; renaming now impacts DNS aliases/health—so keep current service name but remove usage.
  - Optional: Remove `searxng` service if solely used by audit/web search graph. If removed, also:
    - Remove `SEARXNG_URL` from `.env`/`.env.example` and any code paths in `langgraph-service/app.py` referencing it.
  - If removing `airbnb-rpa`, also remove:
    - `depends_on: - airbnb-rpa` from `backend-api` and any env references to `AIRBNB_*`.

- Environment (`.env`)
  - Remove variables only used by removed features: `BEST_PRICE_MULTIPLIER`, `TARGET_MARGIN_PCT`, `QUINTESS_CSV_PATH`, `AIRBNB_*`, `TAVILY_API_KEY`, `SEARXNG_URL`.
  - Preserve: `DATABASE_URL`, `ACCESS_SECRET`, `REFRESH_SECRET`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LANGGRAPH_SERVICE_URL`, `MCP_SERVICE_URL`.

## Non-Breaking Cleanup Phases

### Phase 0: Pre-checks (No code changes)
- Verify current services up: `docker compose ps`.
- Note live endpoints used by UI: `Dashboard.jsx` calls `/api/health`, `/api/ai/health`, `/api/mcp/health` via backend.
- Confirm chat works: create a conversation and send message.

### Phase 1: Introduce safe placeholder in LangGraph
- Add a minimal “simple chat graph” placeholder (if needed) in `langgraph-service/app.py`:
  - Endpoint: `/graphs/chat/health` returning `{ ok: true }` to support any potential future UI checks.
  - This does not replace `/chat` but ensures a graph exists if UI is extended.
- No changes to backend/frontend yet.

### Phase 2: Frontend cleanup (property-specific UI)
- Edit `frontend/src/components/Dashboard.jsx`:
  - Remove the Audit tab button and conditional rendering that imports/uses `AuditPanel`.
  - Ensure remaining tabs: Chat and Status work.
- Remove `frontend/src/components/AuditPanel.jsx` file.
- Search and remove references to audit endpoints from other components.
- Validate: Build frontend locally; confirm no import errors.

### Phase 3: Backend cleanup (routes/services)
- In `backend-api/src/index.js`:
  - Remove `import auditRoutes` and `import propertiesRoutes` lines.
  - Remove `app.use("/audit", auditRoutes)` and `app.use("/properties", propertiesRoutes)`.
  - Keep `/health`, `/ai/health`, `/mcp/health`.
- Delete files:
  - `backend-api/src/routes/audit.js`, `backend-api/src/routes/properties.js`.
  - `backend-api/src/services/airbnbClient.js`, `backend-api/src/services/pricing.js`, `backend-api/src/services/quintessMock.js`.
- Validate: Backend starts without errors; `/health` returns ok; chat endpoints still work.

### Phase 4: LangGraph cleanup (graphs/search)
- In `langgraph-service/app.py`:
  - Remove audit state types, nodes, helper functions, and compiled `_AUDIT_GRAPH`.
  - Remove endpoints `/graphs/audit/health`, `/graphs/audit/run`.
  - Remove Tavily/SearXNG/DDG imports/usage if no longer used.
  - Keep `/chat`, `/healthz`, and root.
- Validate: Service starts; `/healthz` ok; `/chat` returns responses/fallback.

### Phase 5: RPA service (genericize)
- Remove `rpa/robots/ec_airbnb_extractor_v2.robot`.
- Update `rpa/README.md` to reflect a generic RPA connector, with example placeholder robot path (not Airbnb-specific).
- Keep service building and health endpoints so the container remains operable for future robots.
- Validate: RPA container builds and returns health/ready endpoints.

### Phase 6: Data and migrations
- Cease usage of `data/source_quintess_property_data.csv`.
- Do not delete existing audit tables in `scripts/migrate/005_pricing_audit.sql`.
- Optional migration: create a no-op or comment-only migration `006_deprecate_audit.sql` documenting deprecation without dropping tables.

### Phase 7: Docker and env cleanup
- In `docker-compose.yml`:
  - Option A (least breaking): Keep `airbnb-rpa` service running but it no longer has the Airbnb robot; keep aliases for now.
  - Option B: Remove `airbnb-rpa` if unused after backend/langgraph changes. If removed, also remove references to its URL from env.
  - Remove `searxng` service if audit search was its only consumer.
- In `.env`:
  - Remove unused keys mentioned above; update examples in `.env.example`.

### Phase 8: Validation (end-to-end)
- Start stack: `docker compose up --build -d`.
- Frontend:
  - Login/signup works.
  - Chat flows work.
  - Status page shows API/DB/AI/MCP healthy.
- Backend:
  - `/health` reports DB ok.
  - `/ai/health` returns a 200 from LangGraph service.
  - `/mcp/health` returns 200 from MCP service.
- LangGraph:
  - `/chat` responds (OpenAI/Anthropic or fallback).
  - If placeholder graph added: `/graphs/chat/health` returns ok.
- Adminer: Can connect and view tables.

### Phase 9: Documentation
- Update `README.md`:
  - Remove references to property audits, Airbnb, Tavily, SearXNG.
  - Keep architecture diagram/description.
  - Update Quick Start, Validation steps.
- Document deprecation of audit features and tables.

### Phase 10: Post-validation reference check and safe table removal
- Search for lingering references to audit tables and concepts across the codebase:
  - Terms: `properties`, `airbnb_snapshots`, `audit_runs`, `audit_results`, `airbnb`, `snapshot`, `pricing`, `quintess`, `AuditPanel`.
  - Paths to scan: `backend-api/src/**`, `langgraph-service/**`, `frontend/src/**`, `scripts/**`, infra configs, README/docs.
- Refactor/remove any remaining references discovered.
- Confirm base functionality is still green (Phase 8 checks).
- Database backup snapshot prior to drops.
- Create migration `scripts/migrate/007_drop_audit.sql` that:
  - Drops FKs and tables in safe order within a transaction:
    1. Drop constraints from `audit_results` referencing `audit_runs`.
    2. Drop table `audit_results`.
    3. Drop constraints from `audit_runs` referencing `users` and `properties`.
    4. Drop table `audit_runs`.
    5. Drop table `airbnb_snapshots`.
    6. Drop table `properties`.
  - Is idempotent (use `IF EXISTS`).
- Apply migration and validate:
  - Backend `/health` ok; chat flows ok; no errors in logs on startup.
  - Adminer: tables no longer present.

## Optional Follow-ups (Post-cleanup)
- Rename `airbnb-rpa` to `rpa` in compose and code references (breaking change—coordinate across services).
- Add a proper generic RPA API spec with a sample robot.
- Add a minimal graph toolkit for future domain workflows.

## Rollback Plan
- All removals are primarily code-level (no destructive DB changes). To roll back:
  - Revert commits removing audit code and services.
  - Restore env keys and compose services.
  - Rebuild and redeploy.

## File-by-File Checklist (for execution later)
- frontend/
  - components/Dashboard.jsx: remove Audit tab/usage.
  - components/AuditPanel.jsx: delete file.
- backend-api/
  - src/index.js: remove audit/properties routes.
  - src/routes/audit.js, src/routes/properties.js: delete.
  - src/services/airbnbClient.js, pricing.js, quintessMock.js: delete.
- langgraph-service/
  - app.py: remove audit graph/search/RPA nodes and endpoints. Keep /chat.
- rpa/
  - robots/ec_airbnb_extractor_v2.robot: delete.
- data/
  - source_quintess_property_data.csv: stop referencing; optionally remove from repo.
- env/compose
  - .env and .env.example: prune unused vars.
  - docker-compose.yml: optionally remove searxng; keep rpa as generic.
- backend-api/
  - Update `src/index.js` health `features` array to `["auth", "conversations"]`.
  - Remove or replace tests that depend on `services/pricing.js` (e.g., delete `src/tests/pricing.test.js`).
  - Remove `csv-parse` from `package.json` if unused.
- langgraph-service/
  - Update root `endpoints` payload to remove `graphs.audit`.
  - Remove search deps from `pyproject.toml` (tavily-python, duckduckgo-search) and graph libs if unused (langgraph, langchain-core).
  - Optionally add `/health` mirroring `/healthz`.
- scripts/migrate/
  - Add `006_deprecate_audit.sql` (no-op deprecation notes).
  - Add `007_drop_audit.sql` implementing ordered, idempotent drops of audit tables and constraints.

## Acceptance Criteria
- App builds and runs all core containers.
- Frontend shows Chat and Status only; no Audit UI.
- Chat works end-to-end via LangGraph `/chat` with real providers or fallback.
- No runtime references to audit, Airbnb, or property CSV.

## Phased Execution Plan

Each phase ends with a rebuild and smoke test to catch regressions early. Commit after each phase.

### Phase 1: Frontend cleanup (remove Audit UI)
- **Changes**
  - `frontend/src/components/Dashboard.jsx`: remove Audit tab/button and conditional; remove `import AuditPanel`.
  - Delete `frontend/src/components/AuditPanel.jsx`.
- **Rebuild/Test**
  - Rebuild/run frontend. Verify login, Chat works, Status hits `/api/health`, `/api/ai/health`, `/api/mcp/health`.

### Phase 2: Backend cleanup (remove audit/properties)
- **Changes**
  - `backend-api/src/index.js`: remove `/audit` and `/properties` routes; set features to `["auth", "conversations"]`.
  - Delete `routes/audit.js`, `routes/properties.js`, and services `airbnbClient.js`, `pricing.js`, `quintessMock.js`.
  - Remove/replace tests referencing pricing (e.g., `src/tests/pricing.test.js`).
  - Remove `csv-parse` from `backend-api/package.json` if unused.
- **Rebuild/Test**
  - Rebuild backend, run tests. UI Status remains green; Chat works.

### Phase 3: LangGraph cleanup (remove audit graph/search deps)
- **Changes**
  - `langgraph-service/app.py`: remove `/graphs/audit/*` endpoints and audit nodes; stop advertising `graphs.audit` in root.
  - Optional: add `/health` mirroring `/healthz`.
  - `langgraph-service/pyproject.toml`: remove `tavily-python`, `duckduckgo-search`, and if unused post-cleanup, `langgraph`, `langchain-core`.
- **Rebuild/Test**
  - Rebuild langgraph-service. Chat via `/chat` returns responses (provider or fallback). AI health green.

### Phase 4: RPA cleanup (genericize)
- **Changes**
  - Delete `rpa/robots/ec_airbnb_extractor_v2.robot`.
  - Keep container/health as a generic RPA shell.
- **Rebuild/Test**
  - Rebuild RPA service; confirm health.

### Phase 5: Compose/env cleanup (optional service removals)
- **Changes**
  - Optionally remove `searxng` service; remove `SEARXNG_URL` and related code paths.
  - If removing `airbnb-rpa`, drop `depends_on` and `AIRBNB_*` env references across services.
- **Rebuild/Test**
  - Rebuild the stack; UI smoketest.

### Phase 6: Data/migrations (deprecate only)
- **Changes**
  - Stop referencing `data/source_quintess_property_data.csv`.
  - Add `scripts/migrate/006_deprecate_audit.sql` (non-destructive deprecation notes).
- **Rebuild/Test**
  - Confirm migrations OK; app runs.

### Phase 7: Documentation
- **Changes**
  - Update `README.md` and `.env.example` to remove audit/Tavily/DDG/SearXNG/Airbnb references.
- **Test**
  - Sanity check docs and env setup steps.

### Phase 8: Final cleanup (code sweep, reference purge, table drops, data)
- **Phase 8a: LangGraph code sweep (remove legacy audit/search/RPA helpers)**
  - `langgraph-service/app.py`: remove audit state/types and helper functions: property search, web search, RPA extract/parse, reverse lookup, currency parsing, Airbnb URL normalization, and `build_audit_graph()` remnants. Keep only `/healthz`, `/chat`, root, and the minimal chat graph endpoints `/graphs/chat/health` and `/graphs/chat/run` (provider-backed).
  - `langgraph-service/pyproject.toml`: confirm `tavily-python` and `duckduckgo-search` are removed; keep only required deps (FastAPI, Pydantic, httpx, dotenv, OpenAI/Anthropic, LangGraph as needed for the simple chat graph).
  - Rebuild/Test: `langgraph-service` builds and `/healthz` OK; Backend `/ai/health` OK; UI chat works.
- **Phase 8b: Repo-wide reference purge**
  - Search terms: `properties`, `airbnb_snapshots`, `audit_runs`, `audit_results`, `pricing`, `quintess`, `AuditPanel`.
  - Paths: `backend-api/src/**`, `langgraph-service/**`, `frontend/src/**`, `scripts/**`, docs.
  - Remove/refactor any lingering references. Rebuild/Test: stack up, UI smoketest.
- **Phase 8c: Drop deprecated tables**
  - Create `scripts/migrate/007_drop_audit.sql`:
    - Idempotent, ordered drops of FKs and tables: `audit_results` → `audit_runs` → `airbnb_snapshots` → `properties`.
  - Backup DB. Apply migration. Validate: Backend health; Adminer shows tables removed; UI chat and status OK.
- **Phase 8d: Data cleanup**
  - Remove `data/source_quintess_property_data.csv` from the repo.
  - Verify no references remain in code/tests/docs.
