# Rollback Runbook (Arcana)

## Trigger
- Ny release-cykel visar blocker/no-go efter launch
- Patientsäkerhetsregel eller policy floor bryts

## Rollback sequence
1. Stoppa vidare rollout (tenant-batch/canary).
2. Sätt patient kill-switch om extern kanal påverkas.
3. Återställ senaste stabila state:
   - lista backups: `GET /api/v1/ops/state/backups`
   - restore preview: `POST /api/v1/ops/state/restore` (`dryRun=true`)
   - restore: `POST /api/v1/ops/state/restore` med `confirmText=RESTORE`
4. Verifiera templates/risk/evaluations med `npm run smoke:local` eller `smoke:public`.

## Governance updates
1. Markera release cycle som `halted` i release-governance.
2. Lägg post-launch review med status `incident`.
3. Logga root cause, compensating actions och ny release-plan.
