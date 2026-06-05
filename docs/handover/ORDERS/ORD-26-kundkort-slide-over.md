# ORD-26 — Kundkort slide-over ★ Kunddossiér (15 sektioner)

**Skapad:** 2026-06-05  
**Assignee:** Cursor (write — frontend)  
**Prio:** P1  
**Status:** done

---

## Rapport (Cursor · 2026-06-05)

### Levererat

- **ORD-spec:** `docs/handover/ORDERS/ORD-26-kundkort-slide-over.md`
- **Render + bind:** `public/major-arcana-preview/app/cco-v9-customers-parity.js`
  - `renderKundkortSlideOverHtml` — sektion 4–15 (accordion + dokument + kundresa + sticky + footer)
  - Hero sektion 1–3 oförändrad path (`renderV11Hero` med **★ Kunddossiér**)
  - `bindKundkortSlideOver` — intel-actions, scroll-nav, GDPR-footer
- **Public API:** `public/major-arcana-preview/app/cco-kundkort-slide-over.js`
- **CSS vellum slide-over:** `public/major-arcana-preview/cco-v9-customers.css`
- **Script:** `index.html` laddar `cco-kundkort-slide-over.js`
- **Data:** `loadPatientDocumentBundle` → `GET .../dossier-bundle?includeJournal=0` (ORD-23)

### 15 sektioner

| #     | Var       | Innehåll                                                                             |
| ----- | --------- | ------------------------------------------------------------------------------------ |
| 1–3   | Hero      | Identitet ★ · medicinsk briefing · stat-row                                          |
| 4–11  | Accordion | Kommande · Historik · Filer · Anteckningar · Kommunikation · Ekonomi · Formulär · AI |
| 12–13 | Panel     | Dokument-segment · Kundresan                                                         |
| 14–15 | Botten    | Sticky actions · Footer (GDPR · aktivitetslog)                                       |

Anteckningar = read-only (`importantNote`, allergies, `recentEvents`) — **ingen journal-editor**.

### Gates

- `npm run check:syntax` — PASS
- `npm run lint:no-bypass` — PASS
- `npm run smoke:local` — PASS

### Ej rört

- Journal-flikar / feed / forms (backend + editor)  
  **Beroende:** ORD-23 (`GET /api/v1/cco-patient-master/patient/dossier-bundle`)

---

## Uppdrag

Bygg **slide-over ★ Kunddossiér** i kundvyn med **15 sektioner**, vellum-tokens och data från `dossier-bundle`. Ersätter v11-zonpanelen (kommande/kundresan/veckans mönster) med mockup-par accordion-scroll.

---

## 15 sektioner (fast ordning)

| #   | Sektion                               | Datakälla                                   | Placering            |
| --- | ------------------------------------- | ------------------------------------------- | -------------------- |
| 1   | Identitet (★ Kunddossiér, pills)      | `dossier-bundle.card`                       | Hero (befintlig v11) |
| 2   | Medicinsk briefing                    | `card.allergies` / ORD-23                   | Hero                 |
| 3   | Statistik (Besök · Intäkt · No-shows) | `card`                                      | Hero                 |
| 4   | Kommande bokningar                    | `card` + occasionTimeline                   | Slide-over           |
| 5   | Historik                              | occasionTimeline                            | Slide-over           |
| 6   | Filer                                 | `card.fileSummary` + driveFiles             | Slide-over           |
| 7   | Anteckningar                          | `importantNote`, `recentEvents` (read-only) | Slide-over           |
| 8   | Kommunikation                         | occasionTimeline / card                     | Slide-over           |
| 9   | Ekonomi                               | `card` LTV                                  | Slide-over           |
| 10  | Formulär & krav                       | `documentBlockers` / compliance             | Slide-over           |
| 11  | AI-insikter                           | `automationSignals`                         | Slide-over           |
| 12  | Dokument-segment                      | `dossier-bundle.documents`                  | Slide-over           |
| 13  | Kundresan                             | `dossier-bundle` + journey                  | Slide-over           |
| 14  | Sticky actions                        | Smart next step                             | Slide-over botten    |
| 15  | Footer (GDPR · aktivitetslog)         | actions                                     | Slide-over botten    |

---

## Scope (får röras)

- `public/major-arcana-preview/app/cco-kundkort-slide-over.js` (ny)
- `public/major-arcana-preview/app/cco-v9-customers-parity.js` (render + bind)
- `public/major-arcana-preview/cco-v9-customers.css` (slide-over + vellum)
- `public/major-arcana-preview/index.html` (script-tag)
- `public/major-arcana-preview/app/patient-master-ui.js` — **endast** `loadPatientDocumentBundle` → dossier-bundle endpoint

---

## Förbjudet (rörs ej)

- Journal-flikar, journal-feed, formulär-editor (`patient-master-ui` journal/tab panels)
- `src/routes/*journal*`, journal stores, form routes
- Backend ORD-23/ORD-24 (frontend konsumerar befintlig endpoint)

---

## Design

- Vellum-tokens: `--v11-vellum`, `--v11-vellum-border`, `--v11-shadow-base`, `--v11-shadow-lift`
- Kicker: **★ Kunddossiér** (10px lila uppercase i hero)
- Accordion `<details>` — en sektion öppen i taget (befintlig v9-interactions)
- Slide-in animation vid öppet dossier (`data-v9-dossier-open`)

---

## Acceptance

- [x] Klick kund → slide-over med 15 sektioner synliga (hero + scroll)
- [x] Data från `dossier-bundle` (ej mock Anna/1247)
- [x] Sektion 7 visar read-only anteckningar utan journal-editor
- [x] `npm run check:syntax` PASS
- [x] `npm run lint:no-bypass` PASS
- [x] `npm run smoke:local` PASS

---

_Skapad av Cursor · 2026-06-05 · ORD-26 levererad_
