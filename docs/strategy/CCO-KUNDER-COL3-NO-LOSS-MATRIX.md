# CCO Kunder — Kolumn 3 no-loss-matris

**Syfte:** Säkerställa att v9 kunddossiér (kolumn 3) behåller alla funktioner från gamla högerpanelen/flikarna.

**Gate:** `html[data-v9-enabled="on"]` + `?view=customers`  
**Status:** Fas 1–5 implementerad 2026-06-04 — inline flikar, sticky chrome, synthesis polish, rik kunddata, Pipedrive-LTV KPI + bokningsstatus-badges.

## Flik → render → verify

| Gammal flik / funktion               | v9 flik (`key`) | Render-funktion(er)                                                                                                                                                                                                            | Verify                                              |
| ------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Synthesis (Kommande, Filer, AI, KPI) | `oversikt`      | `renderV9DossierScrollBlock` → `CcoV9CustomersParity.renderSynthesisDossierScrollHtml` (primary only)                                                                                                                          | Översikt visar KPI + 3 block; inget «Mer i dossiér» |
| Profil & identitet                   | `profil`        | `renderJournalWorkflowCallout`, `renderScalpImagingCallout`, `renderPatientIntegrationsCard`, `renderPatientComplianceCard`, `renderPatientDemographicsCard`, identitets-DL, `renderPipedriveSection`, `renderMaterialPreview` | Flik Profil → integrations + compliance + demografi |
| Journal (TP/PRP/bleph/kliniska)      | `journal`       | `renderJournalWorkflowCallout`, `renderScalpImagingCallout`, `renderDraftProposalsPanel`, spärr-banner, `renderJournalEntries` (toolbar **en gång**)                                                                           | En Journalverktyg-rad; inga dubbletter              |
| Bokningar / tidslinje                | `tidslinje`     | `renderUnifiedTimelinePanel`                                                                                                                                                                                                   | «Visa alla ›» Kommande → Bokningar-flik             |
| Filer / Drive                        | `filer`         | `renderDriveFiles`                                                                                                                                                                                                             | Fil-kort + flik Filer                               |
| Ekonomi / avtal                      | `avtal`         | `renderAgreementSection`                                                                                                                                                                                                       | KPI Intäkt → Ekonomi-flik                           |
| Anteckningar                         | `anteckningar`  | `renderDraftProposalsPanel`, `renderPatientNotesPanel`                                                                                                                                                                         | Quick-pill Anteckna → Journal (inte anteckningar)   |
| Hår-/scalpanalys (flag)              | `scalpanalys`   | `#cco-scalp-analysis-mount` / `mountScalpAnalysisPanel`                                                                                                                                                                        | Syns när `__ARCANA_ENABLE_AISIA_SCALP_ANALYSIS__`   |
| Sticky snabbåtgärder                 | zone3 (alltid)  | `renderDossierQuickPillsHtml`                                                                                                                                                                                                  | Foto, boka, anteckna, bekräfta tider                |
| Deep-panel overlay                   | reserverad      | `openV9DossierDeepPanel` — **ej** huvudnavigation                                                                                                                                                                              | Huvudflikar använder inline `switchDetailTab`       |

## KPI / sektionshopp → flik

| Källa                  | Mål                |
| ---------------------- | ------------------ |
| KPI Besök / No-shows   | `tidslinje`        |
| KPI Intäkt             | `avtal`            |
| «Visa alla ›» Kommande | `tidslinje`        |
| «Visa alla ›» Filer    | `filer`            |
| «Öppna full journal»   | `journal`          |
| Zone3 «Anteckna»       | `journal`          |
| Zone3 avtal/samtycke   | `avtal` / `profil` |

## Default

| Kontext               | Default `detailTab` |
| --------------------- | ------------------- |
| v9 desktop, ny kund   | `oversikt`          |
| Mobil + preferJournal | `journal`           |
| Övrigt (icke-v9)      | `profil`            |

## Källor

- Design: `uploads/CCO-Kunder-Mockup-v9-DESKTOP.html`
- Shell: `public/major-arcana-preview/app/patient-master-ui.js`
- Synthesis: `public/major-arcana-preview/app/cco-v9-customers-parity.js`
- CSS: `public/major-arcana-preview/cco-v9-customers.css`
