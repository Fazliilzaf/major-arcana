---
owner: Ops
status: active
---

# Tenant Onboarding Playbook

Senast uppdaterad: 2026-05-13

## Syfte

Steg-för-steg-guide för att onboarda en ny kliniktenant i Arcana. Följ detta för tenant nr 2+.

## Förutsättningar

- Arcana kör i produktion med minst en aktiv tenant
- OWNER-konto med MFA konfigurerat
- Tillgång till Render Dashboard (för env-vars)

## Steg 1: Skapa tenant

```bash
# Via API (rekommenderat)
curl -X POST https://arcana.hairtpclinic.se/api/v1/tenants/onboard \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "ny-klinik-slug",
    "ownerEmail": "agare@nyklinik.se",
    "ownerPassword": "<starkt-losenord>"
  }'
```

Slugregler:

- Bara `a-z`, `0-9` och `-`
- Inga mellanslag, versaler eller specialtecken
- Unikt per installation

## Steg 2: Konfigurera tenant

```bash
# Sätt branding och grundinställningar
curl -X PATCH https://arcana.hairtpclinic.se/api/v1/tenant-config \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "clinicName": "Ny Klinik AB",
    "brand": "ny-klinik-slug",
    "riskSensitivityModifier": 0
  }'
```

## Steg 3: Konfigurera OWNER MFA

```bash
BASE_URL=https://arcana.hairtpclinic.se \
  ARCANA_OWNER_EMAIL=agare@nyklinik.se \
  ARCANA_OWNER_PASSWORD=<losenord> \
  npm run owner:mfa:setup -- --show-recovery-codes
```

Spara recovery-koder säkert.

## Steg 4: Skapa kunskapsbas

Lägg tenant-specifikt innehåll i `knowledge/<tenant-slug>/`:

- Behandlingsbeskrivningar
- Prisinformation
- FAQ-svar
- Tonalitet och stilguide

## Steg 5: Importera mail-data (valfritt)

```bash
npm run ingest:mails -- --input ./mail-exports --brand <tenant-slug>
npm run mail:seeds:apply-activate
```

## Steg 6: Verifiera

```bash
# Kör smoke mot tenant
BASE_URL=https://arcana.hairtpclinic.se \
  ARCANA_OWNER_EMAIL=agare@nyklinik.se \
  ARCANA_OWNER_PASSWORD=<losenord> \
  npm run smoke:public
```

Kontrollera:

- [x] Login fungerar med MFA
- [x] Templates kan skapas och aktiveras
- [x] Risk-evaluation ger rimliga resultat
- [x] Monitor/status visar grön

## Steg 7: Konfigurera Graph-koppling (om mailbox behövs)

I Render Dashboard, lägg till mailbox i:

- `ARCANA_GRAPH_READ_DEFAULT_ALLOWLIST`
- `ARCANA_MAILBOX_ALLOWLIST`
- `ARCANA_GRAPH_SEND_ALLOWLIST`

## Offboarding (disable)

```bash
curl -X POST https://arcana.hairtpclinic.se/api/v1/tenants/disable \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "ny-klinik-slug",
    "reason": "Kundavtal avslutat 2026-06-01"
  }'
```

Disable är reversibel (soft-disable). Data kvarstår i stores.

## Dataexport (GDPR)

Använd capability-endpointen:

```bash
# Exportera kunddata
POST /api/v1/capabilities/GdprExportCustomer/run

# Anonymisera kunddata
POST /api/v1/capabilities/GdprAnonymizeCustomer/run
```

## Checklista

- [x] Tenant skapad via `/tenants/onboard`
- [x] OWNER MFA konfigurerat
- [x] Kunskapsbas importerad
- [x] Smoke-test passerar
- [x] Graph-mailbox konfigurerad (om applicerbart)
- [x] Tenant synlig i admin-dashboard
