# Arcana Phase 2 Hardening Sweep (2026-02-25)

Status: `PASS`

Denna sweep kompletterar P0-låsningen med P1-härdning inom orchestrator/gateway, realtime observability och patientguardrails.

## 1) ExecutionGateway runtime hardening

Implementerat:
- Per-tenant serialisering (queue) av gateway-runs.
- Idempotency replay med `tenant_id + idempotency_key`.
- Retry/backoff för `agentRun` (och persist) med fail-closed.
- In-memory dead-letter queue (DLQ) med runtime stats.

Filer:
- `src/gateway/executionGateway.js`
- `tests/gateway/executionGateway.test.js`
- `src/routes/monitor.js` (runtime.gateway + dead-letter endpoint)
- `tests/monitor/gatewayDeadLetters.test.js`

Nya evidenspunkter:
- `GET /api/v1/monitor/status` innehåller `runtime.gateway`.
- `GET /api/v1/monitor/gateway/dead-letters` exponerar tenant-scope DLQ.

## 2) Dashboard realtime notifiering (event-driven)

Implementerat:
- Runtime event-bus för audit-events.
- SSE stream endpoint för owner-dashboard.
- Admin-klient med stream reconnect/backoff + debounce refresh.

Filer:
- `src/observability/eventBus.js`
- `src/security/authStore.js` (publish `audit.event`)
- `src/routes/dashboard.js` (`/dashboard/owner/stream`)
- `public/admin.js` (stream-klient)
- `tests/dashboard/dashboardStream.test.js`

## 3) Patientkanal guardrails

Implementerat:
- Kill-switch för publik chat (`ARCANA_PUBLIC_CHAT_KILL_SWITCH`).
- Prompt-injection filter i patientkanal.
- Max-turn-limit per konversation med tydlig handoff-blockering.

Filer:
- `src/config.js`
- `server.js`
- `src/routes/chat.js`
- `tests/security/chatGatewayPolicy.test.js`

## 4) Risk governance (dual sign-off, optional)

Implementerat:
- Valbar dual sign-off på risk-threshold mutationer (`ARCANA_RISK_DUAL_SIGNOFF_REQUIRED=true`).
- Gäller för:
  - `PATCH /api/v1/risk/settings`
  - `POST /api/v1/risk/settings/rollback`
  - `POST /api/v1/risk/calibration/apply-suggestion`
- Sign-off valideras mot aktiv tenant-medlem (OWNER/STAFF), och måste vara annan användare än aktören.
- Sign-off metadata loggas i audit.

Filer:
- `src/routes/risk.js`
- `src/config.js`
- `server.js`
- `tests/risk/riskDualSignoff.test.js`

## 5) Drift-/verifieringsevidens

Körningar (lokalt):
- `npm run check:syntax` -> PASS
- `npm test` -> PASS (`29` tester)
- `npm run lint:no-bypass` -> PASS
- `npm run smoke:local` -> PASS
- `npm run preflight:pilot -- --skip-public --report-file ./data/reports/preflight-latest.json` -> PASS
- `npm run preflight:report:actions -- --min-priority P0 --top 12` -> `actions=0`

## 6) README / kontrakt uppdaterat

- `README.md` uppdaterad med:
  - dashboard SSE endpoint
  - gateway dead-letter monitor endpoint
  - nya patient guardrail-envs
  - optional dual sign-off env
- `docs/architecture/execution-gateway-contract.md` uppdaterad med concurrency/retry-contract.
