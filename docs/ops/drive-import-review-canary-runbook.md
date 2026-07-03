# Drive Import Review — canary runbook (R2)

Operatörsgräns för **skrivbeslut** i Drive Import Review (`approve`, `reassign`, `reject`, `mark_duplicate`, batch confirm).

## Config (prod)

| Env                                        | Värde                   | Syfte                          |
| ------------------------------------------ | ----------------------- | ------------------------------ |
| `ENABLE_CCO_OPERATOR_CANARY`               | `true`                  | Master-flagga                  |
| `ENABLE_DRIVE_IMPORT_REVIEW_WRITE`         | `true`                  | Aktiverar decide/batch på prod |
| `DRIVE_IMPORT_REVIEW_CANARY_MAX_DECISIONS` | **`100`** (tidigare 25) | Max antal canary-beslut totalt |

Källa: `src/config.js`, `render.yaml`, `.env.example`.

**Applicera på Render efter merge:**

```bash
# Sätter env + deploy + väntar readyz
node scripts/apply-drive-import-review-prod.js
```

Eller manuellt: uppdatera `DRIVE_IMPORT_REVIEW_CANARY_MAX_DECISIONS=100` i Render Dashboard → redeploy → `npm run verify:drive-import-review-prod` (DIR-09 ska visa `max=100`, `remaining` > 0 när gräns höjs).

## Senaste verifiering (2026-07-03) — grund för höjning 25 → 100

| Mätpunkt                      | Före pass | Efter pass        | Session                          |
| ----------------------------- | --------- | ----------------- | -------------------------------- |
| **NEEDS_REVIEW**              | 304       | **293**           | −11                              |
| **Canary**                    | 14/25     | **25/25**         | +11                              |
| Beslut (session)              | —         | **11/11 approve** | alla → `VISIBLE_ON_PATIENT_CARD` |
| Reassign / reject / duplicate | —         | 0                 | —                                |
| **`storageKeyChanged`**       | 0         | **0**             | inga filer flyttade/raderade     |

**Avvikelse:** en batch-confirm avbröts av tillfällig prod-**502** → **delvis commit** (1 fil committad före avbrott). Ingen korruption, ingen `storageKeyChanged`, ingen filflytt.

**Kvar efter pass:** `IMG_3005.JPG` (`018037ed-7813-4ba2-af96-148b22091e67`) — samma homogena grupp (`cliento_61e8e5f…`, `needs_photo_review`, hög confidence).

## Efter merge (canary 100)

1. Verifiera: `npm run verify:drive-import-review-prod` — `max=100`, `remaining` ska vara **75** (100 − 25 redan använda).
2. **Första beslut:** `IMG_3005.JPG` via [drive-import-review.html](https://arcana.hairtpclinic.com/drive-import-review.html) (en-fil-UI).
3. **Därefter:** små homogena batchar (**2–3 filer** åt gången) — se [drive-import-review-batch-pilot.md](./drive-import-review-batch-pilot.md).
4. Efter varje pass: queue minskar, `storageKeyChanged=0`, status `VISIBLE_ON_PATIENT_CARD` / `DUPLICATE` / `REJECTED`.

## Gränser (oförändrat)

- **Ingen batch-UI** — batch endast via pilot/API.
- **Max 2–3 filer** per batch (`pilot-drive-import-review-batch-prod.js`, hard cap 3).
- **Ingen ändring** i importlogik, storage eller patientkort i denna canary-höjning.

## Relaterat

- Batch-pilot: `npm run pilot:drive-import-review-batch-prod`
- Prod-verify: `npm run verify:drive-import-review-prod`
- En-fil-UI: `/drive-import-review.html`
