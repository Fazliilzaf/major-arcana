# Arcana Master-Checklist Status (2026-02-26)

Statusformat:
- `Done` = implementerat + verifierat i kod/test/evidence
- `In progress` = implementerat delvis, kräver fortsatt driftbevis
- `External blocker` = kan inte slutföras enbart i kodbasen

## P0
1. `Done` docs kontrakt/checklista.
2. `Done` gateway-skelett.
3. `Done` input/output/policy gates.
4. `Done` immutabel gateway-pipeline + fail-closed.
5. `Done` chat via gateway med `chat.response|chat.blocked|chat.error`.
6. `Done` template generate eval före persist.
7. `Done` template patch + mail-seeds eval före persist.
8. `Done` no-bypass CI-lint.
9. `Done` audit append-only hardening + offline repair-script.
10. `Done` cross-tenant testsuite i CI.
11. `Done` reality audit rerun + readiness report.

## P1
12. `Done` per-tenant kö + idempotency + retry/dead-letter.
13. `Done` distributed runtime-stöd (memory/redis backend).
14. `Done` risk versions i evaluation (`ruleSet/threshold/model/fusion/build`).
15. `Done` gold-set + precision endpoints (confusion matrix/FPR/FNR underlag).
16. `Done` threshold/version governance + rollback-stöd.
17. `Done` CORS strict default (`CORS_STRICT=true`, `CORS_ALLOW_NO_ORIGIN=false`).
18. `Done` distributed rate limit stöd.
19. `Done` secret-rotation snapshot + governance.
20. `Done` dashboard eventdrivet (SSE) med fallback.
21. `Done` template revisionsmodell + diff/rollback API.

## P2
22. `Done` admin/patient runtime-separation + policy/tool-profiler.
23. `Done` patient guardrails (prompt-injection filter, turn-limit, handoff, kill-switch, beta-gate).
24. `Done` patient pipeline via gateway per turn.
25. `Done` patient safety/readiness checks i monitor + preflight.
26. `Done` patient red-team/policy tests i testsvit.

## P3
27. `Done` SLO breach -> auto ticket + alert.
28. `Done` daglig audit integrity + restore preview scheduler-jobb.
29. `Done` månatlig full restore drill (sandbox).
30. `Done` retention/prune automation för rapporter/backups.
31. `Done` realtidsstatus per tenant (dashboard stream + monitor).
32. `Done` runbooks (incident/failover/rollback/secret/patient safety).
33. `Done` soak/load evidence script + artifacts.
34. `External blocker` extern säkerhetsgranskning/pentest av tredje part.

## P4
35. `Done` release governance store + gate/evidence/sign-off/launch/review/reality-audit.
36. `Done` release cycle automation script.
37. `Done` scheduler auto post-launch review (dedupe per dag).
38. `Done` reality-audit due från launch om audit saknas.
39. `Done` valbar hård post-launch stabiliseringsgate (14 dagar utan no-go/incident).
40. `Done` CI-härdning: `ops:suite:strict` körs i `.github/workflows/ci.yml`.
41. `Done` daglig stabilitetsfönster-automation (`report:stability-window` + `.github/workflows/stability-window.yml`).
42. `In progress` 14-30 dagars kontinuerlig driftperiod utan no-go triggers.
43. `External blocker` formell bred go-live sign-off från Owner + Risk + Ops i live driftfönster.

## Kvar till “helt färdigt”
1. Leverera riktig extern pentest-rapport (ersätt placeholder i `docs/security/pentest-latest.md`).
2. Kör och dokumentera 14-30 dagar kontinuerlig stabil drift (inga no-go triggers).
3. Kör formell live sign-off efter perioden (Owner + Risk + Ops) och lås release.

## Senaste verifiering (2026-02-26 02:26 UTC)
- `Done` stabilitetsfönster-logik centraliserad i `src/ops/stabilityWindow.js` och återanvänd i `scripts/report-stability-window.js`.
- `Done` testtäckning tillagd: `tests/ops/stabilityWindow.test.js`.
- `Done` enhetlig pentest evidence-validering (`src/ops/pentestEvidence.js`) återanvänd i release-governance store + readiness-report.
- `Done` nytt verktyg: `scripts/check-pentest-evidence.js` (`npm run check:pentest:evidence:strict`).
- `Done` nytt master-sweep script: `scripts/run-finalization-sweep.js` (`npm run finalization:sweep:strict:local`) för hela slutkedjan i en körning.
- `Done` master-sweep stödjer release bootstrap (`bootstrap_release_cycle`) så lokal/CI-sweep kan skapa launched cycle automatiskt före gate-kontroller.
- `Done` daglig sweep-automation i CI: `.github/workflows/finalization-sweep.yml` med artifact `finalization-sweep-latest.json`.
- `Done` PR-CI guard för finalization sweep i `.github/workflows/ci.yml` (failar endast vid oväntade regressionssteg via `scripts/check-finalization-sweep.js`).
- `Done` daglig public sweep automation: `.github/workflows/finalization-sweep-public.yml` med artifact `finalization-sweep-public-latest.json`.
- `Done` closure-status rapportering (`scripts/report-closure-status.js`) i CI + finalization-workflows, inklusive Markdown/JSON artifacts med exakt kvarvarande blockerare.
- `Done` closure-status inkluderar progress + stabilitets-ETA (`src/ops/closureStatus.js`) och guard-script (`scripts/check-closure-status.js`) för att faila på oväntade blockerare.
- `Done` finalization sweep bootstrap återanvänder befintlig release-cycle (default `bootstrap-mode=if_missing`) för att undvika att stabilitetsfönster resetas mellan körningar; fresh-mode finns explicit vid behov.
- `Done` finalization sweep kör nu även explicit `release:cycle:final-lock` och markerar separat blocker `formalSignoff` tills stabilitetsfönster + pentest är klara.
- `Done` nytt verktyg för pentest-evidence upsert (`scripts/upsert-pentest-evidence.js`, `npm run pentest:evidence:upsert`) för snabb, validerad inmatning av verklig leverantörsrapport.
- `Done` release-cycle automation stödjer återanvändning av befintlig cycle (`--reuse-latest-cycle` / `npm run release:cycle:auto:reuse`) och skippar launch om cycle redan är launchad för att undvika reset av stabilitetsfönster.
- `Done` explicit final live sign-off lock tillagd (`POST /api/v1/ops/release/cycles/:cycleId/final-live-signoff` + `npm run release:cycle:final-lock`) och exponerad i closure/stability-rapporter.
- `PASS` `npm run check:syntax`.
- `PASS` `npm test`.
- `PASS` `npm run lint:no-bypass`.
- `PASS` `BASE_URL=http://localhost:3000 npm run ops:suite:strict`.
- `PASS` `BASE_URL=http://localhost:3000 npm run report:release-readiness`.
- `PASS` `BASE_URL=http://localhost:3000 ARCANA_RELEASE_AUTO_LAUNCH=true ARCANA_RELEASE_REVIEW_NOW=true ARCANA_RELEASE_REALITY_AUDIT_NOW=true ARCANA_RELEASE_FAIL_ON_GATE=true npm run release:cycle:auto` (cycle launched + review + reality audit).
- `EXPECTED FAIL` `npm run check:pentest:evidence:strict` (template innehåller placeholders).
- `EXPECTED FAIL` `BASE_URL=http://localhost:3000 npm run report:release-readiness -- --require-pentest-evidence --strict` (extern pentest-evidence saknas/ogiltig).
- `EXPECTED FAIL` `npm run release:go-live:gate` (stannar på pentest-gaten innan stabilitetsfönster-gate).
- `EXPECTED FAIL` `BASE_URL=http://localhost:3000 npm run report:stability-window:strict` (status=`in_progress`, 14-dagarsfönster ej komplett än).

## Verifieringsuppdatering (2026-02-26 07:50 UTC)
- `Done` `scripts/run-finalization-sweep.js` har ny base-url preflight guard för att stoppa sweep mot fel app/service.
- `PASS` `node --check scripts/run-finalization-sweep.js`.
- `PASS` `npm run finalization:sweep:strict` fail-fastar nu korrekt med tydligt fel när `BASE_URL` pekar på icke-Arcana service.
- `EXPECTED FAIL` `BASE_URL=http://127.0.0.1:4310 npm run finalization:sweep:strict:local:bootstrap` (endast återstående hard blockers: pentest, stabilitetsfönster, final signoff).
- `PASS` `BASE_URL=http://127.0.0.1:4310 npm run report:closure-status`.
- `STATUS` closure visar fortsatt exakt tre kvarvarande blockerare:
  1. `external_pentest_evidence`
  2. `stability_window_14_30d` (kvar: `13` dagar, ETA: `2026-03-12T07:47:00.909Z`)
  3. `formal_live_signoff`
