# Migration Spår A–D — Plan & nuläge

_Datum: 2026-06-25 · Compliance: counts only — ingen patientdata._

## Princip

**Inget spår A–D är cutover-levererat.** Tabellen nedan är **nuläge**, inte leverans.

Det som finns i repo idag:

- skript + dry-run
- operator-UI (read-only/canary-off lokalt)
- Migration Hub i `/cco-ops-workbench.html`
- aggregerad status: `npm run migration-tracks:publish` → `public/cco-migration-tracks-status.json`

Kö-siffror (860 foto, 1497 import) = **backlog**, inte pågående cutover.

---

## Nuläge (verifierat lokalt 2026-06-25)

| Spår                  | Cutover | Blocker                                                                        | Nyckeltal                                                         |
| --------------------- | ------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **A · Drive**         | ❌      | `ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON` (eller `DRIVE_NOT_COMMITTED` om SA finns) | 0/7257 `driveFolderId` · dry-run 6268/7257 predicted              |
| **B · Meridiq**       | ❌      | `ARCANA_MERIDIQ_COOKIE`                                                        | 6268 eligible · 0 `meridiqPatientId` · 0 importerade poster       |
| **C · Photo Review**  | ❌      | `CANARY_OFF`                                                                   | 860 pending · 150 patienter · write AV · 0 beslut                 |
| **D · Import review** | ❌      | `CANARY_OFF`                                                                   | 1497 osäkra (1366 halso@ · 131 GetAccept) · 0 resolved · write AV |

**Overall:** `NOT_DELIVERED (0/4)`

---

## Faser

### Fas 0 — Underlag (repo) ✅

| Leverans                                                          | Status                                     |
| ----------------------------------------------------------------- | ------------------------------------------ |
| `scripts/migration-tracks-batch-status.js`                        | ✅                                         |
| `public/cco-migration-tracks-status.json`                         | ✅ (regenereras vid publish)               |
| Migration Hub UI                                                  | ✅ `/cco-ops-workbench.html#migration-hub` |
| Photo/import batch-status                                         | ✅                                         |
| Meridiq import-skript + preflight                                 | ✅                                         |
| Drive backfill + scan-skript                                      | ✅                                         |
| Wire till `cco:daily-readiness` + `report:journal-cutover-status` | ✅                                         |

### Fas 1 — Owner-blockers (kan inte automatiseras)

**A — Drive**

1. Owner levererar `ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON` (Render + lokal `.env`)
2. `npm run migration:scan-drive-api`
3. `node scripts/backfill-master-card-drive-coupling.js --commit`
4. Verifiera: `withDriveFolderId > 0` i batch-status + DoD #1

**B — Meridiq**

1. Owner levererar `ARCANA_MERIDIQ_COOKIE` eller API-token
2. `npm run migration:preflight-meridiq`
3. `npm run migration:sync-meridiq-ids:commit`
4. Pilot: `npm run migration:import-meridiq-journals:commit -- --limit=5`
5. Verifiera: `meridiqEntriesImported > 0`

### Fas 2 — Prod canary (Render deploy)

**C — Photo Review**

1. Sätt på Render: `ENABLE_CCO_OPERATOR_CANARY`, `ENABLE_PHOTO_REVIEW_WRITE`, `ENABLE_PHOTO_REVIEW_CANARY_ON_PROD`
2. Deploy → `npm run verify:photo-review-prod`
3. Manuell batch: `/photo-review.html` (max 25 beslut/batch)

**D — Import review**

1. Sätt på Render: `ENABLE_IMPORT_REVIEW_WRITE` + canary
2. Deploy → `npm run verify:import-review-prod`
3. Manuell batch: `/cco-import-review.html` (stark match only · ingen ny kund)

### Fas 3 — Cutover-grön

1. `npm run report:journal-cutover-status`
2. `node scripts/generate-cutover-readiness-report.js`
3. DoD #1–10 GREEN i readiness-rapport
4. Alla spår `cutoverDelivered: true` i migration-tracks JSON

---

## Kommandon (daglig drift)

```bash
npm run migration-tracks:publish          # public JSON + stdout
npm run migration-tracks:batch-status     # stdout only
npm run photo-review:batch-status
npm run import-review:batch-status
npm run report:journal-cutover-status     # markdown + publish JSON
npm run cco:daily-readiness               # inkl. migration-tracks publish
```

---

## Definition: spår klart

| Spår | Cutover = DONE när                                                                        |
| ---- | ----------------------------------------------------------------------------------------- |
| A    | `withDriveFolderId` committat på master-kort (predicted coverage uppnådd)                 |
| B    | Historiska Meridiq-journaler importerade (`meridiqEntriesImported > 0`, pilot expanderad) |
| C    | `pendingPhotos === 0` och godkända bilder `VISIBLE`                                       |
| D    | Import-kö tom (`total === 0`) eller alla manuellt resolved                                |

---

## Källor

- `docs/strategy/JOURNAL-CUTOVER-STATUS-2026-06-25.md` (regenereras)
- `docs/strategy/JOURNAL-CUTOVER-AUDIT-2026-05-30.md`
- `.cursor/rules/cco-journal-cutover-first.mdc`
