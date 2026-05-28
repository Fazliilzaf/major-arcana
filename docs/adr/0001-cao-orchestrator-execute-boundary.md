---
owner: Arkitektur
status: active
---

# ADR: CAO Orchestrator Execute Boundary

Status: ACCEPTED  
Datum: 2026-05-20  
Beslutsfattare: OWNER (Arcana Admin Operator scope)

---

## Kontext

Arcana Admin Operator (CAO) utökades från template advisor till admin-operatör. Admin orchestratorn (`POST /api/v1/orchestrator/admin-run`) ska kunna planera och köra säkra admin-steg via `mode=execute`.

Risk: orchestrator execute kan bli "god mode" och kringgå gateway/policy.

---

## Beslut

1. **Execute körs endast via execution gateway** — samma pipeline som agenter (input risk → agent/capability → output risk → policy floor → audit).
2. **`mode=execute` mappar till CAO agent-run eller enskilda capabilities** med `autoExecuteAllowed`-steg filtrerade i `buildExecutableSteps()`.
3. **L3+ intents kräver OWNER-bekräftelse i admin UI** före execute (dry-run preview cache + confirm dialog).
4. **Audit kedja:** `correlationId`, `executableSteps`, `executedSteps` loggas vid success.
5. **CAO får inte:** aktivera produktion, ändra policy floor, eller fatta L5-beslut utan manuell intervention.

---

## Konsekvenser

- Positiv: MVP execute är testbar (E2E HTTP), spårbar, och begränsad till L1–L3 auto-steg.
- Negativ: execute är långsammare än direkt capability-anrop (gateway overhead) — acceptabelt för admin.
- Executive feed och scheduler-notifieringar är **underlag**, inte auktoritativa beslut.

---

## Relaterade artefakter

- `src/orchestrator/adminOrchestrator.js`
- `src/routes/orchestrator.js`
- `tests/orchestrator/orchestratorGateway.test.js`
- `docs/ops/runbooks/cao-admin-operator-runbook.md`
