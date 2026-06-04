# ORD-12 — Kunder v9 real-data wiring

**Datum:** 2026-06-04  
**Förutsättning:** ORD-11 (`877c726a`) — mockup 1:1 i `public/kunder.html` (4938 rader)  
**Route:** `https://arcana.hairtpclinic.com/kunder.html`

## Scope

- Behåll v9-mockup **layout/CSS** från ORD-11
- Koppla `GET /api/v1/cco/staff/customers-shell` via `cco-kunder-real.js`
- Inga mock-tal i `customers-shell` (Anna Karlsson, 1247, LTV-pills, agg-insight mock-copy)
- Kalender-demo inline-script guard: `if (document.getElementById('customerList')) return;`

## Data-ytor

| UI | Binder |
| --- | --- |
| Toolbar h2 | `renderCounts()` → totalt kunder |
| Status bar | `bindUi()` → kopplade/granska/Cliento/Drive |
| 4× agg-insight | `renderAggInsights()` → `[data-kunder-agg-body]` |
| Side + filter chips | `data-segment` + segmentStats |
| Kundlista | `renderList()` → patientId |
| Höger intel | `renderRightPanel()` → 4 stat + population chart + automation rows |

## Gates

```bash
npm run cco:verify-kunder-real-data
npm run cco:verify-kunder-v9-visual
npm run cco:real-cco-gate
```

## Ej i scope

- Intäkt/LTV mock (fortfarande "—")
- Mass-påminnelse / export (disabled)
- Watch/voice widgets (tas bort i real-läge)
