# Incident Runbook (Arcana)

## Trigger
- SLO-breach ticket skapad (`slo.breach.ticket`)
- `alert_probe` eller monitor visar `critical`/`high` avvikelse

## Immediate actions (0-15 min)
1. Bekräfta incident i owner-dashboard (`/api/v1/ops/slo-tickets`, `/api/v1/monitor/status`).
2. Tilldela ansvarig (OWNER/ops_owner) och sätt ETA i incident-notering.
3. Säkerställ att patientkanalen kan pausas vid behov (`ARCANA_PUBLIC_CHAT_KILL_SWITCH=true`).

## Stabilization (15-60 min)
1. Kör `npm run ops:suite:strict` och samla failures/no-go IDs.
2. Kör riktad remediation:
   - output gates: `npm run ops:suite:heal`
   - owner MFA memberships: `npm run ops:suite:heal:owners`
3. Bekräfta att blocker-checks blir gröna i readiness.

## Recovery
1. Verifiera `goNoGo.allowed=true` i `/api/v1/monitor/readiness`.
2. Markera berörda SLO tickets som lösta (`POST /api/v1/ops/slo-tickets/:ticketId/resolve`).
3. Dokumentera root cause + prevention i postmortem.

## Evidence to archive
- `Ops_Suite_*.json`
- `preflight-latest.json`
- listan av resolved SLO tickets och incident-id
