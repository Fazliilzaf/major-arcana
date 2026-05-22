# Developer Handover - Major Arcana

Detta dokument är ett komplett overlamningspaket for en ny utvecklare som snabbt ska kunna:
- forsta systemet,
- starta lokalt,
- felsoka vanliga problem,
- fortsatta bygga utan att bryta kritiska floden.

## 1) Systemoversikt

Major Arcana ar en Node/Express-monolit med:
- publik patientchat (`/chat`) med kunskapsbas och safeguards,
- admin/API for auth, tenant, risk och ops,
- CCO-workspace (queue, historik, focus, studio, mailbox truth/read models),
- governance/ops-lager (scheduler, readiness, release guards, rapporter).

### Huvuddelar
- **Backend API + runtime**: `server.js`, `src/routes/*`, `src/ops/*`, `src/gateway/*`
- **Frontend workspace (stor klientruntime)**: `public/major-arcana-preview/*`
- **Persistens**: JSON-baserade stores under `ARCANA_STATE_ROOT` (default `./data`)
- **Ops/automation**: scripts + scheduler + report/guard-runner

## 2) Viktig mappstruktur

- `server.js` - app bootstrap, middleware, route montering, static hosting
- `src/config.js` - all env parsing, defaults, guardrails
- `src/routes/` - API-endpoints per doman (auth, capabilities, risk, etc.)
- `src/gateway/executionGateway.js` - execution/risk/policy pipeline
- `src/ops/` - scheduler, stores, read models, truth/adapters
- `public/major-arcana-preview/` - CCO frontend runtime
  - `app.js` - huvudorkestrering och UI wiring
  - `runtime-queue-renderers.js` - kort/list-rendering for queue/historik
  - `runtime-focus-intel-renderers.js` - focus/intel/kundpaneler
  - `runtime-overlay-renderers.js` - overlays (studio, notes, later, etc.)
  - `runtime-async-orchestration.js` - API-anrop och runtime-sync
  - `styles.css` - all styling for preview-ytan
- `tests/` - Node test-runner-baserade regressionstester
- `docs/architecture/` - arkitekturkontrakt
- `docs/ops/` - runbooks, driftguider, predeploy/stabilization

## 3) Lokal setup och korning

## Krav
- Node.js LTS
- npm

## Installera
```bash
npm install
```

## Starta (normal)
```bash
npm run dev
```
Server startar normalt pa `http://localhost:3000`.

## Starta (offline utan extern AI/Graph)
```bash
npm run dev:offline
```
Kor pa port `3100` med fallback-provider och Graph av.

## Standard-URL:er att testa
- `http://localhost:3000/` - publik entry
- `http://localhost:3000/admin` - admin
- `http://localhost:3000/major-arcana-preview/` - CCO preview runtime

## 4) Viktiga npm-scripts

Bas:
- `npm run dev` - start lokal server
- `npm run start` - start server (produktionlikt)
- `npm run dev:offline` - offline/fallback-lage

Verifiering:
- `npm run check:syntax`
- `npm run smoke:local`
- `npm run verify` (syntax + local smoke)
- `npm run lint:no-bypass`

Test:
- `npm test`
- `npm run test:unit` (Node `--test` over `tests/**/*.test.js`)

Ops/governance:
- `npm run ops:suite:strict`
- `npm run finalization:sweep:guard`
- `npm run closure:guard`

## 5) Miljovariabler - minsta fungerande set

Utga fran `.env.example`.

Minimum for meningsfull lokalutveckling:
```env
PORT=3000
PUBLIC_BASE_URL=http://localhost:3000
ARCANA_STATE_ROOT=./data
ARCANA_BRAND=hair-tp-clinic
ARCANA_AI_PROVIDER=fallback

ARCANA_OWNER_EMAIL=owner@example.com
ARCANA_OWNER_PASSWORD=change-me
```

### Kritiska fallgropar
- `CORS_STRICT=true` ar default. Fel origins => frontend/API ser "trasigt" ut.
- `ARCANA_GRAPH_READ_ENABLED=true` utan kompletta Graph credentials ger fail-fast i delar av runtime.
- `OPENAI_API_KEY` krav galler i production nar provider ar `openai`.
- `ARCANA_STATE_ROOT` styr var all state sparas; fel path ger "tomma" vyer eller ovantad data.

## 6) Arkitektur och dataflode

## Backend requestflode (forenklad)
1. `server.js` laddar config + middleware.
2. CORS/request-context/rate-limits appliceras.
3. Routes i `src/routes/*` hanterar endpointlogik.
4. Vissa capability-kall gar via execution gateway (`src/gateway/executionGateway.js`) med risk/policy gates.
5. Stores/read-models i `src/ops/*` levererar state till UI/API.

## CCO frontendflode (preview)
1. `app.js` binder runtime state + renderers + event handlers.
2. `runtime-async-orchestration.js` hamtar/uppdaterar data via API.
3. `runtime-queue-renderers.js` renderar kort/listor (Alla, Historik, lanes, feed).
4. `styles.css` styr layout/utseende, inklusive unified queue card-design.
5. DOM interaction kopplas tillbaka till state via runtime helpers.

## 7) Nyckelmoduler att kunna direkt

## Backend
- `src/routes/capabilities.js`
  - central CCO/logik, Graph connectors, mailbox truth read-model hooks
- `src/ops/scheduler.js`
  - automatiserade jobb (reports, drills, audits, rotation, governance)
- `src/ops/ccoMailboxTruthWorklistReadModel.js`
  - bygger worklist/read projection fran mailbox truth
- `src/ops/ccoMailboxTruthReadAdapter.js`
  - adapterlager for query/read ovan store

## Frontend
- `public/major-arcana-preview/app.js`
  - "control tower" for runtime state/render/events
- `public/major-arcana-preview/runtime-queue-renderers.js`
  - kortmarkup och historik/live render paths (hog regressionsrisk)
- `public/major-arcana-preview/styles.css`
  - stor CSS-yta; gamla selectors kan oavsiktligt override:a nya kort

## 8) Teststrategi och arbetssatt

Projektet anvander Node inbyggda test-runner (`node --test`).

Testkaraktar:
- manga regressions/kontraktstester,
- vissa tester ar text-/wiring-kansliga (små refactors kan bryta tester utan beteendebrott).

Rekommenderat innan PR/merge:
```bash
npm run check:syntax
npm test
npm run smoke:local
```
Vid storre ops/risk-andringar, kor dessutom:
```bash
npm run ops:suite:strict
npm run finalization:sweep:guard
npm run closure:guard
```

## 9) Kanda risker och gotchas

- **Mycket stora filer** i preview-runtimen (framfor allt `app.js` och `styles.css`).
- **Flera render-vagar** for queue/historik kan ge visuella mismatch trots "ratt" markup i en funktion.
- **Legacy CSS-overrides** kan fortfarande paverka kort om selector-specificitet missas.
- **State/Mode-beroenden** (`runtime.mode`, lane/history toggles) styr vilken rendergren som faktiskt anvands.
- **Cache/stale assets** kan maskera frontend-andringar under lokal testning.

## 10) Aktiv kontext (for nasta utvecklare)

Nyligen fokus:
- unifiera kortdesign till v3 i alla vyer,
- riva legacy historik-layout,
- tvinga historik att anvanda samma kortpipeline/fallback som "Alla",
- justera offline-history fallback for att undvika special/offline-kort.

Om "Historik ser gammal ut" fortfarande uppstar:
1. Verifiera att kort har klassen `unified-queue-card`.
2. Verifiera vilken rendergren som traffas i `renderQueueHistorySection`.
3. Verifiera `queueHistoryList.dataset.queueListMode` och aktiv vy/lane.
4. Hard refresh med cache-bust query, t.ex. `?v=debug-<timestamp>`.

## 11) Dag-1 checklista (snabb onboarding)

1. Skapa `.env` fran `.env.example`.
2. Satt owner credentials och `ARCANA_AI_PROVIDER=fallback`.
3. Kor `npm install && npm run dev`.
4. Bekrafta `healthz/readyz` + oppna preview/admin.
5. Kor `npm run verify` + `npm test`.
6. Las:
   - `server.js`
   - `src/config.js`
   - `src/routes/capabilities.js`
   - `src/ops/scheduler.js`
   - `public/major-arcana-preview/app.js`
   - `public/major-arcana-preview/runtime-queue-renderers.js`
7. Gor en liten testandring i preview och validera att test/smoke passerar.

## 12) Rekommenderat arbetssatt i denna kodbas

- Gor sma, isolerade andringar i renderer/CSS.
- Verifiera alltid visuellt + med test efter varje steg.
- Undvik bred refactor av stora runtimefiler utan safety-net.
- Dokumentera varje fallback/override med kort kommentar om "varfor".
- Behall en tydlig mapping mellan API payload -> runtime model -> markup.

## 13) Referenser

- `README.md`
- `.env.example`
- `docs/major-arcana-index.md`
- `docs/architecture/execution-gateway-contract.md`
- `docs/architecture/capability-framework-contract-v1.md`
- `docs/ops/pre-deploy-quickstart-sv.md`
- `docs/ops/arcana-finalization-runbook.md`

## 14) Komplett endpoint-karta (backend -> interna beroenden -> frontend)

Denna sektion ar gjord for snabb felsokning: du ska kunna ga fran symptom i UI till ratt route, store och runtimefil direkt.

### 14.1 Tvargaende felsokningsregler

- **API-gate vid startup**: `server.js` returnerar `503` pa `/api/*` tills runtime ar ready.
- **Rate limiters**: read/write-limiters ligger globalt pa `/api/v1/*`, plus extra risk/chat-limiters.
- **Auth/RBAC**: privata CCO/risk/auth endpoints kraver normalt `requireAuth` + rollkontroll.

### 14.2 CCO Workspace endpoints (`/api/v1/cco-workspace/*`)

- **Routefil**: `src/routes/ccoWorkspace.js`
- **Huvudendpoints**:
  - `GET /bootstrap`
  - `GET /notes`, `POST /notes`, `POST /notes/validate-visibility`
  - `GET /follow-ups`, `POST /follow-ups`, `POST /follow-ups/validate-conflict`
  - `GET|PUT|DELETE /preferences`
- **Interna beroenden**:
  - `noteStore`
  - `followUpStore`
  - `workspacePrefsStore`
  - `authStore` (aktor/audit)
- **Frontend-anrop**:
  - `public/major-arcana-preview/runtime-async-orchestration.js`
- **Vanliga fel**:
  - `401` session/token saknas (forutom vissa localhost preview-fall)
  - `409` follow-up konflikt
  - `400` valideringsfel i payload

### 14.3 Capabilities endpoints (`/api/v1/capabilities/*`)

- **Routefil**: `src/routes/capabilities.js`
- **Huvudendpoints**:
  - `GET /meta`
  - `GET /analysis`
  - `POST /:capabilityName/run`
- **Interna beroenden**:
  - `executionGateway`
  - `createCapabilityExecutor(...)`
  - `capabilityAnalysisStore`
  - `ccoHistoryStore`, `ccoMailboxTruthStore`, `ccoCustomerStore`, `ccoConversationStateStore`
  - `tenantConfigStore`, `authStore`
- **Frontend-anrop**:
  - `public/major-arcana-preview/runtime-dom-live-composition.js`
  - `public/major-arcana-preview/runtime-async-orchestration.js`
- **Vanliga fel**:
  - `400` capabilitynamn/input ogiltigt
  - `403` policy/risk-block
  - `503` connector/store ej tillganglig

### 14.4 CCO runtime/actions (`/api/v1/cco/*`)

Notera att detta prefix hanteras av flera routefiler.

- **Karnroute (runtime/action)**: `src/routes/capabilities.js`
  - Exempel:
    - `GET /api/v1/cco/runtime/status`
    - `GET /api/v1/cco/runtime/history`
    - `GET /api/v1/cco/runtime/history/search`
    - `POST /api/v1/cco/runtime/history/backfill`
    - `GET /api/v1/cco/runtime/worklist/truth`
    - `GET /api/v1/cco/runtime/worklist/consumer`
    - `POST /api/v1/cco/send`
    - `POST /api/v1/cco/handled`
    - `POST /api/v1/cco/reply-later`
    - `POST /api/v1/cco/delete`
    - `POST /api/v1/cco/restore`
    - `POST /api/v1/cco/studio/draft`
    - `GET /api/v1/cco/metrics`
- **Interna beroenden**:
  - Graph connectors (`graphReadConnector`, `graphSendConnector`)
  - `executionGateway`
  - `ccoHistoryStore`, `ccoMailboxTruthStore`, `ccoConversationStateStore`, `ccoCustomerStore`
  - shadow/calibration/readout helpers
- **Vanliga fel**:
  - `422` saknade obligatoriska id-falt (`conversationId`, `mailboxId`, `messageId`)
  - `503` Graph operation avstangd eller connector saknas
  - `403` allowlist-block for mailbox/delete

#### 14.4.a Integrations (`/api/v1/cco/integrations/*`)

- **Routefil**: `src/routes/ccoIntegrations.js`
- **Beroenden**: `integrationStore`, `authStore`
- **Frontend**: `public/major-arcana-preview/app.js`
- **Vanliga fel**: `404` okand integration, `400` fel i contact-sales payload

#### 14.4.b Settings (`/api/v1/cco/settings*`)

- **Routefil**: `src/routes/ccoSettings.js`
- **Beroenden**: `settingsStore`, `authStore`
- **Frontend**: `public/major-arcana-preview/app.js`

#### 14.4.c Macros (`/api/v1/cco/macros*`)

- **Routefil**: `src/routes/ccoMacros.js`
- **Beroenden**: `macroStore`, `authStore`
- **Frontend**: `public/major-arcana-preview/app.js`
- **Vanliga fel**: `404` macro saknas, `500` macro-store fel

#### 14.4.d Customers (`/api/v1/cco/customers/*`)

- **Routefil**: `src/routes/ccoCustomers.js`
- **Beroenden**: `customerStore`, `authStore`
- **Frontend**: `public/major-arcana-preview/app.js`
- **Vanliga fel**: `400` ogiltig merge/split/import input

### 14.5 Risk endpoints (`/api/v1/risk/*`)

Riskprefix ar uppdelat i tva routefiler:

- **Routefil A**: `src/routes/risk.js`
  - `GET /settings`
  - `PATCH /settings`
  - `GET /settings/versions`
  - `POST /settings/rollback`
  - `POST /preview`
  - `GET /precision/report`
  - `GET /calibration/suggestion`
  - `POST /calibration/apply-suggestion`
- **Routefil B**: `src/routes/templates.js`
  - `GET /summary`
  - `GET /evaluations`
  - `GET /evaluations/:evaluationId`
  - `POST /evaluations/:evaluationId/owner-action`
- **Interna beroenden**:
  - `tenantConfigStore`, `templateStore`, `authStore`
  - risk/gold-set/policy moduler
- **Frontend-anrop**:
  - `public/major-arcana-preview/app.js` (bl.a. `GET /api/v1/risk/summary`)
- **Vanliga fel**:
  - `400` validerings-/signoff-fel
  - `404` rollback target/version saknas

### 14.6 Auth endpoints (`/api/v1/auth/*`)

- **Routefil**: `src/routes/auth.js`
- **Huvudendpoints**:
  - `POST /login`
  - `POST /mfa/verify`
  - `POST /select-tenant`
  - `POST /switch-tenant`
  - `POST /logout`
  - `POST /change-password`
  - `GET /me`
  - `GET /sessions`
  - `POST /sessions/:sessionId/revoke`
  - `GET /preview-bootstrap-session`
- **Interna beroenden**:
  - `authStore`
  - login/select-tenant rate limiters
  - session rotation + MFA logic
- **Frontend-anrop**:
  - `public/major-arcana-preview/app.js` (`/auth/preview-bootstrap-session`, `/auth/me`)
- **Vanliga fel**:
  - `401` credentials/session fel
  - `403` tenant/roll nekad
  - `503` preview-bootstrap ej tillganglig i aktuell miljo

### 14.7 Publik chat endpoint (`POST /chat`)

- **Routefil**: `src/routes/chat.js` (mount i `server.js`)
- **Interna beroenden**:
  - `executionGateway`
  - `memoryStore`
  - `runChatWithTools` / providerlager
  - knowledge retriever
  - `patientConversionStore`
- **Requestkarnor**:
  - `message` (kravs)
  - `conversationId` (valfritt men rekommenderat)
  - `sourceUrl` (valfritt)
- **Vanliga fel**:
  - `400` saknad `message`
  - `403` beta-gate/prompt-injection block
  - `429` max turns natt
  - `503` kill switch aktiv

## 15) Felsokningsmatris (symptom -> var du borjar)

- **"Historik visar inte samma som Alla"**
  - Borja i: `public/major-arcana-preview/runtime-queue-renderers.js`
  - Kontrollera: `renderQueueHistorySection`, `renderQueueHistoryList`, `renderQueueInlineLaneList`, `data-queue-list-mode`.

- **"Kortdesign fallbackar till gammal layout"**
  - Borja i: `public/major-arcana-preview/runtime-queue-renderers.js` + `public/major-arcana-preview/styles.css`
  - Kontrollera: att kort renderas med `unified-queue-card`, och att legacy-selectors inte tar over.

- **"API svarar 503 direkt efter start"**
  - Borja i: `server.js`
  - Kontrollera startup readiness gate under `/api`.

- **"CCO action (send/delete/restore) fungerar inte"**
  - Borja i: `src/routes/capabilities.js` (CCO endpoints)
  - Kontrollera Graph-enabled flags, allowlists, connector-status i config.

- **"Risk-sidor saknar data"**
  - Borja i: `src/routes/risk.js` och `src/routes/templates.js`
  - Kontrollera att du letar i ratt routefil for endpointen.

- **"Auth funkar lokalt men inte staging/prod"**
  - Borja i: `src/routes/auth.js` + `src/config.js`
  - Kontrollera CORS, tenant mapping, MFA-krav, session rotation scope.

## 16) Quick command appendix (copy/paste)

Alla kommandon koras fran projektroten.

### 16.1 Start och basverifiering

```bash
npm install
npm run dev
```

```bash
curl -i http://localhost:3000/healthz
curl -i http://localhost:3000/readyz
```

### 16.2 Offline-lage (utan extern AI/Graph)

```bash
npm run dev:offline
```

### 16.3 Kvalitet och test

```bash
npm run check:syntax
npm test
npm run smoke:local
npm run verify
```

### 16.4 Ops/governance checks (vid releasekritiska andringar)

```bash
npm run ops:suite:strict
npm run finalization:sweep:guard
npm run closure:guard
```

### 16.5 Snabb endpoint-check med auth cookie/token

Exempel med bearer-token:

```bash
TOKEN="<paste-token>"
curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/auth/me
curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/cco/runtime/status
curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/risk/summary
```

### 16.6 Snabb frontend-debug (Historik/kort)

Tvinga cache-bust i browser:

```bash
open "http://localhost:3000/major-arcana-preview/?v=debug-$(date +%s)"
```

Sok efter nyckelfunktioner i rendererfil:

```bash
rg "renderQueueHistorySection|renderQueueHistoryList|renderQueueInlineLaneList|buildUnifiedCardMarkup" public/major-arcana-preview/runtime-queue-renderers.js
```

Sok efter legacy-kortselectors i CSS:

```bash
rg "thread-card-head|thread-card-identity|thread-support-stack|thread-intelligence-row" public/major-arcana-preview/styles.css
```

Verifiera auth/cors-relaterad config i kod:

```bash
rg "corsStrict|CORS_|ARCANA_GRAPH_READ_ENABLED|ARCANA_STATE_ROOT|OPENAI_API_KEY" src/config.js .env.example README.md
```

### 16.7 Vanliga "snabba omstarter"

Om servern hanger/stale state misstanks:

```bash
pkill -f "node server.js" || true
npm run dev
```

Om data ska nollstallas i lokal sandlada, verifiera forst `ARCANA_STATE_ROOT` och ta backup innan rensning.

## 17. Arcana Admin Operator (CAO)

- Agent: `POST /api/v1/agents/CAO/run` (17 capabilities, analysis-only).
- Go/No-Go underlag: `GenerateGoNoGoBrief` i CAO-compose (`goNoGoBrief` i output).
- Readiness operational core vs monitor: CAO `/admin/readiness/snapshot` (`source: shared_operational_core`) delar evidence med monitor; auktoritativ Go/No-Go = `/monitor/readiness` (fält `alignment` / `evidence.operationalCore`).
- Rollbaserade checklistor: `GET /api/v1/admin/checklists?role=OWNER|STAFF` (kopplade till seed-mallar).
- Executive feed: `GET /api/v1/executive/feed` — persistent store `data/executive-decision-feed.json` (`EXECUTIVE_FEED_STORE_PATH`).
- Staging smoke: `npm run smoke:cao-staging` (valfritt `ARCANA_SMOKE_BASE_URL` för HTTP).
- ADR orchestrator execute: `docs/adr/0001-cao-orchestrator-execute-boundary.md`.
- Contract-tester: `tests/capabilities/caoCapabilityContract.test.js` + snapshot-fixture.
- Mutation (CAO): `npm run test:mutation:cao` (`stryker.cao.conf.json`).
- Runbook: `docs/ops/runbooks/cao-admin-operator-runbook.md`.
- Orchestrator execute: `POST /api/v1/orchestrator/admin-run?mode=execute` med `{ "prompt": "..." }`.
- Orchestrator audit: `correlationId`, `executableSteps`, `executedSteps` i audit-metadata vid success.
- Admin workspace API (`src/routes/adminWorkspace.js`):
  - `GET /api/v1/admin/tasks` — filter owner/status/risk/deadline
  - `PATCH /api/v1/admin/tasks/:taskId` — tilldela owner, uppdatera status/DoD/nästa steg (audit: `admin.task.update`)
  - `GET /api/v1/admin/incidents/admin-view` — COO+CAO incident read-model
  - `GET /api/v1/admin/documentation/gaps` — frontmatter-audit mot docs-träd
  - `GET /api/v1/admin/audit/trace` — read-only audit-spår
  - `GET /api/v1/admin/readiness` — CAO readiness hydration
- Admin UI §13: `#caoAdminWorkspaceSection` + `public/admin/cao-workspace.js` (tasks/incidents/docs/audit).
- CAO panel: `public/admin/cao-operator.js` (`initCaoOperatorPanel`, `runCaoAgent`).
- Orchestrator UI: L3+-intents kräver OWNER-bekräftelse före `mode=execute`.
- Admin tasks store: `data/admin-tasks.json` via `ADMIN_TASKS_STORE_PATH`.
- Scheduler-jobb: `cao_daily_quality_gate`, `cao_sla_risk_scan`, `cao_missing_dod_scan` (monitor `REQUIRED_SCHEDULER_JOBS`).
- Seed draft-mallar: `npm run seed:admin-templates` → 7 INTERNAL-mallar i `data/templates.json`.
- Daglig gate (manuell): `node scripts/cao-admin-quality-gate-daily.js`.
- Plan/risktabell: `docs/strategy/cao-arcana-admin-operator-implementation-plan.md`, `docs/strategy/cao-capability-risk-matrix.md`, IA: `docs/ops/cao-admin-operator-ia.md`.

## 18. Arcana Marketing Copilot (CMO)

- Agent: `POST /api/v1/agents/CMO/run` (21 capabilities — v2.0.0, Fas A–H).
- Modes: `production_draft` (default), `analytics`, `strategy_intel` (konkurrent + nurture + winback).
- Compose: `composeCmoMarketingCopilot` v1.5.0 med `complianceReview`, `scheduleAllowed`, `orchestrationGates`, `salesEnablementPack`, `crisisCommsHold`.
- Capabilities (urval): `GenerateSocialPostPack`, `ValidateMarketingClaims`, `ReviewMarketingCompliance`, `ProposeContentCalendar`, `ProposePublishSchedule`, `GenerateUtmPack`, `ValidateMarketingTracking`, `SummarizeMarketingPerformance`, `GenerateMarketingBrief`, `GenerateSalesEnablementPack`, `ProposeCrisisCommsHold`.
- Campaign drafts: `data/marketing-campaign-drafts.json` (`MARKETING_CAMPAIGN_DRAFTS_PATH`) via `marketingCampaignDraftsStore`.
- Claims whitelist: `data/marketing-claims-whitelist.json` (`MARKETING_CLAIMS_WHITELIST_PATH`), seed: `npm run seed:marketing-claims`.
- Policy floor: `POLICY_CONTEXT.MARKETING_COPY` + CLINICAL_GUARD-scan i compliance-pipeline.
- Orchestrator intent: `marketing_campaign` → CMO execute med CAO/COO/CFO-gates (`src/ops/cmoOrchestrationGate.js`).
- Marketing workspace API (`src/routes/marketingWorkspace.js`):
  - `GET /api/v1/marketing/campaigns`
  - `POST /api/v1/marketing/campaigns/:id/approve`
  - `POST /api/v1/marketing/campaigns/:id/reject`
  - `PATCH /api/v1/marketing/campaigns/:id`
- Executive feed actions: `approve_campaigns`, `pause_underperforming_ads`, `pause_all_external_campaigns`, `approve_marketing_budget`, `review_go_nogo`, `review_publish_schedule`, `review_missed_publications`.
- Scheduler-jobb: `cmo_weekly_content_plan` (förslag only, ingen auto-publish).
- Audit: `cmo.compliance.review`, `cmo.claims.flagged`, `cmo.analytics.report`.
- Staging smoke: `npm run smoke:cmo-staging`.
- Contract-tester: `tests/capabilities/cmoCapabilityContract.test.js` + `tests/fixtures/cmoCapabilitySnapshot.js`.
- E2E (Fas G): `tests/ops/cmoPhaseG.test.js` — compose → sync → approve → feed resolve.
- Mutation (CMO, valfritt): `npm run test:mutation:cmo` (`stryker.cmo.conf.json`).
- Runbook: `docs/ops/runbooks/cmo-marketing-copilot-runbook.md`.
- IA: `docs/ops/cmo-marketing-copilot-ia.md`, plan: `docs/strategy/cmo-arcana-marketing-copilot-implementation-plan.md`.
- Admin UI: `#cmoSection` med sex flikar (`cmo-tabs.js`), `cmo-copilot.js`, `cmo-workspace.js`, `cmo-analytics.js`.
- Riskmatris: `docs/strategy/cmo-capability-risk-matrix.md`.
- Automation step 2: **No-Go** för auto-publish/auto-spend; scheduler + OWNER approve only (se runbook).
- Tester: `tests/ops/cmoPhaseA.test.js` … `cmoPhaseG.test.js`, `tests/agents/cmoAgentGateway.test.js`, `tests/agents/cmoAnalyticsGateway.test.js`.
