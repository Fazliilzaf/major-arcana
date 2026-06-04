# ORD-10 P0 — Kunder v9 Visual Restoration

**Notion:** `375060cc-c15b-81f29932cb4f4ebdeada`  
**Plan:** `docs/strategy/CCO-KUNDER-V9-VISUAL-RESTORATION-PLAN-2026-06-04.md`

## Levererat

- v9-shell på befintlig `/kunder.html` (app-grid 200/1fr/360, story-cards, agg-shell, dossier)
- Real data: customers-shell, segmentStats, patientId, Smart Nästa Steg i dossier
- Inga mock-tal (1247, Anna, LTV, AI-insikter, voice/watch)
- Gate: `npm run cco:verify-kunder-v9-visual`
- Canonical mockup: `uploads/CCO-Kunder-Mockup-v9-DESKTOP.html`

## Verify

```bash
npm run cco:verify-kunder-real-data
npm run cco:verify-kunder-v9-visual
```

## Blocker

ORD-7 bundle återupptas efter ORD-10 done + deploy.
