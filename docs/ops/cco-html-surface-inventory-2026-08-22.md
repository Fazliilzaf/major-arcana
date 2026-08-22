# CCO HTML-yta — inventering

> **Mätt på:** VPS-utcheckningen `/home/fazli/cco/major-arcana` (nådd via DSH-arbetskopian `dsh-workspace/server-fra1/home/cco/major-arcana`) · gren `main` · commit `a3161a856`
> **Datum:** 2026-08-22 · **Metod:** suffix-agnostisk referenssökning (kod + docs/tests/scripts)

Syfte: skilja riktiga ytor från designunderlag så att nästa agent inte läser fel. Underhålls av `scripts/verify-cco-html-inventory.js`.

## Klasser

| Klass | Antal | Betydelse |
|---|---|---|
| `live` | 146 | Nås från kod (server.js/JS/HTML) — körs |
| `underlag` | 22 | Nämns i docs/tester — designunderlag, rör inte |
| `kandidat` | 2 | I git, ersatt av nyare variant — raderingskandidat |
| `arbetsfil_utanfor_git` | 2 | Untracked — finns bara i arbetskopian, ej i repot |

## live (146)

| Fil | Storlek | Kod-ref | Docs-ref |
|---|---|---|---|
| `public/admin.html` | 221 kB | 32 | 339 |
| `public/ai-triage.html` | 45 kB | 8 | 5 |
| `public/ambiguous-mail-enrichment-review.html` | 0 kB | 17 | 9 |
| `public/cco-after-meeting-start.html` | 18 kB | 11 | 9 |
| `public/cco-concepts.html` | 3 kB | 5 | 4 |
| `public/cco-demo.html` | 27 kB | 48 | 23 |
| `public/cco-import-review.html` | 0 kB | 23 | 21 |
| `public/cco-journal-safety-helper.html` | 15 kB | 10 | 8 |
| `public/cco-journalpilot-faq.html` | 12 kB | 32 | 11 |
| `public/cco-journalpilot-go-live.html` | 26 kB | 23 | 11 |
| `public/CCO-Kunder-Mockup-v9-DESKTOP.html` | 303 kB | 13 | 11 |
| `public/cco-kunder-v9-egen.html` | 83 kB | 3 | 3 |
| `public/cco-kundkort-blueprint.html` | 37 kB | 5 | 4 |
| `public/cco-kundkort-REFERENS.html` | 9 kB | 5 | 3 |
| `public/cco-mail-ingestion-review.html` | 3 kB | 5 | 5 |
| `public/cco-morning-checklist.html` | 10 kB | 9 | 8 |
| `public/cco-naming-review/index.html` | 14 kB | 132 | 419 |
| `public/cco-next-release/index.html` | 2 kB | 132 | 419 |
| `public/cco-ops-workbench.html` | 0 kB | 31 | 20 |
| `public/cco-personal-start.html` | 2 kB | 35 | 26 |
| `public/cco-photo-review.html` | 1 kB | 8 | 12 |
| `public/cco-pre-signering-check.html` | 15 kB | 24 | 11 |
| `public/cco-presenter-mode.html` | 27 kB | 15 | 9 |
| `public/cco-review-material-warning.html` | 16 kB | 21 | 11 |
| `public/cco-staff-day1-checklist.html` | 12 kB | 17 | 9 |
| `public/cco-staff-go-live-control.html` | 37 kB | 13 | 10 |
| `public/cco-staff-training-completion.html` | 13 kB | 13 | 9 |
| `public/cco-staff-training-mode.html` | 24 kB | 28 | 12 |
| `public/cco/index.html` | 2 kB | 132 | 419 |
| `public/customer-quote.html` | 24 kB | 9 | 9 |
| `public/drive-historik.html` | 19 kB | 8 | 7 |
| `public/drive-import-review.html` | 1 kB | 6 | 15 |
| `public/finance-reports.html` | 21 kB | 17 | 11 |
| `public/finance-review.html` | 28 kB | 22 | 15 |
| `public/finance.html` | 183 kB | 45 | 76 |
| `public/friskforsakran.html` | 12 kB | 13 | 34 |
| `public/gouraloto-proposal/current-based-v1.html` | 27 kB | 1 | 1 |
| `public/gouraloto-proposal/final-landing.html` | 28 kB | 3 | 1 |
| `public/gouraloto-proposal/future-home-v2.html` | 28 kB | 1 | 1 |
| `public/gouraloto-proposal/index.html` | 9 kB | 132 | 419 |
| `public/gouraloto-proposal/pathways.html` | 8 kB | 2 | 1 |
| `public/gouraloto-proposal/website-ready.html` | 28 kB | 1 | 1 |
| `public/index.html` | 20 kB | 132 | 419 |
| `public/journal-build-demo.html` | 25 kB | 5 | 2 |
| `public/journal-feed-demo.html` | 11 kB | 33 | 16 |
| `public/journal-pilot-guide.html` | 26 kB | 48 | 17 |
| `public/journal-pilot-print-pack.html` | 20 kB | 15 | 6 |
| `public/journal-pilot-signoff-sheet.html` | 11 kB | 20 | 10 |
| `public/journal-qa.html` | 39 kB | 15 | 12 |
| `public/kalender.html` | 240 kB | 58 | 122 |
| `public/konversationer.html` | 244 kB | 90 | 107 |
| `public/kunder-FACIT.html` | 87 kB | 2 | 1 |
| `public/kunder-mockup-v10.html` | 362 kB | 7 | 2 |
| `public/kundkort-mockup-gemensamt.html` | 33 kB | 5 | 1 |
| `public/m-konversationer.html` | 17 kB | 6 | 3 |
| `public/m-kunder.html` | 10 kB | 8 | 8 |
| `public/major-arcana-preview/auto-avbokningsbekraftelse-final-demo.html` | 33 kB | 9 | 8 |
| `public/major-arcana-preview/auto-bokningspaminnelse-final-demo.html` | 32 kB | 9 | 8 |
| `public/major-arcana-preview/auto-integritet-final-demo.html` | 35 kB | 9 | 8 |
| `public/major-arcana-preview/auto-medical-finance-final-demo.html` | 33 kB | 5 | 5 |
| `public/major-arcana-preview/cco-analytics-v3.html` | 62 kB | 4 | 5 |
| `public/major-arcana-preview/cco-automatisering-v3.html` | 75 kB | 2 | 3 |
| `public/major-arcana-preview/cco-avtal-samtycke-bundle.html` | 2 kB | 5 | 10 |
| `public/major-arcana-preview/cco-booking-wizard-v3.html` | 58 kB | 1 | 3 |
| `public/major-arcana-preview/cco-calendar-v6.html` | 36 kB | 1 | 0 |
| `public/major-arcana-preview/cco-dokument-v1.html` | 69 kB | 13 | 3 |
| `public/major-arcana-preview/cco-foto-samtycke-demo-overlay.html` | 2 kB | 3 | 3 |
| `public/major-arcana-preview/cco-friskforsakran-demo-overlay.html` | 2 kB | 3 | 3 |
| `public/major-arcana-preview/cco-installningar-v3-2.html` | 65 kB | 5 | 6 |
| `public/major-arcana-preview/cco-integrationer-v3.html` | 39 kB | 1 | 1 |
| `public/major-arcana-preview/cco-kalender-v8.html` | 38 kB | 1 | 2 |
| `public/major-arcana-preview/cco-konversationer-v3.html` | 33 kB | 1 | 2 |
| `public/major-arcana-preview/cco-mail-review-v3.html` | 75 kB | 1 | 2 |
| `public/major-arcana-preview/cco-makron-v3.html` | 67 kB | 17 | 11 |
| `public/major-arcana-preview/cco-no-show-ai-v3.html` | 37 kB | 17 | 9 |
| `public/major-arcana-preview/cco-no-show-v3.html` | 50 kB | 5 | 7 |
| `public/major-arcana-preview/cco-notiser-v3.html` | 60 kB | 21 | 12 |
| `public/major-arcana-preview/cco-ny-bokning.html` | 29 kB | 7 | 11 |
| `public/major-arcana-preview/cco-patient-hub-v3.html` | 49 kB | 11 | 13 |
| `public/major-arcana-preview/cco-patient-offer-portal-v3.html` | 211 kB | 11 | 13 |
| `public/major-arcana-preview/cco-pre-signering-v3.html` | 36 kB | 1 | 2 |
| `public/major-arcana-preview/cco-revisor-v3.html` | 48 kB | 1 | 2 |
| `public/major-arcana-preview/cco-senare-v3.html` | 72 kB | 20 | 16 |
| `public/major-arcana-preview/cco-showcase-v3.html` | 39 kB | 1 | 2 |
| `public/major-arcana-preview/cco-signaturer-v3.html` | 59 kB | 13 | 12 |
| `public/major-arcana-preview/cco-skickat-v3.html` | 60 kB | 20 | 14 |
| `public/major-arcana-preview/cco-smart-anteckning-v3.html` | 67 kB | 20 | 16 |
| `public/major-arcana-preview/cco-svarstudio-v3.html` | 120 kB | 13 | 4 |
| `public/major-arcana-preview/index.html` | 523 kB | 132 | 419 |
| `public/major-arcana-preview/lit-preview.html` | 11 kB | 1 | 1 |
| `public/major-arcana-preview/staff-anteckningar-kort-final-demo.html` | 49 kB | 6 | 5 |
| `public/major-arcana-preview/staff-auto-internt-sms-final-demo.html` | 47 kB | 6 | 5 |
| `public/major-arcana-preview/steg2-auto-bokningsbekraftelse-final-demo.html` | 35 kB | 9 | 8 |
| `public/major-arcana-preview/steg3-auto-instruktion-formular-final-demo.html` | 33 kB | 8 | 7 |
| `public/major-arcana-preview/steg3-halsodeklaration-final-demo.html` | 45 kB | 17 | 17 |
| `public/major-arcana-preview/steg3-health-questionnaire-eng-final-demo.html` | 46 kB | 10 | 10 |
| `public/major-arcana-preview/steg4-botulinum-info-final-demo.html` | 39 kB | 2 | 1 |
| `public/major-arcana-preview/steg4-hyalase-info-sve-final-demo.html` | 35 kB | 2 | 1 |
| `public/major-arcana-preview/steg4-id-verifiering-final-demo.html` | 51 kB | 9 | 8 |
| `public/major-arcana-preview/steg4-konsultationsmall-final-demo.html` | 50 kB | 9 | 8 |
| `public/major-arcana-preview/steg4-microneedling-info-sve-final-demo.html` | 37 kB | 7 | 6 |
| `public/major-arcana-preview/steg4-prp-hair-info-eng-final-demo.html` | 41 kB | 7 | 6 |
| `public/major-arcana-preview/steg4-prp-hair-info-sve-final-demo.html` | 35 kB | 7 | 6 |
| `public/major-arcana-preview/steg5-behandlingsplan-staff-final-demo.html` | 51 kB | 9 | 8 |
| `public/major-arcana-preview/steg5-info-offert-tp-final-demo.html` | 33 kB | 9 | 8 |
| `public/major-arcana-preview/steg5-offert-microneedling-final-demo.html` | 35 kB | 3 | 3 |
| `public/major-arcana-preview/steg5-offert-prf-final-demo.html` | 35 kB | 3 | 3 |
| `public/major-arcana-preview/steg5-offert-profilo-final-demo.html` | 35 kB | 3 | 3 |
| `public/major-arcana-preview/steg5-offert-prp-hair-final-demo.html` | 35 kB | 3 | 3 |
| `public/major-arcana-preview/steg5-offert-prp-skin-final-demo.html` | 35 kB | 3 | 3 |
| `public/major-arcana-preview/steg5-offert-tp-final-demo.html` | 35 kB | 4 | 3 |
| `public/major-arcana-preview/steg6-auto-betanketid-final-demo.html` | 35 kB | 9 | 8 |
| `public/major-arcana-preview/steg6-betanketid-samtycke-final-demo.html` | 36 kB | 9 | 8 |
| `public/major-arcana-preview/steg7-offert-microneedling-final-demo.html` | 45 kB | 5 | 4 |
| `public/major-arcana-preview/steg7-offert-prf-final-demo.html` | 45 kB | 5 | 4 |
| `public/major-arcana-preview/steg7-offert-profilo-final-demo.html` | 45 kB | 5 | 4 |
| `public/major-arcana-preview/steg7-offert-prp-hair-final-demo.html` | 43 kB | 5 | 4 |
| `public/major-arcana-preview/steg7-offert-prp-skin-final-demo.html` | 43 kB | 5 | 4 |
| `public/major-arcana-preview/steg7-v6-kundkort-final-demo.html` | 45 kB | 12 | 11 |
| `public/major-arcana-preview/steg8-fore-efter-bildmall-final-demo.html` | 48 kB | 6 | 5 |
| `public/major-arcana-preview/steg8-friskforsakran-final.html` | 49 kB | 10 | 10 |
| `public/major-arcana-preview/steg8-journal-prp-multi-final-demo.html` | 63 kB | 6 | 6 |
| `public/major-arcana-preview/steg8-journal-tp-final-demo.html` | 79 kB | 7 | 7 |
| `public/major-arcana-preview/steg8-journal-tp-follow-12-final-demo.html` | 47 kB | 6 | 6 |
| `public/major-arcana-preview/steg8-journal-tp-follow-4-final-demo.html` | 53 kB | 6 | 6 |
| `public/major-arcana-preview/steg8-journal-tp-follow-6-final-demo.html` | 53 kB | 6 | 6 |
| `public/major-arcana-preview/steg8-journal-tp-post-prp-final-demo.html` | 65 kB | 6 | 6 |
| `public/major-arcana-preview/steg8-ordination-recept-final-demo.html` | 33 kB | 2 | 1 |
| `public/major-arcana-preview/steg8-ordination-tp-final-demo.html` | 50 kB | 8 | 7 |
| `public/major-arcana-preview/steg9-foto-samtycke-final-demo.html` | 33 kB | 9 | 8 |
| `public/mobile-capture.html` | 36 kB | 2 | 1 |
| `public/operator-dashboard.html` | 14 kB | 7 | 9 |
| `public/patient-hub.html` | 3 kB | 4 | 17 |
| `public/patient-portal-chat.html` | 10 kB | 2 | 2 |
| `public/patient-portal.html` | 36 kB | 11 | 19 |
| `public/patient/curatiio.html` | 12 kB | 4 | 66 |
| `public/patient/index.html` | 14 kB | 132 | 419 |
| `public/patientinformation-hartransplantation-dhi-prp-minimal.html` | 13 kB | 7 | 6 |
| `public/patientinformation-ogonlocksplastik-curatiio.html` | 46 kB | 4 | 3 |
| `public/personal-demo.html` | 33 kB | 26 | 20 |
| `public/photo-review.html` | 0 kB | 49 | 45 |
| `public/staff-portal.html` | 253 kB | 6 | 10 |
| `public/svarstudio-v2.html` | 414 kB | 5 | 1 |
| `public/torti-ritual/index.html` | 6 kB | 132 | 419 |
| `public/uppfoljning/index.html` | 32 kB | 132 | 419 |
| `public/uppfoljning/omdome.html` | 8 kB | 4 | 7 |

## underlag (22)

| Fil | Storlek | Kod-ref | Docs-ref |
|---|---|---|---|
| `public/major-arcana-preview/cco-admin-v3.html` | 75 kB | 0 | 1 |
| `public/major-arcana-preview/cco-after-meeting-v3.html` | 50 kB | 0 | 1 |
| `public/major-arcana-preview/cco-ai-coach-v3.html` | 41 kB | 0 | 1 |
| `public/major-arcana-preview/cco-ai-triage-v3.html` | 65 kB | 0 | 1 |
| `public/major-arcana-preview/cco-drive-historik-v3.html` | 47 kB | 0 | 1 |
| `public/major-arcana-preview/cco-finance-v3.html` | 41 kB | 0 | 1 |
| `public/major-arcana-preview/cco-finansrapporter-v3.html` | 46 kB | 0 | 1 |
| `public/major-arcana-preview/cco-import-review-v3.html` | 45 kB | 0 | 1 |
| `public/major-arcana-preview/cco-journal-qa-v3.html` | 56 kB | 0 | 1 |
| `public/major-arcana-preview/cco-journal-safety-v3.html` | 39 kB | 0 | 1 |
| `public/major-arcana-preview/cco-journalbygge-v3.html` | 47 kB | 0 | 1 |
| `public/major-arcana-preview/cco-kunder-v11.html` | 46 kB | 0 | 1 |
| `public/major-arcana-preview/cco-morning-checklist-v3.html` | 39 kB | 0 | 1 |
| `public/major-arcana-preview/cco-operator-dashboard-v3.html` | 36 kB | 0 | 1 |
| `public/major-arcana-preview/cco-ops-workbench-v3.html` | 72 kB | 0 | 1 |
| `public/major-arcana-preview/cco-patient-portal-v3.html` | 56 kB | 0 | 1 |
| `public/major-arcana-preview/cco-personal-start-v3.html` | 50 kB | 0 | 1 |
| `public/major-arcana-preview/cco-photo-review-v3.html` | 52 kB | 0 | 1 |
| `public/major-arcana-preview/cco-presenter-mode-v3.html` | 51 kB | 0 | 1 |
| `public/major-arcana-preview/cco-review-warning-v3.html` | 39 kB | 0 | 1 |
| `public/major-arcana-preview/cco-staff-go-live-v3.html` | 59 kB | 0 | 1 |
| `public/major-arcana-preview/cco-staff-training-v3.html` | 45 kB | 0 | 1 |

## kandidat (2)

| Fil | Storlek | Kod-ref | Docs-ref |
|---|---|---|---|
| `public/major-arcana-preview/cco-patient-offer-portal-v1.html` | 42 kB | 0 | 0 |
| `public/major-arcana-preview/cco-patient-offer-portal-v2.html` | 43 kB | 0 | 0 |

## arbetsfil_utanfor_git (2)

| Fil | Storlek | Kod-ref | Docs-ref |
|---|---|---|---|
| `public/installningar-arkiv.html` | 67 kB | 0 | 0 |
| `public/staff-portal-desktop.html` | 240 kB | 0 | 0 |

---

### Underlag-referens

Alla `underlag`-filer nämns i `docs/strategy/CCO-V3-SURFACE-STRATEGY-2026-06-26.md` (42 byggda v3-ytor).
Offer-portal-v1/v2 ersattes av `cco-patient-offer-portal-v3.html` (serveras av `src/routes/ccoCommercial.js:193`).
De två `arbetsfil_utanfor_git`-filerna är ocommittade arbetsfiler (Kimi 2026-08-22) — besluta committa eller radera separat.
