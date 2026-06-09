> ⛔ **SUPERSEDED 2026-06-09.** Ersatt av det fristående projektet `~/Code/arcana-ceo-agent` (CEO Agent v0.1, 6 lägen, egen TS/Next.js-app som anropar major-arcana-gateway). Bygg inte denna in-repo-modul. Se `arcana-ceo-agent/docs/CEO_AGENT_SPEC.md`.

# ORD-31 — Arcana Chief of Staff: agent-modul + tester

**Skapad:** 2026-06-08 (Claude PM)
**Assignee:** Codex (write — endast NYA filer)
**Claude-spår:** UAT efter commit (schema + komposition + inga delade filer rörda)
**Prio:** P1 · bakom flagga, ej pilot-kritiskt
**Blockerar:** ORD-32 (Cursor-wiring behöver denna modul)

---

## Mål

Formalisera den befintliga `ARCANA`-sloten i `adminOrchestrator.js` som en topp-agent — **Arcana Chief of Staff (CoS)** — som komponerar de befintliga CxO-agenternas output (CCO · COO · CMO · CAO · CFO) till en samlad lägesbild över alla tre domäner (kund · ops · marknad). Agenten gör **inget** eget arbete och anropar inga capabilities direkt; den tar redan-körda agent-outputs som input och buntar dem.

## Scope (endast dessa NYA filer)

1. `src/agents/arcanaChiefOfStaffAgent.js`
2. `tests/agents/arcanaChiefOfStaffAgent.test.js`

## Spec — `arcanaChiefOfStaffAgent.js`

Spegla mönstret i `src/agents/cfoCostAdvisorAgent.js`:

- `const ARCANA_AGENT_NAME = 'ARCANA';`
- `arcanaChiefOfStaffInputSchema` (frozen JSON Schema, `additionalProperties:false`):
  - `ccoOutput`, `cooOutput`, `cmoOutput`, `caoOutput`, `cfoOutput` — alla `object`, valfria (agenten ska tåla att en domän saknas).
  - `channel` (string), `tenantId` (string), `correlationId` (string).
- `arcanaChiefOfStaffOutputSchema` (frozen): `{ data, metadata, warnings }` precis som CFO-agenten.
  - `data` ska innehålla: `executiveSummary` (string), `domains` (object med `customer`/`ops`/`marketing`-sektioner med var sin `headline` + `signals[]` + `recommendedActions[]`), `priorityActions` (array, max 5, sorterade), `generatedAt`.
  - `metadata`: `{ agent:'ARCANA', version, channel }`.
  - `warnings`: array, propagera in-agenternas warnings.
- `function composeArcanaChiefOfStaff({ ccoOutput, cooOutput, cmoOutput, caoOutput, cfoOutput, channel='admin', tenantId='', correlationId='' })`:
  - Återanvänd hjälparna `normalizeText/asObject/asArray` (samma stil som CFO-agenten).
  - Plocka `data` + `warnings` ur varje in-agent-output defensivt.
  - Bygg `domains.customer` ur ccoOutput, `domains.ops` ur coo+cao, `domains.marketing` ur cmo, väv in cfo i en kort ekonomi-rad i executiveSummary.
  - `priorityActions`: slå ihop varje domäns recommendedActions, deduplicera, kapa till 5.
  - Returnera objekt som validerar mot outputSchema.
- Exportera `{ ARCANA_AGENT_NAME, arcanaChiefOfStaffInputSchema, arcanaChiefOfStaffOutputSchema, composeArcanaChiefOfStaff }`.

## Spec — testerna

- Positivt: full input (alla fem domäner) → output matchar schema, `priorityActions ≤ 5`, executiveSummary nämner ekonomi när cfoOutput finns.
- Negativt: saknad domän (t.ex. ingen cmoOutput) → ingen krasch, marketing-sektion tom men giltig.
- Tom input `{}` → giltig output med neutrala fält + warning.
- Warnings propageras från in-agenter.

## FÖRBJUDET

- Rör INTE `adminOrchestrator.js`, `runtimeRegistry.js`, `src/routes/`, `executionGateway.js`, capability-kontrakt eller någon befintlig fil. All wiring sker i ORD-32 (Cursor). Endast de två nya filerna ovan.

## Gates (måste passera)

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- Commit-meddelande refererar ORD-31.

## Rapport till Claude (UAT)

Commit-hash + filträd (endast 2 nya filer) + test-output. Claude verifierar schema-efterlevnad och att inga delade filer rörts.

## Status

| Fas                          | Status          |
| ---------------------------- | --------------- |
| Order skapad (repo + Notion) | KLAR 2026-06-08 |
| Codex: modul + tester        | Väntar          |
| Claude UAT                   | Väntar          |
