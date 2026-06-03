# CCO Mobil Kunder — Readiness (2026-06-03)

**Fas:** P0.5 — Mobil Kunder som riktig arbetsyta.

**Route:** `/m-kunder.html` + `cco-kunder-mobil-real.js`

**Source-of-truth:** Samma API som desktop — `GET /api/v1/cco/staff/customers-shell` (`segmentStats`, enriched patients, `patientId`). Dossier: journal-feed + assets + komm via `patientId`. Ingen mockdata, ingen demo-sida.

---

## Executive summary

| Mått                              | Desktop (P0.4)                       | Mobil (P0.5)            |
| --------------------------------- | ------------------------------------ | ----------------------- |
| **Readiness (verksam arbetsyta)** | **~94%**                             | **~96%**                |
| Lista                             | REAL                                 | REAL                    |
| Segment/filter                    | REAL + partial/disabled från API     | REAL + partial/disabled |
| Global sök                        | REAL (`q=`)                          | REAL (`q=`)             |
| Dossier                           | REAL                                 | REAL                    |
| Journal                           | REAL (`CcoJournalFeed.mount`)        | REAL                    |
| Assets                            | REAL (`/patients/:patientId/assets`) | REAL                    |
| Boka/omboka/bulk                  | disabled P1                          | disabled P1             |

**Gate:** `npm run cco:verify-mobile-kunder-real-data` + `npm run cco:real-cco-gate` (inkl. `/m-kunder.html`).

---

## Real fält (mobil lista + dossier)

| Fält                                                      | Status                           |
| --------------------------------------------------------- | -------------------------------- |
| `patientId`                                               | REAL                             |
| `displayName` (sanerad, ej tekniska filnamn)              | REAL                             |
| `emailMasked` / `phoneMasked`                             | REAL                             |
| `matchStatus`, flags, review badges                       | REAL                             |
| `hasJournal`, `missingJournal`, journalstatus             | REAL                             |
| `hasForm`, `missingForm`, formstatus                      | REAL                             |
| `hasAgreement`, `missingAgreement`, importstatus          | REAL                             |
| `nextStep`                                                | REAL                             |
| `hasUpcomingBooking`, `nextBookingAt`, `nextBookingType`  | REAL (när booking index finns)   |
| `lastVisitAt`, `encounterId`, `bookingCaseStatus`         | REAL / partial                   |
| `needsReview`, `needsPhotoReview`, `needsEncounterReview` | REAL                             |
| `treatmentTypes`, `todayVisit`, `onWaitlist`              | REAL                             |
| Kommunikation                                             | REAL via `CcoKommPanel` när auth |

---

## Segment (mobil chips)

| Segment                       | Status                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| Alla                          | REAL                                                       |
| Granska (`needs_review`)      | REAL                                                       |
| Idag (`today_visits`)         | REAL                                                       |
| Denna vecka (`this_week`)     | REAL                                                       |
| Väntelista (`waitlist`)       | REAL                                                       |
| Saknar journal                | REAL                                                       |
| Saknar formulär               | REAL                                                       |
| Saknar encounter              | REAL / partial                                             |
| Bild-review (`photos_review`) | REAL                                                       |
| GetAccept                     | REAL                                                       |
| halso@                        | REAL                                                       |
| Drive journal                 | REAL                                                       |
| Drive dokument                | REAL                                                       |
| Behandling FUE/DHI/PRP/…      | **Ej mobil chip** (desktop side-nav) — P1 parity om behövs |
| Mina                          | disabled (ägare P1)                                        |

Om API returnerar `status: disabled` → chip `disabled`, ingen mock-count.

---

## Actions

| Action                                   | Mobil                              |
| ---------------------------------------- | ---------------------------------- |
| Öppna dossier                            | REAL                               |
| Visa journal / timeline                  | REAL (länk + feed mount)           |
| Visa assets                              | REAL                               |
| Kalender (länk)                          | REAL                               |
| Boka / omboka                            | disabled — "Kopplas i Kalender P1" |
| Skicka formulär / skapa offert / ta bild | disabled — "Kommer i P1"           |
| Bulk                                     | Ej exponerad på mobil              |

Inga fake-toasts.

---

## Kvarvarande P0 / P1

| Item                                       | Prioritet     |
| ------------------------------------------ | ------------- |
| Behandlingssegment på mobil                | P1            |
| Boka/omboka från dossier                   | P1 (Kalender) |
| Formulär/avtal actions                     | P1            |
| Foto capture full koppling                 | P1            |
| Mina-filter (ägare)                        | P1            |
| Desktop 100% (agg AI/LTV borttaget — klar) | —             |

---

## Verify

```bash
npm run cco:verify-mobile-kunder-real-data
npm run cco:real-cco-gate
```

Script failar på: mock 1247/49 MSEK/Anna Karlsson, saknad `patientId`, namn-baserade assets, Drive-länkar, fake toasts, sök endast aktuell sida.

**Maskinläsbar:** `data/reports/cco-kunder-segment-readiness.json`
