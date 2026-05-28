---
owner: Ops
status: active
---

# CCO prestanda-arkitektur — Fas 1–12

> Vanilla JS runtime (`major-arcana-preview`). Data layer: `CcoRequestCache` (inte React Query).  
> Baseline render-optimeringar P1–P6 + P2–P4 dokumenteras i avsnittet **Historik (Fas P)** nedan.

## Baseline (mät före/efter deploy)

| Signal | DevTools / script |
| --- | --- |
| Render | `window.__getRenderStats()` — `lastDurationMs`, `bootstrapCacheHits` |
| Fetch | `window.__getFetchStats()` — `total`, `deduped`, `byPathPrefix` |
| Prod smoke | `npm run verify:cco-performance-baseline-prod` |
| Index rebuild | `node scripts/rebuild-cco-indexes.js` (efter bulk-import) |

**Mål:** Mejllista klickbar <200 ms; kundregister första paint utan journal-payload; kalender en bundle per månad.

---

## Fas 1 — Instrumentering + baseline

- [x] `public/major-arcana-preview/app/cco-fetch-instrumentation.js`
- [x] `window.__getFetchStats()` (parallellt med `__getRenderStats`)
- [x] `apiRequest` instrumenterad i `app.js` + `patient-master-ui.js`
- [x] `scripts/verify-cco-performance-baseline-prod.js`
- [x] npm: `verify:cco-performance-baseline-prod`

## Fas 2 — Central CCO Data Layer

- [x] `public/major-arcana-preview/app/cco-request-cache.js` — `fetch(key, fn, { staleTime, gcTime })`, in-flight dedupe, subscribe
- [x] `window.ArcanaCcoData` export
- [x] Wired: `patient-master-ui.js`, `booking-calendar-shared.js`, `runtime-dom-live-composition.js` (worklist consumer)

## Fas 3 — staleTime-klasser

- [x] `public/major-arcana-preview/app/cco-cache-policy.js` — `STATIC`, `WORKLIST`, `PATIENT_LIST`, `JOURNAL`, `CALENDAR`, `ANALYTICS`, `BOOTSTRAP`, `REF_DATA`

## Fas 4 — Dedupe + konsoliderade endpoints

- [x] `GET /api/v1/cco/staff/customers-shell` (stats + patients + offer-templates)
- [x] `GET /api/v1/cco-bookings/calendar-bundle?fromDate&toDate` (slots + blocks + cases + signals)
- [x] `fetchBookedCounts` återanvänder calendar-bundle cases
- [x] Kundvy: `loadPatientList` → customers-shell (ersätter parallella stats/patients där säkert)

## Fas 5 — Server-side pagination/filter

- [x] `listPatients()` index-first lookup för e-post/personnummer (`lookupPatientsByQuery`)
- [x] Befintlig limit/offset behållen

## Fas 6 — Store-level JSON-indexering

- [x] Index: `patientByEmail`, `patientByPnr`, `casesByDate`, `journalByPatientId`
- [x] `scripts/rebuild-cco-indexes.js`
- [x] Index uppdateras on save i patient/booking/journal stores

## Fas 7 — Redis/server read-cache

- [x] `src/infra/ccoReadCache.js` — Redis + memory fallback
- [x] Cache: stats, patient queries, calendar-bundle, customers-shell (kort TTL)
- [x] Journal: **aldrig** delad Redis-cache av innehåll (GDPR)

## Fas 8 — Dashboard snapshot

- [x] `src/ops/ccoStaffDashboardSnapshot.js`
- [x] `GET /api/v1/cco/staff/dashboard-snapshot`
- [x] Scheduler: `cco_dashboard_snapshot_refresh` (5 min)
- [x] `loadAnalyticsRuntime()` provar snapshot först

## Fas 9 — Work queue precompute

- [x] Scheduler: `cco_worklist_snapshot_refresh` (2 min)
- [x] `GET /api/v1/cco/staff/worklist-snapshot`
- [x] Worklist consumer cache via `CcoRequestCache` + befintlig AnalyzeInbox debounce

## Fas 10 — Lazy journal

- [x] `GET /api/v1/cco-patient-master/patient/summary` (ingen journal)
- [x] `GET /api/v1/cco-journal/entries?patientId&limit&offset` (paginerad)
- [x] `patient-master-ui.js`: summary vid öppning, journal vid flik

## Fas 11 — Virtualiserade listor

- [x] `public/major-arcana-preview/app/cco-patient-list-virtual.js` (tröskel 80 rader)
- [x] Mail-kö: befintlig `lit-switchover.js` (>150)

## Fas 12 — Cursor rule + QA

- [x] `.cursor/rules/cco-performance.mdc`
- [x] QA-checklista i denna fil + cursor rule

---

## Historik (Fas P — render/bundle)

| # | Åtgärd | Status |
| --- | --- | --- |
| P1 | En JS-bundle | Implementerad |
| P2 | Scopad render | Implementerad |
| P3 | rAF coalesce | Implementerad |
| P4 | AnalyzeInbox bakgrund | Implementerad |
| P5 | Lätt trådval | Implementerad |
| P6 | Lit virtual scroll (>150) | Implementerad |
| P2a–e | Light bootstrap + lazy body | Implementerad |
| P3a–c | content-visibility + stats | Implementerad |
| P4a–d | Lazy aux-mount + history limit | Implementerad |

---

## Deploy

```bash
npm run build:bundle
node bin/inject-bundle.js
npm run check:syntax
npm run test:unit
npm run verify:cco-performance-baseline-prod   # efter prod deploy
```

## Kvar / förbättringar

- Dashboard snapshot: enrich med pilotReport/risk när scheduler har tillgång till report builders
- Worklist snapshot: koppla till truth-consumer payload (inte bara metadata)
- Kör `rebuild-cco-indexes` på prod efter migration om index saknas i JSON
