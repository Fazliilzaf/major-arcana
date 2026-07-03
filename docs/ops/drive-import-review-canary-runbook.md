# Drive Import Review — canary runbook (R2)

Operatörsgräns för **skrivbeslut** i Drive Import Review (`approve`, `reassign`, `reject`, `mark_duplicate`, batch confirm).

## Config (prod)

| Env                                        | Värde                    | Syfte                          |
| ------------------------------------------ | ------------------------ | ------------------------------ |
| `ENABLE_CCO_OPERATOR_CANARY`               | `true`                   | Master-flagga                  |
| `ENABLE_DRIVE_IMPORT_REVIEW_WRITE`         | `true`                   | Aktiverar decide/batch på prod |
| `DRIVE_IMPORT_REVIEW_CANARY_MAX_DECISIONS` | **`200`** (tidigare 100) | Max antal canary-beslut totalt |

Källa: `src/config.js`, `render.yaml`, `.env.example`.

**Applicera på Render efter merge:**

```bash
# Sätter env + deploy + väntar readyz (default CANARY_MAX=200)
node scripts/apply-drive-import-review-prod.js
```

Eller manuellt: uppdatera `DRIVE_IMPORT_REVIEW_CANARY_MAX_DECISIONS=200` i Render Dashboard → redeploy → `npm run verify:drive-import-review-prod` (DIR-09 ska visa `max=200`, `used=100`, `remaining=100` direkt efter höjning).

## Senaste verifiering (2026-07-03) — grund för höjning 100 → 200

| Mätpunkt                | Värde före höjning | Notering                                      |
| ----------------------- | ------------------ | --------------------------------------------- |
| **NEEDS_REVIEW**        | **218**            | Alla kvarvarande `high` confidence            |
| **Canary**              | **100/100**        | Kvoten förbrukad — rent pass, inga avvikelser |
| **`storageKeyChanged`** | **0**              | Inga filer flyttade/raderade                  |
| **medium i kö**         | **0**              | Endast high-confidence kvar                   |

**Session 100/100 (sammanfattning):** 50 beslut i föregående pass (IMG_3005 manuell + homogena batchar 2–3) + 50 beslut i senaste pass (17 batchar) — totalt **100/100**, `storageKeyChanged=0`, inga 502-loopar.

## Prod-auth (pilot + verify)

Drive pilot/verify använder `scripts/lib/resolve-prod-auth-token.js`:

1. `ARCANA_SMOKE_BEARER_TOKEN` — **endast om** `/api/v1/auth/me` svarar 200 (ignorerar utgången token i shell).
2. **STAFF-login** via `get-prod-auth-token.js` (default).
3. **OWNER-login** med **STAFF-reserv** om owner `.env` är gammalt (`--owner` utan `--no-fallback`).

STAFF har `asset.review` — räcker för Drive review read + write/canary.

```bash
# Verify (STAFF-fallback automatiskt)
env -u ARCANA_SMOKE_BEARER_TOKEN npm run verify:drive-import-review-prod

# Batch dry-run / preview / confirm
env -u ARCANA_SMOKE_BEARER_TOKEN \
ARCANA_PROD_URL=https://arcana.hairtpclinic.com \
DRIVE_IMPORT_REVIEW_BATCH_REVIEWER=cursor-drive-review \
  npm run pilot:drive-import-review-batch-prod -- --size 3 --preview --confirm
```

## Efter merge (canary 200)

1. `node scripts/apply-drive-import-review-prod.js` (eller manuell Render env + redeploy).
2. Verifiera: `env -u ARCANA_SMOKE_BEARER_TOKEN npm run verify:drive-import-review-prod`
   - **DIR-09:** `max=200`
   - **DIR-13:** `used=100`, `remaining=100`
   - **`storageKeyChanged=0`**
3. **Fortsätt batchar:** homogena grupper, **`confidence: high`**, **2–3 filer** — se [drive-import-review-batch-pilot.md](./drive-import-review-batch-pilot.md).
4. **Stoppa** vid 502-loop, `storageKeyChanged > 0` eller osäker matchning (medium/low, blandad patient/confidence i samma batch).
5. Efter varje pass: queue minskar, `storageKeyChanged=0`, status `VISIBLE_ON_PATIENT_CARD` / `DUPLICATE` / `REJECTED`.

## Gränser (oförändrat)

- **Ingen batch-UI** — batch endast via pilot/API.
- **Max 2–3 filer** per batch (`pilot-drive-import-review-batch-prod.js`, hard cap 3).
- **Ingen ändring** i importlogik, storage, patientkort eller review-UI i denna canary-höjning.

## Historik

| Höjning   | Datum      | Resultat före höjning                         |
| --------- | ---------- | --------------------------------------------- |
| 25 → 100  | 2026-07-03 | 25/25 rent, skc=0                             |
| 100 → 200 | 2026-07-03 | 100/100 rent, queue 218, skc=0, medium 0 kvar |

## Relaterat

- Batch-pilot: `npm run pilot:drive-import-review-batch-prod`
- Prod-verify: `npm run verify:drive-import-review-prod`
- En-fil-UI: `/drive-import-review.html`
