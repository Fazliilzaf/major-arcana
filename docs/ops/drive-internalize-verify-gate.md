# Drive internalize — QA-gate efter #693

**Read-only.** Denna runbook beskriver hur vi avgör om en internalize-pilot/batch är redo för nästa steg. Den ändrar **ingen** importlogik och kör **inga** skarpa batcher.

Relaterat:

- Verifieringsscript: `scripts/verify-internalize-run-prod.js` (mergad i [#693](https://github.com/Fazliilzaf/major-arcana/pull/693))
- Download hotfix (åäö i `Content-Disposition`): [#690](https://github.com/Fazliilzaf/major-arcana/pull/690)

## Auktoritetslager

| Lager                         | Vad det säger                                                                                    | Auktoritativ för import/storage?                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **Run-nivå**                  | `GET /api/v1/cco/asset-qa/snapshot` + commit-svar (`imported`, `verified`, `failed`, `linkOnly`) | **Ja**                                                                |
| **Full verify-script**        | Patient-scan + bundle + download via `verify-internalize-run-prod.js`                            | **Ja, men bara om** `scanReliability.authoritativeForNextBatch: true` |
| **Riktad read-only kontroll** | Manuell kontroll mot kända patienter (se nedan)                                                  | **Ja, men bara med explicit owner-GO**                                |

Run-nivå och direkta API-anrop är alltid auktoritativa för _själva importen_. Fullscan via script kan vara **UNRELIABLE** utan att importen failat.

## Gate 1 — Full verify (standard)

Nästa skarpa batch får godkännas när verifieraren returnerar:

```text
overallStatus: PASS
runLevel.pass: true
discovery.pass: true
discovery.assetsFound == expectedCount
scanReliability.unreliable: false
scanReliability.authoritativeForNextBatch: true
exit code: 0
```

Körning (ren JSON — `node` direkt, inte `npm run`):

```bash
node scripts/verify-internalize-run-prod.js \
  --run-id <run-uuid> \
  --commit-report /tmp/pilot-commit.json \
  --json > /tmp/verify-<run-id>.json
```

Läsbar rapport:

```bash
npm run verify:internalize-run-prod -- \
  --run-id <run-uuid> \
  --commit-report /tmp/pilot-commit.json
```

## Gate 2 — Explicit owner-GO med riktad kontroll (alternativ)

Använd när full verify returnerar **UNRELIABLE / exit 2** p.g.a. prod-transienta fel (t.ex. många `502` under patient-scan), men run-nivå och direkta lager fortfarande är gröna.

**UNRELIABLE är inte import-fail.** Det betyder att scriptets fullscan inte kunde slutföras tillförlitligt — t.ex.:

```text
runLevelPass: true
assetsFound: 0/10          ← scan-artefakt, inte saknad import
scanReliability.unreliable: true
authoritativeForNextBatch: false
assetApi errors: N
exit code: 2
```

I det läget: **pausa nästa skarpa batch** tills antingen Gate 1 blir grön **eller** owner uttryckligen godkänner Gate 2.

### Riktad kontroll-procedur (read-only)

1. **Run-level PASS** — bekräfta import-run via asset-qa snapshot + commit-svar:
   - `totalImported == totalVerified == expectedCount`
   - `totalFailed == 0`, `totalLinkOnlyBlockers == 0`

2. **Identifiera berörda patienter** — från commit-report / preview / maskerade samples (unika `patientId` som fick assets i run).

3. **Verifiera patient-API assets** — per patient:
   - `GET /api/v1/cco/patients/:patientId/assets`
   - Filtrera på `importRunId == <run-uuid>`
   - Räkna träffar; förväntat antal ska matcha commit

4. **Verifiera bundle / CCO viewUrl** — per patient:
   - `GET /api/v1/cco-patient-master/patient?patientId=…`
   - Assets ska synas i `driveFiles` (native CCO-vy)
   - `viewUrl` ska peka på CCO storage (`/api/v1/cco/patients/.../assets/...`), inte Google Drive

5. **Verifiera download** — per asset:
   - `GET` på asset download/viewUrl
   - **HTTP 200**
   - PDF/body som förväntat
   - `Content-Disposition` med ASCII `filename=` **och** RFC5987 `filename*=UTF-8''…` för åäö/diakritik ([#690](https://github.com/Fazliilzaf/major-arcana/pull/690))

6. **Verifiera 0 Drive-länkar** — inga `drive.google.com`-URL:er i bundle eller som primär åtkomstväg.

**Gate 2 godkänd** när alla steg ovan är gröna för **alla** assets i run, och owner dokumenterar GO (t.ex. i handoff/PR-kommentar).

Exempel (pilot @1319, run `b8364d5d-47dd-4e14-8212-fb0bc1a09152`): riktad kontroll på tre patienter gav 10/10 — `VISIBLE_ON_PATIENT_CARD`, bundle match, download 200, `filename*`, 0 Drive-länkar — medan fullscan var UNRELIABLE p.g.a. prod 502.

## Vad scriptet _inte_ får betyda

| Utdata                                                       | Tolkning                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `UNRELIABLE` / exit **2**                                    | Scan otillförlitlig — **inte** bevis på import-fail              |
| `PARTIAL` / exit **0**                                       | Delvis discovery; granska `scanReliability` innan beslut         |
| `FAIL` / exit **1**                                          | Run-nivå eller discovery fail — stoppa batch                     |
| `assetsFound: 0` + `runLevelPass: true` + `unreliable: true` | Transient scan-fel — använd Gate 2 eller kör om vid lugnare prod |

## Processlås

- **Inga skarpa batcher** utan explicit owner-**GO**.
- **Inga writes** i denna runbook — endast read-only QA.
- Scriptet ska **inte** ensam gate:a nästa batch när `authoritativeForNextBatch: false`.
- Alias-mönster (`asset.patientId=cliento_*`, `bundle.cliento=null`) via heuristik är **känt**, inte import-fail — se `ALIAS_HEURISTIC_NOTE` i scriptet.

## 502 / orphan-runs (2026-07-08)

**Orsak:** Synkron commit via HTTP kan ta >100s (Drive-download). Cloudflare/Render avbryter då med **502** medan importen ibland fortsätter → `finishedAt: null` (orphan-run) och risk för dubbel-commit.

**Fix (deployad):** Commit är **async by default** — POST returnerar **202** direkt; jobbet körs i bakgrunden.

```bash
# 1. Starta commit (async default — vänta INTE på full body i curl)
curl -X POST .../assets/internalize \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"dryRun":false,"limit":10,"offset":1375,"confirmText":"INTERNALIZE ASSETS"}'

# 2. Poll tills running=false
curl .../assets/internalize/job

# 3. Verify med runId från job.state.runId
node scripts/verify-internalize-run-prod.js --run-id <uuid> --commit-report /tmp/job.json
```

Synk commit (endast debug): `"async": false` i body.

**Orphan-reconcile** (read/write, owner): om run saknar `finishedAt` men assets finns:

```bash
POST /api/v1/cco-patient-master/assets/internalize/runs/<runId>/reconcile
```

**Pausa GO** tills async-fixen är live på prod (`/assets/internalize/job` svarar 200). Deploy-trigger restart → vänta `readyz` grön före nästa pilot.

## Referens — npm-script

```bash
npm run verify:internalize-run-prod -- --run-id <uuid> --commit-report /path/to/commit.json
```

Flaggor: `--scan-mode hasFiles|all`, `--max-retries N`, `--json` (endast via `node` direkt).
