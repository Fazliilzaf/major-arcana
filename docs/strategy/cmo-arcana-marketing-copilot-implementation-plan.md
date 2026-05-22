# Implementation Plan: CMO — Arcana Marketing Copilot

Skapad: 2026-05-20  
Uppdaterad: 2026-05-21 (Fas A–M levererad; v3 rollout planerad)  
Syfte: Bygga **CMO** som **Marketing Copilot med godkännande** — skapa, analysera, föreslå och schemalägga marknadscontent utan autonom publicering i v1.  
Källor:
- Användarspecifikation (15 kapacitetsområden + 5 lägen, 2026-05-20)
- Tillägg: compliance-gate, agent-orkestrering, product/trust marketing, retention, kris, data governance
- `docs/strategy/cao-arcana-admin-operator-implementation-plan.md` (mönster)
- Befintlig kod: `src/agents/cmoContentAgent.js`, `src/capabilities/generateContentBrief.js`, `analyzeAudienceSegments.js`, `generateOutreachCampaign.js`

---

## Översikt

**Idag:** CMO = `POST /api/v1/agents/CMO/run` med tre capabilities (`GenerateContentBrief`, `AnalyzeAudienceSegments`, `GenerateOutreachCampaign`). Agenten komponerar brief, målgrupp och kampanjförslag via `composeCmoContentAdvisor`. Executive feed kan flagga `approve_campaigns`. Orchestrator kopplar CMO till `tenant_branding` med `CLINICAL_GUARD`-validering.

**Mål:** CMO blir **Content & Campaign Copilot** med tydlig pipeline:

```
Strategi → Produktion → Compliance → Godkännande → Schemaläggning (förslag) → Analys → Kontroll
```

**Produktnamn i UI:** *Arcana Marketing Copilot* (API/registry: `CMO`).

**Grundregel (icke förhandlingsbar):**

> Skapa fritt → Compliance check → Owner godkänner → Schemalägg (förslag) → Mät → Lär

CMO **publicerar inte** externt i v1 (social, ads, mail, patientnära kanaler). CMO **spenderar inte** budget autonomt.

---

## Specifikationslänk

| Källa | Plats |
|--------|--------|
| CAO-plan (mönster) | `docs/strategy/cao-arcana-admin-operator-implementation-plan.md` |
| CMO IA | `docs/ops/cmo-marketing-copilot-ia.md` |
| Nuvarande CMO-agent | `src/agents/cmoContentAgent.js` |
| Agent-registry | `src/capabilities/registry.js` (CMO bundle) |
| Orchestrator (branding) | `src/orchestrator/adminOrchestrator.js` (`TENANT_BRANDING`) |
| Executive feed | `src/ops/executiveDecisionFeed.js` (`approve_campaigns`) |
| CLINICAL_GUARD | Orchestrator + gateway policy floor |
| ADR-mönster | `docs/adr/0001-cao-orchestrator-execute-boundary.md` |

---

## Sex lägen (produktmodell)

| Läge | Syfte | Auto-exekvering v1 |
|------|--------|-------------------|
| **1. Strategi** | Månad/fokus, pillars, kanaler, KPI:er, kampanjidéer | Nej — förslag |
| **2. Produktion** | Social, SEO, ads, mail, landningssidor, manus | Nej — utkast |
| **3. Compliance** | Claims, GDPR/samtycke, patientnära, juridik, brand | **Gate** — blockerar schemaläggning |
| **4. Schemaläggning** | Kalender, publiceringstid, batch-plan | Förslag only |
| **5. Analys** | Kanalresultat, CPA/CTR, rekommendationer | Read-only |
| **6. Kontroll** | Paus, budgettak, saknad UTM/CTA, kris | Flag + executive feed |

Compliance är **obligatoriskt gate** mellan Produktion och Schemaläggning — inte ett efterhandscheck.

---

## Tekniskt angreppssätt

### 1. Två lager (samma som CAO)

| Lager | Roll | Befintligt |
|-------|------|------------|
| **CMO Agent Bundle** | Capability-komponerad körning via gateway | `cmoContentAgent.js` |
| **Admin Orchestrator** | Intent → plan → valfri execute för säkra steg | `adminOrchestrator.js` |

**Rekommendation:** Utöka CMO-bundlen per domän. Ny orchestrator-intent `marketing_campaign` (Fas 4) som kedjar CMO → CLINICAL_GUARD → CAO (godkännande).

### 2. Capability-mönster

Varje CMO-funktion = capability i `src/capabilities/`:

- Metadata: `roles`, `channels: ['admin']`, `requiresOwnerApproval: true` för extern output
- `autoExecute: false`, `autoPublish: false` default
- Output-typer: `ContentBrief`, `CampaignDraft`, `ComplianceReview`, `MarketingReport`, `ScheduleProposal`

### 3. Pipeline (icke förhandlingsbar)

```
Request → Input Risk → Agent → Output Risk → Policy Floor → CLINICAL_GUARD (extern copy) → Persist (draft only) → Audit → Notify
```

**CMO-specifikt:**

- Extern copy (social, ads, mail, landningssidor) → **mandatory** `ValidateMarketingClaims` + CLINICAL_GUARD pass
- Persist till produktion (publicering, spend, utskick) → **OWNER confirm** + executive feed resolve

### 4. Gränser (policy som kod)

| CMO får | CMO får inte |
|---------|----------------|
| Skapa utkast (inlägg, annonser, SEO, mail, briefs) | Publicera till Meta/Google/LinkedIn/mail utan godkännande |
| Föreslaa schemaläggning och budgetfördelning | Aktivera annonsbudget autonomt |
| Analysera resultat (när datakällor finns) | Hitta på metrics utan källa/freshness |
| Generera UTM-förslag och kampanjstruktur | Bypassa consent/tracking-regler |
| Flagga claims, svag CTA, saknad tracking | Patientnära budskap utan compliance-gate |
| Skapa kampanjversioner + audit-spår | Kringgå CAO/OWNER launch gates |

Lägg gränser i: capability metadata + ny `marketingCopilot` profil i `src/policy/floor.js`.

### 5. Datamodell (minimal utökning)

| Entitet | Fält (minimum) | Store / route |
|---------|----------------|---------------|
| CampaignDraft | id, tenantId, name, channel, status, owner, claims[], utm, scheduledAt, version | `data/marketing-campaign-drafts.json` |
| ContentAsset | id, type, platform, caption, hashtags, hook, status, approvedBy, approvedAt | nested i draft eller separat store |
| ApprovedClaim | id, text, category, expiresAt, approvedBy | `data/marketing-claims-whitelist.json` |
| MarketingCalendarEntry | draftId, platform, proposedAt, timezone, requiresApproval | derived från drafts |
| ComplianceReview | draftId, passed, flags[], reviewerAgent, reviewedAt | audit + draft metadata |

**Fas 1:** inga nya stores — output i agent response + executive feed.  
**Fas 3:** `CampaignDraft` store + PATCH approve.

### 6. UI (admin panel)

Ny sektion **Arcana Marketing Copilot** (parallellt med CAO workspace):

- Flikar: Strategi, Content, Kampanjer, Compliance, Kalender, Analys
- Actions: Godkänn / Avvisa / Begär ändring / Schemalägg (förslag)
- Koppling till executive feed (`approve_campaigns`, `review_claims`, `pause_campaigns`)

Extrahera till `public/admin/cmo-copilot.js` (undvik monolitisk `admin.js`).

---

## Faser och uppgifter

### Fas 0 — Canon, scope & risk (1 vecka) ✓

- [x] Besluta produktnamn: UI “Arcana Marketing Copilot”, API `CMO`
- [x] Skriv ADR: `0002-cmo-publish-and-spend-boundary.md` (ingen auto-publish/spend v1)
- [x] Riskklassificera alla 22 kapacitetsområden (L1–L5) — `docs/strategy/cmo-capability-risk-matrix.md`
- [x] Definiera output-typer och compliance-gate kontrakt
- [x] Dokumentera claims whitelist-format och review-expiry
- [x] Uppdatera `docs/ops/cmo-marketing-copilot-ia.md`

### Fas A — Strategi + Produktion MVP (2–3 veckor) ✓

**Mål:** Synligt värde utan extern publicering — brief, audience, kampanjutkast.

- [x] Utöka `composeCmoContentAdvisor` → `composeCmoMarketingCopilot` (bakåtkompatibel)
- [x] Capability: `GenerateSocialPostPack` (LinkedIn, Instagram, Facebook, X — plattformsvarianter)
- [x] Capability: `GenerateSeoBrief` (keywords, titlar, meta, rubrikstruktur, internlänkar)
- [x] Capability: `GenerateAdCopyPack` (Google/Meta/LinkedIn — utkast, ingen upload)
- [x] Capability: `RepurposeContent` (blogg → social, release notes → multi-channel)
- [x] Capability: `GenerateEmailDraft` (nyhetsbrev, nurture — utkast only)
- [x] Uppdatera `registry.js` CMO bundle (v1.1.0, 8 capabilities)
- [x] `executionService.js`: snapshot hydration via `hydrateCmoSystemSnapshot`
- [x] Admin UI: CMO-körning + executive summary + produktionspreview (`cmo-copilot.js`)
- [x] Tester: `tests/agents/cmoAgentGateway.test.js`, `tests/ops/cmoPhaseA.test.js`
- [x] Executive feed: utöka `actionType` (`review_claims`, `approve_social_batch`)

**Leverans:** `POST /api/v1/agents/CMO/run` returnerar strategi + content-utkast per kanal.

### Fas B — Compliance-gate (2 veckor) ✓

**Mål:** Obligatorisk gate före schemaläggning/godkännande.

- [x] Capability: `ValidateMarketingClaims` (whitelist + flaggor)
- [x] Capability: `ReviewMarketingCompliance` (GDPR/samtycke-hints, patientnära, juridik, överdrivna löften)
- [x] Integrera CLINICAL_GUARD i CMO compose-pipeline för extern copy (policy floor `marketing_copy`)
- [x] Store: `data/marketing-claims-whitelist.json` + seed (`npm run seed:marketing-claims`)
- [x] Output: `ComplianceReview` med `passed | blocked | needs_owner`
- [x] Blockera “ready to schedule” om compliance inte passerar (`scheduleAllowed`, `compliance_blocked`)
- [x] Audit: `cmo.compliance.review`, `cmo.claims.flagged`
- [x] Tester: `tests/ops/cmoPhaseB.test.js`

**Leverans:** Inget content markeras `ready` utan compliance-pass + owner för L3+.

### Fas C — Godkännande & workspace (2 veckor) ✓

**Mål:** CMO Copilot workspace med write-actions (som CAO E4).

- [x] Store: `data/marketing-campaign-drafts.json`
- [x] Routes: `src/routes/marketingWorkspace.js`
  - `GET /api/v1/marketing/campaigns`
  - `GET /api/v1/marketing/campaigns/:id`
  - `PATCH /api/v1/marketing/campaigns/:id` (status, owner, schedule proposal)
  - `POST /api/v1/marketing/campaigns/:id/approve` (OWNER)
  - `POST /api/v1/marketing/campaigns/:id/reject`
- [x] UI: `public/admin/cmo-workspace.js` — godkänn, avvisa, tilldela owner
- [x] Executive feed: kvittera `approve_campaigns` → PATCH campaign
- [x] Versionering: spara `version`, `approvedBy`, `approvedAt` per draft
- [x] Tester: `tests/ops/cmoPhaseC.test.js`

**Leverans:** Owner godkänner kampanjer i UI; audit loggar beslut.

### Fas D — Schemaläggning & UTM (2 veckor) ✓

**Mål:** Kalenderförslag och tracking-struktur — fortfarande utan auto-publish.

- [x] Capability: `ProposeContentCalendar` (vecko/månadsplan)
- [x] Capability: `ProposePublishSchedule` (bästa tid per plattform — heuristik v1)
- [x] Capability: `GenerateUtmPack` (kampanjnamn, kanalstruktur, länkar)
- [x] Validering: saknad UTM, saknad CTA, brutna länkar (lokal check v1)
- [x] Scheduler-förslag: `cmo_weekly_content_plan` (generera plan, notify OWNER)
- [x] Flaggor: missad publicering, content batch redo för review
- [x] Tester + smoke: `scripts/cmo-staging-smoke.js`

**Leverans:** Veckoplan + UTM-pack; schemaläggning = förslag i draft store.

### Fas E — Analys & rapportering (2–3 veckor) ✓

**Mål:** Read-only analys med data quality guardrails.

- [x] Capability: `SummarizeMarketingPerformance` (social, ads, SEO, mail — när API kopplade)
- [x] Capability: `GenerateMarketingBrief` (weekly/monthly via `period`)
- [x] Data contract: varje metric kräver `{ source, window, fetchedAt, fresh }`
- [x] Om data saknas: `insufficient_data — no recommendation` (inga hallucinerade KPI:er)
- [x] KPI:er: CTR, CPC, CPA, CPL, konvertering, kanalmix
- [x] UI: CMO Analys-flik (read-only)
- [x] Executive feed: `pause_underperforming_ads` (förslag, OWNER confirm)

**Leverans:** Veckorapport med tydliga datakällor; inga rekommendationer utan evidence.

### Fas F — Agent-orkestrering (2 veckor) ✓

**Mål:** CMO i samspel med CAO, COO, CCO, CFO, CLINICAL_GUARD.

- [x] Orchestrator intent: `marketing_campaign` → CMO + CLINICAL_GUARD + CAO
- [x] CAO launch gate: CMO föreslår inte “go live” om readiness under tröskel
- [x] COO incident hook: öppen P0/P1 → CMO föreslår `pause_all_external_campaigns`
- [x] CCO handoff: delad MQL/SQL-definition, battlecard-capability
- [x] CFO budget gate: spend-förslag över tak → `requiresOwnerApproval`
- [x] Capability: `GenerateSalesEnablementPack` (battlecards, objection handling)
- [x] Capability: `ProposeCrisisCommsHold` (holding statement draft — aldrig auto-send)
- [x] Tester: orchestrator + feed integration

**Leverans:** Cross-agent plans med correlationId och audit.

### Fas G — Automation & hardening (1–2 veckor) ✓

- [x] Contract tests: `tests/capabilities/cmoCapabilityContract.test.js` + snapshot fixture
- [x] E2E: CMO run → compliance → approve → feed resolve
- [x] Stryker-config för CMO capabilities (valfritt): `npm run test:mutation:cmo`
- [x] Runbook: `docs/ops/runbooks/cmo-marketing-copilot-runbook.md`
- [x] Uppdatera `docs/ops/developer-handover.md`
- [x] Go/No-Go för **automation step 2** (No-Go auto-publish; scheduler + OWNER approve only)
- [x] UI: sex flikar i `#cmoSection` (Strategi, Content, Kampanjer, Compliance, Kalender, Analys)

---

## Mapping: 22 kapacitetsområden → faser

| # | Område | Primär fas | Primär artefakt |
|---|--------|------------|-----------------|
| 1 | Sociala medier | A | `GenerateSocialPostPack` |
| 2 | Content-strategi | A, D | `GenerateContentBrief` (utökad) |
| 3 | SEO | A | `GenerateSeoBrief` |
| 4 | SEM och annonser | A, E | `GenerateAdCopyPack` |
| 5 | E-post och utskick | A, C | `GenerateEmailDraft` |
| 6 | Analys och rapportering | E | `SummarizeMarketingPerformance` |
| 7 | Konkurrentanalys | F (v2) | `AnalyzeCompetitorLandscape` (backlog) |
| 8 | Varumärke och tonalitet | A, B | tenant branding + claims whitelist |
| 9 | Lead generation | A, F | `GenerateOutreachCampaign` (utökad) |
| 10 | Kampanjhantering | A, C, D | `CampaignDraft` store |
| 11 | Organisk tillväxt | A, D | calendar + series capabilities |
| 12 | Automatisering | D, G | scheduler jobs (förslag only) |
| 13 | UTM, tracking och struktur | D | `GenerateUtmPack` |
| 14 | Kreativt stöd | A | briefs inom post/ad packs |
| 15 | Godkännande och säkerhet | B, C | compliance + approve routes |
| 16 | Compliance & samtycke | B | `ReviewMarketingCompliance` |
| 17 | Agent-orkestrering | F | orchestrator intents |
| 18 | Product & trust marketing | A, F | security/trust content templates |
| 19 | Retention & customer marketing | A (v2) | nurture + winback capabilities |
| 20 | Kris & reputation | F | `ProposeCrisisCommsHold` |
| 21 | Data governance (analys) | E | metric source contract |
| 22 | Asset & version governance | C, G | draft versioning + approved assets |

---

## Beroenden

| Beroende | Varför | Blocker? |
|----------|--------|----------|
| Gateway pipeline | Alla CMO-capabilities | Ja |
| CLINICAL_GUARD / policy floor | Compliance-gate | Ja för Fas B+ |
| Executive decision feed | Godkännande UX | Ja för Fas C |
| CAO readiness (monitor) | Launch timing | Fas F |
| COO incidents | Kris-paus | Fas F |
| CCO commercial data | MQL/SQL alignment | Fas F |
| CFO budget config | Spend gates | Fas F |
| Externa API (Meta, Google, etc.) | Auto-publish v2+ | **Nej** för v1 |

**v1 princip:** CMO fungerar fullt utan externa integrations-API:er — all output är utkast + förslag.

---

## Risker och mitigering

| Risk | Sannolikhet | Mitigering |
|------|-------------|------------|
| Auto-publicering skadar varumärke/patienttrust | Hög | ADR + `autoPublish: false`; OWNER gate |
| Hallucinerade kampanjmetrics | Medel | Data contract + insufficient_data |
| Compliance bypass | Medel | Mandatory gate; CLINICAL_GUARD |
| Scope creep (22 områden) | Hög | Fas A–C = MVP; resten backlog |
| CMO/CAO dubbel sanning | Medel | correlationId, executive feed som hub |
| Aggressiv healthcare copy | Hög | claims whitelist + expiry |

---

## Acceptanskriterier (v1 = slutet av Fas G)

1. `POST /api/v1/agents/CMO/run` returnerar: content brief + social/SEO/ad **utkast** + compliance status + schema/UTM.
2. Inget draft markeras `ready` utan `ComplianceReview.passed` och orkestrerings-gates.
3. Admin panel visar **Arcana Marketing Copilot** med sex flikar och kampanjworkspace.
4. `POST /api/v1/marketing/campaigns/:id/approve` kräver OWNER och skriver audit.
5. Executive feed `approve_campaigns` kan kvitteras och uppdaterar draft.
6. Inga paths kringgår output risk + policy floor + CLINICAL_GUARD för extern copy.
7. Orchestrator `marketing_campaign` kör CMO med cross-agent-gates.
8. Unit-/contract-/E2E-tester gröna (`cmoPhaseA–G`, `cmoCapabilityContract`, `cmoAgentGateway`).

---

## Nästa steg (v2 backlog) ✓

Alla punkter nedan är levererade. **Aktiv plan:** [`cmo-v3-rollout-plan.md`](./cmo-v3-rollout-plan.md) — Fas N (commit/CI), Fas O (prod connectors), Fas P–R (v3 scope).

1. ~~`AnalyzeCompetitorLandscape` capability.~~ ✓ v2.0
2. ~~Retention/winback capabilities (nurture, winback).~~ ✓ v2.0
3. ~~Externa API-kopplingar (Meta, Google Ads, LinkedIn) — connector stub i `cmoMarketingConnectors.js`.~~ ✓ v2.1 fixture/live merge + v2.2 platform adapters
4. ~~Revisit auto-publish per kanal (ADR 0002) efter pilot och OWNER-process.~~ ✓ v2.3 kanal-policy + pilot queue
5. ~~Separat `ContentAsset`-store om draft-nesting blir flaskhals.~~ ✓ v2.4
6. ~~CI: `npm run test:mutation:cmo` i pipeline (valfritt).~~ ✓ Fas M

### Fas M — Mutation CI ✓

- [x] `tests/_cmoMutationRunner.js` — kör alla CMO phase-tester (14 filer) utan kommaseparerade paths
- [x] `stryker.cmo.conf.json` — 7 kärnfiler, `inPlace` (sandbox exkluderar `tests/`), `coverageAnalysis: off`
- [x] `npm run test:mutation:cmo` — score **66.32%**; trösklar break 30 / low 50 / **high 65**
- [x] CI-jobb `cmo-mutation` i `.github/workflows/ci.yml` (45 min, HTML-artifact)
- [x] Refactor: `cmoCopilotComposeHelpers.js` + dedikerade helper-tester
- [x] Gateway: analytics + strategy_intel i `cmoAgentGateway.test.js`
- [x] Store-integration: `cmoStoreIntegration.test.js` + `cmoStoreMutationEdge.test.js`
- [x] High-tröskel **65%** uppnådd (stores ~65–70%, helpers ~68%)

→ **Fortsättning:** se [`cmo-v3-rollout-plan.md`](./cmo-v3-rollout-plan.md)

### Fas H — Strategy intel v2 ✓

- [x] `AnalyzeCompetitorLandscape`, `GenerateNurtureSequence`, `GenerateWinbackCampaign`
- [x] Agent mode `strategy_intel` + `composeCmoStrategyIntelReport`
- [x] Connector stub: `src/ops/cmoMarketingConnectors.js`
- [x] CMO bundle **v2.0.0**
- [x] UI: Strategi-insights (v2)
- [x] Tester: `tests/ops/cmoPhaseV2.test.js`

### Fas I — Marketing connectors v2.1 ✓

- [x] `cmoMarketingConnectors.js`: fixture mode, optional live fetch, snapshot merge
- [x] `hydrateCmoSystemSnapshot` + `SummarizeMarketingPerformance` connector hydration
- [x] `GET /api/v1/marketing/connectors/status`
- [x] Config: `ARCANA_MARKETING_*` env vars + marketing store paths
- [x] Tester: `tests/ops/cmoPhaseV2Connectors.test.js`

### Fas J — Live platform adapters v2.2 ✓

- [x] `cmoMarketingConnectorAdapters.js` — Google Ads GAQL, Meta Graph insights, LinkedIn adAnalytics
- [x] Adapter dispatch i `fetchLiveChannelMetrics` (fallback till generic endpoint)
- [x] Config: `CUSTOMER_ID`, `DEVELOPER_TOKEN`, `AD_ACCOUNT_ID` per kanal
- [x] Runbook: live env-exempel
- [x] Tester: `tests/ops/cmoPhaseV2LiveAdapters.test.js`

### Fas K — Publish policy v2.3 (ADR 0002 revisit) ✓

- [x] `cmoPublishPolicy.js` — kanalrisk L1–L5, pilot allowlist, publish modes
- [x] Global `autoPublish: false` bibehållen; `pilot_auto_queue` efter OWNER + gates
- [x] Scheduler `cmo_pilot_publish_due` — audit-only queue (ingen extern API)
- [x] `GET /api/v1/marketing/publish-policy` + UI preview i Compliance-fliken
- [x] Tester: `tests/ops/cmoPhasePublishPolicy.test.js`

### Fas L — ContentAsset store v2.4 ✓

- [x] `marketingContentAssetsStore.js` — social/SEO/ads/mail/repurpose som egna assets
- [x] `cmoContentAssetExtract.js` + `cmoMarketingWorkspaceSync.js`
- [x] Campaign drafts lagrar `payload.assetIds` (refs, inte nested blobs)
- [x] CMO agent-run syncar campaigns + assets; approve godkänner länkade assets
- [x] API: `GET /api/v1/marketing/content-assets`, `GET .../:assetId`
- [x] Tester: `tests/ops/cmoPhaseContentAssets.test.js`

---

## Relaterade kommandon (utveckling)

```bash
cd major-arcana
npm run dev:offline          # http://localhost:3100/admin
npm run test:unit            # inkl. CMO-tester (efter Fas A)
```

API-smoke (idag):

```bash
curl -X POST http://localhost:3100/api/v1/agents/CMO/run \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"maxTopics":5,"targetAudience":"klinikledning"}'
```

Efter Fas D:

```bash
npm run smoke:cmo-staging
```
