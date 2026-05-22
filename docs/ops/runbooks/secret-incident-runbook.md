# Secret Incident Runbook

## Trigger
- Läckt webhook/API-nyckel
- `secrets_rotation_snapshot` visar stale required secrets
- Oväntad signering/valideringsavvikelse i integrationsflöden

## Containment
1. Rotera berörda hemligheter omedelbart.
2. Invalidera gamla credentials i externa system.
3. Bekräfta att tjänsten fortfarande fungerar med nya värden.

## Verification
1. Kör snapshot:
   - `POST /api/v1/ops/secrets/snapshot` (preview + apply enligt policy)
2. Kontrollera status:
   - `GET /api/v1/ops/secrets/status`
3. Kontrollera scheduler-evidens:
   - `secrets_rotation_snapshot` senaste success <= 24h.

## Post-incident
1. Dokumentera incidentorsak och scope.
2. Uppdatera secret-rotation policy och alert-trösklar vid behov.
3. Lägg till notering i release-governance review för aktiv cykel.
