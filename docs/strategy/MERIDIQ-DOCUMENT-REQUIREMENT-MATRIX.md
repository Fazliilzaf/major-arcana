# Meridiq Document Requirement Matrix

Per behandling × kundresesteg — vilka dokument krävs?
Sammanfogat från `config/cco-treatment-document-requirements.json` (10 treatments), `migration/meridiq/service-bindings-catalog.json` (82 services + bindings) och `config/external-template-versions.json`.

Förkortningar i kolumner: **Obl.** = obligatorisk, **Sign** = signering krävs, **Journal** = journalförs i CCO, **CCO-status** = EXISTS/MISSING/PARTIAL.

Versionssiffror hämtade från `external-template-versions.json` per 2026-05-29.

---

## 1) Hair TP — FUE (brand: hair_tp, kategori: surgical)

Bundna Meridiq-services: 7086, 7087, 7088, 7089, 7090, 7091, 7092, 7106 + 7128 (PRP-post-op) + 7131 (uppföljning) + 7397-7401 (Skägg FUE) → 14 services.

| Steg | Dokument | Källa | Version | Obl. | Sign | Journal | CCO-status | templateId |
|---|---|---|---|---|---|---|---|---|
| Pre-konsult | Patientinformation konsult | nordbro | 2.0.0 | Y | N | N | EXISTS | `patient_info_consultation` |
| Konsultation | Hälsodeklaration Hair TP | meridiq (Q 16414) | 3.0.0 | Y | Y | Y | EXISTS | `health_declaration_hair_tp` |
| Pre-op (T-48h) | Friskförsäkran TP | insatt (Q 16413) | 2.0.0 | Y | Y | Y | EXISTS | `fitness_certificate_hair_tp` |
| Pre-op | Patientinformation FUE | nordbro | 3.0.0 | Y | N | N (snapshot) | EXISTS | `patient_info_fue` |
| Avtalsfas | Behandlingsavtal | insatt | 4.0.0 | Y | Y | N (snapshot) | EXISTS | `agreement_fue` (mall `agreement_hair_tp_generic` v4) |
| Avtalsfas | Behandlingssamtycke | nordbro (C 170917 Meridiq) | 1.0.0 | Y | Y | Y | **MISSING** (levererad ej importerad) | `consent_treatment_fue` |
| Avtalsfas | Foto-samtycke internt | nordbro | 2.0.0 | Y | Y | Y | EXISTS | `consent_photo_internal` |
| Avtalsfas | Foto-samtycke publik | nordbro | 2.0.0 | N | Y | Y | EXISTS | `consent_photo_publish` |
| Ankomst | ID-verifiering | CCO native | — | Y | N | Y (event) | EXISTS | — (`staff_confirm_4_last_digits`) |
| Encounter | TP-journal | meridiq (Q 16411) | 1.0.0 | Y | Y | Y | EXISTS | schema `tp_journal_v3` |
| Eftervård | Eftervård FUE | nordbro | 3.0.0 | Y | N | N | EXISTS | `aftercare_fue` |
| Uppföljning 4m | Uppföljningsformulär | meridiq (Q 16407) | 1.0.0 | Y | Y | Y | EXISTS | schema `follow_up:4_manader` |
| Uppföljning 6m | Uppföljningsformulär | meridiq (Q 16409) | 1.0.0 | Y | Y | Y | EXISTS | schema `follow_up:6_manader` |
| Uppföljning 12m | Resultatuppföljning | meridiq (Q 16390) | 1.0.0 | Y | Y | Y | PARTIAL (endast 1 fält i schema) | schema `follow_up:12_manader` |

**Betänketid: 14d distance_purchase.**

---

## 2) Hair TP — DHI (brand: hair_tp, surgical)

Bundna services: 7093-7097, 7104 (Ögonbryn), 7127/7144/7387/7388/7389 (Skägg), 7414 (Ärr), 7103/7132/7135/7414/8727 (PRP-post-op) → 16 services.

| Steg | Dokument | Källa | Version | Obl. | Sign | Journal | CCO-status | templateId |
|---|---|---|---|---|---|---|---|---|
| Pre-konsult | Patientinformation konsult | nordbro | 2.0.0 | Y | N | N | EXISTS | `patient_info_consultation` |
| Konsultation | Hälsodeklaration Hair TP | meridiq | 3.0.0 | Y | Y | Y | EXISTS | `health_declaration_hair_tp` |
| Pre-op | Friskförsäkran TP | insatt | 2.0.0 | Y | Y | Y | EXISTS | `fitness_certificate_hair_tp` |
| Pre-op | Patientinformation DHI | nordbro | — (saknas i version-fil) | Y | N | N (snapshot) | **PARTIAL** (saknar version-tracking) | `patient_info_dhi` |
| Avtalsfas | Behandlingsavtal DHI | insatt | 4.0.0 | Y | Y | N | EXISTS | `agreement_dhi` (mall `agreement_hair_tp_generic` v4) |
| Avtalsfas | Behandlingssamtycke DHI | meridiq C 170917 (delar med FUE) | 1.0.0 | Y | Y | Y | **MISSING** | `consent_treatment_dhi` (Nordbro ej levererad separat) |
| Avtalsfas | Foto-samtycke | nordbro | 2.0.0 | Y | Y | Y | EXISTS | `consent_photo_internal` / `_publish` |
| Encounter | TP-journal | meridiq (Q 16411) | 1.0.0 | Y | Y | Y | EXISTS | `tp_journal_v3` |
| Eftervård | Eftervård DHI | nordbro | — (saknas) | Y | N | N | **PARTIAL** | `aftercare_dhi` |
| Uppföljning | (samma som FUE 4/6/12m) | meridiq | 1.0.0 | Y | Y | Y | EXISTS | `follow_up:*` |

**Betänketid: 14d distance_purchase.**

---

## 3) Hair TP — PRP Hår (brand: hair_tp, injection)

Bundna services: 7112, 7114, 7116, 7133, 7395 → 5 services (med C 170945). Plus 7113 (PRP XL) med legacy-consent C 152994.

| Steg | Dokument | Källa | Version | Obl. | Sign | Journal | CCO-status | templateId |
|---|---|---|---|---|---|---|---|---|
| Konsultation | Hälsodeklaration | meridiq | 3.0.0 | Y | Y | Y | EXISTS | `health_declaration_hair_tp` |
| Pre-op | Friskförsäkran | insatt | 2.0.0 | N | Y | Y | EXISTS (frivillig) | `fitness_certificate_hair_tp` |
| Avtalsfas | Patientinfo PRP Hår | nordbro | 2.0.0 | Y | N | N | EXISTS | `patient_info_prp_hair` |
| Avtalsfas | Behandlingsavtal PRP Hår | meridiq C 170945 / nordbro | — | Y | Y | Y | **MISSING** | `agreement_prp_hair` (saknar version-tracking) |
| Avtalsfas | Behandlingssamtycke PRP Hår | nordbro / meridiq C 170945 | — | Y | Y | Y | **MISSING** | `consent_treatment_prp_hair` |
| Encounter | PRP-journal | meridiq (`prp_treatment:prp_skin` med variant `tp_post_op`) | 1.0.0 | Y | Y | Y | EXISTS | `prp_journal_v2` |
| Eftervård | Eftervård PRP Hår | nordbro | 2.0.0 | Y | N | N | EXISTS | `aftercare_prp_hair` |
| Uppföljning | 2 veckor / 1 mån | CCO native | — | N | N | N | EXISTS (config) | (cadence "2w_after_each_session", "1m_after_final") |

**Betänketid: 7d in_clinic_aesthetic.**

**Brand-flagg:** Legacy C 152994 "PRP hår – Platelet Rich Plasma - SWE" är märkt `brand: Hair TP Clinic` i Meridiq men bunden bara till 7113 — version 3 är aktuell, version 2 är arkiv. Konflikt risk vid migration.

---

## 4) Hair TP — Microneedling Hår (brand: hair_tp, device)

Konfiguration i `cco-treatment-document-requirements.json` heter `microneedling_hair`.
Meridiq-bindings: ingen direkt service-id för "Microneedling Hår" — kategorin `Microneedling med Dermapen` (7121, 7392-7394, 7396) säljs som hud-behandling.

| Steg | Dokument | Källa | Version | Obl. | Sign | Journal | CCO-status | templateId |
|---|---|---|---|---|---|---|---|---|
| Konsultation | Hälsodeklaration Hair TP | meridiq | 3.0.0 | Y | Y | Y | EXISTS | `health_declaration_hair_tp` |
| Pre-op | Friskförsäkran (om PRP-tillägg) | insatt | 2.0.0 | N (cond.) | Y | Y | EXISTS | `fitness_certificate_hair_tp` |
| Avtalsfas | Patientinfo Microneedle | nordbro | — | Y | N | N | **PARTIAL** | `patient_info_microneedle` |
| Avtalsfas | Behandlingsavtal | nordbro | — | Y | Y | Y | **PARTIAL** | `agreement_microneedle` |
| Avtalsfas | Behandlingssamtycke | meridiq C 170946 / nordbro | — | Y | Y | Y | **MISSING** | `consent_treatment_microneedle` |
| Encounter | Journal | CCO/meridiq schema `prp_treatment:prp_skin` | — | Y | Y | Y | PARTIAL | `microneedle_journal_v1` |
| Eftervård | Eftervård | nordbro | — | Y | N | N | **PARTIAL** | `aftercare_microneedle` |

**Brand-mismatch:** Meridiq-consent C 170946 är taggad `Behandlingsavtal | Microneedling och PRP` utan brand-prefix → behöver tolkas som **shared** vid import. Legacy consent 152998 (Microneedling SWE) är märkt `Hair TP Clinic` — fel brand.

---

## 5) Hair TP — Trichoscopy (consultation)

Inga direkta Meridiq-bindings (konsultation 7078/7079 täcker detta).

| Steg | Dokument | Källa | Version | Obl. | Sign | Journal | CCO-status | templateId |
|---|---|---|---|---|---|---|---|---|
| Pre-konsult | Patientinfo konsultation | nordbro | 2.0.0 | Y | N | N | EXISTS | `patient_info_consultation` |
| Konsult | Hälsodeklaration | meridiq | 3.0.0 | Y | Y | Y | EXISTS | `health_declaration_hair_tp` |
| Konsult | Konsultations-samtycke | nordbro | — | Y | Y | Y | **PARTIAL** | `consent_consultation` |
| Encounter | Konsultationsplan | CCO | 1.0.0 | Y | Y | Y | EXISTS | schema `consultation_plan` |

**Betänketid: 0.**

---

## 6) Curatiio — Botox (injection)

Bundna services: 7382, 7383, 7384, 7385 (4 st) + 8952 (uppföljning) med C 170949.

| Steg | Dokument | Källa | Version | Obl. | Sign | Journal | CCO-status | templateId |
|---|---|---|---|---|---|---|---|---|
| Konsult | Hälsodeklaration Estet. injektioner | meridiq (Q 16472) | 3.0.0 | Y | Y | Y | EXISTS | `health_declaration_curatiio` |
| Pre-op | Friskförsäkran Curatiio | insatt | 2.0.0 | Y | Y | Y | EXISTS | `fitness_certificate_curatiio` |
| Avtalsfas | Patientinfo Botox | nordbro | 2.0.0 | Y | N | N | EXISTS | `patient_info_botox` |
| Avtalsfas | Behandlingsavtal Botox | insatt / meridiq C 170949 | 4.0.0 | Y | Y | Y | EXISTS | `agreement_botox_curatiio` |
| Avtalsfas | Behandlingssamtycke Botox | nordbro / meridiq C 170949 | — | Y | Y | Y | **MISSING** | `consent_treatment_botox` |
| Avtalsfas | Foto-samtycke | nordbro | 2.0.0 | Y | Y | Y | EXISTS | `consent_photo_*` |
| Encounter | Botox-journal | meridiq (delar `bleph_treatment` strukturen, eget schema saknas) | 2.0.0 | Y | Y | Y | **PARTIAL** | `botox_journal_v2` (referens, schema saknas i `journal-schema-catalog`) |
| Eftervård | Eftervård Botox | nordbro | 2.0.0 | Y | N | N | EXISTS | `aftercare_botox` |
| Uppföljning | 2w touchup / 3m re-treat | CCO native | — | N | N | N | EXISTS (cadence) | — |

**Betänketid: 7d in_clinic_aesthetic.**

**Brand-flagg:** Legacy C 152981 "Botulinumtoxin - ENG" och C 152988 "Botulinumtoxin - SWE" är märkta `brand: Hair TP Clinic` trots att Botox är Curatiio. **MUST FIX vid import.**

---

## 7) Curatiio — Filler (injection)

Bundna services: 7376, 7377, 7378 (3 st) + 8953 (uppföljning) med C 170950.

| Steg | Dokument | Källa | Version | Obl. | Sign | Journal | CCO-status | templateId |
|---|---|---|---|---|---|---|---|---|
| Konsult | Hälsodeklaration | meridiq Q 16472 | 3.0.0 | Y | Y | Y | EXISTS | `health_declaration_curatiio` |
| Pre-op | Friskförsäkran | insatt | 2.0.0 | Y | Y | Y | EXISTS | `fitness_certificate_curatiio` |
| Avtalsfas | Patientinfo Filler | nordbro | — | Y | N | N | **PARTIAL** | `patient_info_filler` |
| Avtalsfas | Behandlingsavtal Filler | insatt / meridiq C 170950 | 4.0.0 | Y | Y | Y | EXISTS | `agreement_filler_curatiio` |
| Avtalsfas | Behandlingssamtycke Filler | nordbro / meridiq C 170950 | — | Y | Y | Y | **MISSING** | `consent_treatment_filler` |
| Encounter | Filler-journal | meridiq (schema saknas) | 2.0.0 | Y | Y | Y | **PARTIAL** | `filler_journal_v2` (ej i journal-schema-catalog) |
| Eftervård | Eftervård Filler | nordbro | 2.0.0 | Y | N | N | EXISTS | `aftercare_filler` |

**Betänketid: 7d.**

---

## 8) Curatiio — Profhilo (injection) — SAKNAS I CONFIG

Bundna services: 7379, 7380, 7381 + 8954 (uppföljning) med C 170948.

| Steg | Dokument | Källa | Version | Obl. | Sign | Journal | CCO-status | templateId |
|---|---|---|---|---|---|---|---|---|
| (alla steg) | — | meridiq C 170948 | — | Y | Y | Y | **MISSING — treatment-key saknas i `cco-treatment-document-requirements.json`** | — |

**Åtgärd:** lägg till `profhilo` som treatment i config. Föreslagen mapping: brand=`curatiio`, category=`injection`, coolingOff=7d, journalTemplate=`profhilo_journal_v1`.

---

## 9) Curatiio — Ögonlocksplastik / Blefaroplastik (surgical)

Bundna services: 7082, 7085, 7105 (3 st) + 7107 (suturborttagning) + 7410 (uppföljning) med C 170954.

| Steg | Dokument | Källa | Version | Obl. | Sign | Journal | CCO-status | templateId |
|---|---|---|---|---|---|---|---|---|
| Konsult | Hälsodeklaration Ögonlocksplastik | meridiq Q 16415 | 3.0.0 | Y | Y | Y | EXISTS | `health_declaration_curatiio` (variant `curatiio_bleph`) |
| Pre-op | Friskförsäkran Ögonlocksplastik | meridiq Q 16389 | 2.0.0 | Y | Y | Y | EXISTS | `fitness_certificate_curatiio` (variant `curatiio_bleph`, 6 fält) |
| Avtalsfas | Patientinfo Bleph | nordbro | 2.0.0 | Y | N | N | EXISTS | `patient_info_bleph` |
| Avtalsfas | Behandlingsavtal Ögonlocksplastik | insatt / meridiq C 170954 | 4.0.0 | Y | Y | Y | EXISTS | `agreement_bleph_curatiio` |
| Avtalsfas | Behandlingssamtycke Bleph | nordbro / meridiq C 170954 | — | Y | Y | Y | **MISSING** | `consent_treatment_bleph` |
| Encounter | Bleph-journal | meridiq Q 16388 | 2.0.0 | Y | Y | Y | EXISTS | schema `bleph_treatment:curatiio_bleph` (15 fält) |
| Eftervård | Eftervård Bleph | nordbro | 2.0.0 | Y | N | N | EXISTS | `aftercare_bleph` |
| Uppföljning 7d | Suturborttagning (service 7107) | meridiq | — | Y | N | Y | EXISTS | (cadence "7d_suture_removal") |
| Uppföljning 3m/12m | (cadence) | CCO | — | Y | Y | Y | EXISTS (cadence) | — |

**Betänketid: 7d in_clinic_aesthetic** (OBS: kirurgi men i klinik — flagga: 14d distance_purchase kan vara mer korrekt om köp gjorts online).

---

## 10) Curatiio — PRP Hud (injection)

Bundna services: 7117, 7118, 7119, 7120, 7122 (5 st) med C 170944.

| Steg | Dokument | Källa | Version | Obl. | Sign | Journal | CCO-status | templateId |
|---|---|---|---|---|---|---|---|---|
| Konsult | Hälsodeklaration | meridiq | 3.0.0 | Y | Y | Y | EXISTS | `health_declaration_curatiio` |
| Pre-op | Friskförsäkran | insatt | 2.0.0 | Y | Y | Y | EXISTS | `fitness_certificate_curatiio` |
| Avtalsfas | Patientinfo PRP Hud | nordbro | — | Y | N | N | **PARTIAL** | `patient_info_prp_skin` |
| Avtalsfas | Behandlingsavtal PRP Hud | insatt / meridiq C 170944 | — | Y | Y | Y | **PARTIAL** | `agreement_prp_skin_curatiio` |
| Avtalsfas | Behandlingssamtycke PRP Hud | nordbro / meridiq C 170944 | — | Y | Y | Y | **MISSING** | `consent_treatment_prp_skin` |
| Encounter | PRP-journal | meridiq schema `prp_treatment:prp_skin` (12 fält) | 2.0.0 | Y | Y | Y | EXISTS | `prp_skin_journal_v2` |
| Eftervård | Eftervård PRP Hud | nordbro | — | Y | N | N | **PARTIAL** | `aftercare_prp_skin` |

**Betänketid: 7d.**

**Brand-flagg:** PRP-hår-mallen (152994) är taggad `Hair TP Clinic` — PRP-hud-services är otaggade. Audit: säkerställ att PRP-hud körs som `curatiio` brand i CCO.

---

## 11) Curatiio — Mesoterapi (injection) — INGEN MERIDIQ-BINDING

Finns som `mesotherapy` i `cco-treatment-document-requirements.json` men **inga matchande services i `service-bindings-catalog.json`**.

| Steg | Dokument | Källa | Version | Obl. | Sign | Journal | CCO-status | templateId |
|---|---|---|---|---|---|---|---|---|
| Alla steg | — | — | — | Y | — | — | **MISSING I MERIDIQ** | — |

**Åtgärd:** Verifiera om mesoterapi finns i Meridiq-katalog som ej exporterats, eller om det är CCO-only (kommande lansering). Risk: konfig finns för en behandling som ej går att boka.

---

## 12) Curatiio — Ortopediska injektioner (HA / PRP / PRF) — INGEN CCO-TREATMENT-KEY

Bundna services: 7081 (konsult), 7109, 7123, 7124, 7406, 7411, 7412, 7413 → 8 services med C 170941/170942/170943.

| Steg | Dokument | Källa | Version | Obl. | Sign | Journal | CCO-status | templateId |
|---|---|---|---|---|---|---|---|---|
| Konsult | Hälsodeklaration Ortopedi | meridiq Q 14878 | 3.0.0 | Y | Y | Y | EXISTS | `health_declaration_curatiio` (variant `curatiio_ortho`, 14 fält) |
| Avtalsfas | Behandlingsavtal Ortopedisk HA / PRP/PRF / HA+PRP | meridiq C 170941/170942/170943 | — | Y | Y | Y | **MISSING** | — (saknar treatment-key) |
| Encounter | Journal | meridiq (schema saknas i export) | — | Y | Y | Y | **MISSING** | — |

**Åtgärd:** Lägg till `ortho_ha`, `ortho_prp_prf`, `ortho_ha_prp_prf` som treatments i config.

---

## 13) Uppföljningstjänster (cross-brand)

Bundna services utan consent/questionnaire: 7107, 7128, 7130, 7131, 7132, 7134, 7135, 7137, 7405, 7410, 7103, 8694(?), 8727, 8952, 8953, 8954 → 16 services.

| Steg | Dokument | Källa | Version | Obl. | Sign | Journal | CCO-status | templateId |
|---|---|---|---|---|---|---|---|---|
| Uppföljning 4m / 6m / 12m (TP) | Meridiq Q 16407 / 16409 / 16390 | meridiq | 1.0.0 | Y | Y | Y | EXISTS | `follow_up:*` |
| Uppföljning Bleph / Botox / Filler / Profhilo / Ögonbryn / Skägg | (saknar form i Meridiq — bara bookings) | — | — | N | N | Y (booking-event) | PARTIAL | — |

---

## Behandlingar utan dokumentkrav i config

Följande Meridiq-services har consent eller questionnaire men **finns ej som key i `cco-treatment-document-requirements.json`**:

| Meridiq-namn | apiId | Consent | Brand | Föreslagen treatment-key |
|---|---|---|---|---|
| Profhilo 1/2/3 behandlingar | 7379-7381 | 170948 | curatiio | `profhilo` |
| Microneedling med PRP (Ansikte/Hals/Dekolletage/Händer) | 7121, 7392-7394 | 170946 | curatiio | `microneedling_skin` |
| Ortopedisk HA | 7123 | 170942 | curatiio | `ortho_ha` |
| Ortopedisk PRP/PRF | 7109, 7406, 7412 | 170941/170943 | curatiio | `ortho_prp_prf` |
| Ortopedisk HA + PRP/PRF | 7124, 7411, 7413 | 170943 | curatiio | `ortho_ha_prp_prf` |
| DHI Ärr | 7414 | 170917 | hair_tp | (täcks av `dhi`?) |
| FUE Skäggtransplantation 1000-3000 grafts | 7397-7401 | 170917 | hair_tp | `fue_beard` (eller behåll under `fue`) |
| DHI Skäggtransplantation 1000-3000 grafts | 7127, 7144, 7387-7389 | 170917 | hair_tp | `dhi_beard` |
| DHI Ögonbrynstransplantation | 7104 | 170917 | hair_tp | `dhi_brow` |
| PRP XL (Hår) | 7113 | 152994 (legacy) | hair_tp | (täcks av `prp_hair`?) men VERSIONSKONFLIKT |

---

## Behandlingar med BLOCKING-blockers (sammanställning)

Alla 10 treatments i config har följande som `blocking: true` enligt `cco-treatment-document-requirements.json`:

| Treatment | healthDecl | fitnessCert | patientInfo | agreement | consent | photoConsentInt | idVerification | coolingOff |
|---|---|---|---|---|---|---|---|---|
| fue | Y | Y | Y | Y | Y | N (req-not-blocking) | Y | 14d |
| dhi | Y | Y | Y | Y | Y | N | Y | 14d |
| prp_hair | Y | N | Y | Y | Y | N | Y | 7d |
| microneedling_hair | Y | N (cond) | Y | Y | Y | N | Y | 7d |
| trichoscopy | Y | N | N | N | Y | N | N | 0 |
| botox | Y | Y | Y | Y | Y | N | Y | 7d |
| filler | Y | Y | Y | Y | Y | N | Y | 7d |
| bleph | Y | Y | Y | Y | Y | N | Y | 7d |
| prp_skin | Y | Y | Y | Y | Y | N | Y | 7d |
| mesotherapy | Y | Y | Y | Y | Y | N | Y | 7d |

---

## Brand-mismatch upptäckt

| Mall / Consent | Meridiq-brand-tagg | Faktisk brand | Risk |
|---|---|---|---|
| 152981 "Botulinumtoxin - ENG" | Hair TP Clinic | Curatiio | **KRITISK** — visa felaktigt varumärke till patient |
| 152988 "Botulinumtoxin - SWE" | Hair TP Clinic | Curatiio | **KRITISK** |
| 152984 "Filler - ENG" | Curatiio | Curatiio | OK |
| 152990 "Fillers - SWE" | Curatiio | Curatiio | OK |
| 152994 "PRP hår – Platelet Rich Plasma - SWE" | Hair TP Clinic | Hair TP | OK |
| 152997 "Microneedling - ENG" | Hair TP Clinic | Båda (sold under båda) | FLAGGAD — bör vara `shared` |
| 152998 "Microneedling - SWE" | Hair TP Clinic | Båda | FLAGGAD |
| 152999 "Plasma Pen - ENG" | Hair TP Clinic | Curatiio (Plasma Pen säljs Curatiio) | **HÖG** |
| 152995/152996 "Fat dissolving" | Hair TP Clinic | Curatiio | **HÖG** (om aktivt erbjudande) |
| 170941/170942/170943 Ortopedi | (otaggad i `byConsent`) | Curatiio | LÅG — behöver brand-tagg vid import |
| 170944 PRP hud | (otaggad) | Curatiio (PRP hud säljs Curatiio) | MEDEL |
| 170945 PRP hår | (otaggad) | Hair TP | MEDEL |
| 170946 Microneedling och PRP | (otaggad) | shared / Curatiio | MEDEL |

**Åtgärd vid import till `ccoTemplateRegistry`:**
Tillämpa brand-override via mapping-tabell. Eftersom `VALID_BRANDS = ['hair_tp', 'curatiio', 'shared']` är en uttömmande lista, kasta error om Meridiq-tagg inte kan resolveras — INTE tysta defaults till `hair_tp`.

---

*Genererad: 2026-05-29*
