# CCO Mobil journal — Pilotchecklista (Fas 5.5–5.6 + UX sweep)

Produktion: **https://arcana.hairtpclinic.se/staff?view=customers**  
Instruktion: [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md)  
Sweep-plan: [cco-mobile-ux-sweep-plan.md](./cco-mobile-ux-sweep-plan.md)

## Före pilot

- [x] **Pilotläge aktivt** — `ARCANA_STAFF_JOURNAL_OPEN_ACCESS=true` (ingen login krävs just nu)
- [x] **Auth go-live** — `OPEN_ACCESS=false`, OWNER MFA required, STAFF `staff@hairtpclinic.se` (2026-05-23)
- [ ] Minst 1 STAFF + 1 OWNER har inloggning testad på **mobil** (login krävs nu)
- [x] 5 pilotkunder tillgängliga — se `data/pilot-patients.json` + deep links via `npm run verify:mobile-pilot-prod`
- [ ] Personal har läst instruktionen (1 sida) — [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md)
- [x] Kör `npm run verify:mobile-pilot-prod` — **grön 2026-05-21**
- [x] Kör `npm run run:rollout-sweep` + pilot E2E alla 5 kunder — **grön 2026-05-23 (STAFF-auth)**
- [x] Kör `npm run verify:staff-ui-prod` — Playwright iPhone viewport **16/16 grön 2026-05-23**
- [x] Kör `npm run verify:staff-ui-desktop-prod` — desktop @1280 regression **2026-05-23**
- [x] Kör `smoke:mobile-journal` (STAFF) — photo upload + GET **~3,6s 2026-05-23**
- [x] Kör `npm test -- tests/ops/ccoMobileUxSweep.test.js` — asset + API-yta **2026-05-23**
- [x] Kör `npm run backup:journal-photos` — **2026-05-23** (`data/backups/journal-photos/`)

## Mobil shell (UX sweep — ny checklista)

Testa på **iPhone Safari 390×844** (eller DevTools iPhone 13).

| Kontroll | OK? |
| -------- | --- |
| Bottom tab bar (Kö / Kunder / Boka / Mer) synlig, inga desktop-nav-länkar | ✅ auto |
| Topbar ≤ 56px; app-titel visar vy/kundnamn | ✅ auto |
| Kundlista → klick → detail; **← Tillbaka** till lista | ✅ auto |
| Journal-flik ≥ 40px; **Ta bild** synlig utan scroll | ✅ auto |
| Inställningar/modaler öppnas som **bottom sheet** (inte centrerad desktop-modal) | ✅ auto |
| Arbetskö: kompakta rader + **Filter ▾** | ⚠️ auto (Filter ✅; tom kö = inga rader) |
| PWA “Lägg till på hemskärmen” från `/staff` | ☐ manuell |

**Automatiserat:** `npm run verify:staff-ui-prod` (prod) eller `npm run verify:staff-ui-local` (localhost:3100).

## Enhetstest (Fas 5.5)

Fyll i per enhet efter test i verklig konsultation (eller simulerad kund).

| Enhet            | Testare | Datum | Ta bild | Galleri | HEIC | Etikett | QR/deep link | Markera plan | Shell UX | OK? |
| ---------------- | ------- | ----- | ------- | ------- | ---- | ------- | ------------ | ------------ | -------- | --- |
| iPhone Safari    |         |       | ☐       | ☐       | ☐    | ☐       | ☐            | ☐            | ☐        | ☐   |
| Android Chrome   |         |       | ☐       | ☐       | ☐    | ☐       | ☐            | ☐            | ☐        | ☐   |
| iPad (markering) |         |       | ☐       | ☐       | ☐    | ☐       | ☐            | ☐            | ☐        | ☐   |

**Godkänt per enhet:** alla ☐ i raden ikryssade utan utvecklarstöd.

## Pilot med personal (Fas 5.6)

Mål: **2 personal**, minst **5 riktiga konsultationer** totalt.

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
