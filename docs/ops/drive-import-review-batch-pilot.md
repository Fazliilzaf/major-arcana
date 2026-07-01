# Drive Import Review — R3.3 batch pilot (operator/admin)

**Inte CI.** Manuellt canary-verktyg efter deploy av batch-endpoints (`#466`).

## Syfte

Kör en liten homogen batch (2–3 `NEEDS_REVIEW`-filer) mot **prod** via:

1. `POST …/batches/preview`
2. `POST …/batches/confirm`

Scriptet ändrar **inte** batch-logik eller UI.

## Krav

| Krav         | Env / flagga                                                                |
| ------------ | --------------------------------------------------------------------------- |
| Prod URL     | `ARCANA_PROD_URL` (eller `BASE`) — **obligatorisk**, ingen localhost        |
| Auth         | `ARCANA_SMOKE_BEARER_TOKEN` eller owner `.env` via `get-prod-auth-token.js` |
| Reviewer     | `--reviewer` eller `DRIVE_IMPORT_REVIEW_BATCH_REVIEWER`                     |
| Write/canary | `ENABLE_DRIVE_IMPORT_REVIEW_WRITE=true` på prod                             |

## Säkerhetsflöde

```bash
# 1. Plan only (default)
ARCANA_PROD_URL=https://arcana.hairtpclinic.com \
DRIVE_IMPORT_REVIEW_BATCH_REVIEWER=operator.name \
  npm run pilot:drive-import-review-batch-prod

# 2. Preview (skriver preview-token på server, ingen asset-statusändring)
ARCANA_PROD_URL=… DRIVE_IMPORT_REVIEW_BATCH_REVIEWER=… \
  npm run pilot:drive-import-review-batch-prod -- --preview

# 3. Confirm (kräver explicit --confirm)
ARCANA_PROD_URL=… DRIVE_IMPORT_REVIEW_BATCH_REVIEWER=… \
  npm run pilot:drive-import-review-batch-prod -- --preview --confirm

# Eller confirm med sparat token
npm run pilot:drive-import-review-batch-prod -- \
  --confirm --preview-token=<uuid> --reviewer=operator.name
```

## Flaggor

| Flagga                               | Beskrivning                                                              |
| ------------------------------------ | ------------------------------------------------------------------------ |
| _(default)_                          | Dry-run: välj homogen batch, visa plan + queue/canary före               |
| `--preview`                          | Kör preview-endpoint                                                     |
| `--confirm`                          | Kör confirm (kräver `--preview-token` eller `--preview` i samma körning) |
| `--decision approve\|mark_duplicate` | Default `approve`                                                        |
| `--size 2\|3`                        | Default 3, max 3                                                         |
| `--reviewer`                         | Audit-reviewer (min 2 tecken)                                            |

## Summary (efter confirm)

Scriptet skriver:

- queue före/efter
- status per asset
- canary used/remaining
- `storageKeyChanged` delta (förväntat 0)

Audit-läsning via `GET /cco-audit` kan ge 403 utan separat auth-fix — då används queue/canary-delta som bevis.

## Relaterat

- En-fil-pilot: `npm run pilot:drive-import-review-prod`
- Prod-verify: `npm run verify:drive-import-review-prod`
- UI: `https://arcana.hairtpclinic.com/drive-import-review.html` (ingen batch-UI ännu)
