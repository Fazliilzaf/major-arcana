# Final Readiness Sweep (2026-02-26)

Denna sweep verifierar att hela blockkedjan (P0-P4) är körd end-to-end med aktuell evidens.
Kompletterande statusöversikt: `docs/ops/master-checklist-status-2026-02-26.md`.

## 1) Quality gates

- `npm run check:syntax` -> PASS
- `npm test` -> PASS (74/74)
- `npm run lint:no-bypass` -> PASS

## 2) Drift + readiness

- `npm run ops:suite:strict` -> PASS (`failures=0`)
  - Artifact: `data/reports/Scheduler_Suite_20260226-021030.json`
- `npm run preflight:pilot -- --skip-public --report-file ./data/reports/preflight-latest.json` -> PASS
  - Artifact: `data/reports/preflight-latest.json`
- `npm run preflight:report:actions -- --min-priority P0 ...` -> PASS (`actions=0`)
  - Artifact: `data/reports/preflight-actions-p0.json`

## 3) Release governance

- `npm run release:cycle:auto -- --launch --review-now --reality-audit-now --change-governance-version 2026-Q1 --review-status ok --review-note "launch-day review" --no-fail-on-gate`
  - Result: `gatePassed=yes`, `launch=yes`, `review=yes`, `realityAudit=yes`
  - Artifact: `data/reports/Release_Cycle_20260226-014023.json`
  - Cycle status: `launched`
  - Sign-off: `owner + risk_owner + ops_owner` (alla `ok`)
- `npm run release:cycle:auto -- --launch --no-review-now --no-reality-audit-now --no-fail-on-gate`
  - Result: `launch=yes`, `review=no`
  - Artifact: `data/reports/Release_Cycle_20260226-014934.json`
  - Kör därefter `npm run ops:suite:strict` för att verifiera scheduler auto-review (se section 8).
- `npm run report:release-readiness -- --pentest-evidence-path ./docs/security/pentest-latest.md --out-file ./data/reports/release-readiness-latest.json`
  - Result: `gate: PASS`
  - Artifact: `data/reports/release-readiness-latest.json`
- `npm run release:cycle:auto -- --no-launch --no-review-now --no-reality-audit-now --no-fail-on-gate`
  - Result: `gatePassed=yes`, `blockers=0` (gate-clear kräver nu både `releaseGatePassed=true` och `blockers=0`)
  - Artifact: `data/reports/Release_Cycle_20260226-020042.json`

## 4) Pilot evidence (strict)

- `npm run pilot:evidence:check:strict` -> PASS
  - Artifact: `data/reports/Pilot_Scheduler_14d_20260226-013807.json`
  - Readiness: `score=100`, `goAllowed=true`, `band=controlled_go`

## 5) Soak / capacity evidence

- `node ./scripts/run-load-soak.js --baseUrl http://localhost:3000 --path /healthz --durationSec 30 --concurrency 20 --timeoutMs 6000`
  - Artifact: `data/reports/Soak_Healthz_Clean_20260226-013845.json`
  - Result:
    - requests: `794429`
    - errorRatePct: `0`
    - p95: `1ms`
    - p99: `5ms`
    - max: `29ms`

## 6) Slutsats

- Arkitekturlåsning + gateway enforcement: verifierad.
- Risk/policy före persist/svar: verifierad.
- Tenant isolation / RBAC / audit immutability / CI gates: verifierad.
- Patient guardrails + runtime-separation + safety gates: verifierad.
- Drift automation + restore/backup + observability + incident/SLO: verifierad.
- Release governance + staged launch + sign-off + review-flöde: verifierad.
- Extern tredjeparts-pentest: kräver separat leverantörsrapport (runbook-/filstöd finns, men själva externa granskningen är ett operativt steg utanför kodbasen).

## 7) Pentest-gate hardening (verifierat)

- `npm run report:release-readiness -- --require-pentest-evidence --pentest-evidence-path ./docs/security/pentest-latest.md --out-file ./data/reports/release-readiness-require-pentest.json`
  - Result: `FAIL` när pentest-filen innehåller placeholders
  - Artifact: `data/reports/release-readiness-require-pentest.json`
- `ARCANA_RELEASE_REQUIRE_PENTEST_EVIDENCE=true npm run release:cycle:auto -- --no-launch --no-fail-on-gate ...`
  - Result: release cycle blockeras med `pentest_evidence_missing`
  - Artifact: `data/reports/Release_Cycle_20260226-014409.json`

## 8) Release governance auto-review (verifierat)

- `release_governance_review` i scheduler skapar nu daglig `postLaunchReview` automatiskt för `launched` cycle (dedupe: max 1 per dag).
- Runtime-bevis:
  - Cycle `rel_30c58ac0-9998-43ed-83d1-fc7c723f2cde` fick auto-review `rr_408043b5-eb6b-409f-9bc0-dd546f8efe1f` (`status=ok`).
  - Efter auto-review visar strict artifact `Scheduler_Suite_20260226-021030.json`:
    - `releaseGovernance.status=launched`
    - `gatePassed=yes`
    - `blockers=0`
    - `postLaunchReviewHealthy=yes`
  - Audit-event finns: `release.governance.post_launch_review.auto` med cycle/review-id.

## 9) Reality-audit due from launch (verifierat)

- Fixa: om reality-audit saknas helt räknas due-date nu från `launch.launchedAt` + interval.
- Testbevis:
  - `release governance store marks reality audit overdue based on launch date when missing` -> PASS.
  - Vid overdue sätts blocker `quarterly_reality_audit_overdue` i evaluation.

## 10) Post-launch stabiliseringsgate (verifierat)

- Ny capability:
  - `ARCANA_RELEASE_POST_LAUNCH_STABILIZATION_DAYS` (default 14)
  - `ARCANA_RELEASE_ENFORCE_POST_LAUNCH_STABILIZATION` (default false)
- När enforce är aktiv krävs komplett stabiliseringsfönster utan incident/no-go-trigger för att undvika blockers:
  - `post_launch_stabilization_incomplete`
  - `post_launch_reviews_insufficient`
  - `post_launch_no_go_triggered`
- Testbevis:
  - `release governance store can enforce post-launch stabilization no-go window` -> PASS.
  - `scheduler release_governance_review alerts on enforced post-launch stabilization gap` -> PASS.

## 11) CI-gate hardening (verifierat)

- `.github/workflows/ci.yml` kör nu även `npm run ops:suite:strict` mot lokal runtime i CI.
- Syfte: blockerar merge när drifts-/governance-kedjan inte håller, inte bara enhetstester.

## 12) Stabilitetsfönster-automation (verifierat)

- Ny rapport: `npm run report:stability-window -- --window-days 14 --run-required-suite`
  - Artifact: `data/reports/stability-window-latest.json`
  - Aktuell status: `not_launched` för senaste cycle (förväntat före faktisk launch).
- Ny strikt gate: `npm run report:stability-window:strict`
  - returnerar exit code `2` när komplett 14-dagarsfönster ännu inte är uppfyllt (eller launch saknas).
- Ny daglig workflow: `.github/workflows/stability-window.yml` som laddar upp `stability-window-latest.json` som artifact.

## 13) Final live signoff i sweep/CI (verifierat)

- `scripts/run-finalization-sweep.js` kör nu även `release_final_live_signoff` via `npm run release:cycle:final-lock`.
- `summary.blockers` inkluderar `formalSignoff` så externa återstående steg blir explicita i samma rapport.
- Guard-konfigurationer (`check-finalization-sweep`, CI + finalization-workflows) är uppdaterade med:
  `check_pentest_evidence,report_release_readiness,report_stability_window,release_go_live_gate,release_final_live_signoff`.

## 14) Sweep base-url preflight guard (verifierat)

- `scripts/run-finalization-sweep.js` verifierar nu att `baseUrl` faktiskt pekar på Arcana innan sweep utan lokal server.
- Kontroll:
  - `/healthz` måste se ut som Arcana-health payload (`ok`, `ready`, `startedAt`)
  - `/api/v1/monitor/readiness` måste svara som Arcana-route (`200|401|403` + JSON)
- Om fel app kör på URL: tydligt fail-fast fel med instruktion att använda `--with-local-server` eller korrekt `--base-url`.
- Runtime-bevis:
  - `npm run finalization:sweep:strict` => fail-fast med:
    `Base URL verkar inte vara Arcana (http://localhost:3000)...`

## 15) Aktuellt slutläge (2026-02-26 07:50 UTC)

- `BASE_URL=http://127.0.0.1:4310 npm run finalization:sweep:strict:local:bootstrap` => expected fail på kvarvarande externa/tidsberoende blockers.
- Kvarvarande blockers:
  - `external_pentest_evidence`
  - `stability_window_14_30d`
  - `formal_live_signoff`
- Senaste closure-status:
  - `done=no`
  - `stabilityRemainingDays=13`
  - `stabilityEstimatedReadyAt=2026-03-12T07:47:00.909Z`
