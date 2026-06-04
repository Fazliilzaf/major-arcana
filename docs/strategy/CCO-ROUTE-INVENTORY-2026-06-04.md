# CCO Route Inventory — 4 juni 2026

_Generated: 2026-06-03T06:43:05.384Z_
_Base: https://arcana.hairtpclinic.com_

## Canonical navigation

|            |                                                         |
| ---------- | ------------------------------------------------------- |
| **Start**  | `/cco-demo.html` — Välkommen till CCO                   |
| **Flöde**  | Välkommen till CCO → Kunder → Kundkort → Journal        |
| **Legacy** | `/cco-personal-start.html` → redirect (ej huvudprodukt) |

**Route count:** 50

## Summary

- **CANONICAL:** /cco-demo.html, /major-arcana-preview/?view=customers
- **LEGACY:** /cco-personal-start.html
- **REMOVE_FROM_NAV:** /cco/index.html, /index.html, /major-arcana-preview/index.html, /uppfoljning/index.html, /uppfoljning/omdome.html
- **DEMO_OLD:** /ai-triage.html, /cco-concepts.html, /journal-build-demo.html
- **PAUSED:** /konversationer.html, /m-konversationer.html

## Git: cco-demo.html history

| SHA        | Notering                                                                                |
| ---------- | --------------------------------------------------------------------------------------- |
| `70b8aea9` | Gammal **Demo-portal** · mock 1 247 / 49 MSEK · Kalender/Kunder/Konv/Analytics-struktur |
| `d6997442` | Cycle-19: **Välkommen till CCO** utan mock · journal-fokus                              |
| `b225be56` | Primär start + gate + legacy redirect personal-start                                    |

Rätt struktur (Kalender, Kunder, Konversationer, mobil, AI/watch/automation som **pausade** kartor) kommer från `70b8aea9` — **utan** mock-siffror och Demo-portal-copy.

## All routes

| Path                                                          | Title                                                                  | Status          | HTTP      | Main nav | Presentation | Risks                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------- | --------- | -------- | ------------ | ----------------------------------- | -------------- |
| `/admin.html`                                                 | Admin                                                                  | LIVE_TOOL       | 502       | nej      | nej          | auth                                |
| `/ai-triage.html`                                             | AI triage                                                              | DEMO_OLD        | 502       | nej      | nej          | mock/demo · ej färdigt              |
| `/ambiguous-mail-enrichment-review.html`                      | Mail ambiguous review                                                  | LIVE_TOOL       | 502       | nej      | nej          | ej dag-1-verktyg                    |
| `/personal-demo.html`                              | 4 juni Command Center                                                  | SUPPORT         | 502       | nej      | ja           | —                                   |
| `/cco-after-meeting-start.html`                               | Efter mötet — börja här · Journalpilot · Hair TP Clinic                | LIVE_TOOL       | 502       | nej      | nej          | —                                   |
| `/cco-concepts.html`                                          | CCO concepts                                                           | DEMO_OLD        | 502       | nej      | nej          | —                                   |
| `/cco-demo.html`                                              | Välkommen till CCO                                                     | CANONICAL       | 502       | ja       | ja           | —                                   |
| `/cco-import-review.html`                                     | Import review                                                          | LIVE_TOOL       | 502       | nej      | nej          | read-only                           |
| `/cco-journal-safety-helper.html`                             | Journal Safety Helper · Hair TP Clinic                                 | SUPPORT         | 502       | nej      | ja           | —                                   |
| `/cco-journalpilot-faq.html`                                  | Journalpilot Quick FAQ · Hair TP Clinic                                | SUPPORT         | 502       | nej      | ja           | —                                   |
| `/cco-journalpilot-go-live.html`                              | Go-Live Support · Journalpilot dag 1 · Hair TP Clinic                  | SUPPORT         | 502       | nej      | ja           | false live claim                    |
| `/cco-morning-checklist.html`                                 | Morgon-checklist 4 juni · Fazli · Hair TP Clinic                       | LIVE_TOOL       | 502       | nej      | nej          | —                                   |
| `/cco-ops-workbench.html`                                     | Ops Workbench                                                          | LIVE_TOOL       | 502       | nej      | nej          | intern only                         |
| `/cco-personal-start.html`                                    | Legacy personal-start                                                  | LEGACY          | 502       | nej      | nej          | ska ej vara primaryStartUrl         |
| `/cco-pre-signering-check.html`                               | Pre-Signering Check · Identity Verification · Hair TP Clinic           | LIVE_TOOL       | 502       | nej      | nej          | —                                   |
| `/cco-presenter-mode.html`                                    | Presenter Mode · CCO Personalmöte 4 juni 2026 · Hair TP Clinic         | LIVE_TOOL       | 502       | nej      | nej          | —                                   |
| `/cco-review-material-warning.html`                           | Review-Material Warning · Vad är inte klinisk sanning · Hair TP Clinic | LIVE_TOOL       | 502       | nej      | nej          | —                                   |
| `/cco-staff-day1-checklist.html`                              | Staff Day-1 Checklist · Journalpilot · 4 juni 2026 · Hair TP Clinic    | SUPPORT         | 502       | nej      | nej          | —                                   |
| `/cco-staff-go-live-control.html`                             | Personal Go-Live Control · Dag 1 styrning · Hair TP Clinic             | SUPPORT         | 502       | nej      | nej          | —                                   |
| `/cco-staff-training-completion.html`                         | Staff Training Completion · Journalpilot · Hair TP Clinic              | SUPPORT         | 502       | nej      | nej          | —                                   |
| `/cco-staff-training-mode.html`                               | Personal Training Mode · Journalpilot · Hair TP Clinic                 | SUPPORT         | 502       | nej      | nej          | —                                   |
| `/cco/index.html`                                             | CCO index                                                              | REMOVE_FROM_NAV | 502       | nej      | nej          | —                                   |
| `/drive-historik.html`                                        | Drive historik                                                         | LIVE_TOOL       | 502       | nej      | nej          | Drive-referens; mock claims         |
| `/finance-reports.html`                                       | Finance reports                                                        | LIVE_TOOL       | 502       | nej      | nej          | —                                   |
| `/finance-review.html`                                        | Finance review                                                         | LIVE_TOOL       | 502       | nej      | nej          | —                                   |
| `/finance.html`                                               | Chief of Finance                                                       | LIVE_TOOL       | 502       | nej      | nej          | Fortnox blockerad                   |
| `/friskforsakran.html`                                        | Friskförsäkran · Hair TP Clinic                                        | LIVE_TOOL       | 502       | nej      | nej          | —                                   |
| `/index.html`                                                 | Index                                                                  | REMOVE_FROM_NAV | 502       | nej      | nej          | —                                   |
| `/journal-build-demo.html`                                    | Journal API demo                                                       | DEMO_OLD        | 502       | nej      | nej          | demo only                           |
| `/journal-feed-demo.html`                                     | Journal feed (demo shell)                                              | LIVE_TOOL       | 502       | nej      | ja           | kräver customerId query             |
| `/journal-pilot-guide.html`                                   | Journal pilot guide                                                    | SUPPORT         | 502       | nej      | ja           | —                                   |
| `/journal-pilot-print-pack.html`                              | Print Pack · Journalpilot dag 1 · Hair TP Clinic · 4 juni 2026         | SUPPORT         | 502       | nej      | ja           | —                                   |
| `/journal-pilot-signoff-sheet.html`                           | Sign-off Sheet · Journalpilot · Hair TP Clinic                         | SUPPORT         | 502       | nej      | ja           | —                                   |
| `/journal-qa.html`                                            | Journal Cutover QA · Arcana CCO                                        | SUPPORT         | 502       | nej      | ja           | —                                   |
| `/kalender.html`                                              | Kalender                                                               | LIVE_TOOL       | 502       | ja       | ja           | ej journal-P0                       |
| `/konversationer.html`                                        | Konversationer                                                         | PAUSED          | 502       | ja       | ja           | aktivering pågår · ej dag-1-verktyg |
| `/major-arcana-preview/?view=customers`                                                | Kunder                                                                 | CANONICAL       | 502       | ja       | ja           | —                                   |
| `/m-konversationer.html`                                      | Konversationer (mobil)                                                 | PAUSED          | 502       | nej      | nej          | mobil demo                          |
| `/major-arcana-preview/index.html`                            | Operatörsvy · Arcana                                                   | REMOVE_FROM_NAV | 502       | nej      | nej          | —                                   |
| `/operator-dashboard.html`                                    | Operator dashboard                                                     | LIVE_TOOL       | 502       | nej      | nej          | —                                   |
| `/patient-hub.html`                                           | Patient · Arcana                                                       | LIVE_TOOL       | 502       | nej      | nej          | patient-facing                      |
| `/patient-portal.html`                                        | Patientportal · Hair TP Clinic                                         | LIVE_TOOL       | 502       | nej      | nej          | patient-facing                      |
| `/patient/curatiio.html`                                      | Min Sida — Curatiio                                                    | LIVE_TOOL       | 502       | nej      | nej          | patient-facing                      |
| `/patient/index.html`                                         | Patient · Arcana                                                       | LIVE_TOOL       | 502       | nej      | nej          | patient-facing                      |
| `/patientinformation-hartransplantation-dhi-prp-minimal.html` | Minimalistiskt förslag · Patientinformation                            | Hair TP Clinic  | LIVE_TOOL | 502      | nej          | nej                                 | patient-facing |
| `/patientinformation-ogonlocksplastik-curatiio.html`          | Patientinformation · Ögonlocksplastik                                  | Curatiio        | LIVE_TOOL | 502      | nej          | nej                                 | patient-facing |
| `/personal-demo.html`                                         | Personal demo (alt)                                                    | SUPPORT         | 502       | nej      | nej          | —                                   |
| `/photo-review.html`                                          | Photo Review                                                           | LIVE_TOOL       | 502       | nej      | nej          | write AV prod                       |
| `/uppfoljning/index.html`                                     | Uppföljning · Arcana                                                   | REMOVE_FROM_NAV | 502       | nej      | nej          | —                                   |
| `/uppfoljning/omdome.html`                                    | Hair TP Clinic — Dela din upplevelse                                   | REMOVE_FROM_NAV | 502       | nej      | nej          | —                                   |

---

_Regenerate: `node scripts/build-cco-route-inventory.js`_
