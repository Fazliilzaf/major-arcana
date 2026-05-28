---
owner: Arkitektur
status: active
---

# ADR 0002: CMO publish and spend boundary

**Status:** Accepted (design)  
**Date:** 2026-05-20  
**Context:** Arcana Marketing Copilot (CMO)

## Context

CMO ska kunna skapa marknadscontent, kampanjförslag och analyser. Arcana opererar i en kontext med patientnära budskap, compliance-krav och varumärkesrisk. Autonom publicering eller annonsbudget utan mänskligt godkännande är oacceptabelt i v1.

Befintlig arkitektur har:

- Gateway pipeline (input risk → agent → output risk → policy floor)
- `CLINICAL_GUARD` i orchestrator för branding
- Executive decision feed med `approve_campaigns`
- CAO-mönster: copilot med OWNER-godkännande och audit

## Decision

1. **CMO v1 är Marketing Copilot, inte autonom marknadschef.**
2. **Ingen auto-publicering** till externa kanaler (social, ads, mail, webb) i v1.
3. **Ingen autonom annonsbudget** — spend-förslag kräver OWNER (ev. CFO gate).
4. **Compliance-gate är obligatorisk** mellan produktion och schemaläggning för extern copy:
   - `ValidateMarketingClaims`
   - `ReviewMarketingCompliance`
   - CLINICAL_GUARD pass
5. **Persist till “ready”** kräver compliance-pass + OWNER approve (L3+).
6. **Alla approve/reject** loggas i audit + campaign draft version history.
7. **Analys** får inte rekommendera utan metric source + freshness.

## Consequences

### Positive

- Lägre varumärkes- och patientsäkerhetsrisk
- Konsekvent med CAO copilot-modell
- Tydlig väg till stegvis automation (v2+) efter pilot

### Negative

- Mer manuellt arbete för OWNER i början
- Externa integrations-API:er skjuts till senare fas

### Follow-up

- Implementera enligt `docs/strategy/cmo-arcana-marketing-copilot-implementation-plan.md`
- ~~Revisit auto-publish per kanal efter Fas G Go/No-Go~~ → v2.3 pilot kanal-policy (`cmoPublishPolicy.js`)

### v2.3 addendum (2026-05-20)

- Global `autoPublish` förblir **false** på alla CMO-outputs.
- **Pilot auto-queue** tillåts per kanal (default allowlist: `linkedin`, max L3) när:
  - `ARCANA_MARKETING_PUBLISH_PILOT_ENABLED=true`
  - OWNER har godkänt kampanj
  - Compliance + schedule + orchestration-gates passerar
- Scheduler `cmo_pilot_publish_due` skriver audit + `publish_queued` — **ingen extern publicering** förrän separat connector/adapters godkänns.
- L5 autonom publicering/spend förblir blockerad.

### v3 addendum (2026-05-22)

- **Live extern publish** tillåts endast när `ARCANA_MARKETING_PUBLISH_LIVE_ENABLED=true` (default **false**).
- Pilot allowlist (default `linkedin`) + OWNER-godkännande + compliance-gates krävs fortfarande.
- `cmoPublishConnectors.js` adapter-lager anropar extern API i sandbox/live; mail/meta kan vara stub.
- Idempotency via `correlationId`; misslyckade försök loggas som `cmo.pilot_publish.failed` med dead-letter metadata.
- Rollback: sätt `ARCANA_MARKETING_PUBLISH_LIVE_ENABLED=false` — återgå till queue-only.

## References

- `docs/strategy/cmo-arcana-marketing-copilot-implementation-plan.md`
- `docs/adr/0001-cao-orchestrator-execute-boundary.md`
- `src/agents/cmoContentAgent.js`
- `src/ops/executiveDecisionFeed.js`
