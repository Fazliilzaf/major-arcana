# Arcana Finalization Runbook

Detta runbook dokumenterar de sista leverablerna innan Arcana anses helt produktionsklar:

1. Patientkanal: kontrollerad beta-rollout
2. Pilotvolym: verifierbar evidence över tid
3. Driftlåsning: repeterbar preflight/ops med MFA-säkring
4. Release governance: formell gate + sign-off + post-go-live review

Samlad evidens för senaste fulla sweep: `docs/ops/final-readiness-sweep-2026-02-26.md`.

## 0) Förutsättningar

Sätt alltid dessa envs i runtime/CI:

```env
BASE_URL=https://arcana.hairtpclinic.se
ARCANA_OWNER_EMAIL=<owner-email>
ARCANA_OWNER_PASSWORD=<owner-password>
ARCANA_DEFAULT_TENANT=hair-tp-clinic
```

Om OWNER har MFA aktiv, ange minst en av dessa:

```env
ARCANA_OWNER_MFA_CODE=<6-digit>
ARCANA_OWNER_MFA_SECRET=<base32>
ARCANA_OWNER_MFA_RECOVERY_CODE=<recovery-code>
```

För återkommande preflight/ops-körningar: använd helst `ARCANA_OWNER_MFA_SECRET` (recovery-koder är engångskoder).

## 1) Patientkanal: kontrollerad beta-rollout

Mål: behåll gate aktiv, verifiera allowlist/key och kör staged rollout.

1. Verifiera gate + required checks:

```bash
BASE_URL=$BASE_URL npm run smoke:public
BASE_URL=$BASE_URL npm run preflight:readiness:guard -- --use-required-checks
BASE_URL=$BASE_URL npm run ops:suite:strict
```

2. Verifiera monitor/readiness är `controlled_go` och att `public_chat_beta_gate` är grön.
   - Verifiera även `patient_conversion_feedback_loop` i readiness och monitor endpoint:
     `GET /api/v1/monitor/patient-channel`
3. Kör rollout i steg:
- Steg A: endast intern allowlist (kända hostar)
- Steg B: begränsad extern trafik
- Steg C: utökad allowlist + kontinuerlig observability

Go-kriterier per steg:
- `readiness.score >= 85`
- `goNoGo.allowed = true`
- inga blockerande `triggeredNoGo`
- inga nya P0-remediations

## 2) Pilotvolym: evidence och KPI-gate

Mål: visa att piloten har tillräcklig volym och kvalitet för stabil drift.

1. Spara färsk pilotrapport:

```bash
BASE_URL=$BASE_URL npm run report:pilot
```

2. Kör evidence-check mot senaste 14d-rapport:

```bash
npm run pilot:evidence:check
```

Notera: om rapporten saknar `readinessSnapshot` läser checken readiness från `data/reports/preflight-latest.json`.

3. Valfritt strikt läge (högre trösklar):

```bash
npm run pilot:evidence:check:strict
```

Default-trösklar (`pilot:evidence:check`):
- `templatesTotal >= 100`
- `evaluationsTotal >= 200`
- `highCriticalTotal <= 0`
- `ownerDecisionPending <= 0`
- `readinessScore >= 85`
- `goAllowed = true`

## 3) Driftlåsning: preflight + ops i återkommande körning

Mål: driften ska vara repeterbar och inte bero på manuell MFA-app i stunden.

1. Kör public advisor-preflight:

```bash
BASE_URL=$BASE_URL npm run preflight:pilot:report -- --public-url "$BASE_URL"
npm run preflight:report:actions
```

2. Kör helkedja (preflight + smoke + report) i ett pass:

```bash
BASE_URL=$BASE_URL npm run pilot:public
```

3. Om guard blockerar på healbara checks, kör heal:

```bash
BASE_URL=$BASE_URL npm run pilot:public:heal
BASE_URL=$BASE_URL npm run pilot:public:heal:all
```

4. Sätt upp schemalagd drift-gate (var 6:e timme) med preflight-artifact (`data/reports/preflight-latest.json`).
   - Required scheduler-suite ska inkludera: `nightly_pilot_report`, `backup_prune`, `restore_drill_preview`, `restore_drill_full`, `audit_integrity_check`, `secrets_rotation_snapshot`, `release_governance_review`, `alert_probe`.

## 4) Release governance (P4)

Mål: release får inte gå live utan verifierbar gate + tre sign-off + governance-evidens.

1. Starta release-cykel:

```bash
curl -s -X POST "$BASE_URL/api/v1/ops/release/cycles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"targetEnvironment":"production","rolloutStrategy":"tenant_batch"}'
```

2. Generera gate-evidence:

```bash
npm run report:release-readiness -- --pentest-evidence-path ./docs/security/pentest-latest.md
```

3. Registrera evidence + sign-off (owner, risk_owner, ops_owner) och verifiera:
   - `GET /api/v1/ops/release/status` visar `releaseGatePassed=true` och tom blocker-lista.
4. Kör launch via `POST /api/v1/ops/release/cycles/:cycleId/launch`.
   - Vid upprepade automationer: använd `npm run release:cycle:auto:reuse` så befintlig launchad cycle återanvänds och stabilitetsfönstret inte nollställs.
5. Säkerställ daglig review första 14-30 dagarna:
   - automatiskt via scheduler-jobb `release_governance_review` (om `ARCANA_SCHEDULER_RELEASE_GOVERNANCE_AUTO_REVIEW_ENABLED=true`)
   - eller manuellt via `POST /api/v1/ops/release/cycles/:cycleId/review`.
   - valfritt enforce-läge: `ARCANA_RELEASE_ENFORCE_POST_LAUNCH_STABILIZATION=true` + `ARCANA_RELEASE_POST_LAUNCH_STABILIZATION_DAYS=14` för hård gate utan no-go/incident i stabiliseringsfönstret.
6. Markera kvartalsvis reality-audit via `POST /api/v1/ops/release/cycles/:cycleId/reality-audit`.
7. Lås formell live sign-off när stabilitetsfönstret är komplett:
   - `npm run release:cycle:final-lock`
   - verifiera `GET /api/v1/ops/release/status` -> `finalLiveSignoff.locked=true`.

## 5) Exit-kriterier för "helt färdig"

Arcana kan klassas som färdig när följande hålls stabilt över flera körningar:

1. `ops:suite:strict` passerar utan failures.
2. `preflight:pilot:report` passerar och action-plan är tom på P0/P1 blockerare.
3. `pilot:evidence:check` passerar konsekvent.
4. Patientkanalens beta-rollout håller `controlled_go` utan nya No-Go triggers.
5. Soak-test (`npm run ops:soak`) visar stabil felgrad/latens inom överenskomna SLO-gränser.
6. Release governance-status visar `releaseGatePassed=true` med signerad cycle.
7. Stabilitetsfönster-report (`npm run report:stability-window -- --window-days 14`) visar `readyForBroadGoLive=true` innan bred lansering.
8. Daglig evidens samlas via workflow `.github/workflows/stability-window.yml`.
9. Formell live sign-off är låst (`npm run release:cycle:final-lock`) och closure-status visar `done: yes`.
