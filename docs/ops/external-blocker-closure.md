# External Blocker Closure (Final 3 Points)

Denna runbook stänger de enda kvarvarande punkterna som inte kan färdigställas enbart med kod.

## 1) Extern pentest-evidence (blocker #34)

1. Kör extern pentest via tredjepartsleverantör mot live-lik miljö.
2. Uppdatera `docs/security/pentest-latest.md` med verkliga datum, leverantör och severity-sammanfattning.
3. Verifiera att inga placeholders finns kvar.

Snabbt uppdateringskommando (från leverantörens faktiska värden):

```bash
npm run pentest:evidence:upsert -- \
  --vendor "Acme Security AB" \
  --scope-date "2026-03-01" \
  --report-date "2026-03-04" \
  --scope "API, auth, tenant isolation, patient channel" \
  --critical 0 --high 0 --medium 2 --low 3 \
  --required-fixes-completed yes \
  --residual-accepted-risk "Documented low residual risk accepted by owner+risk." \
  --signed-report-reference "SEC-REP-2026-03-04"
```

Kommando:

```bash
npm run check:pentest:evidence:strict
BASE_URL=http://localhost:3000 npm run report:release-readiness -- --require-pentest-evidence --strict
```

Förväntat: `gate: PASS` och ingen `pentestEvidenceOk` i `failedChecks`.

## 2) 14-30 dagars stabiliseringsfönster (blocker #42)

1. Sätt release-cykel till launched (owner).
2. Kör daglig drift med scheduler + readiness utan no-go triggers.
3. Samla minst 14 dagar (helst 30) kontinuerlig evidens.
4. Håll `ARCANA_RELEASE_ENFORCE_POST_LAUNCH_STABILIZATION=true` i release-gate för hård validering.

Kommando (daglig kontroll):

```bash
BASE_URL=http://localhost:3000 npm run report:stability-window:strict
```

Förväntat: exit `0`, `window.status=pass`, `readyForBroadGoLive=yes`.

Tips: om ni behöver uppdatera evidens/sign-off/review utan ny cycle:

```bash
npm run release:cycle:auto:reuse -- --launch --review-now --reality-audit-now
```

## 3) Formell live sign-off (blocker #43)

1. Säkerställ att owner, risk owner och ops owner signerar aktuell cycle.
2. Verifiera att release gate är grön efter sign-off + stabilitetsfönster.
3. Lås release med formellt beslut och journalför i release governance.

Kommando:

```bash
BASE_URL=http://localhost:3000 npm run report:release-readiness -- --strict
npm run release:cycle:final-lock
```

Förväntat: `gate: PASS`, `failedChecks: -`, samt final live sign-off låst i release governance.

## Slutlig kontroll (allt klart)

Kör i ordning:

```bash
npm run check:syntax
npm test
npm run lint:no-bypass
BASE_URL=http://localhost:3000 npm run ops:suite:strict
BASE_URL=http://localhost:3000 npm run report:release-readiness -- --require-pentest-evidence --strict
BASE_URL=http://localhost:3000 npm run report:stability-window:strict
```

Definition: Arcana är helt färdigt först när samtliga ovan returnerar pass i live driftfönstret.

Alternativt samlad gate:

```bash
npm run release:go-live:gate
```

Hela kedjan i ett svep (syntax/test/no-bypass/ops/pentest/readiness/stability/go-live):

```bash
npm run finalization:sweep:strict:local
```

För lokal bootstrap utan att nollställa stabilitetsfönster:

```bash
npm run finalization:sweep:strict:local:bootstrap
```

Tvinga ny release-cycle endast vid avsiktlig omstart:

```bash
npm run finalization:sweep:strict:local:bootstrap:fresh
```

Closure-guard (tillåter endast de tre kända externa blockerarna):

```bash
npm run report:closure-status
npm run closure:guard
```
