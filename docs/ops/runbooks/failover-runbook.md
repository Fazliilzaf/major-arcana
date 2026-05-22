# Failover Runbook (Arcana)

## Trigger
- Produktionsinstans svarar inte
- Återkommande 5xx/timeout över SLO-gräns

## Failover sequence
1. Aktivera patient kill-switch (`ARCANA_PUBLIC_CHAT_KILL_SWITCH=true`).
2. Säkerställ senaste backup:
   - `POST /api/v1/ops/state/backup`
3. Verifiera restore-evidens:
   - `POST /api/v1/ops/scheduler/run` med `jobId=restore_drill_preview`
   - vid större incident även `jobId=restore_drill_full`
4. Flytta trafik till standby (plattformsspecifikt steg utanför applikationen).

## Validation
1. Kör `npm run smoke:public` mot failover-mål.
2. Kör `npm run preflight:readiness:guard -- --use-required-checks`.
3. Bekräfta att `/api/v1/monitor/status` visar gröna restore/audit/secrets gates.

## Exit criteria
- `ops:suite:strict` passerar
- inga nya `critical` alerts under 30 min
- readiness `goNoGo.allowed=true`
