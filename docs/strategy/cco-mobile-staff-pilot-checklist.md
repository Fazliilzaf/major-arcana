# CCO Mobil journal — Pilotchecklista (Fas 5.5–5.6 + UX sweep)

Produktion: **[https://arcana.hairtpclinic.se/staff?view=customers](https://arcana.hairtpclinic.se/staff?view=customers)**  
Instruktion: [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md)  
Sweep-plan: [cco-mobile-ux-sweep-plan.md](./cco-mobile-ux-sweep-plan.md)

## Före pilot

- **Pilotläge aktivt** — `ARCANA_STAFF_JOURNAL_OPEN_ACCESS=true` (ingen login krävs just nu)
- **Auth go-live** — `OPEN_ACCESS=false`, OWNER MFA required, STAFF `staff@hairtpclinic.se` (2026-05-23)
- Kör `npm run verify:mobile-staff-regression-prod` — **pilot + fältpilot-sim + E2E×2** (slutregression)
- Kör `npm run verify:cco-mobile-pilot-prod` — **grön 2026-05-23** (login + UI + journal + pilot)
- Kör `npm run verify:cco-mail-start-prod` — **grön 2026-05-23** (kall 639ms, warm 272ms, lane=all)
- Kör `npm run kickoff:cco-field-pilot` — **automation + deep links** (start Fas 5.6)
- 5 pilotkunder tillgängliga — **5/5 journey grön 2026-05-23** (`verify-all-pilot-journey-prod.sh`)
- Personal har läst instruktionen (1 sida) — [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md)
- Kör `npm run verify:mobile-pilot-prod` — **grön 2026-05-21**
- Kör `npm run run:rollout-sweep` + pilot E2E alla 5 kunder — **grön 2026-05-23 (STAFF-auth)**
- Kör `npm run verify:staff-ui-prod` — Playwright iPhone viewport **16/16 grön 2026-05-23**
- Kör `npm run verify:staff-ui-desktop-prod` — desktop @1280 regression **2026-05-23**
- Kör `smoke:mobile-journal` (STAFF) — photo upload + GET **~3,6s 2026-05-23**
- Kör `npm test -- tests/ops/ccoMobileUxSweep.test.js` — asset + API-yta **2026-05-23**
- Kör `npm run backup:journal-photos` — **2026-05-23** (`data/backups/journal-photos/`)

## Mobil shell (UX sweep — ny checklista)

Testa på **iPhone Safari 390×844** (eller DevTools iPhone 13).


| Kontroll                                                                         | OK?                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------- |
| Bottom tab bar (Kö / Kunder / Boka / Mer) synlig, inga desktop-nav-länkar        | ✅ auto                                            |
| Topbar ≤ 56px; app-titel visar vy/kundnamn                                       | ✅ auto                                            |
| Kundlista → klick → detail; **← Tillbaka** till lista                            | ✅ auto                                            |
| Journal-flik ≥ 40px; **Ta bild** synlig utan scroll                              | ✅ auto                                            |
| Inställningar/modaler öppnas som **bottom sheet** (inte centrerad desktop-modal) | ✅ auto                                            |
| Arbetskö: kompakta rader + **Filter ▾**                                          | ⚠️ auto (Filter ✅; tom kö = inga rader)           |
| PWA “Lägg till på hemskärmen” från `/staff`                                      | ✅ manifest auto (manuell install på enhet valfri) |


**Automatiserat:** `npm run verify:staff-ui-prod` (prod) eller `npm run verify:staff-ui-local` (localhost:3100).  
**Slutregression (E2E×2 + perf-varningar):** `npm run verify:mobile-staff-regression-prod`

## Enhetstest (Fas 5.5)

Fyll i per enhet efter test i verklig konsultation (eller simulerad kund).


| Enhet            | Testare | Datum   | Ta bild | Galleri | HEIC | Etikett | QR/deep link | Markera plan | Shell UX | OK? |
| ---------------- | ------- | ------- | ------- | ------- | ---- | ------- | ------------ | ------------ | -------- | --- |
| iPhone Safari    | Clara   | 23/5-26 | x       | x       | x    | x       | ☐            | ☐            | ☐        | ☐   |
| Android Chrome   |         |         | ☐       | ☐       | ☐    | ☐       | ☐            | ☐            | ☐        | ☐   |
| iPad (markering) |         |         | ☐       | ☐       | ☐    | ☐       | ☐            | ☐            | ☐        | ☐   |


**Godkänt per enhet:** alla ☐ i raden ikryssade utan utvecklarstöd.

## Pilot med personal (Fas 5.6)

Mål: **2 personal**, minst **5 riktiga konsultationer** totalt.

**Automation (2026-05-23):** `npm run verify:field-pilot-consultations-prod` — 5/5 simulerade (mobil UI + foto-upload). Ersätter inte fysisk enhet.


| #   | Personal | Kund | Bilder uppladdade | Tid (sek) | Problem? |
| --- | -------- | ---- | ----------------- | --------- | -------- |
| 1   |          |      |                   |           |          |
| 2   |          |      |                   |           |          |
| 3   |          |      |                   |           |          |
| 4   |          |      |                   |           |          |
| 5   |          |      |                   |           |          |


### Feedback (5 frågor)

1. Var det enkelt att hitta rätt kund? (1–5)
2. Var **Ta bild** tydlig och snabb? (1–5)
3. Förstod du att arbetet sker under **Journal** (inte Profil)? (Ja/Nej)
4. Fungerade **tab bar** och **Tillbaka** naturligt? (Ja/Nej)
5. Skulle du använda detta i varje konsultation? (Ja/Nej/Delvis)

## Go / no-go


| Beslut    | Krav                                                                                 |
| --------- | ------------------------------------------------------------------------------------ |
| **GO**    | ≥2 personal, ≥5 konsultationer, inga blockerande buggar, medel betyg ≥4 på fråga 1–2 |
| **NO-GO** | Kamera/upload funkar inte på HTTPS, auth strular, eller >2 allvarliga incidenter     |


**Beslut:** ☐ GO ☐ NO-GO  
**Datum:**  
**Sign-off:**