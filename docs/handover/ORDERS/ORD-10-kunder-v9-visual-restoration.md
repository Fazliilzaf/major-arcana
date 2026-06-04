# ORD-10 P0 — Kunder v9 Visual Restoration — DONE

**Notion:** `375060cc-c15b-81f29932cb4f4ebdeada`  
**Plan:** `docs/strategy/CCO-KUNDER-V9-VISUAL-RESTORATION-PLAN-2026-06-04.md`  
**Status:** **DONE** (deploy live + gates + prod screenshots)

## Deploy

|             |                                             |
| ----------- | ------------------------------------------- |
| **Commit**  | `17b4881d` (feat) + housekeeping            |
| **Deploy**  | `dep-d8ghaibtqb8s73bjotvg` live             |
| **Service** | `srv-d8b3i3tckfvc73clgeng` (Frankfurt)      |
| **Prod**    | https://arcana.hairtpclinic.com/kunder.html |

## Levererat

- v9-shell på befintlig `/kunder.html` (app-grid 200/1fr/360, story-cards, agg-shell, dossier)
- Real data: `customers-shell`, `segmentStats`, `patientId`, Smart Nästa Steg i dossier
- Inga mock-tal (1247, Anna, LTV, AI-insikter, voice/watch)
- Gate: `npm run cco:verify-kunder-v9-visual`
- Canonical mockup: `uploads/CCO-Kunder-Mockup-v9-DESKTOP.html`
- Prod screenshots (7): `docs/ops/screenshots/ord-10/`

## Verify

```bash
npm run cco:verify-kunder-real-data
npm run cco:verify-kunder-v9-visual
```

## STAFF-UAT (manuell)

Inloggad STAFF: bekräfta story-cards med tal, kundrader, dossier + Smart Nästa Steg.

## Nästa ordning

1. ~~ORD-10~~ **DONE**
2. ORD-7 bundle (återupptas)
3. ORD-9 day-of (efter ORD-7)
