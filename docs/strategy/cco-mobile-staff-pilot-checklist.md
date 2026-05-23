# CCO Mobil journal — Pilotchecklista (Fas 5.5–5.6)

Produktion: **https://arcana.hairtpclinic.se/major-arcana-preview/?view=customers**  
Instruktion: [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md)

## Före pilot

- [x] **Pilotläge aktivt** — `ARCANA_STAFF_JOURNAL_OPEN_ACCESS=true` (ingen login krävs just nu)
- [ ] Minst 1 STAFF + 1 OWNER har inloggning (krävs **före skarp drift** när open access stängs av)
- [x] 5 pilotkunder tillgängliga — se `data/pilot-patients.json` + deep links via `npm run verify:mobile-pilot-prod`
- [ ] Personal har läst instruktionen (1 sida) — [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md)
- [x] Kör `npm run verify:mobile-pilot-prod` — **grön 2026-05-23**
- [x] Kör `npm run backup:journal-photos` — **2026-05-23** (`data/backups/journal-photos/`)

## Enhetstest (Fas 5.5)

Fyll i per enhet efter test i verklig konsultation (eller simulerad kund).

| Enhet            | Testare | Datum | Ta bild | Galleri | HEIC | Etikett | QR/deep link | Markera plan | OK? |
| ---------------- | ------- | ----- | ------- | ------- | ---- | ------- | ------------ | ------------ | --- |
| iPhone Safari    |         |       | ☐       | ☐       | ☐    | ☐       | ☐            | ☐            | ☐   |
| Android Chrome   |         |       | ☐       | ☐       | ☐    | ☐       | ☐            | ☐            | ☐   |
| iPad (markering) |         |       | ☐       | ☐       | ☐    | ☐       | ☐            | ☐            | ☐   |

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
4. Något som strulade (nätverk, inloggning, bildformat)? (fritext)
5. Skulle du använda detta i varje konsultation? (Ja/Nej/Delvis)

## Go / no-go

| Beslut    | Krav                                                                                 |
| --------- | ------------------------------------------------------------------------------------ |
| **GO**    | ≥2 personal, ≥5 konsultationer, inga blockerande buggar, medel betyg ≥4 på fråga 1–2 |
| **NO-GO** | Kamera/upload funkar inte på HTTPS, auth strular, eller >2 allvarliga incidenter     |

**Beslut:** ☐ GO ☐ NO-GO  
**Datum:**  
**Sign-off:**
