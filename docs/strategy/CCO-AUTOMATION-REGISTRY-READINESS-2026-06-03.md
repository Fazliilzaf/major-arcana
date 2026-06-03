# CCO Automation Registry — Implementation readiness (2026-06-03)

**Status:** Readiness only · **ingen kod** · **ingen Runner** · **ingen POST** · **ingen AI**  
**Kundresa (kanonisk):** [`CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`](./CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md) — **9 steg** (ersätter fel 10-stegs-/T-48-antaganden)  
**Strategi-master:** [Gemensam plan v2](https://app.notion.com/p/374060ccc15b8194883ce75d56fd621c) (L1–L3 — **inte** kundresa-execution)  
**Planlås:** [`CCO-KUNDRESA-FAZLI-PLAN-MAPPING-2026-06-03.md`](./CCO-KUNDRESA-FAZLI-PLAN-MAPPING-2026-06-03.md)

### Byggordning (låst)

1. Riktig CCO-data → 2. Regelmotor dry-run → 3. What/Why/Next → 4. Human approval → 5. Reminders/worklists → 6. AI sist (flagg)

**Förbjudet före L1 grön:** T-48 friskförsäkran-reminder · separat samtycke-utskick vid offert · pre-info som eget steg · autoapprove photo · extern AI på journal

---

## Regel-migration (gammalt → nytt)

| Gammal regel (v1 utkast)             | Ny regel                                                              | Kundreseg steg                                          |
| ------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------- |
| `customer.missing_form`              | **`customer.missing_health_declaration`**                             | **3** — hälsodekl **inför konsult** (≠ friskförsäkran)  |
| `customer.missing_journal`           | **`customer.missing_journal`**                                        | **4** — konsultation / encounter                        |
| —                                    | **`customer.missing_treatment_plan`**                                 | **5** — offert = behandlingsplan                        |
| —                                    | **`customer.cooling_off_active`** / **`customer.cooling_off_passed`** | **6** — **2 dagar**                                     |
| `customer.missing_agreement`         | **`customer.missing_agreement_consent_bundle`**                       | **7** — avtal + behandlingssamtycke, **en transaktion** |
| —                                    | **`customer.missing_operation_day_insurance`**                        | **8** — friskförsäkran **operationsdagen** (≠ T-48h)    |
| —                                    | **`customer.missing_photo_consent`**                                  | **9** — vid foto, hårlinje/krona, aldrig ansikte        |
| `customer.has_photo_review`          | **`customer.has_photo_review`**                                       | Review-kö (≠ steg 9 samtycke)                           |
| `customer.ready_for_visit`           | **`customer.ready_for_treatment`**                                    | Komposit efter steg 6–8 (+ 9 om bilder)                 |
| `customer.booking_missing_encounter` | _(kvar som ops-regel, ej kundreseg-steg)_                             | Bokning ↔ encounter sync                                |

**Borttaget / ogiltigt i registry v2:** T-48h friskförsäkran-reminder · `missing_form` som proxy för “allt formulär” · `ready_for_visit` som behandlingsredo

---

## 1. Stores (9 kundrese-regler + ops)

| Store / modul                                           | Regler                                  | I readout idag?                         |
| ------------------------------------------------------- | --------------------------------------- | --------------------------------------- |
| `ccoKunderEnrichment`                                   | `missing_journal`, legacy `missingForm` | ✅                                      |
| Journal / `health_declaration:*`                        | `missing_health_declaration`            | ⚠️ v1.1 — idag asset-proxy              |
| `ccoJournalStore` (`consultation_plan`)                 | `missing_treatment_plan`                | ⚠️ v1.1                                 |
| `ccoTreatmentAgreementStore`                            | `cooling_off_*`, bundle, `legal_review` | ⚠️ cooling ✅; bundle/legal ❌          |
| `fitness_certificate` / portal                          | `missing_operation_day_insurance`       | ⚠️ v1.1 — **ingen** ops-dags gate i kod |
| `ccoPhotoConsentStore` / publish consent                | `missing_photo_consent`                 | ⚠️ generell publish idag                |
| Asset index                                             | `has_photo_review`                      | ✅ `needsPhotoReview`                   |
| **Komposit**                                            | `ready_for_treatment`                   | ❌ — måste byggas                       |
| `ccoKunderBookingEnrichment`                            | encounter-gap (ops)                     | ✅                                      |
| **Ny:** `ccoAutomationRegistry` / `ccoAutomationRunner` | metadata + evaluate                     | ❌                                      |

**v1-minimum:** Predicates på `buildKunderReadout` där möjligt; **v1.1** kopplar journal/agreement/ops-dag för precision.

---

## 2. Regler v2 (9 + 1 ops)

Konvention: fas 1 = **dry-run only** · `humanApprovalRequired` enligt tabell.

### 2.1 `customer.missing_health_declaration` (steg 3)

| Fält               | Värde                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| **Ersätter**       | `missing_form`                                                                         |
| **Steg**           | 3 — före konsultation                                                                  |
| **Datafält (mål)** | Signerad `health_declaration:hair_tp` i journal/portal; **inte** `fitness_certificate` |
| **v1 proxy**       | `readout.missingForm` / asset `form` — **medium** confidence, dokumentera i WHY        |
| **WHAT**           | Hälsodeklaration saknas                                                                |
| **WHY**            | Krävs inför konsult (steg 3); ingår i bokningsbekräftelse (Meridiq-länk steg 2)        |
| **NEXT**           | Öppna patientportal / formulärstatus — **ingen** separat pre-info-utskick              |
| **Human approval** | **ja** om NEXT = skicka påminnelse (fas 2)                                             |
| **Gates**          | Medicinsk                                                                              |
| **Byggbar v1**     | ✅ proxy · v1.1 journal-signatur                                                       |

---

### 2.2 `customer.missing_journal` (steg 4)

| Fält               | Värde                                                        |
| ------------------ | ------------------------------------------------------------ |
| **Steg**           | 4 — konsultation, encounter + journal                        |
| **Datafält**       | `missingJournal`, `hasJournal`, encounter från booking index |
| **WHAT**           | Journal/encounter saknas för konsultation                    |
| **NEXT**           | Öppna journal (`/journal-feed-demo.html?customerId=`)        |
| **Human approval** | **nej** (navigering)                                         |
| **Byggbar v1**     | ✅                                                           |

---

### 2.3 `customer.missing_treatment_plan` (steg 5)

| Fält               | Värde                                                           |
| ------------------ | --------------------------------------------------------------- |
| **Steg**           | 5 — offert = behandlingsplan (samma steg)                       |
| **Datafält (mål)** | `consultation_plan` i journal; commercial offer status          |
| **v1**             | **low** — saknas i readout; flagga inactive + reason tills v1.1 |
| **WHAT**           | Behandlingsplan/offert saknas efter konsult                     |
| **NEXT**           | Skapa/skicka plan (staff route — ofta disabled)                 |
| **Human approval** | **ja** (commercial)                                             |
| **Byggbar v1**     | ⚠️ **blocker** data — kräver readout-fält                       |

---

### 2.4 `customer.cooling_off_active` / `customer.cooling_off_passed` (steg 6)

| Fält               | Värde                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------- |
| **Steg**           | 6 — betänketid **2 dagar** (Fazli)                                                            |
| **Datafält**       | `ccoTreatmentAgreementStore.getCoolingOffMeta` + `ccoHairTpCoolingOffPolicy` (**2d** default) |
| **Active**         | `cooling.active === true`                                                                     |
| **Passed**         | cooling elapsed + agreement status tillåter nästa steg                                        |
| **WHAT**           | Betänketid pågår / passerad                                                                   |
| **NEXT**           | Vänta / fortsätt till bundle (steg 7)                                                         |
| **Human approval** | **nej** (info); legal vid distansavtal                                                        |
| **Gates**          | Juridisk                                                                                      |
| **Byggbar v1**     | ⚠️ kräver agreement i evaluate (v1.1)                                                         |

---

### 2.5 `customer.missing_agreement_consent_bundle` (steg 7)

| Fält               | Värde                                                              |
| ------------------ | ------------------------------------------------------------------ |
| **Ersätter**       | `missing_agreement` (separat samtycke)                             |
| **Steg**           | 7 — **en** signering: avtal + behandlingssamtycke                  |
| **Datafält (mål)** | Bundle status + `legal_review` godkänd                             |
| **v1 proxy**       | `missingAgreement && hasJournal` — **medium**                      |
| **WHAT**           | Avtal + samtycke ej komplett (bundle)                              |
| **WHY**            | Separata utskick är **ogiltiga**; legal_review krävs före bookable |
| **NEXT**           | Legal review → bundle send-for-sign                                |
| **Human approval** | **ja** (legal + sign provider)                                     |
| **Gates**          | **legal_review**                                                   |
| **Byggbar v1**     | ✅ proxy · bundle + legal **MISSING** i kod                        |

---

### 2.6 `customer.missing_operation_day_insurance` (steg 8)

| Fält               | Värde                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| **Steg**           | 8 — friskförsäkran **på operationsdagen** (tablet/QR)                         |
| **Ogiltigt**       | T-48h reminder (`COMMUNICATION-TEMPLATE-REGISTRY`, `ccoCommCronStore` legacy) |
| **Datafält (mål)** | Signerad `fitness_certificate` **samma dag** som OP; blockerar ops-start      |
| **v1**             | **inactive** eller reason “Kräver ops-dags gate” — **ingen** T-48 predicate   |
| **WHAT**           | Friskförsäkran saknas på operationsdagen                                      |
| **NEXT**           | Tablet/QR i kliniken — **inte** mail 48h före                                 |
| **Human approval** | patient signerar                                                              |
| **Gates**          | Medicinsk — blockerar operationsstart                                         |
| **Byggbar v1**     | ❌ **blocker** — ops-dags gate ej i runner                                    |

---

### 2.7 `customer.missing_photo_consent` (steg 9)

| Fält               | Värde                                                              |
| ------------------ | ------------------------------------------------------------------ |
| **Steg**           | 9 — samma dag som för-/efterbild                                   |
| **Scope**          | Hårlinje/krona — **aldrig ansikte**; **inte** generell publicering |
| **Trigger**        | Vid första journalfoto / före-efterfoto                            |
| **v1**             | `ccoPhotoPublishConsent` = **fel scope** idag                      |
| **WHAT**           | Foto-samtycke saknas för planerad bildtagning                      |
| **NEXT**           | Prompt scope hairline/crown — **ingen** face/publish-mall          |
| **Human approval** | **ja** (scope)                                                     |
| **Byggbar v1**     | ❌ **blocker** — fel consent-modell i kod                          |

---

### 2.8 `customer.has_photo_review` (separat)

| Fält               | Värde                                |
| ------------------ | ------------------------------------ |
| **Steg**           | — (operatör, inte kundreseg 9)       |
| **Datafält**       | `needsPhotoReview`, `reviewFlags`    |
| **WHAT**           | Bildreview väntar                    |
| **NEXT**           | Photo Review — **ingen autoapprove** |
| **Human approval** | **ja**                               |
| **Byggbar v1**     | ✅                                   |

---

### 2.9 `customer.ready_for_treatment` (komposit)

| Fält               | Värde                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ersätter**       | `ready_for_visit`                                                                                                                               |
| **true när**       | `cooling_off_passed` + bundle signerad + `legal_review` OK + på **ops-dag**: friskförsäkran signerad + om bilder: `missing_photo_consent` false |
| **v1**             | Delvis via `ccoReadyForTreatmentBuilder` / treatment gate — **ej** aligned med 9 steg                                                           |
| **Human approval** | **nej** (info)                                                                                                                                  |
| **Byggbar v1**     | ❌ **blocker** — komposit ej implementerad                                                                                                      |

---

### 2.10 `customer.booking_missing_encounter` (ops — behålls)

Samma som v1-utkast: bokning utan encounter. **Ej** ett av Fazlis 9 kundresesteg.

---

## 3. Byggbarhet & build-blockers

| Regel                              | v1 dry-run | Blocker                                                 |
| ---------------------------------- | ---------- | ------------------------------------------------------- |
| `missing_health_declaration`       | ✅ proxy   | Journal-signatur i readout (v1.1)                       |
| `missing_journal`                  | ✅         | —                                                       |
| `missing_treatment_plan`           | ❌         | Readout-fält `consultation_plan` / offer                |
| `cooling_off_active` / `passed`    | ⚠️         | Agreement i evaluate (2d default; legacy 14d poster OK) |
| `missing_agreement_consent_bundle` | ✅ proxy   | Bundle-sign + `legal_review` i store                    |
| `missing_operation_day_insurance`  | ❌         | Ops-dags gate; avveckla T-48 comms                      |
| `missing_photo_consent`            | ❌         | Hairline/crown consent vid capture                      |
| `has_photo_review`                 | ✅         | —                                                       |
| `ready_for_treatment`              | ❌         | Komposit + alla gates ovan                              |
| `booking_missing_encounter`        | ✅\*       | \*bookingCoverage                                       |

---

## 4. Filstruktur & API (oförändrat princip)

- `ccoAutomationRegistry.js` — **9** kundrese-regler + `booking_missing_encounter`
- GET only: `/api/v1/cco/automation/catalog` · `evaluate` · `worklists`
- `customers-shell` + `includeAutomation=1` · Smart nästa steg (Claude UX)

---

## 5. GO

| GO                       | Beskrivning                                       |
| ------------------------ | ------------------------------------------------- |
| **Docs 9-steg**          | ✅ Kanonisk kundresa + denna readiness            |
| **GO: Registry dry-run** | Efter Fazli GO; **inte** före kundresa-docs klara |
| **GO: v1.1 data**        | HD, plan, bundle, ops-dag FF, photo scope         |
| **GO: reminders**        | **Ej** T-48 FF; separat beslut per steg 2/3/7     |

---

## Referenser

- Kanonisk kundresa: [`CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`](./CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md)
- Readout: `src/ops/ccoKunderEnrichment.js` · `ccoKunderBookingEnrichment.js`
- Cooling: `src/ops/ccoTreatmentAgreementStore.js`

_Hair TP Clinic · 2026-06-03 · Readiness v2 (9-steg)_
