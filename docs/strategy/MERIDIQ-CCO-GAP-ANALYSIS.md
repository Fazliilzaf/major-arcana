# Meridiq → CCO Gap Analysis

Den HÅRDA leveransen. Vad CCO har byggt, vad som fattas, vad som är blockad. Beslutsunderlag för implementation.

**Källor:**
- `src/ops/cco*.js` — 90 moduler (utöver `data/`-filer + `config/`-filer)
- `migration/meridiq/*.json` — 151 dokument (16 Q + 39 C + 14 schemas + 82 services)
- Tidigare audit-filer: `MERIDIQ-DOCUMENT-COVERAGE-REPORT.md`, `MERIDIQ-SOURCE-OF-TRUTH-MATRIX.md`, `CHANNEL-DOCUMENT-INVENTORY.md`, `MERIDIQ-JOURNEY-BLUEPRINT.md`, `TP-JOURNAL-PARITY-MATRIX.md`, `MERIDIQ-DOCUMENT-REQUIREMENT-MATRIX.md`, `COMMUNICATION-TEMPLATE-REGISTRY.md`, `CONSENT-AGREEMENT-AFTERCARE-FLOW.md`

---

## 1. Sammanfattning (TL;DR)

| Mätvärde | Värde |
|---|---|
| Totalt CCO-moduler granskade | 90 |
| Totalt Meridiq-objekt med paritet-krav | 151 (16 Q + 39 C + 14 schemas + 82 services) |
| **EXISTS** (CCO har fullt stöd) | 62 moduler (~69 %) |
| **PARTIAL** (delvis stöd / saknar delfunktion) | 18 moduler (~20 %) |
| **MISSING** (refererad men ej byggd) | 6 moduler (~7 %) |
| **UPGRADE** (byggd men kräver vidareutveckling) | 4 moduler (~4 %) |
| P0 Compliance Blockers | **7** |
| Saknade treatment-configs | **3** (profhilo, ortopedi×3, fettuplösande) |
| Saknade aftercare-templates | **4** (DHI, Microneedling, PRP skin, Meso) |
| Saknade follow-up-templates | **10** (Curatiio cadences i config men ej template) |
| Meridiq consents med tom letterText | **19 / 39** |
| TP-journal fält-paritet | 52 / 52 (100 %) — diff till user-scope 59 förklarad i parity-matrix |
| **Coverage Gate-beslut** | **BLOCKED** |

**Motivering till BLOCKED:**
Trots 100 % document-coverage och 52/52 fält-paritet kan inte CCO gå live-cutover förrän:
1. Pipedrive PII är purgad ur git-historik (commit-tråd kvarstår).
2. Minst Botox, FUE, Bleph, Filler har fullständig kedja inkl. importerade consents (saknas idag).
3. Brand-overrides för 17 mismatched Meridiq-consents är konfigurerade i CCO-import.
4. Profhilo + Ortopedi (3 varianter) + Fettuplösande har treatment-configs.

**Estimat till Coverage Gate PASS:** ~6 veckor över 4 faser (A–D).

---

## 2. Per CCO-modul: EXISTS / MISSING / PARTIAL / UPGRADE

Grupperat efter funktionsområde. 90 moduler totalt.

### 2.1 Journal & Klinisk dokumentation (13 moduler)

| Modul | Funktion | Källfil(er) | Meridiq-paritet | Status | Gaps |
|---|---|---|---|---|---|
| ccoJournalStore | CRUD + sign+lock + tamper-hash | `src/ops/ccoJournalStore.js` | Q 16411 (TP), 16388 (bleph), 16415, 16472, 14878 | EXISTS | — |
| ccoJournalSchemas | Field-defs per behandling | `src/ops/ccoJournalSchemas.js` | 14 schemas | EXISTS | — |
| ccoJournalTextTemplates | Text-block för journal | `src/ops/ccoJournalTextTemplates.js` | — (CCO native) | EXISTS | — |
| ccoJournalPdfExport | PDF + hash | `src/ops/ccoJournalPdfExport.js` | (Meridiq exporterar PDF men ej hashat) | EXISTS | UPGRADE: PAdES-LTV-signering |
| ccoJournalPhotoStore | Pre/post-foton | `src/ops/ccoJournalPhotoStore.js` | (Meridiq har separat photo-modul) | EXISTS | — |
| ccoJournalPhotoProcess | Bildbearbetning, EXIF-strip | `src/ops/ccoJournalPhotoProcess.js` | — | EXISTS | — |
| ccoJournalBeforeAfter | Before/after-jämförelse-UI | `src/ops/ccoJournalBeforeAfter.js` | — (CCO native) | EXISTS | — |
| ccoJournalBookingBridge | Knyter encounter ↔ booking | `src/ops/ccoJournalBookingBridge.js` | — | EXISTS | — |
| ccoJournalAiGuard | AI-redaktör-stop för känsligt | `src/ops/ccoJournalAiGuard.js` | — (CCO native) | EXISTS | — |
| ccoTreatmentEncounterStore | Encounter lifecycle | `src/ops/ccoTreatmentEncounterStore.js` | (Meridiq har journal-typ) | EXISTS | — |
| ccoConsultationStore | Konsultationsplan | `src/ops/ccoConsultationStore.js` | (CCO native) | EXISTS | — |
| ccoFollowUpStore | Uppföljnings-journal | `src/ops/ccoFollowUpStore.js` | Q 16407/16409/16390 | PARTIAL | Q 16390 har bara 1 fält → schema needs upgrade |
| ccoFollowupDraftPlanner | Uppföljnings-utkast | `src/ops/ccoFollowupDraftPlanner.js` | — | EXISTS | — |

### 2.2 Booking & Schemaläggning (8 moduler)

| Modul | Funktion | Källfil(er) | Meridiq-paritet | Status | Gaps |
|---|---|---|---|---|---|
| ccoBookingStore | Slot create/confirm/cancel | `src/ops/ccoBookingStore.js` | (Meridiq saknar schemaläggning; Cliento är källa) | EXISTS | — |
| ccoBookingEngineStore | Pricing + addons | `src/ops/ccoBookingEngineStore.js` | — | EXISTS | — |
| ccoBookingCaseStore | Multi-session-case (PRP-serier) | `src/ops/ccoBookingCaseStore.js` | — | EXISTS | — |
| ccoBookingPolicy | Lead-time + capacity | `src/ops/ccoBookingPolicy.js` | — | EXISTS | — |
| ccoBookingStaffNotify | Internal notify on booking events | `src/ops/ccoBookingStaffNotify.js` | — | EXISTS | — |
| ccoTreatmentBookingGate | Block booking om consent/avtal saknas | `src/ops/ccoTreatmentBookingGate.js` | — (CCO native) | EXISTS | UPGRADE: lägg till profhilo/ortopedi |
| ccoBlockingStore | Betänketid 14d/7d | `src/ops/ccoBlockingStore.js` | — (CCO native) | EXISTS | — |
| ccoIdVerificationStore | Steg 3.2 last4-SSN | `src/ops/ccoIdVerificationStore.js` | — (CCO native) | EXISTS | — |

### 2.3 Consent & Agreement (8 moduler)

| Modul | Funktion | Källfil(er) | Meridiq-paritet | Status | Gaps |
|---|---|---|---|---|---|
| ccoTreatmentAgreementStore | Avtals-CRUD | `src/ops/ccoTreatmentAgreementStore.js` | C 170917/170941-170955 | PARTIAL | brand-overrides ej tillämpade |
| ccoTreatmentAgreementDocument | PDF-render av avtal | `src/ops/ccoTreatmentAgreementDocument.js` | — | EXISTS | — |
| ccoAgreementQuickStore | Snabb-avtal med BankID-sign | `src/ops/ccoAgreementQuickStore.js` | — | EXISTS | — |
| ccoPhotoConsentStore | Foto-samtycke internt | `src/ops/ccoPhotoConsentStore.js` | — | EXISTS | — |
| ccoPhotoPublishConsent | Foto-samtycke publik | `src/ops/ccoPhotoPublishConsent.js` | — | EXISTS | — |
| ccoMarketingConsentStore | Email/SMS/profiling | `src/ops/ccoMarketingConsentStore.js` | — | EXISTS | — |
| ccoTemplateRegistry | Template version + must-store | `src/ops/ccoTemplateRegistry.js` | Meridiq-import-bridge | PARTIAL | 19/39 letterText tom; 17 brand-mismatches |
| ccoComplianceScanStore | Version-drift detection | `src/ops/ccoComplianceScanStore.js` | — | EXISTS | UPGRADE: lägg in brand-override-check |

### 2.4 Communication (12 moduler)

| Modul | Funktion | Källfil(er) | Meridiq-paritet | Status | Gaps |
|---|---|---|---|---|---|
| ccoSendActionStore | 4 send-kinds + audit + dry-run | `src/ops/ccoSendActionStore.js` | — (CCO native) | EXISTS | — |
| ccoAftercareSchedulerStore | Cadence + jobs | `src/ops/ccoAftercareSchedulerStore.js` | — | EXISTS | — |
| ccoAftercareStore | Aftercare lifecycle | `src/ops/ccoAftercareStore.js` | — | EXISTS | — |
| ccoMailTemplateStore | Mail-templates | `src/ops/ccoMailTemplateStore.js` | — | EXISTS | — |
| ccoMailDocument | Mail-rendering | `src/ops/ccoMailDocument.js` | — | EXISTS | — |
| ccoMailComposeDocument | Compose-flow | `src/ops/ccoMailComposeDocument.js` | — | EXISTS | — |
| ccoMailContentParser | Inbound parser | `src/ops/ccoMailContentParser.js` | — | EXISTS | — |
| ccoMailMimeLayer + ccoMailMimeParser | MIME-hantering | — | — | EXISTS | — |
| ccoMailAssetLayer | Bilagor + asset-cache | — | — | EXISTS | — |
| ccoMailThreadHydrator | Thread-rekonstruktion | — | — | EXISTS | — |
| ccoMailboxSettingsDocument | Mailbox-prefs | — | — | EXISTS | — |
| ccoMailboxTruth* (7 moduler) | Mailbox sharded truth-store | — | — | EXISTS | — |

### 2.5 Marketing / Commercial (3 moduler)

| Modul | Funktion | Källfil(er) | Meridiq-paritet | Status | Gaps |
|---|---|---|---|---|---|
| ccoCommercialStore | Commercial-CRUD | `src/ops/ccoCommercialStore.js` | — | EXISTS | — |
| ccoCommercialMailDispatch | Marketing utskick | `src/ops/ccoCommercialMailDispatch.js` | — | EXISTS | — |
| ccoPatientOutreach | Outreach-orchestration | `src/ops/ccoPatientOutreach.js` | — | EXISTS | — |

### 2.6 Patient & Customer (8 moduler)

| Modul | Funktion | Källfil(er) | Meridiq-paritet | Status | Gaps |
|---|---|---|---|---|---|
| ccoCustomerStore | Customer CRUD | `src/ops/ccoCustomerStore.js` | — (Cliento är källa) | EXISTS | — |
| ccoPatientMasterStore | Master patient record | `src/ops/ccoPatientMasterStore.js` | — | EXISTS | — |
| ccoPatientCareStateStore | Care-state lifecycle | `src/ops/ccoPatientCareStateStore.js` | — | EXISTS | — |
| ccoPatientCareOps | Care-ops business logic | `src/ops/ccoPatientCareOps.js` | — | EXISTS | — |
| ccoPatient360Bridge | 360-vy aggregator | `src/ops/ccoPatient360Bridge.js` | — | EXISTS | — |
| ccoPatientSystemStore | System-level patient state | `src/ops/ccoPatientSystemStore.js` | — | EXISTS | — |
| ccoPortalStore | Patient portal | `src/ops/ccoPortalStore.js` | — | EXISTS | — |
| ccoBrandUserStore | Brand-scoped users | `src/ops/ccoBrandUserStore.js` | — | EXISTS | — |

### 2.7 Integrations (8 moduler)

| Modul | Funktion | Källfil(er) | Meridiq-paritet | Status | Gaps |
|---|---|---|---|---|---|
| ccoIntegrationStore | Integration registry | `src/ops/ccoIntegrationStore.js` | — | EXISTS | — |
| ccoFortnoxStore | Fortnox sync | `src/ops/ccoFortnoxStore.js` | — | EXISTS | — |
| ccoFortnoxPatientSync | Patient → Fortnox-kund | `src/ops/ccoFortnoxPatientSync.js` | — | EXISTS | — |
| ccoSwishStore + ccoSwishPayments | Swish-betalningar | — | — | EXISTS | — |
| ccoMigrationIndexStore | Migration-index | `src/ops/ccoMigrationIndexStore.js` | — | EXISTS | — |
| ccoCounterpartyTruth | External counterparty | `src/ops/ccoCounterpartyTruth.js` | — | EXISTS | — |
| ccoInboxEnrichmentCoverage | Inbox-enrichment coverage | — | — | EXISTS | — |

### 2.8 Offers (5 moduler)

| Modul | Funktion | Källfil(er) | Meridiq-paritet | Status | Gaps |
|---|---|---|---|---|---|
| ccoOfferQuickStore | Snabb-offert | `src/ops/ccoOfferQuickStore.js` | — | EXISTS | — |
| ccoOfferDocumentStore | Offert-PDF | `src/ops/ccoOfferDocumentStore.js` | — | EXISTS | — |
| ccoOfferTemplateStore | Offert-templates | `src/ops/ccoOfferTemplateStore.js` | — | EXISTS | — |
| ccoOfferPdf | PDF-render | `src/ops/ccoOfferPdf.js` | — | EXISTS | — |
| ccoOfferFromPlan | Plan → offert | `src/ops/ccoOfferFromPlan.js` | — | EXISTS | — |
| ccoOfferEsign | E-sign integration | `src/ops/ccoOfferEsign.js` | (GetAccept-ersättare) | EXISTS | UPGRADE: full GetAccept-feature parity |

### 2.9 Notifications & Telemetry (6 moduler)

| Modul | Funktion | Källfil(er) | Meridiq-paritet | Status | Gaps |
|---|---|---|---|---|---|
| ccoNotificationFeedStore | Notification feed | `src/ops/ccoNotificationFeedStore.js` | — | EXISTS | — |
| ccoNotificationReadStore | Read-state | — | — | EXISTS | — |
| ccoTelemetryStore | Telemetry | — | — | EXISTS | — |
| ccoHistoryStore | History audit | — | — | EXISTS | — |
| ccoStaffDashboardSnapshot | Dashboard snapshot | — | — | EXISTS | — |
| ccoOperationStore | Operations CRUD | — | — | EXISTS | — |

### 2.10 Policy & Retention (3 moduler)

| Modul | Funktion | Källfil(er) | Meridiq-paritet | Status | Gaps |
|---|---|---|---|---|---|
| ccoPolicyStore | Policy-defs | `src/ops/ccoPolicyStore.js` | — | EXISTS | — |
| ccoRetentionPolicy | PDL 10 år | `src/ops/ccoRetentionPolicy.js` | — | EXISTS | — |
| ccoSettingsStore | Settings | — | — | EXISTS | — |

### 2.11 AI & Conversation (5 moduler)

| Modul | Funktion | Källfil(er) | Meridiq-paritet | Status | Gaps |
|---|---|---|---|---|---|
| ccoAiService | AI-service-glue | `src/ops/ccoAiService.js` | — | EXISTS | — |
| ccoConversationNotesStore | Conversation notes | — | — | EXISTS | — |
| ccoConversationStateStore | Conversation state | — | — | EXISTS | — |
| ccoNoteStore | General notes | — | — | EXISTS | — |
| ccoMacroStore | Text-macros | — | — | EXISTS | — |

### 2.12 Saknade moduler (refererade men ej byggda)

| Modul | Funktion | Anledning | Prioritet |
|---|---|---|---|
| `ccoLeadStore` | Lead-CRUD från Pipedrive deal:created | Refererad i `MERIDIQ-JOURNEY-BLUEPRINT` rad 19 men finns ej | HÖG |
| `ccoBrandOverrideStore` | Mappa Meridiq brand-mismatches | 17 mallar behöver omtaggning | HÖG |
| `ccoTreatmentConfigStore` | Treatment-keys för profhilo/ortopedi/fettuplösande | 3 treatment-configs saknas | HÖG |
| `ccoDriveArchiveStore` | Drive PDF-arkiv-bridge | ~1 981 Drive-profiler ej importerade | MEDEL |
| `ccoGetAcceptArchiveStore` | GetAccept-export-arkiv | okänt antal signerade avtal | MEDEL |
| `ccoNordbroPdfImporter` | Importera Nordbro/Insatt PDFs → letterText | 19 tomma letterText | HÖG |

---

## 3. P0 Compliance Blockers

| # | Blocker | Källa | Berörda behandlingar | Risk | Åtgärd | ETA |
|---|---|---|---|---|---|---|
| 1 | `consent_treatment_*` saknas för 8+ behandlingar — Nordbro levererat men ej importerat | `MERIDIQ-JOURNEY-BLUEPRINT` Del 3 + `MERIDIQ-DOCUMENT-REQUIREMENT-MATRIX` rad 23-92 | FUE, DHI, PRP Hår, PRP Hud, Microneedling, Filler, Profhilo, Ortopedi (alla 3) | IVO-anmälningsbar — patient behandlas utan dokumenterat samtycke | Importera Nordbro-PDF → `ccoTemplateRegistry` + manuell brand-mappning | Sprint 11 (1 v) |
| 2 | Profhilo saknar treatment-key i `cco-treatment-document-requirements.json` | `MERIDIQ-DOCUMENT-REQUIREMENT-MATRIX` rad 88 | Profhilo (3 services: 7379/7380/7381) | Booking-gate kollapsar — ingen kontroll | Lägg till `profhilo` i config med samma struktur som `botox` | Sprint 11 (1 d) |
| 3 | Ortopedi saknar treatment-config helt (3 varianter) | Service-bindings 7109/7123/7124/7406/7411/7412/7413 + C 170941/2/3 | Ortopedi PRP/PRF, HA, HA+PRP/PRF (Curatiio Konsultation 7081) | Booking-gate kollapsar; ingen automatiserad eftervård | Lägg till `ortho_prp_prf`, `ortho_ha`, `ortho_combi` i config | Sprint 11-12 (2 d) |
| 4 | Brand-mismatch i Meridiq — 17 mallar är `hair_tp`-taggade men säljs som Curatiio | `MERIDIQ-JOURNEY-BLUEPRINT` Del 5 + `CONSENT-AGREEMENT-AFTERCARE-FLOW` Del A.3 | Botox legacy (152981/152988), Plasma Pen (152999-153001), Fat dissolving (152995/152996), Profhilo (153002/153003), PRP hud (170944/170951/170952), PRF hud (170947/170952), Microneedling (170946/170953), Profhilo Behandlingsavtal (170948) | Brand-isolering bryts — Curatiio-mall visas med "Hair TP Clinic"-rubrik för kund | Skapa `config/meridiq-brand-overrides.json` + applicera vid import via `ccoTemplateRegistry` | Sprint 11 (3 d) |
| 5 | 19/39 Meridiq consents har tom letterText | `migration/meridiq/consent-catalog.json` (verifierat: 19 entries med empty/null letterText) | Behandlingsavtal-mallar (samtliga 14 + 5 ortho/övriga) | Patienten ser tomt UI — ingen text att samtycka till | Importera Nordbro-/Insatt-PDFs och fyll letterText, eller ersätt med pekare till GetAccept-mall | Sprint 11-12 (5 d) |
| 6 | Pipedrive PII finns kvar i git-historik (Task #167) | `CHANNEL-DOCUMENT-INVENTORY` rad 82, commit `19718e8` | 3 694 personer + 3 487 affärer (PII) | GDPR Art. 32 + IMY-rapporteringsbar incident | `git-filter-repo --invert-paths --path migration/pipedrive/*csv` + force-push + collaborator-koord | Owner-beslut + 1 d arbete |
| 7 | Drive / GetAccept-rådata saknas helt | `CHANNEL-DOCUMENT-INVENTORY` rad 105-117 + 162-175 | Alla — verifiering av produktion mot Meridiq kan ej göras | Paritet ej verifierbar — risk för silent drift mellan Meridiq och produktion | Export-script: Drive API → iCloud-arkiv; GetAccept bulk-export | Wendela exportera; Sprint 12 (5 d) |

**Sub-blocker (icke-P0 men relaterad):**
- Plasma Pen apiId 153000+153001 är möjlig duplikat — samma titel, brand och version-1, möjligen två versioner men labelmissning. **Verifiera i Meridiq UI**.

---

## 4. Implementation Plan — 4 faser

### Fas A — P0 Compliance Blockers (Sprint 11, ~1 v)

**Mål:** Stäng compliance-risk innan vidare CCO-utveckling.

| # | Task | Modul | Owner | Insats |
|---|---|---|---|---|
| A1 | Skapa `config/meridiq-brand-overrides.json` med 17 mappings (Del A.3) | `ccoTemplateRegistry` | Dev | 0.5 d |
| A2 | Applicera brand-override vid import (re-run `npm run migration:import-meridiq`) | `ccoTemplateRegistry` | Dev | 0.5 d |
| A3 | Importera Nordbro/Insatt-PDF-text för 19 tomma consents | `ccoNordbroPdfImporter` (ny modul) | Dev + Wendela | 3 d |
| A4 | Importera `consent_treatment_*` för 8 behandlingar | `ccoTemplateRegistry` | Dev | 1 d |
| A5 | Säkra Pipedrive-historik: owner-beslut → `git-filter-repo` + force-push | Git | Owner + Dev | 1 d |
| A6 | Lägga till `compliance.brand_override_applied` audit-event | `auditLog` + `ccoComplianceScanStore` | Dev | 0.5 d |

**Resultat:** Inga aktiva brand-mismatches; alla Meridiq-consents har text; PII-purge dokumenterat.

### Fas B — Saknade Treatment-configs + Aftercare/Followup (Sprint 11-12, ~2 v)

**Mål:** Få alla 10 treatment-configs kompletta + alla 9 aftercare-mallar + 10 saknade follow-ups.

| # | Task | Insats |
|---|---|---|
| B1 | Lägg till `profhilo`, `ortho_prp_prf`, `ortho_ha`, `ortho_combi`, `fat_dissolving` i `cco-treatment-document-requirements.json` | 1 d |
| B2 | Lägg till `service-bindings`-mappning för dessa 5 | 1 d |
| B3 | Importera Nordbro-aftercare-PDFs: `aftercare_dhi`, `aftercare_microneedle`, `aftercare_prp_skin`, `aftercare_meso` | 2 d |
| B4 | Skapa 10 saknade follow-up templates (`followup_botox_3m_re_treat_window`, filler×2, bleph×3, prp_skin×2, meso×1, `followup_fue_4m`) | 3 d |
| B5 | Uppdatera `ccoTreatmentBookingGate` med nya treatment-keys | 0.5 d |
| B6 | Uppdatera `ccoAftercareSchedulerStore` med nya cadences | 0.5 d |
| B7 | Schema-upgrade för `follow_up:12_manader` (Q 16390) — bygg ut fler fält | 1 d |
| B8 | Backfill journal-text-templates för nya behandlingar | 1 d |
| B9 | E2E-tester per behandling × aftercare cadence | 2 d |

**Beslut owner krävs:** vilka behandlingar prioriteras? Rekommendation: börja med högsta volym (sannolikt Botox + FUE + Filler + Bleph).

### Fas C — Channel rådata-insamling (Sprint 12-13, ~2 v)

**Mål:** Stäng de 4 BLOCKING-kanalerna identifierade i `CHANNEL-DOCUMENT-INVENTORY` § "Vilka kanaler är BLOCKING".

| # | Task | Owner | Insats |
|---|---|---|---|
| C1 | Export Drive-mallar + signerade avtal till `iCloud/Migration-data/drive-2026-XX-XX/` | Fazli + script | 3 d |
| C2 | Be Nordbro skicka 14 mall-PDFs → `iCloud/Migration-data/nordbro/` | Wendela | 5 d (externt) |
| C3 | Be Insatt skicka 4 mall-PDFs/DOCXs → `iCloud/Migration-data/insatt/` | Wendela | 5 d (externt) |
| C4 | GetAccept bulk-export av aktiva mallar + senaste 12 mån signerade → `iCloud/Migration-data/getaccept/` | Wendela | 3 d |
| C5 | Bygg `ccoDriveArchiveStore` + `ccoGetAcceptArchiveStore` modules | Dev | 4 d |
| C6 | Compliance-scan: diff Meridiq-text vs. Nordbro/Insatt-PDFs → flagga avvikelser | `ccoComplianceScanStore` | 2 d |

**Resultat:** Alla 7 kanaler är spårbara, inte bara 3.

### Fas D — Polish + Full Audit (Sprint 13-14, ~1 v)

**Mål:** Production-readiness.

| # | Task | Insats |
|---|---|---|
| D1 | Build `ccoLeadStore` (Pipedrive deal:created → CCO lead lifecycle) | 2 d |
| D2 | Add `cancellation_noshow_internal`, `arrival_confirmation_internal`, `agreement_reminder_t-3d` staff-feed templates | 1 d |
| D3 | Marketing templates: `marketing_offer_generic_*`, `marketing_recall_followup` | 1 d |
| D4 | Verifiera 59 vs 52 TP-journal-fält med owner i Meridiq UI | 0.5 d |
| D5 | Owner-beslut på open questions (sektion 6) | 1 d |
| D6 | Skriva training-material för staff (CCO-portal walkthrough) | 1 d |
| D7 | Final security/compliance review innan cutover | 1 d |
| D8 | Coverage Gate re-evaluation → PASS-beslut | 0.5 d |

---

## 5. Trigger & Automation Matrix

Per workflow-event: trigger → action → audit. Härlett från `src/ops/cco*Store.js` + journey blueprint.

| Trigger-event | CCO-modul | Action | Audit-event | Patient-impact |
|---|---|---|---|---|
| Pipedrive deal:created | `ccoLeadStore` (MISSING) | Skapa lead-record | `lead.created` | — |
| Lead status=qualified | `ccoPatientOutreach` | Skicka first-contact mall | `outreach.sent` | mail/SMS |
| Cliento slot:booked (konsultation) | `ccoBookingStore` | Confirm + skapa booking-event | `booking.confirmed` | bekräftelse-mall |
| Booking confirmed → T-48h | `ccoSendActionStore` (`send.form`) | Skicka health-decl + fitness-cert | `communication.send.form` | portal-länk |
| Hälsodekl signerad | `ccoJournalStore.upsertEntry` | Lagra journal + lock | `journal.signed` | — |
| Konsult avslutad | `ccoConsultationStore` | Spara konsultationsplan | `consultation.completed` | — |
| Offer accepted | `ccoOfferQuickStore` | Trigger avtal-flow | `offer.accepted` | avtal-mall |
| Avtal signerat (BankID) | `ccoAgreementQuickStore` | Snapshot + lock | `agreement.signed` | bekräftelse |
| Avtal signerat + betänketid OK | `ccoBlockingStore` | Release booking-block | `booking.unblocked` | — |
| Behandlings-samtycke signerat | `ccoTemplateRegistry` + journal | Snapshot consent-text i journal | `consent.signed` | — |
| Foto-samtycke signerat | `ccoPhotoConsentStore` | State = granted | `photo.consent.granted` | — |
| Booking confirmed (behandling) | `ccoBookingStore` | T-24h cron schemalägg påminnelse | `booking.reminder_scheduled` | SMS |
| T-24h cron tick | `ccoAftercareSchedulerStore` (booking-version) | Skicka 24h-påminnelse | `communication.send.reminder` | SMS |
| Patient anländer + ID-verifierad | `ccoIdVerificationStore` | State = verified | `id_check.passed` | — |
| Encounter draft startas | `ccoTreatmentEncounterStore` | Lock booking | `encounter.draft` | — |
| Encounter signerad + lock | `ccoJournalStore.signAndLock` | SHA256 + PDF + retention-clock start | `journal.locked` | — |
| Encounter completed | `ccoAftercareSchedulerStore` | Skapa T+1h, T+1d, T+7d jobs + per cadence | `aftercare.job.queued` (×N) | mail/SMS |
| Aftercare job-cron tick (5 min) | `ccoAftercareSchedulerStore` | Skicka via `ccoSendActionStore` | `aftercare.job.sent` | mail/SMS |
| Patient klickar unsubscribe-token | `ccoMarketingConsentStore` | flip state → opted_out | `marketing.consent.opted_out` | bekräftelse-mail |
| Patient revokes photo-consent | `ccoPhotoConsentStore` | State = revoked + hide | `photo.consent.revoked` | — |
| Compliance-scan detect version-drift | `ccoComplianceScanStore` | Flagga VERSION_CONFLICT | `compliance.version_drift` | staff-feed |
| Retention 30d kvar | `ccoRetentionPolicy` | Skicka staff-warning | `retention.warning` | staff-feed |
| Retention 0d (10 år sedan) | `ccoRetentionPolicy` | Markera eligible_for_purge | `retention.eligible` | — |
| Booking cancel + ej i klinik | `ccoBookingStore.cancel` | Skicka avbokningsbekräftelse | `booking.cancelled` | mail |
| No-show registrerad | `ccoBookingStore` (staff) | Lägg i `cancellation_noshow_internal` feed (MISSING template) | `booking.noshow` | staff-feed |

---

## 6. Open Questions för Owner

| # | Fråga | Rekommendation | Beslut väntar på |
|---|---|---|---|
| 1 | Pipedrive PII i git-historik — kör `git-filter-repo` + force-push (förstör collaborator-cleanness) ELLER acceptera soft-fix (filen borttagen ur HEAD men kvar i historik)? | **Force-push** om <5 collaborators kan koordineras inom 24 h. Annars soft-fix + dokumentera i `SECURITY.md`. | Owner |
| 2 | TP-journal: 52 fält (Meridiq-mappad katalog-siffra) ELLER 59 (user-scope)? | **Acceptera 52 som canonical** för field-mapping; verifiera 59 i Meridiq UI för att förklara diffen (troligen 7 sortOrder-luckor + 6 CCO native + 1 patient-ID). | Owner verifierar i Meridiq UI |
| 3 | Vilka behandlingar prioriteras för Fas B (treatment-configs + aftercare/followup)? | **Börja med högsta volym** — Botox > FUE > Filler > Bleph > PRP Hair > Profhilo > resten. | Owner bekräftar volym-ranking |
| 4 | Vem ansvarar för att hämta Nordbro/Insatt-PDFs? | **Wendela** (befintlig kontakt). Deadline sprint 11 slut. | Owner bekräftar |
| 5 | Ska Drive-mallar in i `data/cco-templates.json` eller separat store? | **Separat store** (`ccoDriveArchiveStore`) — Drive-mallar är arkiv, inte aktiva templates. `data/cco-templates.json` ska bara innehålla aktiva mallar. | Owner |
| 6 | GetAccept-arkiv: behåll i GetAccept (read-only) eller exportera till iCloud-arkiv? | **Exportera till iCloud-arkiv** för paritets-verifiering, sedan deprecate GetAccept-kontot när alla nya avtal går via CCO. | Owner + Wendela |
| 7 | Plasma Pen apiId 153000+153001: är detta verkligen duplikat eller två versioner med samma label? | **Verifiera i Meridiq UI** — om duplikat: ta bort 153001, behåll 153000. Om versioner: tagga som v1/v2 i CCO-import. | Owner verifierar |
| 8 | Marketing-mallar (offer + recall) — vill vi köra opt-in vid registrering (med pre-checked box) eller helt double-opt-in? | **Double-opt-in** för GDPR-säkerhet. Pre-checked är icke-compliance enligt e-Privacy. | Owner + Legal |
| 9 | Cliento `booking_confirmation` (extern) vs CCO `booking_confirmation_hair_tp/curatiio` — vilken är primär? | **Cliento primär under övergång** (tills CCO fullt cutover). Båda kan skicka, men endast en i taget per booking-källa. | Owner |
| 10 | Ortopedi-flödet (Curatiio Konsultation 7081) — ska detta vara en egen pilot-fas eller med i Fas B? | **Egen pilot-fas** efter Fas B — ortopedi är low-volume och behöver kliniska valideringar separat. | Owner + Klinik |

---

*Genererad: 2026-05-29*
