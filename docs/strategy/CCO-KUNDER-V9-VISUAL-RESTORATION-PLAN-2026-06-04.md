# CCO Kunder v9 Visual Restoration — ORD-10

**Datum:** 2026-06-04 · **Status:** DONE  
**Deploy:** `dep-d8ghaibtqb8s73bjotvg` · commit `17b4881d`  
**Screenshots:** `docs/ops/screenshots/ord-10/`  
**Route:** `public/major-arcana-preview/?view=customers` (ingen ny sida)  
**Canonical visual:** `uploads/CCO-Kunder-Mockup-v9-DESKTOP.html`  
**Canonical data:** `GET /api/v1/cco/staff/customers-shell` + `cco-kunder-real.js`

## Sektion → status

| Sektion                 | v9 mockup        | Prod efter ORD-10 | Data-källa                         |
| ----------------------- | ---------------- | ----------------- | ---------------------------------- |
| topnav                  | rose-pill active | ✅                | statisk HTML                       |
| side-shell              | segment counts   | ✅                | `segmentStats.counts`              |
| customers-surface       | toolbar + list   | ✅                | customers-shell                    |
| story-cards             | 4 kort           | ✅                | `renderStoryCards()` — real counts |
| filters                 | filter-chip      | ✅                | segment filter                     |
| customer-row            | v9 layout        | ✅                | `renderList()` + patientId         |
| intel-shell / agg-shell | höger översikt   | ✅                | `renderRightPanel()` + chart       |
| dossier                 | v9 shell         | ✅                | `openDossier()` + journal/assets   |
| Smart Nästa Steg        | dossier panel    | ✅                | `cco-kunder-smart-next-step.js`    |
| global search           | Cmd+K            | ✅                | `q=` customers-shell               |
| voice / watch           | mock             | ❌ disabled       | borttaget / guard                  |
| camera                  | mock overlay     | ❌ disabled       | demo-script guard                  |
| AI-insikter / LTV       | mock             | ❌ disabled       | "Data saknas"                      |

## Gates

```bash
npm run cco:verify-kunder-real-data
npm run cco:verify-kunder-v9-visual
npm run cco:real-cco-gate
```

## Blocker

~~ORD-7/8/9 startar efter ORD-10~~ — ORD-10 deploy + screenshots klara; ORD-7 kan återupptas.
