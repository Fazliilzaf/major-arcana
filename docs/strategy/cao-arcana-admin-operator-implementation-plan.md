# Implementation Plan: CAO — Arcana Admin Operator

Skapad: 2026-05-20  
Uppdaterad: 2026-05-20 (Fas 0–7 kod levererad)  
Syfte: Utöka **CAO** från dagens _Template Advisor_ till **Arcana Admin Operator** — agenten som håller ordning på admin, mallar, dokumentation, processer, kvalitet och intern kontroll.  
Källor:

- Användarspecifikation (15 kapacitetsområden, 2026-05-20)
- `docs/strategy/arcana-master-plan-punktvis.md` §8.2, §8.7, §9
- Befintlig kod: `src/agents/caoTemplateAdvisorAgent.js`, `src/orchestrator/adminOrchestrator.js`, `src/gateway/*`

---

## Översikt

**Idag:** CAO = `POST /api/v1/agents/CAO/run` med tre capabilities (SuggestTemplateImprovement, ValidateDisclaimers, OptimizeVariables). Admin-orchestratorn (`POST /api/v1/orchestrator/admin-run`) _planerar_ adminåtgärder men exekverar dem inte. Obligatorisk pipeline finns i gateway.

**Mål:** CAO blir den primära **admin-operatören** som strukturerar, flaggar och föreslår — med tydliga gränser: inga högriskbeslut, ingen policy-floor-ändring, ingen patientkanal-release utan manuell granskning.

**Produktnamn i UI:** _Arcana Admin Operator_ (kodnamn kan fortfarande vara `CAO` i API/registry).

---

## Specifikationslänk

| Källa                      | Plats                                               |
| -------------------------- | --------------------------------------------------- |
| Masterplan CAO-scope       | `docs/strategy/arcana-master-plan-punktvis.md` §8.2 |
| Pipeline (obligatorisk)    | Samma fil §8.7                                      |
| Go/No-Go / readiness       | Samma fil §9                                        |
| Nuvarande CAO-agent        | `src/agents/caoTemplateAdvisorAgent.js`             |
| Agent-registry             | `src/capabilities/registry.js`                      |
| Admin intent-router        | `src/orchestrator/adminOrchestrator.js`             |
| Admin UI                   | `public/admin.html`, `public/admin.js`              |
| Executive actions från CAO | `src/ops/executiveDecisionFeed.js`                  |

---

## Tekniskt angreppssätt

### 1. Två lager (behåll separation)

| Lager                  | Roll                                                       | Befintligt                   |
| ---------------------- | ---------------------------------------------------------- | ---------------------------- |
| **CAO Agent Bundle**   | Deterministisk + capability-komponerad körning via gateway | `caoTemplateAdvisorAgent.js` |
| **Admin Orchestrator** | Intent → action plan → _föreslagna_ API-anrop              | `adminOrchestrator.js`       |

**Rekommendation:** Utöka CAO-bundlen med nya capabilities per domän (admin QC, incident admin, dokument-metadata). Koppla orchestratorn så att den kan **invoka** CAO (och andra agenter) med `mode: 'plan' | 'execute'`, där `execute` bara kör L1–L3-förslag som passerar policy.

### 2. Capability-mönster (samma som COO/CCO)

Varje ny CAO-funktion = capability i `src/capabilities/`:

- Metadata: `roles`, `channels: ['admin']`, risk flags, input/output schema
- `execute(context)` → läser från JSON stores (`data/`, auth, templates, audit, incidents)
- Registreras i `registry.js` under CAO-bundle **eller** nytt under-bundle `CAO.AdminOperator` om output-typ skiljer sig

### 3. Pipeline (icke förhandlingsbar)

Alla nya capabilities måste gå via:

```
Request → Input Risk → Agent → Output Risk → Policy Floor → Persist → Audit → Notify
```

Implementation: `src/gateway/executionGateway.js`, gates i `src/gateway/gates/`.

**CAO-specifikt:** `outputType` för “förslag/utkast/checklista” ska märkas `requiresOwnerApproval: true` där persist skulle ändra produktion.

### 4. Gränser (policy som kod)

| CAO får                                                    | CAO får inte                                      |
| ---------------------------------------------------------- | ------------------------------------------------- |
| Skapa/uppdatera **utkast** (mallar, dokument, checklistor) | Aktivera mall i produktion utan owner             |
| Flagga saknad owner/DoD/status/deadline                    | Ändra policy floor                                |
| Generera rapporter och sammanfattningar                    | Släppa patientkanal / Go utan manuell gate        |
| Föreslå eskalering / arbetsordrar                          | Kringgå L5 manuell intervention                   |
| Skriva audit-vänliga sammanfattningar                      | Exekvera finans-/säkerhetsbeslut (CFO/OWNER-only) |

Lägg gränser i: `src/policy/floor.js` (ny `adminOperator` profil) + capability metadata `autoExecute: false`.

### 5. Datamodell (minimal utökning)

Utöka eller inför JSON-backed “admin objects” (kan börja i befintliga stores):

| Entitet           | Fält (minimum)                                          | Store / route                                         |
| ----------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| AdminTask         | id, owner, status, dod, deadline, workstream, riskLevel | ny `data/admin-tasks.json` eller Notion-export senare |
| TemplateRecord    | befintlig + version, riskClass, lastReviewedAt          | `src/templates/store.js`                              |
| AdminDocument     | id, owner, status, workstream, updatedAt, nextStep      | ny capability läser `docs/` index eller DB            |
| IncidentAdminView | wrapper kring befintlig incident/SLA data               | COO + monitor routes                                  |

**Fas 1:** använd befintlig audit + templates + monitor utan ny DB.

### 6. UI (admin panel)

Utöka `public/admin.html` / `admin.js`:

- Sektion **Arcana Admin Operator** (ersätter/utökar “CAO — Mallkvalitetsrådgivare”)
- Widgets: dagens adminläge, öppna blockers, mallbibliotek-status, incident-SLA-risk, readiness-hint
- Filter: owner, status, risk, tenant, deadline (enligt spec §13)

CCO preview (`major-arcana-preview/`) påverkas **inte** i fas 1–2.

---

## Faser och uppgifter

### Fas 0 — Canon & scope (1 vecka)

- [x] Besluta produktnamn: UI “Arcana Admin Operator”, API `CAO` vs ny `CAO_OPERATOR`
- [x] Skriv ADR: CAO scope expansion + orchestrator execute boundary
- [x] Uppdatera `arcana-master-plan-punktvis.md` §8.2 med 5 “extra starka” områden (mallbibliotek, admin QC, incident/SLA, Go/No-Go-underlag, audit-dok)
- [x] Riskklassificera alla 15 kapacitetsområden (L1–L5) i tabell
- [x] Definiera output-typer: `AdminBrief`, `TemplateLibraryReport`, `QualityGateReport`, `GoNoGoBrief`

### Fas 1 — Mallbibliotek & admin quality gate (2–3 veckor)

**Mål:** CAO gör mer än disclaimer-scan; varje task/mall har owner, status, DoD.

- [x] Capability: `AssessTemplateLibraryHealth` (version, inkonsistens, stale flags)
- [x] Capability: `AssessAdminQualityGate` (tasks utan owner/status/dod från konfigurerad källa)
- [x] Utöka `composeCaoTemplateAdvisor` → `composeCaoAdminOperator` med bakåtkompatibel output
- [x] Uppdatera `registry.js` CAO bundle capability-lista
- [x] `executionService.js`: snapshot hydration (templates + audit + open incidents)
- [x] Admin UI: visa quality-gate-resultat + länk till mallar att fixa
- [x] Tester: `tests/agents/caoAgentGateway.test.js` (spegla COO-test)
- [x] `executiveDecisionFeed.js`: nya action types (`fix_template`, `assign_owner`)

**Koppling till masterplan:** §8.2 “standardisering, drafts” — capability `GenerateAdminTemplateDraft` (utkast only, persist draft)

### Fas 2 — Orchestrator ↔ CAO execution bridge (2 veckor)

**Mål:** `admin-run` ska kunna köra säkra steg, inte bara returnera plan.

- [x] `adminOrchestrator.js`: `buildExecutableSteps()` — filtrera steg med `autoExecuteAllowed`
- [x] Ny route eller flagga: `POST /api/v1/orchestrator/admin-run?mode=execute`
- [x] Map intents → CAO capabilities (template_library → CAO run med intent payload)
- [x] Audit: logga orchestrator plan + executed steps + correlationId
- [x] Admin UI: “Kör rekommenderad admin-plan” med preview av steg

### Fas 3 — Dokumentation & process (2 veckor)

- [x] Capability: `AuditDocumentationMetadata` (saknar ägare/datum/status/nästa steg) mot `docs/major-arcana-index.md` + strategi/ops-träd
- [x] Capability: `ProposeDocumentStructure` (förslag, ingen auto-flytt av filer)
- [x] Mallgenerator: onboarding, incident, SLA, DoD, möte, release notes, runbook (från spec §2) som **draft templates** i `data/templates.json`
- [x] Scheduler-förslag: `scripts/` job som kör CAO quality gate dagligen (OWNER notify)

### Fas 4 — Incident, SLA & compliance admin (2–3 veckor)

- [x] Capability: `SummarizeIncidentAdmin` (ägare, status, deadline, severity, SLA-risk)
- [x] Capability: `FlagUnownedIncidents` + integration med COO output
- [x] Capability: `BuildAuditSummary` (read-only från `authStore` audit events)
- [x] Capability: `VerifyDecisionTraceability` (ändring utan motivering/godkännande → flag)
- [x] Admin dashboard: incident/SLA-vy (§13)
- [x] Runbook: uppdatera `docs/ops/runbooks/patient-safety-incident-runbook.md` med CAO admin-steg

### Fas 5 — Tenant, onboarding & rapportering (2 veckor)

- [x] Capability: `TenantAdminHealthSummary` (status, owner, policy profile, isolation checklist)
- [x] Capability: `GenerateAdminDailyBrief` / `WeeklyAdminBrief` (komponera COO + CAO + audit)
- [x] Capability: `ExplainReadinessScore` (koppla till monitor Go/No-Go §9)
- [x] Rollbaserade checklistor (OWNER vs team) som template-sets
- [x] CFO/CMO/CCO-sammanfattningar: separata compose-warnings, ingen data-leak mellan agenter

### Fas 6 — Automation & adminpanel-struktur (2 veckor)

- [x] Identifiera scheduler-jobb (daglig adminrapport, SLA-risk scan, saknad DoD)
- [x] Notifieringsregler (notify efter gateway, OWNER-only för L4+)
- [x] Adminpanel informationsarkitektur (§13): task-, incident-, mall-, dokument-, audit-vyer
- [x] Dokumentera API i `docs/ops/developer-handover.md`

### Fas 7 — Hardening & Go/No-Go (1–2 veckor)

- [x] E2E: admin-run plan + execute med mock data
- [x] Stryker/contract tests på nya capabilities
- [x] Readiness: CAO får inte sänka score (monitor checks)
- [x] Go/No-Go-underlag genereras av CAO men **beslut** förblir OWNER + COO

---

## Mapping: 15 spec-områden → faser

| #   | Område                     | Primär fas | Primär artefakt                         |
| --- | -------------------------- | ---------- | --------------------------------------- |
| 1   | Admin & daglig struktur    | 5          | `GenerateAdminDailyBrief`               |
| 2   | Mallar & dokument          | 1, 3       | Template capabilities + draft generator |
| 3   | Intern dokumentation       | 3          | `AuditDocumentationMetadata`            |
| 4   | Processoptimering          | 3, 6       | Orchestrator plans + process templates  |
| 5   | Incident & SLA-admin       | 4          | `SummarizeIncidentAdmin`                |
| 6   | Compliance & audit         | 4          | `BuildAuditSummary`                     |
| 7   | Risk & policy admin        | 0, 4       | Policy profil + flags (read-only)       |
| 8   | Onboarding & användaradmin | 5          | Checklist templates + staff routes      |
| 9   | Tenant-admin               | 5          | `TenantAdminHealthSummary`              |
| 10  | Rapportering               | 5          | Brief capabilities                      |
| 11  | Quality control            | 1          | `AssessAdminQualityGate`                |
| 12  | Kommunikation internt      | 5          | Brief compose (COO/CAO/CCO summaries)   |
| 13  | UI/adminpanel              | 1–6        | `admin.html` dashboards                 |
| 14  | Beslutsstöd                | 5, 7       | `ExplainReadinessScore`, Go/No-Go brief |
| 15  | Automation-förslag         | 6          | Scheduler scripts + notify rules        |

---

## Beroenden

| Beroende                   | Varför                | Blocker?     |
| -------------------------- | --------------------- | ------------ |
| Gateway pipeline stabil    | Alla CAO-capabilities | Ja           |
| Template store + risk      | Mallbibliotek         | Ja för fas 1 |
| Audit events (`authStore`) | Compliance            | Fas 4        |
| COO incident data          | Incident admin        | Fas 4        |
| Monitor / readiness API    | Go/No-Go explain      | Fas 5–7      |
| OWNER auth roller          | CFO-liknande gates    | Fas 5+       |
| Admin orchestrator         | Execute bridge        | Fas 2        |

**Ej blocker:** Notion (finns inte i repo) — använd `docs/` + framtida export.

---

## Risker och mitigering

| Risk                                             | Sannolikhet | Mitigering                                                |
| ------------------------------------------------ | ----------- | --------------------------------------------------------- |
| CAO blir “god mode” och kringgår gates           | Medel       | `autoExecute: false` default; separata persist strategies |
| Scope creep (15 områden samtidigt)               | Hög         | Fas 1–2 levererar synligt värde; resten backlog           |
| Orchestrator execute kör fel steg                | Medel       | Dry-run preview + OWNER confirm för L3+                   |
| Dubbel sanning (orchestrator plan vs CAO output) | Medel       | En `correlationId`, audit kedja                           |
| UI i `admin.js` (1.3M) svår att underhålla       | Hög         | Extrahera CAO-modul till `public/admin/cao-operator.js`   |
| iCloud/git instabilitet                          | Hög         | Repo utanför iCloud; CI på Render                         |

---

## Acceptanskriterier (MVP = slutet av Fas 2)

1. `POST /api/v1/agents/CAO/run` returnerar utöver template-advisor: **quality gate summary** + **admin brief stub**.
2. Admin panel visar **Arcana Admin Operator** med öppna flaggor (saknad owner/DoD på konfigurerad task-källa).
3. `POST /api/v1/orchestrator/admin-run` med `mode=execute` kör minst ett säkert steg (t.ex. template health read) och loggar audit.
4. Inga nya paths kringgår `outputRisk` + `policyFloor`.
5. L5-ärenden stoppar med `requiresManualIntervention` (befintligt beteende oförändrat).
6. Unit-test `caoAgentGateway.test.js` grönt i CI.

---

## Nästa steg (omedelbart)

1. Godkänn fasindelning och MVP (Fas 0–2).
2. Skapa ADR + risktabell för 15 områden.
3. Implementera Fas 1 capability `AssessAdminQualityGate` + admin UI widget.
4. (Valfritt) Exportera denna plan till Notion under Arcana-strategi.

---

## Relaterade kommandon (utveckling)

```bash
cd major-arcana
npm run dev:offline          # http://localhost:3100/admin
npm run test:unit            # inkl. nya CAO-tester
npm run ops:suite:strict     # gateway + readiness
```

API-smoke:

```bash
curl -X POST http://localhost:3100/api/v1/agents/CAO/run \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
```
