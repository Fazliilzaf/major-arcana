# Arcana Secrets Rotation Runbook

Denna runbook beskriver hur Arcana hanterar rotation av känsliga nycklar utan att lagra råa hemligheter i app-state.

## Scope
- `OPENAI_API_KEY` (provider key)
- `ARCANA_ALERT_WEBHOOK_SECRET` (webhook-signering, när `ARCANA_ALERT_WEBHOOK_URL` är satt)

Arcana lagrar endast:
- SHA-256 fingerprint
- versionsnummer
- tidsstämplar
- actor + notering

## Förutsättningar
- OWNER-behörighet i Arcana.
- Tillgång till plattformens secret manager (t.ex. Render env vars).
- Planerat rotationsärende/ticket-id.

## Standardflöde (produktion/staging)
1. Skapa ny nyckel hos leverantören.
2. Uppdatera nyckel i secret manager:
   - `OPENAI_API_KEY` eller `ARCANA_ALERT_WEBHOOK_SECRET`
3. Deploy/restart Arcana så nyckeln laddas i runtime.
4. Kör snapshot commit:
   - `POST /api/v1/ops/secrets/snapshot`
   - body: `{"dryRun":false,"note":"rotation ticket <ID>"}`
5. Verifiera status:
   - `GET /api/v1/ops/secrets/status`
   - kontrollera:
     - `totals.pendingRotation = 0`
     - `totals.staleRequired = 0`
6. Verifiera historik:
   - `GET /api/v1/ops/secrets/history?limit=20`
7. Spara länk/utdrag i driftlogg.

## Dry-run före commit
För att validera förändring utan att skriva historik:
- `POST /api/v1/ops/secrets/snapshot` med body `{"dryRun":true}`

## Rollback
Rollback av hemligheter sker i plattformens secret manager:
1. Återställ föregående secret-version i plattformen.
2. Deploy/restart Arcana.
3. Kör snapshot commit igen (`dryRun:false`) så Arcana loggar ny version i rotationhistorik.

## Kontrollpunkter
- `GET /api/v1/monitor/status` visar sammanfattning under:
  - `security.secrets`
  - `kpis.secretRotationStaleRequired`
  - `kpis.secretRotationPending`

## Incidenthantering
Om rotation misslyckas:
1. Sätt tillbaka senast fungerande secret-version i plattformen.
2. Restart/deploy.
3. Verifiera tjänst (`/healthz`, `/readyz`, smoke).
4. Logga incident och ny rotationsplan.
