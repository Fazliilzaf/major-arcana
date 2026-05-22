# Release Governance Runbook (P4)

Detta runbook operationaliserar P4-gates: release-gate, 3-signoff, staged launch, post-go-live review och kvartalsvis reality-audit.

## 1) Starta release-cykel

```bash
curl -s -X POST "$BASE_URL/api/v1/ops/release/cycles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"targetEnvironment":"production","rolloutStrategy":"tenant_batch","note":"Q1 go-live"}'
```

## 2) Ladda gate-evidence

Skapa evidensrapport:

```bash
npm run report:release-readiness -- --pentest-evidence-path ./docs/security/pentest-latest.md
```

Snabb validering av pentest-filen:

```bash
npm run check:pentest:evidence:strict
```

Registrera evidens i aktiv cycle:

```bash
curl -s -X POST "$BASE_URL/api/v1/ops/release/cycles/<cycleId>/evidence" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source":"release_readiness_report",
    "noP0P1Blockers":true,
    "patientSafetyApproved":true,
    "restoreDrillsVerified":true,
    "governanceRunbooksReady":true,
    "pentestEvidencePath":"./docs/security/pentest-latest.md"
  }'
```

Notera:
- Pentest-evidens valideras nu för placeholder-innehåll (`<fill>`, `<YYYY-MM-DD>`, `<yes/no>`, `<text>`).
- Pentest-evidens kräver också ifylld `Signed report reference` (eller motsvarande `Reference IDs:` / `Report reference:` rad).
- Om sådana placeholder-värden finns blockeras release-gaten när `requirePentestEvidence=true`.

## 3) Formell sign-off (Owner + Risk + Ops)

Tre olika användare signer:

```bash
curl -s -X POST "$BASE_URL/api/v1/ops/release/cycles/<cycleId>/signoff" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"signoffRole":"owner","note":"Owner approved"}'
```

Upprepa med `risk_owner` och `ops_owner`.

## 4) Launch (staged)

```bash
curl -s -X POST "$BASE_URL/api/v1/ops/release/cycles/<cycleId>/launch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"strategy":"tenant_batch","batchLabel":"batch-1","rollbackPlan":"rollback within 10 min"}'
```

## 5) Daglig post-go-live review (14-30 dagar)

```bash
curl -s -X POST "$BASE_URL/api/v1/ops/release/cycles/<cycleId>/review" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"ok","openIncidents":0,"breachedIncidents":0,"triggeredNoGoCount":0,"note":"daily review"}'
```

Notera:
- Scheduler-jobbet `release_governance_review` kan nu auto-skapa en daily review för `launched` cycle (max en per dag) när `ARCANA_SCHEDULER_RELEASE_GOVERNANCE_AUTO_REVIEW_ENABLED=true`.
- Manual review endpointen ovan finns kvar för explicit operator-signoff och incidentkommentarer.
- Valfri härdning: sätt `ARCANA_RELEASE_ENFORCE_POST_LAUNCH_STABILIZATION=true` för att kräva ett komplett post-launch stabiliseringsfönster (`ARCANA_RELEASE_POST_LAUNCH_STABILIZATION_DAYS`, default 14) utan no-go/incident-triggers.

## 5b) Formell final live sign-off lock

När stabiliseringsfönstret är komplett och release-gate är grön:

```bash
curl -s -X POST "$BASE_URL/api/v1/ops/release/cycles/<cycleId>/final-live-signoff" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"note":"Owner locks final live sign-off after 14-day stabilized window."}'
```

CLI:

```bash
npm run release:cycle:final-lock
```

## 6) Kvartalsvis reality-audit markering

```bash
curl -s -X POST "$BASE_URL/api/v1/ops/release/cycles/<cycleId>/reality-audit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"changeGovernanceVersion":"2026-Q1","note":"quarterly architecture audit complete"}'
```

Notera:
- Om ingen reality-audit registreras räknas due-date automatiskt från `launch.launchedAt` + `ARCANA_RELEASE_REALITY_AUDIT_INTERVAL_DAYS`.
- När due-date passeras blockeras release-gaten med `quarterly_reality_audit_overdue`.

## 7) Statuskontroll

```bash
curl -s "$BASE_URL/api/v1/ops/release/status" -H "Authorization: Bearer $TOKEN"
```

`releaseGatePassed=true` och tom blocker-lista krävs innan bred launch.

Stabilitetsfönster (14-30 dagar) kan verifieras med:

```bash
BASE_URL=$BASE_URL \
ARCANA_OWNER_EMAIL=<owner-email> \
ARCANA_OWNER_PASSWORD=<owner-password> \
npm run report:stability-window -- --window-days 14
```

Strikt gate (exit code 2 om fönstret inte är komplett/grönt):

```bash
BASE_URL=$BASE_URL \
ARCANA_OWNER_EMAIL=<owner-email> \
ARCANA_OWNER_PASSWORD=<owner-password> \
npm run report:stability-window:strict
```

Automatisering:
- `.github/workflows/stability-window.yml` kör reporten dagligen och sparar artifact för 14-30 dagars evidensperiod.

## 8) Allt-i-ett automation

Kör hela release-cykeln (create + evidence + 3 sign-offs + gate-check, valfri launch/review) i ett kommando:

```bash
BASE_URL=$BASE_URL \
ARCANA_OWNER_EMAIL=<owner-email> \
ARCANA_OWNER_PASSWORD=<owner-password> \
npm run release:cycle:auto
```

Återanvänd senaste cycle (utan att skapa ny) för att undvika att launch-tid resetas i stabilitetsfönstret:

```bash
BASE_URL=$BASE_URL \
ARCANA_OWNER_EMAIL=<owner-email> \
ARCANA_OWNER_PASSWORD=<owner-password> \
npm run release:cycle:auto:reuse -- --launch --review-now --reality-audit-now
```

Alternativt explicit cycle:

```bash
npm run release:cycle:auto -- --cycle-id <cycleId> --launch --review-now --reality-audit-now
```

Valfritt:
- `ARCANA_RELEASE_AUTO_LAUNCH=true`
- `ARCANA_RELEASE_REVIEW_NOW=true`
- `ARCANA_RELEASE_REALITY_AUDIT_NOW=true`
- `ARCANA_RELEASE_CHANGE_GOVERNANCE_VERSION=2026-Q1`
- `ARCANA_RELEASE_REALITY_AUDIT_NOTE="quarterly architecture audit"`
- `ARCANA_RELEASE_PENTEST_EVIDENCE_PATH=./docs/security/pentest-latest.md`
- `ARCANA_RELEASE_FAIL_ON_GATE=true` (exit code 2 om gate ej passerar)

Notera:
- `release:cycle:auto` behandlar gate som klar endast när både `evaluation.releaseGatePassed=true` och `evaluation.blockers.length=0`.
- `--reuse-latest-cycle` återanvänder senaste cycle med status `planning|launch_ready|launched`; `halted` återanvänds inte.
- Om cycle redan är launchad och `--launch` skickas, markeras launch som `skipped(already_launched)` och `launch.launchedAt` behålls oförändrad.
- `--final-live-signoff-now` kan köras i samma automation för att låsa formell final sign-off när kriterierna är uppfyllda.
