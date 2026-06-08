# ORD-32 — Arcana Chief of Staff: wiring + flagga

**Skapad:** 2026-06-08 (Claude PM)
**Assignee:** Cursor (write — ÄNDRINGAR i befintliga filer)
**Claude-spår:** UAT efter commit (flagga av→på, gateway grön, inga regressioner)
**Prio:** P1 · bakom flagga, ej pilot-kritiskt
**Blockeras av:** ORD-31 (behöver `arcanaChiefOfStaffAgent.js`)

---

## Mål

Koppla in Arcana Chief of Staff-agenten (ORD-31) i orkestratorn så att cross-domän-prompts dirigeras till `ARCANA`, körs genom befintlig execution gateway, och allt ligger bakom en avstängd flagga `ARCANA_COS_ENABLED` (default `false`). Noll påverkan på live tills flaggan tänds.

## Scope (ÄNDRINGAR i befintliga filer)

1. `src/orchestrator/adminOrchestrator.js`
   - `ARCANA` finns redan i `AGENTS`-enum. Lägg routing: när intent spänner över ≥2 domäner, eller prompt matchar chief-of-staff-mönster (t.ex. `/chief of staff|lägesbild|överblick|allt just nu|sammanfatta läget/i`), routa till `ARCANA` som kör de relevanta CxO-agenterna och skickar deras output till `composeArcanaChiefOfStaff()`.
   - Respektera execute-boundary enligt ADR-0001: ARCANA execute begränsad till L1–L3 auto-steg; L3+ kräver OWNER-bekräftelse. Ingen ny "god mode".
2. `src/agents/runtimeRegistry.js`
   - Ny profil `chief_of_staff` (eller utöka `admin`): `toolAllowlist` som täcker de tre domänerna, `maxTurns`, guardrails (kill-switch + PII-redact + prompt-injection-filter).
3. `src/routes/orchestrator.js`
   - CoS nås via befintliga `admin-run` (mode=plan/execute). Ingen ny route om det inte krävs; om ny endpoint behövs, `cos-run` bakom samma auth.
4. Flagga `ARCANA_COS_ENABLED` (default `false`)
   - Läs via befintligt config-mönster. När `false`: ARCANA-routing helt förbikopplad (orkestratorn beter sig exakt som idag). När `true`: routing aktiv.
5. `tests/orchestrator/` + `tests/agents/`
   - Routing-test: cross-domän-prompt → ARCANA (flagga på). Flagga av → oförändrat beteende. Gateway-pipeline grön (input-risk → agent → output-risk → policy-floor → audit).

## FÖRBJUDET

- Rör INTE `src/agents/arcanaChiefOfStaffAgent.js` eller dess tester (Codex äger dem, ORD-31).
- Ändra INTE capability-kontrakt, gateway-pipeline, patient-runtime eller `/cco`/`/cco-next`-ytor.
- Inga ändringar som är aktiva när flaggan är `false`.

## Gates (måste passera)

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`
- Commit-meddelande refererar ORD-32.

## Rapport till Claude (UAT)

Commit-hash + ändrade filer + bevis på: (a) flagga av = oförändrat orkestrator-beteende, (b) flagga på = ARCANA-routing + gateway grön, (c) inga regressioner i CCO/CMO/CAO-agent-tester.

## Status

| Fas                          | Status          |
| ---------------------------- | --------------- |
| Order skapad (repo + Notion) | KLAR 2026-06-08 |
| Cursor: wiring + flagga      | Väntar ORD-31   |
| Claude UAT                   | Väntar          |
