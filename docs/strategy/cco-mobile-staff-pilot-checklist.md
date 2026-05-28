---
owner: CCO
status: active
---

# CCO Mobil journal — Pilotchecklista (Fas 5.5–5.6 + UX sweep)

> **Status 2026-05-20:** Fas 5.5–5.6 **uppskjuten** — automation smoke GO (`verify:staff-ui-prod`).  
> Denna checklista körs vid behov när personal ska testa i fält; blockerar inte go-live.

Produktion: **[https://arcana.hairtpclinic.se/staff?view=customers](https://arcana.hairtpclinic.se/staff?view=customers)**  
Masterlista (en sida): [MASTER-TODO.md](./MASTER-TODO.md) · Notion: [Major Arcana — Master TODO](https://www.notion.so/6d5ae9dabf314678959270ba86a6cbf6)  
Instruktion: [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md)  
Sweep-plan: [cco-mobile-ux-sweep-plan.md](./cco-mobile-ux-sweep-plan.md)

## Före pilot

- **Login krävs** — `ARCANA_STAFF_JOURNAL_OPEN_ACCESS=false` (ingen open access i prod)
- **Auth go-live** — OWNER MFA enforced, STAFF `staff@hairtpclinic.se` (2026-05-24)
- **iOS blur-fix** — stängda modal-backdrops suddar inte längre (`3364875`, 2026-05-24)
- Kör `npm run verify:mobile-staff-regression-prod` — **pilot + fältpilot-sim + E2E×2**
- Kör `npm run verify:cco-mobile-pilot-prod` — login + UI + journal + pilot
- Kör `npm run kickoff:cco-field-pilot` — automation + deep links (start Fas 5.6)
- 5 pilotkunder tillgängliga — `verify-all-pilot-journey-prod.sh`
- Personal har läst instruktionen — [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md) *(valfritt; hanteras externt)*
- Kör `npm run run:rollout-sweep` + pilot E2E alla 5 kunder
- Kör `npm run verify:staff-ui-prod` — Playwright iPhone viewport
- Kör `smoke:mobile-journal` (STAFF) — photo upload + GET
- Kör `npm test -- tests/ops/ccoMobileUxSweep.test.js`
- Kör `npm run backup:journal-photos` (`data/backups/journal-photos/`)

## Mobil shell (UX sweep)

Testa på **iPhone Safari 390×844** (eller DevTools iPhone 13).  
Efter deploy: **stäng Safari-fliken** och öppna `/staff` igen (cache).

| Kontroll | OK? |
| -------- | --- |
| Bottom tab bar (Hem · Boka · Kalender · Kund · Journal), inga desktop-nav-länkar | ✅ auto |
| Topbar ≤ 56px; app-titel visar vy/kundnamn | ✅ auto |
| **Skarp bild** — ingen suddig overlay; kan scrolla och trycka | ✅ auto (iOS backdrop-fix) |
| Kundlista → klick → detail; **← Tillbaka** till lista | ✅ auto |
| Journal-flik ≥ 40px; **Ta bild** synlig utan scroll | ✅ auto |
| Inställningar/modaler öppnas som **bottom sheet** | ✅ auto |
| Arbetskö: kompakta rader + **Filter ▾** | ⚠️ auto (tom kö = inga rader) |
| PWA “Lägg till på hemskärmen” från `/staff` | ✅ manifest (manuell install valfri) |

**Automatiserat:** `npm run verify:staff-ui-prod` · **Slutregression:** `npm run verify:mobile-staff-regression-prod`

## Enhetstest (Fas 5.5)

**Automatiserat (BL.3):** `npm run verify:android-staff-prod` — Playwright Pixel 5 @ prod (login, tabbar, E2E-klick). Ersätter inte kamera/HEIC på fysisk Android.

Fyll i per enhet efter test i verklig konsultation (eller simulerad kund).

| Enhet | Testare | Datum | Ta bild | Galleri | HEIC | Etikett | QR/deep link | Markera plan | Shell UX | OK? |
| ----- | ------- | ----- | ------- | ------- | ---- | ------- | ------------ | ------------ | -------- | --- |
| iPhone Safari | Clara | 23/5–26 | x | x | x | x | ☐ | ☐ | ☐ | ☐ |
| Android Chrome | | | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| iPad (markering) | | | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

**Godkänt per enhet:** alla ☐ i raden ikryssade utan utvecklarstöd.

## Pilot med personal (Fas 5.6)

Mål: **2 personal**, minst **5 riktiga konsultationer** totalt.

**Automation:** `npm run verify:field-pilot-consultations-prod` — simulerar UI + foto (ersätter inte fysisk enhet).

| # | Personal | Kund | Bilder uppladdade | Tid (sek) | Problem? |
| --- | -------- | ---- | ----------------- | --------- | -------- |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

### Feedback (5 frågor)

1. Var det enkelt att hitta rätt kund? (1–5)
2. Var **Ta bild** tydlig och snabb? (1–5)
3. Förstod du att arbetet sker under **Journal** (inte Profil)? (Ja/Nej)
4. Fungerade **tab bar** och **Tillbaka** naturligt? (Ja/Nej)
5. Skulle du använda detta i varje konsultation? (Ja/Nej/Delvis)

## Go / no-go

| Beslut | Krav |
| ------ | ---- |
| **GO** | ≥2 personal, ≥5 konsultationer, inga blockerande buggar, medel betyg ≥4 på fråga 1–2 |
| **NO-GO** | Kamera/upload funkar inte på HTTPS, auth strular, eller >2 allvarliga incidenter |

**Beslut:** ☐ GO ☐ NO-GO  
**Datum:**  
**Sign-off:**
