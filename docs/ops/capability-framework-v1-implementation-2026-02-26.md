# Capability Framework V1 – Implementation Evidence (2026-02-26)

## Scope
- Capability-lager ovanpå befintlig `ExecutionGateway`.
- Ingen ändring i patientkanalens flödeslogik.
- Ingen ändring i gateway-pipelineordning.
- Ingen ändring i risk/policy-corelogik.

## Implementerat

1. BaseCapability-kontrakt + schema-validering
- `src/capabilities/baseCapability.js`
- `src/capabilities/capabilityContract.js`
- `src/capabilities/schemaValidator.js`

2. Capability registry + agent bundles
- `src/capabilities/registry.js`

3. Första capability: `GenerateTaskPlan`
- `src/capabilities/generateTaskPlan.js`
- Implementerad som klass som ärver `BaseCapability`
- Returnerar standardformat: `{ data, metadata, warnings }`
- Kör med `requiresInputRisk=false`, `requiresOutputRisk=true`, `requiresPolicyFloor=true`

4. Gateway-enforced capability execution service
- `src/capabilities/executionService.js`
- Kör alltid via `executionGateway.runCapability(...)` (med adapter till `run(...)` för bakåtkompatibilitet)
- Skriver audit-events:
  - `capability.run.start`
  - `capability.run.decision`
  - `capability.run.persist`
  - `capability.run.complete`
- Injectar context enligt kontrakt:
  - `tenantId`, `actor`, `channel`, `correlationId`, `requestId`, `input`, `systemStateSnapshot`

5. PersistStrategy `analysis` store
- `src/capabilities/analysisStore.js`
- Config:
  - `ARCANA_CAPABILITY_ANALYSIS_STORE_PATH`
  - `ARCANA_CAPABILITY_ANALYSIS_MAX_ENTRIES`

6. API-routes för capability layer
- `src/routes/capabilities.js`
  - `GET /api/v1/capabilities/meta`
  - `POST /api/v1/capabilities/:capabilityName/run`
  - `GET /api/v1/capabilities/analysis`
- Router inkopplad i `server.js`

7. No-bypass enforcement utökad till capabilities
- `scripts/check-route-bypass.js`
- `npm run lint:no-bypass` skannar nu både:
  - `src/routes`
  - `src/capabilities`

8. Dokumentation
- `docs/architecture/capability-framework-contract-v1.md`
- `docs/architecture/capability-base-class-contract-v1.md`
- README-länk till capability-kontrakt.

## Tester (kravuppfyllnad)

### Unit
- `tests/capabilities/generateTaskPlan.test.js`
  - output max 5 tasks
  - schema-validerad output
  - fallback-plan vid låg risk

### Gateway integration
- `tests/capabilities/capabilityGateway.test.js`
  - capability-run via route + gateway
  - verifierar `gateway.run.*` + `capability.run.*` i audit
  - verifierar `analysis` persist

### Risk/policy + persist
- Integrationstester verifierar att:
  - `riskSummary.input` och `riskSummary.output` finns i payload
  - `policySummary` finns i payload
  - analysis-entry skapas vid allow
  - output risk/policy enforcement körs innan response

## Verifieringskommandon
- `npm run check:syntax` -> PASS
- `npm run lint:no-bypass` -> PASS
- `node --test tests/capabilities/generateTaskPlan.test.js tests/capabilities/capabilityGateway.test.js` -> PASS
- `npm test` -> PASS (80/80)
