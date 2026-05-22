# CCO Block 1.1 - AnalyzeInbox + Draft Preparation (2026-02-26)

## Scope
- New capability: `AnalyzeInbox`
- Draft preparation inside capability output (`suggestedDrafts`)
- Persist strategy: `analysis` only
- No mailbox write/send/update behavior
- No gateway bypass

## Implemented

1. New capability module
- `src/capabilities/analyzeInbox.js`
- Exposes structured output:
  - `urgentConversations`
  - `needsReplyToday`
  - `slaBreaches`
  - `riskFlags`
  - `suggestedDrafts` (max 5)
  - `executiveSummary`
  - `priorityLevel`
- Enforces:
  - `requiresInputRisk=false`
  - `requiresOutputRisk=true`
  - `requiresPolicyFloor=true`
  - `persistStrategy='analysis'`

2. Safety and draft controls
- Body previews are masked before draft composition.
- Medical topics force safety disclaimer in draft reply.
- Draft output avoids diagnosis/guarantee language.
- Output contains manual control signal:
  - `metadata.deliveryMode = manual_review_required`
  - warning that drafts are suggestions only.

3. Registry and CCO bundle
- `src/capabilities/registry.js`
  - Added `AnalyzeInbox` to capability registry.
  - Added CCO agent bundle metadata with `AnalyzeInbox`.

4. Formal snapshot contract
- `docs/architecture/analyze-inbox-snapshot-contract-v1.md`
- Defines required/optional `systemStateSnapshot` fields, normalization rules,
  SLA/risk classification behavior, and debug evidence keys.

## Tests

### Unit tests
- `tests/capabilities/analyzeInbox.test.js`
  - schema-valid output
  - max 5 suggested drafts
  - medical safety disclaimer
  - forbidden language avoidance
  - SLA edge windows (24h vs 48h) + riskord classification
  - debug snapshot structure

### Gateway integration and enforcement
- `tests/capabilities/capabilityGateway.test.js`
  - AnalyzeInbox route runs through gateway
  - analysis-only persist
  - policy block on unsafe draft language
  - no mailbox writes (write methods are not called)
  - capability meta exposes AnalyzeInbox + CCO bundle

## Verification commands
- `node --test tests/capabilities/analyzeInbox.test.js`
- `node --test tests/capabilities/capabilityGateway.test.js`
- `npm run lint:no-bypass`

## Runtime evidence (local)
- Endpoint: `POST /api/v1/capabilities/AnalyzeInbox/run`
- Example decision: `allow`
- Example persisted analysis entry:
  - `capability.name = AnalyzeInbox`
  - `persistStrategy = analysis`
  - `correlationId = corr-analyzeinbox-runtime-001`
- Example audit chain events with same correlation id:
  - `capability.run.start`
  - `gateway.run.start`
  - `gateway.run.decision`
  - `gateway.run.persist`
  - `gateway.run.response`
  - `capability.run.decision`
  - `capability.run.persist`
  - `capability.run.complete`
