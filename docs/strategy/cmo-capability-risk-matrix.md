# CMO — Risktabell (22 kapacitetsområden)

Datum: 2026-05-20  
Status: Accepted  
API-agent: `CMO` | UI: *Arcana Marketing Copilot*

## Output-typer

| Typ | Beskrivning | Persist |
|-----|-------------|---------|
| `MarketingCopilot` | Strategi + produktion + compliance + schema (utkast) | analysis |
| `MarketingAnalytics` | Read-only KPI/brief med metric-kontrakt | analysis |
| `ComplianceReview` | Claims + CLINICAL_GUARD + gate-status | audit + draft metadata |
| `CampaignDraft` | Kampanjutkast med version/approve | `marketing-campaign-drafts.json` |
| `ScheduleProposal` | Kalender + publiceringsschema (förslag) | draft metadata |
| `SalesEnablementPack` | MQL/SQL + battlecards (utkast) | analysis |
| `CrisisCommsHold` | Holding statement (aldrig auto-send) | analysis |

## Kapacitetsområden

| # | Område | Risk | CMO-beteende | Capability / artefakt |
|---|--------|------|--------------|------------------------|
| 1 | Sociala medier | L3 | Utkast per plattform, OWNER approve | `GenerateSocialPostPack` |
| 2 | Content-strategi | L2 | Brief + pillars, förslag only | `GenerateContentBrief` |
| 3 | SEO | L2 | Brief/artikelutkast, ingen auto-publish | `GenerateSeoBrief` |
| 4 | SEM och annonser | L4 | Ad copy-utkast, ingen budget/spend | `GenerateAdCopyPack` |
| 5 | E-post och utskick | L4 | Mail-utkast, ingen auto-send | `GenerateEmailDraft` |
| 6 | Analys och rapportering | L1 | Read-only, metric-kontrakt | `SummarizeMarketingPerformance`, `GenerateMarketingBrief` |
| 7 | Konkurrentanalys | L2 | Positionering + evidence flag | `AnalyzeCompetitorLandscape` |
| 8 | Varumärke och tonalitet | L3 | Tenant tone + claims whitelist | tenant config + `ValidateMarketingClaims` |
| 9 | Lead generation | L3 | Kampanjförslag, OWNER gate | `GenerateOutreachCampaign` |
| 10 | Kampanjhantering | L3 | Draft store + approve/reject | `marketingCampaignDraftsStore` |
| 11 | Organisk tillväxt | L2 | Kalenderförslag, serie-plan | `ProposeContentCalendar` |
| 12 | Automatisering | L2 | Scheduler-förslag only | `cmo_weekly_content_plan` |
| 13 | UTM, tracking och struktur | L2 | Generera + validera lokalt v1 | `GenerateUtmPack`, `ValidateMarketingTracking` |
| 14 | Kreativt stöd | L2 | Hooks/varianter inom packs | `RepurposeContent` |
| 15 | Godkännande och säkerhet | L4 | Mandatory OWNER + feed | workspace routes + executive feed |
| 16 | Compliance & samtycke | L4 | Gate blockerar schedule | `ReviewMarketingCompliance`, CLINICAL_GUARD |
| 17 | Agent-orkestrering | L3 | Cross-agent gates, plan/execute | orchestrator `marketing_campaign` |
| 18 | Product & trust marketing | L3 | Trust copy inom whitelist | briefs + enablement pack |
| 19 | Retention & customer marketing | L3 | Nurture/winback utkast only | `GenerateNurtureSequence`, `GenerateWinbackCampaign` |
| 20 | Kris & reputation | L4 | Hold-utkast, paus-förslag | `ProposeCrisisCommsHold` |
| 21 | Data governance (analys) | L2 | `insufficient_data` utan fresh metrics | `cmoMarketingMetrics.js` |
| 22 | Asset & version governance | L3 | Draft versioning + approvedBy | campaign draft store |

## Risknivåer (L1–L5)

| Nivå | Definition | CMO v1 |
|------|------------|--------|
| L1 | Read-only, intern sammanfattning | Analys, KPI-summaries |
| L2 | Förslag/utkast utan extern effekt | Briefs, kalender, UTM |
| L3 | Extern copy eller kampanjutkast | Social, SEO, outreach — compliance + OWNER |
| L4 | Patientnära, spend, mail, ads | Mandatory gate + approve; ingen auto-exekvering |
| L5 | Autonom publicering/spend | **Blockerad i v1** (ADR 0002) |

## Gränser (policy)

CMO får inte: auto-publicera, auto-spend, bypassa compliance/claims, rekommendera utan metric evidence, kringgå CAO launch gate eller COO incident-paus.

Se: `docs/adr/0002-cmo-publish-and-spend-boundary.md`, `src/policy/floor.js` (`MARKETING_COPY`).
