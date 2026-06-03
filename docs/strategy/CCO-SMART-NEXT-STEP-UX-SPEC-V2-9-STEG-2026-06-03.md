# Smart nästa steg — UX-spec v2 (9-steg Hair TP)

**Status:** Spec only — **ingen UI-implementation** · ORD-1 deploy `7bca8362` (2026-06-03)  
**Kanonisk kundresa:** [`CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`](./CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md)  
**Registry (teknisk):** [`CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md`](./CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md)  
**Supersedes:** Smart Functions-plan där `missing_form` = hälsodekl+friskförsäkran, T-48 FF, 14d betänketid, separat samtycke vid offert

---

## Förbjuden copy (använd aldrig i v2)

- T-48h friskförsäkran
- Auto-skicka behandlingssamtycke
- Pre-info separat steg
- 14 dagar (betänketid Hair TP)
- Foto-samtycke ansikte / generell publicering som default
- `missing_form` / “Saknar formulär” (ospecifikt)
- AI föreslår / Automatiskt skickat

---

## Signalmatris

| #   | Signal                             | What                          | Why                                                                                                 | Next                                 | Risk          | Human approval           | Knapp                  | Disabled reason                       |
| --- | ---------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------- | ------------------------ | ---------------------- | ------------------------------------- |
| 1   | `missing_health_declaration`       | Hälsodeklaration saknas       | Krävs inför konsultation (steg 3). Pre-info och Meridiq-länk ingår i bokningsbekräftelsen (steg 2). | Öppna formulärstatus / patientportal | blocker       | Ja om påminnelse skickas | Formulär (partial)     | “Kräver formulärmotor” tills route GO |
| 2   | `missing_journal`                  | Journal saknas                | Konsultation (steg 4) kräver encounter + journal.                                                   | Öppna journal                        | blocker       | Nej                      | Journal (real)         | —                                     |
| 3   | `missing_treatment_plan`           | Behandlingsplan/offert saknas | Efter konsult (steg 5) — samma operativa steg.                                                      | Skapa/skicka plan                    | blocker       | Ja                       | Offert (disabled)      | “Kräver offertmotor”                  |
| 4   | `cooling_off_active`               | Betänketid pågår              | **2 dagar** (steg 6). Ej bokbar för nästa steg.                                                     | Vänta — visa slutdatum               | info          | Nej                      | —                      | —                                     |
| 5   | `cooling_off_passed`               | Betänketid passerad           | 2 dagar har gått — kan gå till bundle-signering.                                                    | Fortsätt till avtal+samtycke         | ready         | Nej                      | Avtal (partial)        | Saknar legal_review/sign              |
| 6   | `missing_agreement_consent_bundle` | Avtal + samtycke saknas       | Steg 7 — **samma transaktion**. Separata utskick förbjudna.                                         | Legal review → bundle sign           | legal_blocker | Ja                       | Avtal (partial)        | Signering ej GO                       |
| 7   | `missing_operation_day_insurance`  | Friskförsäkran saknas         | **Operationsdagen** — tablet/QR. Blockerar operationsstart.                                         | Öppna friskförsäkran på plats        | blocker       | Patient signerar         | Portal-länk (partial)  | Ej T-48 mail                          |
| 8   | `missing_photo_consent`            | Foto-samtycke saknas          | Vid för-/efterbild (steg 9). **Hårlinje/krona — aldrig ansikte.**                                   | Visa scope-prompt vid foto           | legal         | Ja                       | Samtycke (disabled)    | Ej publiceringsmall                   |
| 9   | `has_photo_review`                 | Bildreview väntar             | Operatör granskar import — **ej** samma som foto-samtycke.                                          | Öppna Photo Review                   | needs_review  | Ja                       | Photo Review (partial) | Ingen autoapprove                     |
| 10  | `ready_for_treatment`              | Redo för behandling           | Komposit: betänketid OK + bundle + legal_review + ops-dag FF + foto-samtycke om bilder.             | Öppna kalender / ops                 | ready         | Nej                      | Kalender (real)        | Saknar gate ovan                      |

**Ops (ej kundresesteg):** `booking_missing_encounter` — samma UX-mönster som idag, egen badge.

---

## Godkänd copy (mallar)

- Friskförsäkran signeras på operationsdagen
- Betänketid 2 dagar
- Avtal + behandlingssamtycke signeras tillsammans
- Foto-samtycke gäller hårlinje/krona — aldrig ansikte
- Pre-info ingår i bokningsbekräftelsen

---

## Bilaga C — Prod-alignment (ORD-2, efter ORD-1)

### ✅ DONE (live `7bca8362`)

- **2d betänketid** — `ccoHairTpCoolingOffPolicy.js` (`HAIR_TP_COOLING_OFF_DAYS = 2`)
- **Kanonisk 9-stegs** kundresa i strategy-docs + verify-gate
- **`missing_health_declaration`** — segment + readout-fält (proxy: asset `form`; journal-signatur = v1.1)
- **Förbjuden copy** — T-48 FF, 14d betänketid, `missing_form`, separat samtycke vid offert

### ⏳ REMAINING (ej ORD-1/2)

- `legal_review` i `ccoTreatmentAgreementStore`
- Bundle-sign avtal + behandlingssamtycke (steg 7)
- Ops-dags friskförsäkran-gate (steg 8) i runner/UI
- Foto-samtycke hårlinje/krona vid capture (steg 9)
- `cooling_off_active` / `cooling_off_passed` i readout (agreement i evaluate)
- **`ready_for_treatment`** — registry-namn; readout har fortfarande `readyForVisit`
- Automation Registry dry-run (väntar owner-GO)

---

## Kräver Cursor-kodfix (nästa orders)

- Registry/Runner implementation (väntar GO)
- `missingHealthDeclaration` från journal-signatur (v1.1 precision)
- Ops-dags gate för friskförsäkran
- Bundle-sign + `legal_review`
- Hairline/crown consent vid capture
- `readyForVisit` → `ready_for_treatment` i readout

_Hair TP Clinic · 2026-06-03 · ORD-2 doc-sync_
