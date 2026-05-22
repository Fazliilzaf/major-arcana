# P0 Checklist (Execution Gateway Lock)

## Definition of Done (P0)
- Samtliga routes som producerar extern text eller persisterad AI-output går via `ExecutionGateway`.
- Ingen route kan kringgå risk/policy före persist/response.
- Audit är append-only i produktion utan runtime-repair.
- Cross-tenant testsuite körs i CI och blockerar merge vid fel.

## No-Go (P0)
- Chat svarar utan outputRisk + policyFloor.
- Template/mail-seed persisterar draft före eval.
- Routes kan importera write-store direkt.
- Cross-tenant access går igenom utan `403` + auditspår.

## Commit-ordning
1. `Commit 0` Dokumentation:
   - `docs/architecture/execution-gateway-contract.md`
   - `docs/architecture/p0-checklist.md`
2. `Commit 1` Gateway-skelett:
   - `src/gateway/executionGateway.js`
3. `Commit 2` Gates:
   - `src/gateway/gates/inputRiskGate.js`
   - `src/gateway/gates/outputRiskGate.js`
   - `src/gateway/gates/policyFloorGate.js`
4. `Commit 3` Pipeline enforcement:
   - exakt ordning + fail-closed
5. `Commit 4` Chat via gateway:
   - `POST /chat` via gateway
   - `chat.response|chat.blocked|chat.error` audit
6. `Commit 5` Template generate:
   - eval före persist
7. `Commit 6` Template patch + mail-seeds:
   - eval före persist
8. `Commit 7` No-bypass CI:
   - förbjudna route-imports
9. `Commit 8` Audit hardening:
   - `AUTH_AUDIT_APPEND_ONLY=true` i prod
   - flytta `repairMissing` till offline script
10. `Commit 9` Cross-tenant testsuite i CI
11. `Commit 10` Reality audit rerun + readiness report

## Evidence per steg
- Filvägar
- Diff
- Testkommando + output
- Runtimebevis (audit/log)

Om något saknar kod/test/log-evidens räknas det som ej implementerat.
