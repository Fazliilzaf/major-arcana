# ORD-29 — Cloud Staff UAT (hälsodeklaration · asset enrichment)

**Status:** **CLOSED** — Fas 1 · owner prod GO · automated prod sticks **14/14 PASS** (2026-06-16)  
**Prod:** `https://arcana.hairtpclinic.com`  
**Automated pre-check:** `npm run verify:ord29-prod-sticks`  
**Browser capture:** `npm run capture:ord29-browser-uat`  
**Förväntad tid:** 25–35 min

**Fas 2:** Struktur-ingest (mailbox HD → `patient.healthDeclaration`) **operativt blockerad** — PNR-källa otillräcklig (Kundexport + Dataexport testat). **Nästa:** manuell review-queue triage (`ORD-29-MANUAL-REVIEW-TRIAGE.md`). Fas 1 UAT nedan är **CLOSED**.

---

## Förutsättningar

1. Inloggad som staff/owner
2. Prod grön: `/readyz` + `npm run verify:ord29-prod-sticks`
3. Stickprov-patienter har importerad HD (halso@ / PDF) — se `scripts/run-import-plan-uat.js`
4. Screenshot vid FAIL

---

## Pilot-URL:er (prod)

| Scenario                   | Kund            | URL                                                                                                                             |
| -------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| U29.1 · HD positive (Omar) | Omar Khalid     | `https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=3cdf4d6c-8f3d-4b2a-9c1e-2a4f8b0e9d12` |
| U29.2 · Signed HD (Jonas)  | Jonas Lundvall  | `https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=a6a55cae-8c12-4d7d-83da-adbcdd368b00` |
| U29.3 · HD PDF stickprov   | Johan Magnusson | `https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=134562c1-ce60-49a3-82dd-f5489defaf09` |

Höger kundkort ska öppnas direkt (desktop `patientId` deeplink). Hårdladda vid cache-problem.

---

## U29.1 — m365_halso HD asset räknas som hälsodeklaration

| #      | Steg                                  | Förväntat                                                          | PASS  |
| ------ | ------------------------------------- | ------------------------------------------------------------------ | ----- |
| U29.1a | Öppna Omar (URL ovan)                 | Kundkort laddar utan fel                                           | ☑     |
| U29.1b | Sektion Medicinskt / ORD-48 ready-rad | Hälsodekl. pill **grön** (success)                                 | ☑     |
| U29.1c | API/readout (Omar ref-UUID)           | **WARN förväntat** — ref-ID 404 i master; övriga stickprov `false` | N/A ☑ |
| U29.1d | Dokument                              | HD kan öppnas (viewUrl / medicinskt rad)                           | ☑     |

---

## U29.2 — Journal-only räknas inte som HD

| #      | Steg                                                     | Förväntat                                            | PASS |
| ------ | -------------------------------------------------------- | ---------------------------------------------------- | ---- |
| U29.2a | Patient med enbart m365_halso **journal** (ej stickprov) | `missingHealthDeclaration` fortfarande true          | ☑    |
| U29.2b | Segmentfilter                                            | Syns under `missing_health_declaration` i kundlistan | ☑    |

---

## U29.3 — Injektions-journal filnamn exkluderas

| #      | Steg                                            | Förväntat                                                 | PASS |
| ------ | ----------------------------------------------- | --------------------------------------------------------- | ---- |
| U29.3a | Asset med `[Injektions-journal/Webb]` i filnamn | Räknas **inte** som HD (`isHealthDeclarationAsset` false) | ☑    |

---

## U29.4 — viewUrl på enriched card

| #      | Steg                             | Förväntat                                            | PASS |
| ------ | -------------------------------- | ---------------------------------------------------- | ---- |
| U29.4a | Jonas — signerad HD i medicinskt | Hälsodeklaration visar signerad + ev. öppningslänk   | ☑    |
| U29.4b | FC/HD asset                      | `viewUrl` pekar på `/api/v1/cco/assets/.../download` | ☑    |

---

## U29.5 — Segment `missing_health_declaration` + `halso`

| #      | Steg                                          | Förväntat                                        | PASS |
| ------ | --------------------------------------------- | ------------------------------------------------ | ---- |
| U29.5a | Kundlista segment **Saknar hälsodeklaration** | Patienter utan HD syns                           | ☑    |
| U29.5b | Segment **halso@**                            | Patienter med m365_halso-import syns             | ☑    |
| U29.5c | Omar/Johan stickprov                          | **Ej** i missing_health_declaration efter import | ☑    |

---

## Automatiserad prod-check (före manuell UAT)

```bash
npm run verify:ord29-prod-sticks
node --test tests/ops/ccoKunderEnrichment.test.js
npm run capture:ord29-browser-uat
node scripts/run-import-plan-uat.js
```

---

## Godkännandekriterier

- [x] U29.1–U29.5 PASS eller N/A — U29.1c Omar ref-UUID **WARN förväntat** (404); övriga täcks av sticks **14/14** + owner prod GO 2026-06-16
- [x] `verify:ord29-prod-sticks` PASS (14/14 exit 0; 4/5 stickprov `missingHealthDeclaration=false`, Omar WARN)
- [x] Owner prod GO (2026-06-16)

---

_Hair TP · ORD-29 Cloud Staff UAT · 2026-06-16_
