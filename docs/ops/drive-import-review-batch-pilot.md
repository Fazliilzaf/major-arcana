# Drive Import Review — R3.3 batch pilot (operator/admin)

**Inte CI.** Manuellt canary-verktyg efter deploy av batch-endpoints (`#466`).

## Syfte

Kör en liten homogen batch (2–3 `NEEDS_REVIEW`-filer) mot **prod** via:

1. `POST …/batches/preview`
2. `POST …/batches/confirm`

Scriptet ändrar **inte** batch-logik eller UI.

## Krav

| Krav         | Env / flagga                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Prod URL     | `ARCANA_PROD_URL` (eller `BASE`) — **obligatorisk**, ingen localhost                                                 |
| Auth         | Validerad `ARCANA_SMOKE_BEARER_TOKEN` **eller** STAFF/owner `.env` (STAFF-fallback via `resolve-prod-auth-token.js`) |
| Reviewer     | `--reviewer` eller `DRIVE_IMPORT_REVIEW_BATCH_REVIEWER` — **obligatorisk**                                           |
| Write/canary | `ENABLE_DRIVE_IMPORT_REVIEW_WRITE=true` + `DRIVE_IMPORT_REVIEW_CANARY_MAX_DECISIONS=200` på prod                     |

## Säkerhetsflöde

```bash
# 1. Plan only (default) — ingen preview/confirm
ARCANA_PROD_URL=https://arcana.hairtpclinic.com \
ARCANA_SMOKE_BEARER_TOKEN=… \
DRIVE_IMPORT_REVIEW_BATCH_REVIEWER=operator.name \
  npm run pilot:drive-import-review-batch-prod

# 2. Preview (skriver preview-token på server, ingen asset-statusändring)
ARCANA_PROD_URL=… ARCANA_SMOKE_BEARER_TOKEN=… DRIVE_IMPORT_REVIEW_BATCH_REVIEWER=… \
  npm run pilot:drive-import-review-batch-prod -- --preview

# 3. Confirm (kräver explicit --confirm)
ARCANA_PROD_URL=… ARCANA_SMOKE_BEARER_TOKEN=… DRIVE_IMPORT_REVIEW_BATCH_REVIEWER=… \
  npm run pilot:drive-import-review-batch-prod -- --preview --confirm

# Eller confirm med sparat token
ARCANA_PROD_URL=… ARCANA_SMOKE_BEARER_TOKEN=… \
  npm run pilot:drive-import-review-batch-prod -- \
  --confirm --preview-token=<uuid> --reviewer=operator.name
```

## Efter merge (#468)

1. **Invänta Codex-review** — mergea inte förrän CI är grön och review klar.
2. **Dry-run** (default) — granska homogen batch + queue/canary före.
3. **Preview + confirm** — 2–3 homogena filer: `--preview --confirm` (eller separata steg).
4. **Verifiera summary** — queue −N, status OK, canary +N, `storageKeyChanged Δ = 0`.
5. **Ingen batch-UI** — fortsatt en-fil-UI tills separat uppgift.

```bash
# Steg 2–3 efter merge (exempel size=2)
ARCANA_PROD_URL=https://arcana.hairtpclinic.com \
ARCANA_SMOKE_BEARER_TOKEN=… \
DRIVE_IMPORT_REVIEW_BATCH_REVIEWER=operator.name \
  npm run pilot:drive-import-review-batch-prod

ARCANA_PROD_URL=… ARCANA_SMOKE_BEARER_TOKEN=… DRIVE_IMPORT_REVIEW_BATCH_REVIEWER=… \
  npm run pilot:drive-import-review-batch-prod -- --size 2 --preview --confirm
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

**`mark_duplicate`:** status verifieras via `confirmResult.results` (inte patientkortets default-lista, som döljer `DUPLICATE`).

## Auth (STAFF-fallback)

Pilot och verify validerar inte blint på `ARCANA_SMOKE_BEARER_TOKEN` — utgången shell-token ignoreras. Ordning: validerad SMOKE → STAFF-login → OWNER med STAFF-reserv. Se [drive-import-review-canary-runbook.md](./drive-import-review-canary-runbook.md#prod-auth-pilot--verify).

**Batch-regel efter auth-merge:** kör bara homogena grupper med **`confidence: high`**, 2–3 filer. Stoppa vid 502-loop eller `storageKeyChanged > 0`.

## Relaterat

- Canary-runbook (gräns, senaste pass, post-merge): [drive-import-review-canary-runbook.md](./drive-import-review-canary-runbook.md)
- En-fil-pilot: `npm run pilot:drive-import-review-prod`
- Prod-verify: `npm run verify:drive-import-review-prod`
- UI: `https://arcana.hairtpclinic.com/drive-import-review.html` (ingen batch-UI ännu)
