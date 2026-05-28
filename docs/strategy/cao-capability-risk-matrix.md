---
owner: CAO
status: active
---

# CAO — Risktabell (15 kapacitetsområden)

Datum: 2026-05-20  
Status: Accepted  
API-agent: `CAO` | UI: *Arcana Admin Operator*

## Output-typer

| Typ | Beskrivning | Persist |
|-----|-------------|---------|
| `AdminBrief` | Daglig/veckovis adminöversikt | analysis |
| `TemplateLibraryReport` | Mallbibliotek + hälsa | analysis |
| `QualityGateReport` | Admin tasks owner/DoD/status | analysis |
| `GoNoGoBrief` | Readiness-förklaring (beslut = OWNER) | analysis |
| `DocumentationAuditReport` | Saknad metadata i docs-träd | analysis |

## Kapacitetsområden

| # | Område | Risk | CAO-beteende | Capability |
|---|--------|------|--------------|------------|
| 1 | Admin & daglig struktur | L1 | Sammanfattning | `GenerateAdminDailyBrief` |
| 2 | Mallar & dokument | L2 | Utkast/förslag | `GenerateAdminTemplateDraft`, mall-capabilities |
| 3 | Intern dokumentation | L1 | Flagga metadata | `AuditDocumentationMetadata` |
| 4 | Processoptimering | L2 | Förslag struktur | `ProposeDocumentStructure` |
| 5 | Incident & SLA-admin | L1 | Read-only sammanfattning | `SummarizeIncidentAdmin`, `FlagUnownedIncidents` |
| 6 | Compliance & audit | L1 | Read-only audit | `BuildAuditSummary`, `VerifyDecisionTraceability` |
| 7 | Risk & policy admin | L4 | Endast flagga | befintlig risk + policy floor |
| 8 | Onboarding & användaradmin | L3 | Förslag checklistor | via orchestrator + mallutkast |
| 9 | Tenant-admin | L1 | Hälsosammanfattning | `TenantAdminHealthSummary` |
| 10 | Rapportering | L1 | Brief compose | `GenerateAdminDailyBrief` |
| 11 | Quality control | L1 | Gate | `AssessAdminQualityGate` |
| 12 | Kommunikation internt | L1 | Brief stubs | `GenerateAdminDailyBrief` |
| 13 | UI/adminpanel | L1 | Visning | `public/admin.html` |
| 14 | Beslutsstöd | L2 | Förklara readiness | `ExplainReadinessScore` |
| 15 | Automation-förslag | L2 | Scheduler-förslag | `scripts/cao-admin-quality-gate-daily.js` |

## Gränser (policy)

CAO får inte: aktivera mall i produktion, ändra policy floor, släppa patientkanal, exekvera CFO/OWNER-only mutationer utan manuell gate.
