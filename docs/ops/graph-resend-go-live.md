# Graph read + Resend go-live (Render prod)

**Tjänst:** `major-arcana` (`srv-d6b11o0boq4c73chm7f0`)  
**URL:** https://arcana.hairtpclinic.se

## 1. Fyll `.env` (lokalt, committas aldrig)

```bash
# Microsoft Graph (Azure App Registration 13adfc91-69ab-4c35-ac80-b52ebba7e09f)
ARCANA_GRAPH_CLIENT_SECRET=<från Azure Portal → Certificates & secrets>

# Valfritt — default fylls automatiskt om tomt:
# ARCANA_GRAPH_TENANT_ID=90b09262-dfbf-42b7-9c56-1149703a76e5
# ARCANA_GRAPH_CLIENT_ID=13adfc91-69ab-4c35-ac80-b52ebba7e09f
# ARCANA_GRAPH_USER_ID=fazli@hairtpclinic.com

# Resend (resend.com — domän hairtpclinic.com verifierad)
RESEND_API_KEY=re_...
RESEND_FROM=contact@hairtpclinic.com
OPERATOR_NOTIFY_TO=contact@hairtpclinic.com
```

## 2. Kör go-live

```bash
npm run apply:graph-resend-go-live-prod
```

Endast Graph (utan Resend):

```bash
SKIP_RESEND=true npm run apply:graph-resend-go-live-prod
```

Scriptet **merge:ar** alla befintliga Render env-variabler (PUT med full lista) — samma mönster som `apply-auth-go-live-prod`.

## 3. Verify

```bash
npm run verify:graph-read-prod      # Graph live-läge
npm run verify:booking-plan-a-prod  # catalog
npm run verify:cco-mail-start-prod  # live-trådar när Graph läser
```

Efter Resend: gör en testreservation och kontrollera audit-event `reservation_confirmation_sent` (inte `…_failed`).

## 4. Uppdatera blueprint

Efter lyckad prod-verify: sätt `ARCANA_GRAPH_READ_ENABLED: "true"` i `render.yaml` och push så blueprint matchar runtime.

**Resend** deklareras medvetet **utanför** `render.yaml` (UI-managed) — se kommentar i render.yaml.
