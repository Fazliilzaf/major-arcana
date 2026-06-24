# Broken Require Audit - 2026-06-24

Status: active debt / route-split stop condition

## Summary

During the `cco-send` route split, Cloud Code found that `server.js` references modules that do not exist in the repository. Codex reproduced the scan against `origin/main`. A raw text scan finds a broader set of historical/commented names; the code-aware guard currently finds 13 actual unresolved relative `require()` paths.

Most of these are inside `try/catch` mount blocks, so startup does not fail. The practical effect is worse: the affected CCO mounts silently skip and those features are dead in repo-built production unless another path provides equivalent behavior.

## Current Guard

This audit adds:

- `scripts/check-require-paths.js`
- `config/require-path-allowlist.json`
- `npm run check:requires`

The guard allows the 13 known missing code paths for now, but fails on any new unresolved relative require/import. This freezes the debt while we repair it in explicit batches.

Run strict mode to see the full debt:

```bash
node scripts/check-require-paths.js --strict
```

## Known Missing Modules

| Area                    | Missing module                                              |
| ----------------------- | ----------------------------------------------------------- |
| Frontend customer patch | `./public/major-arcana-preview/customers/server-patch`      |
| Frontend customer patch | `./public/major-arcana-preview/customers/ical-patch`        |
| Frontend customer patch | `./public/major-arcana-preview/customers/real-data-adapter` |
| CCO booking             | `./src/ops/ccoBookingCaseStore`                             |
| GDPR/compliance         | `./src/ops/ccoDataFlowMapStore`                             |
| Documents               | `./src/ops/ccoOfferDocumentPackageStore`                    |
| ID verification         | `./src/ops/ccoIdVerificationStore`                          |
| Notifications           | `./src/ops/ccoNotificationFeedStore`                        |
| Notifications           | `./src/ops/ccoNotificationReadStore`                        |
| Consent                 | `./src/ops/ccoMarketingConsentStore`                        |
| Templates/send          | `./src/ops/ccoSendActionStore`                              |
| Legacy Meridiq script   | `../src/ops/ccoTemplateRegistry`                            |
| Legacy Meridiq script   | `../src/ops/ccoBlockingStore`                               |

## Impact

- Do not continue route-splitting domains that depend on these modules until the dependency is restored or the dead mount is intentionally removed.
- Already merged route moves that depend on missing modules are behavior-neutral only if the old inline mount was already skipped.
- `cco-send` must not be moved until `ccoSendActionStore` is restored or intentionally replaced.

## Recommended Repair Order

1. Restore or intentionally remove frontend customer patches: `server-patch`, `ical-patch`, `real-data-adapter`.
2. Repair template/send foundation: `ccoSendActionStore`, then decide whether legacy Meridiq scripts still need `ccoTemplateRegistry`.
3. Repair compliance/GDPR stores as one batch: data-flow map and marketing consent.
4. Repair remaining optional CCO stores in small batches with route-level tests.
5. Remove fixed entries from `config/require-path-allowlist.json` in each repair PR.

## Rule Going Forward

Every new server/domain split must run:

```bash
npm run check:requires
```

If it fails, stop. Do not add to the allowlist unless the missing module is deliberately optional and documented in this audit.
