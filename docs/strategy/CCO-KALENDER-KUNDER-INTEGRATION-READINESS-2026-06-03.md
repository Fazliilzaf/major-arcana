# CCO Kalender ↔ Kunder — Integration Readiness (2026-06-03)

**Scope:** `/kalender.html` (kalender-arbetsyta) och `/kunder.html` (kund-arbetsyta), koppling via `customers-shell` + bokningsstores.

---

## `/kalender.html` — inventering (P0.4)

| Yta                                | Status             | Datakälla                                        | Anteckning                                        |
| ---------------------------------- | ------------------ | ------------------------------------------------ | ------------------------------------------------- |
| Dag/vecka/resurs-vy                | **REAL** (delvis)  | `GET /api/v1/cco-bookings/calendar-bundle`       | Via `booking-calendar-shared.js` / kalender-shell |
| Slots & block                      | **REAL**           | `ccoBookingEngineStore.listAvailability`         | Engine store                                      |
| Bokningsärenden (cases)            | **REAL**           | `ccoBookingStore`                                | Legacy cases + status workflow                    |
| Drag-omboka                        | **REAL**           | `POST /cco-bookings/calendar/rebook`             | Kräver auth                                       |
| Calendar signals (påminnelse/form) | **REAL**           | `calendar-signals` + `buildCalendarSignalsIndex` | E-post → patient via missing-forms report         |
| Kunddossier i kalender             | **PARTIAL**        | Mockup-DNA + API hooks                           | v8 dossier — inte full patient-master             |
| Intäkt/KPI i kalender              | **MOCK / REMOVED** | —                                                | Ska inte återinföras utan Fortnox-read            |
| Anna Karlsson demo-rader           | **MOCK** (om kvar) | Statisk HTML                                     | Ej i aktiv bundle om borttagen                    |

**API:er i bruk**

- `/api/v1/cco-bookings/calendar-bundle`
- `/api/v1/cco-bookings/calendar-signals`
- `/api/v1/cco-bookings/calendar/rebook`
- `/api/v1/cco-bookings/cases`
- `/api/v1/cco-booking-engine/*` (publik + staff)

**För verksam kalender (post P0.4)**

1. Konsekvent `patientId` på alla nya bokningar (idag primärt `customerEmail` + `conversationId`).
2. Encounter skapas vid confirm (`ccoTreatmentEncounterStore`) — Kunder visar gap om encounter saknas.
3. Mobil kalender (`/m-kalender.html`) — P0.5.
4. Boka/omboka från Kunder — P1 (länk till kalender finns P0.4).

---

## `/kunder.html` — bokningskoppling (P0.4)

| Fält / segment                           | Status                       | Källa                        |
| ---------------------------------------- | ---------------------------- | ---------------------------- |
| `hasUpcomingBooking`, `nextBookingAt`, … | **REAL**                     | `ccoKunderBookingEnrichment` |
| Idag / Denna vecka / Väntelista          | **REAL** (om store har data) | Engine bookings + cases      |
| Behandling FUE/DHI/PRP/…                 | **REAL**                     | `serviceId` / encounter-typ  |
| `lastVisitAt`, `lastEncounterAt`         | **REAL** (partial)           | Past slots + encounters      |
| Saknar encounter                         | **REAL**                     | Upcoming utan encounter-rad  |
| Öppna i kalender                         | **REAL**                     | Länk `/kalender.html`        |
| Boka / Omboka                            | **DISABLED**                 | "Kopplas i Kalender P1"      |

**Stores (lazy-load i `customers-shell`)**

- `data/cco-booking-engine.json`
- `data/cco-bookings.json`
- `data/cco-treatment-encounters.json`

---

## Readiness

| Mått                        | Värde                                          |
| --------------------------- | ---------------------------------------------- |
| Kunder (efter P0.4)         | **~94%** verksam arbetsyta                     |
| Kalender (befintlig)        | **~72%** (UI stark, patientId-koppling svag)   |
| Kunder↔Kalender integration | **~85%** (read-sida klar, write i kalender P1) |
