# CCO Kundresa — 9 steg Hair TP (kanonisk 2026-06-03)

**Status:** Fazli korrigerad process · **execution source of truth** (ersätter fel 10-stegs-/utskicksordning)  
**Scope:** Hårtransplantation (Hair TP) · konsultation → operationsdag  
**Ingen implementation** i detta dokument — endast process + kod-nuläge

**Relaterat:** [`CCO-KUNDRESA-FAZLI-PLAN-MAPPING-2026-06-03.md`](./CCO-KUNDRESA-FAZLI-PLAN-MAPPING-2026-06-03.md) · [`CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md`](./CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md)

---

## Ogiltiga antaganden (rensas överallt)

| Fel (gammalt)                                          | Korrekt (Fazli 2026-06-03)                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Pre-info som **eget steg** / eget utskick              | Pre-info ingår i **steg 2** (bokningsbekräftelse-mail)                      |
| Friskförsäkran **T-48h** / påminnelse före konsult     | Friskförsäkran **steg 8** — **operationsdagen**, tablet/QR, blockerar start |
| Offert och behandlingsplan som **två steg**            | **Steg 5** = samma operativa steg (`consultation_plan` / offert)            |
| Avtal och behandlingssamtycke som **separata utskick** | **Steg 7** = **samma transaktion** (bundle-signering)                       |
| Foto-samtycke = generellt ansikte/publicering          | **Steg 9** = **hårlinje/krona**, samma dag som foto tas, **aldrig ansikte** |
| Automation: T-48 friskförsäkran-reminder               | **Förbjudet** tills explicit ny GO                                          |
| Auto-skicka behandlingssamtycke vid offert             | **Förbjudet** — samtycke ingår i steg 7-bundle                              |

---

## 9-stegsordning (kanonisk)

| #     | Steg                        | Utskick / kanal                                               | Patient                        | Personal                     | CCO (regelbaserat)                                     | Human approval        | Gates                               |
| ----- | --------------------------- | ------------------------------------------------------------- | ------------------------------ | ---------------------------- | ------------------------------------------------------ | --------------------- | ----------------------------------- |
| **1** | Bokning konsultation        | Webb/widget → booking-engine                                  | Väljer slot, fyller kontakt    | Bekräftar vid behov          | Reservation → encounter `reserved`                     | Nej (bokning)         | Kapacitet, min-notice               |
| **2** | Bokningsbekräftelse-mail    | **Ett mail:** pre-info + tjänstespec + Meridiq-länk hälsodekl | Läser, klickar HD-länk         | —                            | `booking_confirmation` / `dispatchBookingConfirmation` | Nej                   | —                                   |
| **3** | Hälsodeklaration            | Portal `/screen` (Meridiq Q 16414)                            | Fyller + signerar före konsult | Ser status i journal/Kunder  | `missing_health_declaration`                           | Signering = patient   | Medicinsk                           |
| **4** | Konsultation                | Encounter + journal                                           | Deltar                         | Encounter, journal, ev. foto | `missing_journal` · encounter-länk                     | Signering journal     | Medicinsk                           |
| **5** | Offert = Behandlingsplan    | Efter konsult (mail/PDF/journal `consultation_plan`)          | Tar del av plan                | Skapar/skickar plan          | `missing_treatment_plan`                               | Offert/commercial GO  | Commercial                          |
| **6** | Betänketid **2 dagar**      | Ingen separat “påminnelse” — räknare                          | Väntar                         | Följer cooling               | `cooling_off_active` / `cooling_off_passed`            | Legal vid distans     | **Juridisk** (2d)                   |
| **7** | Avtal + behandlingssamtycke | **En signering/transaktion** (bundle)                         | Signerar en gång               | Legal review → send          | `missing_agreement_consent_bundle`                     | **Ja** (legal + sign) | **legal_review** + sign provider    |
| **8** | Friskförsäkran              | **Operationsdagen** — tablet/QR i kliniken                    | Signerar på plats              | Kontrollerar innan start     | `missing_operation_day_insurance`                      | Patient signerar      | **Medicinsk** — blockerar ops-start |
| **9** | Foto-samtycke               | **Samma dag** som för-/efterbild                              | Godkänner scope hårlinje/krona | Prompt vid foto              | `missing_photo_consent` (vid foto)                     | **Ja** (scope)        | **Aldrig ansikte**                  |

**Separat (inte samma som steg 9):** `has_photo_review` — operatör granskar bilder i Photo Review (human approval, ingen autoapprove).

**`ready_for_treatment`:** true först när betänketid passerad + bundle signerad + legal_review OK + ops-dags friskförsäkran (på ops-dag) + foto-samtycke om bilder ska användas.

---

## Kod-nuläge per steg (undersökt 2026-06-03)

| Steg  | Kod / modul                                                                                                       | Status                | Gap mot Fazli                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | `ccoBookingEngineStore`, `publicBookingEngine`, `syncWebReservationToJournal`                                     | **DONE**              | Cliento legacy parallellt                                                                                                                |
| **2** | `buildBookingConfirmationEmail`, `bookingConfirmationDispatch`, `ccoCommCronStore` trigger `booking_confirmation` | **PARTIAL**           | Bekräftelse-mail har slot/tjänst — **saknar** inbäddad pre-info + Meridiq HD-länk i samma mall                                           |
| **3** | Patientportal, `health_declaration:*`, `ccoPatientCareOps`, `ccoPatientOutreach`                                  | **DONE**              | Kunder-action “Formulär” disabled; HD via portal inte alltid synlig i shell                                                              |
| **4** | `ccoJournalStore`, `ccoJournalBookingBridge`, `CcoJournalFeed` i Kunder                                           | **DONE**              | Aisia auto-import **ej** byggd                                                                                                           |
| **5** | `consultation_plan` journal, `ccoCommercialStore` / offers                                                        | **PARTIAL**           | Offert-flöde och journal-plan **inte** tvångssammanslagna i UI                                                                           |
| **6** | `ccoHairTpCoolingOffPolicy`, `ccoTreatmentAgreementStore`, `ccoOfferEsign`, `ccoOfferTemplateStore`               | **DONE** (2d default) | Legacy poster med `coolingOffDays: 14` / gammal `coolingOffEndsAt` ändras **inte** retroaktivt                                           |
| **7** | `ccoTreatmentAgreement` `send-for-sign`, `accept-public`, `meridiqConsentCatalogRuntime`                          | **PARTIAL**           | **Separata** flöden idag; **ingen** bundle-sign; **ingen** `legal_review` i agreement store                                              |
| **8** | `fitness_certificate`, `/friskforsakran.html`, `ccoReadyForTreatmentBuilder`                                      | **PARTIAL**           | Formulär finns; **ingen** ops-dags gate/blocker i runner; **fel** T-48 i `COMMUNICATION-TEMPLATE-REGISTRY` / `MERIDIQ-JOURNEY-BLUEPRINT` |
| **9** | `ccoPhotoPublishConsent`, `ccoPhotoConsentStore`, `consent_photo_*` i config                                      | **PARTIAL**           | **Generell** publiceringssamtycke — **inte** hårlinje/krona-only; **ingen** prompt vid första journalfoto i Kunder                       |

---

## Legacy — betänketid 14 dagar (migration)

| Situation                                     | Policy                                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Nya offerter/avtal** (skickas efter P0)     | `HAIR_TP_COOLING_OFF_DAYS = 2` via `src/ops/ccoHairTpCoolingOffPolicy.js` (`CCO_HAIR_TP_COOLING_OFF_DAYS` env) |
| **Signerade / arkiverade**                    | Ändras **aldrig** utan separat owner-GO                                                                        |
| **Öppna osignerade** med sparad 14d           | Behåll `coolingOffEndsAt` tills owner-review; nya utskick använder 2d                                          |
| **Juridisk 14d ångerrätt** (distansavtal PDF) | Kvar i avtalstext — **inte** samma som CCO 2d operativa gate                                                   |

---

## Automation (L1) — koppling till steg

Se [`CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md`](./CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md) för 9 registry-regler mappade till steg 3–9 + review.

**Princip:** Registry fas 1 = dry-run only · inga writes · inga reminders · ingen AI.

---

## Planhierarki (oförändrad)

1. **Fazlis kundrese-plan** (denna 9-steg när godkänd) = execution
2. `CCO-SYSTEM-SCOPE.md` = kravbas
3. [Gemensam plan v2](https://app.notion.com/p/374060ccc15b8194883ce75d56fd621c) = Automation OS-strategi (L1–L3), **inte** denna stegordning
4. Kunder P1.2 = arbetsyta för signaler

---

_Hair TP Clinic · Fazli korrigering · 2026-06-03_
