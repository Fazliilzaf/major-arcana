# ExecutionGateway Contract (P0)

## Definition of Done (P0)
- Alla routes som skapar extern text eller persisterar AI-output går via `ExecutionGateway`.
- Pipelineordning är exakt och oförändrad: `ingress -> inputRisk -> agentRun -> outputRisk -> policyFloor -> persist -> audit -> response`.
- Fail-closed gäller: gate-fel eller timeout ger `blocked` + safe fallback.
- Audit-events för gatewayrun skapas för varje körning.
- CI stoppar bypass-försök från routes.

## No-Go (P0)
- En enda route som kan skapa extern text utan gateway.
- En enda route som kan persistera AI-output före risk/policy.
- Runtime-repair av auditkedja i produktion.
- Saknade auditspår för gateway-run eller chat-blockeringar.

## 1. Syfte
`ExecutionGateway` är enda tillåtna vägen för:
- Externa svar (`chat`, patient, marketing).
- Persist av AI-genererade artefakter (drafts, seeds, output).
- Agentkörningar som producerar artefakter.

Inga undantag.

## 2. Input Contract
Gateway tar emot:
- `tenant_id`
- `actor` (`id`, `role`)
- `channel` (`admin|template|patient|marketing|ops`)
- `intent` / `request_type`
- `payload`
- `correlation_id`
- `idempotency_key` (för writes)

## 3. Output Contract
Gateway returnerar alltid:
- `decision`: `allow | allow_flag | review_required | blocked | critical_escalate`
- `risk_summary`:
  - `input`
  - `output`
  - `versions` (`ruleSet`, `threshold`, `model`, `fusion`, `build`)
- `policy_summary`:
  - `blocked`
  - `reason_codes[]`
- `artifact_refs` (t.ex. `draft_id`, `version_id`, `run_id`)
- `audit_refs` (`correlation_id`)
- `safe_response` (om block)

## 4. Pipeline (immutabel ordning)
Gateway måste alltid köra:
1. ingress validation
2. inputRisk
3. agentRun
4. outputRisk
5. policyFloor
6. persist (endast om beslut tillåter)
7. audit (alltid)
8. response (allow eller safe fallback)

## 5. Concurrency + Retry Contract
- Per-tenant serialisering: samtidiga gateway-runs för samma tenant körs i köad ordning.
- Distributed mode: vid `ARCANA_DISTRIBUTED_BACKEND=redis` flyttas tenant-lås + idempotency till Redis (multi-instance safe).
- Idempotency: samma `tenant_id + idempotency_key` returnerar samma `run_id` och markeras som replay.
- Retry/backoff: `agentRun` (och persist-steg) körs med begränsade återförsök innan block.
- Dead-letter queue: exhausted retries/gate-fel skrivs till gateway DLQ för operativ uppföljning.

## 6. Fail-Closed
Om risk/policy-gate failar (error/timeout) blir beslutet `blocked`.

## 7. No-Bypass
- Routes får inte persistera AI-output direkt.
- Routes får inte generera extern text utan gatewaybeslut.
- Alla agent-runs ska kunna spåras via `gateway_run_id`.
- CI måste blockera förbjudna imports/mönster.

## 8. Audit Rule
Varje gateway-run skapar:
- `gateway.run.start`
- `gateway.run.decision`
- `gateway.run.persist`
- `gateway.run.response`

Samt route-specifika events (exempel: `chat.response`, `chat.blocked`, `chat.error`).

## 9. Patient Safety (framtida krav)
Patientkanal kräver per turn:
- inputRisk + outputRisk + policyFloor
- kill-switch
- strict tool allowlist
- PII-redaction
- human handoff triggers
