# Phase 2 Hardening Sweep (2026-02-26)

Denna sweep stänger flera kvarvarande P1/P2-gap med kod + test-evidens.

## 1) Distribuerad runtime (Redis) för rate-limit + gateway

Implementerat:
- `src/infra/redisClient.js`
- `src/security/rateLimitStores.js`
- `src/gateway/redisRuntimeBackend.js`
- `src/security/rateLimit.js` stödjer nu store-adapter (`memory|redis`).
- `server.js` initierar Redis när `ARCANA_DISTRIBUTED_BACKEND=redis` och fallbackar till memory om Redis saknas/är nere (om inte `ARCANA_REDIS_REQUIRED=true`).
- `ExecutionGateway` kan nu använda distribuerat backend för:
  - per-tenant serialisering (distributed lock)
  - idempotency replay över instanser
  - dead-letter replikering

Nya envs:
- `ARCANA_DISTRIBUTED_BACKEND`
- `ARCANA_REDIS_URL`
- `ARCANA_REDIS_REQUIRED`
- `ARCANA_REDIS_CONNECT_TIMEOUT_MS`
- `ARCANA_REDIS_KEY_PREFIX`
- `ARCANA_GATEWAY_QUEUE_LOCK_TTL_MS`
- `ARCANA_GATEWAY_QUEUE_ACQUIRE_TIMEOUT_MS`
- `ARCANA_GATEWAY_QUEUE_POLL_INTERVAL_MS`

## 2) Semantisk riskmotor: heuristisk + modellbaserad mode-switch

Implementerat:
- `src/risk/semanticScoring.js`
- `src/risk/templateRisk.js` använder nu semantic mode:
  - `heuristic` -> `semantic.heuristic.v1`
  - `linear` -> `semantic.linear.v1`
  - `hybrid` -> `semantic.hybrid.v1`
- Versionsfält loggar aktiv `semanticModelVersion` i varje evaluering.

Ny env:
- `ARCANA_SEMANTIC_MODEL_MODE=heuristic|linear|hybrid`

## 3) Template revisionsmodell + optimistic locking + diff/rollback API

Implementerat i store:
- `src/templates/store.js`
  - draft-versioner har nu `revision` + `revisions[]`
  - varje draft-edit skapar ny revisionspost (ingen tyst in-place mutation)
  - `updateDraftVersion(... expectedRevision)` ger `VERSION_CONFLICT` vid stale write
  - nya metoder:
    - `listVersionRevisions`
    - `getVersionRevision`
    - `diffVersionRevisions`
    - `rollbackDraftVersion`

Implementerat i routes:
- `src/routes/templates.js`
  - `PATCH /templates/:templateId/versions/:versionId` stödjer optimistic locking via `If-Match: W/"r<revision>"` eller `expectedRevision`
  - returnerar `409 version_conflict` vid stale write
  - sätter `ETag` med aktuell revision
  - nya endpoints:
    - `GET /templates/:templateId/versions/:versionId/revisions`
    - `GET /templates/:templateId/versions/:versionId/revisions/:revisionNo`
    - `GET /templates/:templateId/versions/:versionId/revisions/diff?from=<n>&to=<m>`
    - `POST /templates/:templateId/versions/:versionId/revisions/:revisionNo/rollback`
  - rollback körs via ExecutionGateway med eval före persist.

## 4) Agentdomäner: admin vs patient runtime-profiler + orchestrator via gateway

Implementerat:
- `src/agents/runtimeRegistry.js`
- `src/routes/chat.js`
  - patient runtimeprofil (`patient-runtime.v1`) exponeras i svar + audit metadata
  - runtime-id skickas i gateway-context
- `src/routes/orchestrator.js`
  - `POST /orchestrator/admin-run` går nu via `ExecutionGateway`
  - inputRisk/outputRisk/policyFloor körs före svar
  - blockerade svar returnerar safe fallback
  - admin runtimeprofil (`admin-runtime.v1`) exponeras i svar/meta

## 5) Test-evidens

Nya tester:
- `tests/security/rateLimitBackend.test.js`
- `tests/templates/templateRevisioning.test.js`
- `tests/orchestrator/orchestratorGateway.test.js`
- `tests/ops/schedulerSloTicketing.test.js`
- `tests/ops/sloTicketStore.test.js`
- Utökning: `tests/gateway/executionGateway.test.js` (distributed runtime backend)
- Utökning: `tests/risk/riskVersioning.test.js` (semantic mode switch)
- Utökning: `tests/security/chatGatewayPolicy.test.js` (adversarial patient guardrails)

Körningar:
- `npm run check:syntax` ✅
- `npm test` ✅ (43 pass)
- `npm run lint:no-bypass` ✅
- `npm run smoke:local` ✅
- `npm run preflight:pilot -- --skip-public --report-file ./data/reports/preflight-latest.json` ✅

## 6) Operativ kapacitetstest (nytt)

Implementerat:
- `scripts/run-load-soak.js`
- `npm run ops:soak`
- `scripts/run-load-soak.js` fixad för stora samplemängder (ingen `Math.max(...hugeArray)` stack overflow)

Syfte:
- ge repeterbar latency/error-rate evidence före bredare rollout.

## 7) SLO breach -> ticket automation

Implementerat:
- `src/ops/sloTicketStore.js` (append-safe store för SLO breach tickets)
- `src/ops/scheduler.js` (`alert_probe` skapar/uppdaterar SLO tickets + webhook event `slo.breach.ticket`)
- `src/routes/ops.js`
  - `GET /ops/slo-tickets`
  - `GET /ops/slo-tickets/summary`
  - `POST /ops/slo-tickets/:ticketId/resolve`
- `src/routes/monitor.js`
  - `monitor/status` inkluderar `sloTickets` + KPI-fält
  - `monitor/slo` inkluderar ny SLO-rad `slo_ticket_backlog`
- `src/ops/stateBackup.js` inkluderar `sloTickets` i backup/restore-manifest.

Nya envs:
- `ARCANA_SCHEDULER_SLO_AUTO_TICKETING_ENABLED`
- `ARCANA_SCHEDULER_SLO_TICKET_MAX_PER_RUN`
- `ARCANA_SLO_TICKET_STORE_PATH`
- `ARCANA_SLO_TICKET_STORE_MAX_ENTRIES`

## 8) Template revision UI (admin)

Implementerat:
- `public/admin.html` ny revisionspanel i versionsredigeraren.
- `public/admin.js` stöd för:
  - ladda revisionshistorik
  - diff mellan revisioner
  - rollback av revision (OWNER)
  - optimistic locking via `If-Match` + `expectedRevision` i draft save/rollback.

## 9) Scheduler governance-jobs (P3/P4 hardening)

Implementerat:
- `src/ops/scheduler.js`
  - nytt jobb `audit_integrity_check` (daglig)
  - nytt jobb `secrets_rotation_snapshot` (daglig)
  - nytt jobb `restore_drill_full` (månatlig sandbox-restore)
- `src/routes/monitor.js`
  - required scheduler-jobs inkluderar nu dessa governance-jobb
  - readiness + SLO inkluderar recency checks för full restore / audit-integrity / secrets-rotation
  - nya no-go triggers för utebliven evidens i dessa jobb
- `src/routes/ops.js`
  - `required_suite` kör även governance-jobben
- `server.js` injicerar `secretRotationStore` i scheduler för automatiserad snapshot-jobb.

Nya envs:
- `ARCANA_SCHEDULER_RESTORE_DRILL_FULL_INTERVAL_HOURS`
- `ARCANA_SCHEDULER_AUDIT_INTEGRITY_INTERVAL_HOURS`
- `ARCANA_SCHEDULER_SECRET_ROTATION_INTERVAL_HOURS`
- `ARCANA_SCHEDULER_SECRET_ROTATION_DRY_RUN`
- `ARCANA_SCHEDULER_SECRET_ROTATION_NOTE`

## 10) Realtime tenant-status i dashboard stream

Implementerat:
- `src/routes/dashboard.js` SSE (`/dashboard/owner/stream`) skickar nu `status`-events var 15s:
  - latency (p95/p99)
  - availability (sampled + 5xx-rate)
  - open/breached incidents
  - open/openBreaches för SLO tickets
  - scheduler running-jobs
- `public/admin.js` reagerar på `status`-events och triggar live-refresh.

## 11) Release governance (P4): gates + sign-off + post-go-live review

Implementerat:
- `src/ops/releaseGovernanceStore.js`
  - release cycle store (append-safe JSON)
  - tre sign-off roller: `owner`, `risk_owner`, `ops_owner`
  - distinct-user enforcement för sign-off
  - gate-evaluering: readiness/strict/no-go-window/pentest/runbooks/post-launch/reality-audit
- `src/routes/ops.js`
  - `GET /ops/release/cycles`
  - `POST /ops/release/cycles`
  - `GET /ops/release/status`
  - `POST /ops/release/cycles/:cycleId/evidence`
  - `POST /ops/release/cycles/:cycleId/signoff`
  - `POST /ops/release/cycles/:cycleId/launch`
  - `POST /ops/release/cycles/:cycleId/review`
  - `POST /ops/release/cycles/:cycleId/reality-audit`
- `src/ops/scheduler.js`
  - nytt jobb `release_governance_review` (daglig)
  - notifierar vid blockerad release-gate, saknad post-launch review eller försenad reality-audit
- `scripts/report-release-readiness.js`
  - genererar final readiness-report med release-gate-checks + evidens
- `docs/ops/release-governance-runbook.md`
  - operativt flöde för cycle/evidence/sign-off/launch/review/reality-audit
- `docs/ops/runbooks/*`
  - incident/failover/rollback/patient safety/secret incident runbooks
