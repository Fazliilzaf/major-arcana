# Communication Template Registry

Heltäckande register över alla kommunikationsmallar som ska finnas i CCO.

**Källor:**
- `data/cco-templates.json` — 77 templates (category-loss, men typer: transactional 5, patient_information 12, health_declaration 2, fitness_certificate 2, consent 43, agreement 2, aftercare 5, followup 6)
- `migration/meridiq/consent-catalog.json` — 39 mallar (varav 19 har tom `letterText` — Nordbro/Insatt-PDFs ej importerade)
- `migration/cliento-compact-export.json` + `docs/strategy/CLIENTO-INVENTORY.md` § 5.2 — bokningsbekräftelse, 4h/24h-påminnelse, avbokning, ICS
- `src/ops/ccoSendActionStore.js` — stödjer 4 send-kinds: `send.form`, `send.consent`, `send.file`, `send.encounter`
- `src/ops/ccoAftercareSchedulerStore.js` — cadence-parser (h/d/w/m), jobs-states queued/sent/cancelled/failed/skipped
- `src/ops/ccoMarketingConsentStore.js` — opt-in/opt-out + unsubscribe-token
- `config/cco-treatment-document-requirements.json` — 10 treatments × cadence

**Send-kinds som stöds idag (`ccoSendActionStore`):**
| Kind | Syfte | Audit-action |
|---|---|---|
| `send.form` | Formulärs-länk (hälsodeklaration/friskförsäkran/förbehandling) | `communication.send.form` |
| `send.consent` | Samtycke-länk (foto, GDPR, marketing) | `communication.send.consent` |
| `send.file` | Bifoga PDF/JPG/PNG/HEIC/DOCX till patient (DOCX = warn) | `communication.send.file` |
| `send.encounter` | Bekräftar booking + skapar behandlingstillfälle-länk | `communication.send.encounter` |

Dry-run om `RESEND_API_KEY` saknas eller `CCO_SEND_DRY_RUN=true`. Audit-event registreras ändå.

**Förkortningar:** `Y` = krav uppfyllt, `N` = ej tillämpligt, `pdl` = Patientdatalagen (10 år), `dist` = Distansavtalslag (14d), `art13` = GDPR Art. 13.

---

## 1. Pre-konsultation — info-utskick + portal-onboarding

| TemplateId | Brand | Trigger | Kanal | Mottagare | Merge-fält | Audit-krav | Journalnotering | CCO-status | Källa |
|---|---|---|---|---|---|---|---|---|---|
| `patient_info_consultation` | shared | Lead-status `qualified` → T-48h innan slot | email + portal | kund | firstName, date, time, brand, consultantName, clinicAddress | art13 | N (info-skickad-event) | EXISTS | Nordbro v2.0.0 |
| `patient_info_fue` | hair_tp | Offert accepterad (treatment=fue) | email + portal | kund | firstName, surgeryDate, preOpInstructions | art13 + must-store version | N (snapshot vid signering) | EXISTS | Nordbro v3.0.0 |
| `patient_info_dhi` | hair_tp | treatment=dhi | email + portal | kund | (samma som FUE + DHI-specifika instr.) | art13 + must-store | N | **PARTIAL** (saknar version-tracking) | Nordbro — version ej i `external-template-versions.json` |
| `patient_info_prp_hair` | hair_tp | treatment=prp_hair | email + portal | kund | sessionCount, sessionIndex | art13 | N | EXISTS | Nordbro v2.0.0 |
| `patient_info_microneedle` | hair_tp | treatment=microneedling_hair | email + portal | kund | sessionCount, addonPRP | art13 | N | **MISSING** | Nordbro — ej levererad |
| `patient_info_botox` | curatiio | treatment=botox | email + portal | kund | injectionAreas, brand=curatiio | art13 | N | EXISTS | Nordbro v2.0.0 |
| `patient_info_bleph` | curatiio | treatment=bleph | email + portal | kund | surgeryDate, eyelidArea | art13 | N | EXISTS | Nordbro v2.0.0 |
| `patient_info_filler` | curatiio | treatment=filler | email + portal | kund | productName, mlBooked | art13 | N | **MISSING** | Nordbro — ej levererad |
| `patient_info_profilho` | curatiio | treatment=profilho | email + portal | kund | productName | art13 | N | **MISSING** | Profhilo saknar treatment-key i config |
| `meridiq_prp_treatment_16412_hair_tp` | hair_tp | Meridiq Q 16412 — proxy-info till portal | portal | kund | (form-fields) | journal | Y (signed) | EXISTS | Meridiq Q-import |
| `meridiq_tp_treatment_16411_hair_tp` | hair_tp | Meridiq Q 16411 — TP-behandling-info | portal | kund | (52 form-fields) | journal | Y (signed) | EXISTS | Meridiq Q-import |
| `meridiq_bleph_treatment_16388_curatiio` | curatiio | Meridiq Q 16388 — bleph-info | portal | kund | (form-fields) | journal | Y (signed) | EXISTS | Meridiq Q-import |

---

## 2. Pre-behandling — hälsodeklaration + friskförsäkran + förbehandling

| TemplateId | Brand | Trigger | Kanal | Mottagare | Merge-fält | Audit-krav | Journalnotering | CCO-status | Källa |
|---|---|---|---|---|---|---|---|---|---|
| `health_declaration_hair_tp` | hair_tp | Konsult bokad → T-48h | portal | kund | firstName, consultDate, brand=hair_tp | journal + sign | Y (`health_declaration:hair_tp`) | EXISTS | Meridiq Q 16414 v3.0.0 |
| `health_declaration_curatiio` | shared | Konsult bokad (curatiio brand) | portal | kund | firstName, consultDate, brand | journal + sign | Y (`health_declaration:bleph` Q 16415 / `:ortho` Q 14878 / `:inj` Q 16472) | EXISTS | Meridiq Q 16415/14878/16472 v3.0.0 |
| `fitness_certificate_hair_tp` | hair_tp | Konsult avslutad, behandling bokad → T-48h | portal | kund | firstName, surgeryDate | journal + sign | Y (`fitness_certificate:hair_tp` Q 16413) | EXISTS | Insatt v2.0.0 + Meridiq Q 16413 |
| `fitness_certificate_curatiio` | curatiio | Behandling bokad (curatiio) | portal | kund | firstName, surgeryDate | journal + sign | Y (`fitness_certificate:curatiio_bleph` Q 16389) | EXISTS | Insatt v2.0.0 + Meridiq Q 16389 |
| `pre_treatment_instructions` (`send.form` payload `pre_treatment`) | shared | T-24h innan behandling | email + portal | kund | preOpChecklist | art13 + sign | N | EXISTS (i `FORM_TEMPLATES`) | CCO native |

---

## 3. Bokningsbekräftelse (Cliento + CCO)

| TemplateId | Brand | Trigger | Kanal | Mottagare | Merge-fält | Audit-krav | Journalnotering | CCO-status | Källa |
|---|---|---|---|---|---|---|---|---|---|
| `booking_confirmation_hair_tp` | hair_tp | Cliento slot booked / `ccoBookingStore.confirm` | email + sms | kund | firstName, date, time, resource | art13 | N (booking-event) | EXISTS | CCO native (mall 1.0.0) |
| `booking_confirmation_curatiio` | curatiio | Cliento slot booked (curatiio) | email + sms | kund | firstName, date, time, resource | art13 | N | EXISTS | CCO native |
| (Cliento native) bokningsbekräftelse SMS/mejl | hair_tp | Cliento slot booked (extern) | sms + email | kund | `#TIDPUNKT`, `#TJANST`, `#FORETAG` | art13 (Cliento ToS) | N | EXISTS (extern) | Cliento — INVENTORY § 5.2 |
| (Cliento native) ICS-kalenderinbjudan | hair_tp | Cliento slot booked | email | kund | ics-event | art13 | N | EXISTS (extern) | Cliento |
| `reschedule_confirmation` | shared | `ccoBookingStore.reschedule` | email + sms | kund | oldSlot, newSlot | art13 | N | EXISTS | CCO native |

---

## 4. Bokningspåminnelse 24h (+ 4h)

| TemplateId | Brand | Trigger | Kanal | Mottagare | Merge-fält | Audit-krav | Journalnotering | CCO-status | Källa |
|---|---|---|---|---|---|---|---|---|---|
| `booking_reminder_24h` | shared | T-24h cron | sms + email | kund | firstName, time, address | art13 | N (reminder-event) | EXISTS | CCO native (mall 1.0.0) |
| (Cliento native) Påminnelse 4h | hair_tp | Cliento cron, 4h innan | sms | kund | merge-tags Cliento | (Cliento ToS) | N | EXISTS (extern) | Cliento INVENTORY § 5.2 |
| (Cliento native) Påminnelse 24h | hair_tp | Cliento cron, 24h innan | sms | kund | merge-tags Cliento | art13 | N | EXISTS (extern) | Cliento |
| `booking_reminder_curatiio_24h` | curatiio | T-24h cron (curatiio) | sms + email | kund | firstName, time | art13 | N | **MISSING** | rekommenderad split från `shared`-mallen |

---

## 5. Avbokning

| TemplateId | Brand | Trigger | Kanal | Mottagare | Merge-fält | Audit-krav | Journalnotering | CCO-status | Källa |
|---|---|---|---|---|---|---|---|---|---|
| `cancellation_confirmation` | shared | `ccoBookingStore.cancel` | email | kund | firstName, reason, refundInfo | art13 | N (cancel-event) | EXISTS | CCO native |
| (Cliento native) Avbokningsbekräftelse | hair_tp | Cliento avbokning | email | kund | merge-tags Cliento | — | N | EXISTS (extern) | Cliento |
| `cancellation_noshow_internal` | shared | No-show registrerad av staff | (intern feed) | staff | patientRef, slot | audit | N | **MISSING** | CCO native — bör läggas till |

---

## 6. Behandlingsdag — in-clinic check + ID-verifiering

| TemplateId | Brand | Trigger | Kanal | Mottagare | Merge-fält | Audit-krav | Journalnotering | CCO-status | Källa |
|---|---|---|---|---|---|---|---|---|---|
| ID-verifiering (`staff_confirm_4_last_digits`) | shared | Ankomst | in-clinic | staff | last4SSN | audit | Y (`id_check`-event) | EXISTS | `ccoIdVerificationStore` Steg 3.2 |
| `arrival_confirmation_internal` | shared | Patient anländer + verifierad | (intern feed) | staff | patientRef, slot | audit | Y (arrival-event) | **MISSING** | CCO native — bör läggas till |
| Tamper-hash + PDF lock (Steg 7.1) | shared | `signAndLock` av encounter | system | journal | hash (sha256), encounterId | audit + sign | Y (lock-event) | EXISTS | `ccoJournalStore.signAndLock` |

---

## 7. Eftervård (1h / 1d / 7d post-encounter)

| TemplateId | Brand | Trigger | Kanal | Mottagare | Merge-fält | Audit-krav | Journalnotering | CCO-status | Källa |
|---|---|---|---|---|---|---|---|---|---|
| `aftercare_fue` | hair_tp | encounter completed (treatment=fue) → T+1h, +1d, +7d | email + portal | kund | firstName, surgeonName | art13 + must-store | N (aftercare-event) | EXISTS | Nordbro v3.0.0 |
| `aftercare_dhi` | hair_tp | encounter completed (treatment=dhi) | email + portal | kund | (samma) | art13 | N | **PARTIAL** (refererad i `cco-treatment-document-requirements.json` men ej i `cco-templates.json`) | Nordbro — saknas |
| `aftercare_prp_hair` | hair_tp | encounter completed (treatment=prp_hair) → T+1h, +1d | email + portal | kund | sessionIndex | art13 | N | EXISTS | Nordbro v2.0.0 |
| `aftercare_microneedle` | hair_tp | encounter completed (treatment=microneedling_hair) | email + portal | kund | (sessionIndex) | art13 | N | **MISSING** | Nordbro — ej levererad |
| `aftercare_botox` | curatiio | encounter completed (treatment=botox) → T+1h, +1d | email + portal | kund | firstName, brand | art13 | N | EXISTS | Nordbro v2.0.0 |
| `aftercare_filler` | curatiio | encounter completed (treatment=filler) | email + portal | kund | (product) | art13 | N | EXISTS | Nordbro v2.0.0 |
| `aftercare_bleph` | curatiio | encounter completed (treatment=bleph) → T+1h, +1d, +7d (suture-removal) | email + portal | kund | sutureRemovalDate | art13 | N | EXISTS | Nordbro v2.0.0 |
| `aftercare_prp_skin` | curatiio | encounter completed (treatment=prp_skin) | email + portal | kund | sessionIndex | art13 | N | **MISSING** | Nordbro — ej levererad |
| `aftercare_meso` | curatiio | encounter completed (treatment=mesotherapy) | email + portal | kund | sessionIndex | art13 | N | **MISSING** | Nordbro — ej levererad |
| `aftercare_1h_*` | shared | Generic T+1h SMS post-encounter | sms | kund | firstName | art13 | N (event) | EXISTS (`type=aftercare` i registry) | CCO native |

---

## 8. Uppföljning (1m / 3m / 6m / 12m + treatment-specifika)

| TemplateId | Brand | Trigger | Kanal | Mottagare | Merge-fält | Audit-krav | Journalnotering | CCO-status | Källa |
|---|---|---|---|---|---|---|---|---|---|
| `followup_fue_1m` | hair_tp | T+1m efter senaste FUE-encounter | email + portal | kund | firstName, surgeryDate, photoUploadLink | art13 + journal | Y (`follow_up:1_manad`) | EXISTS | CCO native |
| `followup_fue_3m` | hair_tp | T+3m | email + portal | kund | (samma) | art13 | Y | EXISTS | CCO native |
| `followup_fue_6m` | hair_tp | T+6m — Meridiq Q 16409 | email | kund | (samma) | art13 + journal | Y (`follow_up:6_manader`) | EXISTS | CCO + Meridiq Q 16409 v1.0.0 |
| `followup_fue_12m` | hair_tp | T+12m — Meridiq Q 16390 | email + portal | kund | (samma) | art13 + journal | Y (`follow_up:12_manader`) | EXISTS (PARTIAL — Q 16390 har bara 1 fält) | CCO + Meridiq |
| `followup_fue_4m` | hair_tp | T+4m — Meridiq Q 16407 | email + portal | kund | (samma) | art13 + journal | Y (`follow_up:4_manader`) | **MISSING** (cadence ej i `cco-treatment-document-requirements.json`) | Meridiq Q 16407 v1.0.0 |
| `followup_prp_hair_2w` | hair_tp | T+2v efter varje session | sms + email | kund | sessionIndex | art13 | N | EXISTS | CCO native |
| `followup_botox_2w_touchup_window` | curatiio | T+2v efter botox | email | kund | touchupSlotUrl | art13 | N | EXISTS | CCO native |
| `followup_botox_3m_re_treat_window` | curatiio | T+3m | email | kund | reBookUrl | art13 | N | **MISSING** | rekommenderad |
| `followup_filler_2w_check` | curatiio | T+2v | email | kund | firstName | art13 | N | **MISSING** | cadence finns i config |
| `followup_filler_12m_re_treat` | curatiio | T+12m | email | kund | reBookUrl | art13 | N | **MISSING** | cadence finns i config |
| `followup_bleph_7d_suture_removal` | curatiio | T+7d | sms + portal | kund | sutureRemovalSlot | art13 | N | **MISSING** | cadence finns i config |
| `followup_bleph_3m` | curatiio | T+3m | email | kund | firstName | art13 + journal | Y | **MISSING** | cadence finns i config |
| `followup_bleph_12m` | curatiio | T+12m | email | kund | firstName | art13 + journal | Y | **MISSING** | cadence finns i config |
| `followup_prp_skin_2w_after_each` | curatiio | T+2v efter varje session | email | kund | sessionIndex | art13 | N | **MISSING** | cadence finns i config |
| `followup_prp_skin_1m_after_final` | curatiio | T+1m efter sista session | email + portal | kund | firstName | art13 | N | **MISSING** | cadence finns i config |
| `followup_meso_1w_after_each` | curatiio | T+1v efter varje session | email | kund | sessionIndex | art13 | N | **MISSING** | cadence finns i config |
| `meridiq_follow_up_16407_hair_tp` | hair_tp | Meridiq Q 16407 4m portal | portal | kund | (form-fields) | journal | Y | EXISTS | Meridiq Q-import |
| `meridiq_follow_up_16409_hair_tp` | hair_tp | Meridiq Q 16409 6m portal | portal | kund | (form-fields) | journal | Y | EXISTS | Meridiq Q-import |
| `meridiq_follow_up_16390_hair_tp` | hair_tp | Meridiq Q 16390 12m portal | portal | kund | (form-fields) | journal | Y | EXISTS | Meridiq Q-import |

---

## 9. Intern notis (staff-only) — interna feeds, ingen patient-kanal

| TemplateId | Brand | Trigger | Kanal | Mottagare | Merge-fält | Audit-krav | Journalnotering | CCO-status | Källa |
|---|---|---|---|---|---|---|---|---|---|
| Booking staff-notify | shared | Booking created/modified/cancelled | internal feed | staff | bookingDetails | audit | N | EXISTS | `ccoBookingStaffNotify` |
| `notification_feed:journal_lock` | shared | `signAndLock` | internal feed | staff | encounterId, signedBy | audit | Y (lock-event) | EXISTS | `ccoNotificationFeedStore` |
| `notification_feed:consent_revoked` | shared | Patient revokes consent | internal feed | staff | customerId, channel | audit | Y | EXISTS | `ccoNotificationFeedStore` + `ccoMarketingConsentStore` |
| `notification_feed:compliance_violation` | shared | `ccoComplianceScanStore` detects version-drift | internal feed | staff | templateId, current vs. expected | audit | N | EXISTS | `ccoComplianceScanStore` |
| `notification_feed:photo_publish_change` | shared | Photo publish state changed | internal feed | staff | customerId, status | audit | Y | EXISTS | `ccoPhotoPublishConsent` |
| `notification_feed:retention_warning` | shared | Retention 30 dagar kvar | internal feed | staff | customerId, lastActivityAt | audit | N | EXISTS | `ccoRetentionPolicy` |

---

## 10. Marketing (opt-in / opt-out)

| TemplateId | Brand | Trigger | Kanal | Mottagare | Merge-fält | Audit-krav | Journalnotering | CCO-status | Källa |
|---|---|---|---|---|---|---|---|---|---|
| `consent_marketing` | shared | Patient opt-in vid registrering eller send | portal + email | kund | unsubscribeToken | art13 + opt-in-log | N (consent-event) | EXISTS | Nordbro v1.0.0 |
| `marketing_offer_generic_hair_tp` | hair_tp | Marketing campaign trigger | email + sms | kund | offer, unsubscribeUrl | art13 + opt-in check | N | **MISSING** | bör läggas till för commercial-flöde |
| `marketing_offer_generic_curatiio` | curatiio | Marketing campaign trigger | email + sms | kund | offer, unsubscribeUrl | art13 | N | **MISSING** | bör läggas till |
| `marketing_unsubscribe_confirmation` | shared | Patient klickar unsubscribe-token | email | kund | unsubscribedChannel | audit | Y (revocation-event) | EXISTS (i `ccoMarketingConsentStore` flow) | CCO native |
| `marketing_recall_followup` | shared | Cadence-baserad recall (LTV) | email | kund | suggestedTreatment | art13 + opt-in check | N | **MISSING** | bör läggas till |

---

## 11. Legal / compliance — avtals-påminnelse, foto-consent-förfrågan

| TemplateId | Brand | Trigger | Kanal | Mottagare | Merge-fält | Audit-krav | Journalnotering | CCO-status | Källa |
|---|---|---|---|---|---|---|---|---|---|
| `agreement_hair_tp_generic` | hair_tp | Avtalsfas → behandling bokad | portal + email | kund | brand, treatment, prisplan | legal review + sign | N (snapshot) | EXISTS | Insatt v4.0.0 |
| `agreement_curatiio_generic` | curatiio | Avtalsfas | portal + email | kund | (samma) | legal review + sign | N (snapshot) | EXISTS | Insatt v4.0.0 |
| `agreement_reminder_t-3d` | shared | Offert/avtal osignerat 3d innan slot | email + sms | kund | signUrl, agreementVersion | art13 + sign | N | **MISSING** | bör läggas till |
| `consent_photo_internal` | shared | Pre-treatment kit | portal | kund | brand | art13 + sign + version-snapshot | Y | EXISTS | Nordbro v2.0.0 |
| `consent_photo_publish` | shared | Showcase-flag eller separat förfrågan | portal + email | kund | usageDuration, channels | art13 + sign + version-snapshot | Y | EXISTS | Nordbro v2.0.0 |
| `consent_treatment_fue` | hair_tp | Pre-treatment efter betänketid OK | portal + email | kund | (treatment-specifik text) | sign + version-snapshot + journal | Y (snapshot) | EXISTS | Meridiq C 170917 v1.0.0 |
| `meridiq_consent_behandlingsavtal_tp_170917` | hair_tp | (samma som ovan, men direkt-mappad mall) | portal + email | kund | (text) | sign + journal | Y | EXISTS | Meridiq C 170917 |
| `meridiq_consent_behandlingsavtal_ortopedisk_prp_prf_170941` | curatiio | Ortopedi PRP/PRF behandling | portal + email | kund | (text) | sign + journal | Y | EXISTS | Meridiq C 170941 |
| `meridiq_consent_behandlingsavtal_ortopedisk_ha_170942` | curatiio | Ortopedi HA | portal + email | kund | (text) | sign + journal | Y | EXISTS | Meridiq C 170942 |
| `meridiq_consent_behandlingsavtal_ortopedisk_ha_och_prp_prf_170943` | curatiio | Ortopedi HA+PRP/PRF | portal + email | kund | (text) | sign + journal | Y | EXISTS | Meridiq C 170943 |
| `meridiq_consent_behandlingsavtal_prp_hud_170944` | hair_tp | PRP hud | portal + email | kund | (text) | sign + journal | Y | EXISTS | Meridiq C 170944 (brand-mismatch — säljs som curatiio) |
| `meridiq_consent_behandlingsavtal_prp_har_170945` | hair_tp | PRP hår | portal + email | kund | sessionCount | sign + journal | Y | EXISTS | Meridiq C 170945 |
| `meridiq_consent_behandlingsavtal_microneedling_och_prp_170946` | hair_tp | Microneedling + PRP | portal + email | kund | (text) | sign + journal | Y | EXISTS | Meridiq C 170946 (brand-mismatch) |
| `meridiq_consent_behandlingsavtal_prf_hud_170947` | hair_tp | PRF hud | portal + email | kund | (text) | sign + journal | Y | EXISTS | Meridiq C 170947 |
| `meridiq_consent_behandlingsavtal_profilho_170948` | hair_tp | Profhilo | portal + email | kund | (text) | sign + journal | Y | EXISTS (brand-mismatch — säljs som curatiio) | Meridiq C 170948 |
| `meridiq_consent_behandlingsavtal_botulinumtoxin_botox_170949` | curatiio | Botox | portal + email | kund | injectionAreas | sign + journal | Y | EXISTS | Meridiq C 170949 |
| `meridiq_consent_behandlingsavtal_fillers_170950` | curatiio | Filler | portal + email | kund | productName, ml | sign + journal | Y | EXISTS | Meridiq C 170950 |
| `meridiq_consent_behandlingsavtal_prp_hud_curatiio_170951` | hair_tp | PRP hud Curatiio | portal + email | kund | (text) | sign + journal | Y | EXISTS (brand-mismatch i Meridiq — `hair_tp` tagg, säljs som curatiio) | Meridiq C 170951 |
| `meridiq_consent_behandlingsavtal_prf_hud_curatiio_170952` | hair_tp | PRF hud Curatiio | portal + email | kund | (text) | sign + journal | Y | EXISTS (brand-mismatch) | Meridiq C 170952 |
| `meridiq_consent_behandlingsavtal_prp_och_microneedling_curatiio_170953` | hair_tp | PRP + Microneedling Curatiio | portal + email | kund | (text) | sign + journal | Y | EXISTS (brand-mismatch) | Meridiq C 170953 |
| `meridiq_consent_behandlingsavtal_ogonlocksplastik_170954` | curatiio | Bleph | portal + email | kund | eyelidArea, surgeryDate | sign + journal | Y | EXISTS | Meridiq C 170954 |
| `meridiq_consent_samtycke_vid_bokning_inom_14_dagar_154369` | hair_tp | Bokning inom 14d distans-betänketid | portal + email | kund | originalSlotDate | sign | Y (ångerrätt-event) | EXISTS | Meridiq C 154369 |
| `meridiq_consent_begaran_och_samtycke_till_att_behandling_paborjas_under_angerfristen_14_dagar_170955` | hair_tp | Begäran att starta under ångerfrist | portal + email | kund | startDate | sign + legal | Y | EXISTS | Meridiq C 170955 |
| Legacy SWE/ENG behandlingsspecifika consents (152981-153040) | varierar | Pre-behandling per metod (legacy-väg) | portal + email | kund | (text per behandling) | sign + journal | Y | EXISTS (21 st) men **19 har tom `letterText`** | Meridiq C 152981-153040 |

---

## Saknade mallar i CCO (sammanfattning)

Mallar som **finns i Cliento/Meridiq/Nordbro/Insatt eller refereras i config** men inte är registrerade i `cco-templates.json`:

| TemplateId | Behov | Källa | Prioritet |
|---|---|---|---|
| `aftercare_dhi` | Refererad i `cco-treatment-document-requirements.json` → DHI | Nordbro (ej levererad) | HÖG (kirurgi) |
| `aftercare_microneedle` | Refererad i config → microneedling_hair | Nordbro | HÖG |
| `aftercare_prp_skin` | Refererad i config → prp_skin | Nordbro | HÖG |
| `aftercare_meso` | Refererad i config → mesotherapy | Nordbro | MEDEL |
| `patient_info_dhi` | Refererad i config (DHI) men `external-template-versions.json` saknar version | Nordbro | HÖG |
| `patient_info_microneedle` | Refererad i config | Nordbro | HÖG |
| `patient_info_filler` | Refererad i config | Nordbro | HÖG |
| `patient_info_profilho` | Profhilo saknar treatment-config helt | Nordbro | HÖG |
| `followup_fue_4m` (Meridiq Q 16407) | Q-mall finns importerad men ingen patientutskick-mall är aktiv | Meridiq + CCO native | HÖG |
| `followup_botox_3m_re_treat_window` | Cadence finns i config | CCO native | MEDEL |
| `followup_filler_2w_check` + `_12m_re_treat` | Cadence finns i config | CCO native | MEDEL |
| `followup_bleph_7d_suture_removal` + `_3m` + `_12m` | Cadence finns i config (3 cadences) | CCO native | HÖG |
| `followup_prp_skin_2w_after_each` + `_1m_after_final` | Cadence finns i config | CCO native | MEDEL |
| `followup_meso_1w_after_each` | Cadence finns i config | CCO native | MEDEL |
| `booking_reminder_curatiio_24h` | Split från `shared` för brand-isolering | CCO native | LÅG |
| `cancellation_noshow_internal` | Staff-feed för no-show | CCO native | MEDEL |
| `arrival_confirmation_internal` | Staff-feed för verifierad ankomst | CCO native | LÅG |
| `agreement_reminder_t-3d` | Avtals-påminnelse för osignerade offerter | CCO native + Insatt | HÖG |
| `marketing_offer_generic_hair_tp` + `_curatiio` | Marketing-flöde | CCO native | LÅG |
| `marketing_recall_followup` | LTV-baserad recall | CCO native | LÅG |
| 19 av 39 Meridiq consents med tom `letterText` | Råtext från Nordbro/Insatt-PDFs saknas | Nordbro + Insatt | HÖG (compliance-blocker) |

**Sammanfattning av saknade mallar:** **20+ nya templates** + **19 fyllningar av tom letterText** = 39+ konkreta åtgärder för att uppnå full Meridiq-paritet i `data/cco-templates.json`.

**Sammanfattning av treatment-coverage:** av 10 treatments i `cco-treatment-document-requirements.json` har **5 av 9 aftercare-templates** stöd (FUE, PRP Hair, Botox, Filler, Bleph), och **0 av 5** Curatiio-specifika followup-cadences har en patient-facing template registrerad.

---

*Genererad: 2026-05-29*
