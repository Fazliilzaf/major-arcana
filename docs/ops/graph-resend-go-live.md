# Graph read + Resend go-live (Render prod)

**Tjänst:** `arcana` (Frankfurt, `srv-d8b3i3tckfvc73clgeng`)  
**URL:** https://arcana.hairtpclinic.com

## 1. Fyll `.env` (lokalt, committas aldrig)

```bash
# Microsoft Graph (Azure App Registration 13adfc91-69ab-4c35-ac80-b52ebba7e09f)
ARCANA_GRAPH_CLIENT_SECRET=<från Azure Portal → Certificates & secrets>

# Valfritt — default fylls automatiskt om tomt:
# ARCANA_GRAPH_TENANT_ID=90b09262-dfbf-42b7-9c56-1149703a76e5
# ARCANA_GRAPH_CLIENT_ID=13adfc91-69ab-4c35-ac80-b52ebba7e09f
# ARCANA_GRAPH_USER_ID=fazli@hairtpclinic.com

# Resend (B3b — separat domän, valfritt; Graph send räcker för B3)
# RESEND_API_KEY=re_...
# RESEND_DOMAIN=notifications.hairtpclinic.com
# RESEND_FROM=Hair TP Clinic <booking@notifications.hairtpclinic.com>
# RESEND_REPLY_TO=contact@hairtpclinic.com
# OPERATOR_NOTIFY_TO=contact@hairtpclinic.com
```

## 2. Kör go-live

### Graph (automatiskt via Azure CLI)

```bash
az login --tenant 90b09262-dfbf-42b7-9c56-1149703a76e5 --use-device-code
# Slutför inloggning i webbläsaren (M365-lösenord, ev. MFA)
npm run provision:graph-secret-via-az
```

Detta skapar nytt client secret, uppdaterar `.env` och pushar till Render.

### Manuellt (om du redan har secrets i .env)

```bash
npm run apply:graph-resend-go-live-prod
```

Endast Graph (standard — Resend behövs inte för bokningsmail):

```bash
SKIP_RESEND=true npm run apply:graph-resend-go-live-prod
```

Detta sätter `ARCANA_GRAPH_SEND_ENABLED=true`, send-allowlist och `OPERATOR_NOTIFY_TO`.
Bokningsbekräftelser skickas via `transactionalMailer` (Graph fallback) efter deploy.

Scriptet **merge:ar** alla befintliga Render env-variabler (PUT med full lista) — samma mönster som `apply-auth-go-live-prod`.

## 3. Verify

```bash
npm run verify:graph-read-prod       # Graph live-läge
npm run verify:graph-send-prod       # alias → verify:post-op-graph-prod (post-op Graph send)
npm run verify:post-op-graph-prod    # post-op operator trigger + Graph sendMail
npm run verify:booking-mail-prod     # PA-25 Graph send (Resend ej krävd)
npm run verify:booking-plan-a-prod   # catalog + reservation
npm run verify:cco-mail-start-prod   # live-trådar när Graph läser
npm run verify:post-op-uppfoljning-prod  # patient /uppfoljning/[token] fetch smoke
```

Efter deploy: gör en testreservation och kontrollera audit-event `reservation_confirmation_sent`
med `metadata.provider: "graph"` (eller `"resend"` om nyckel finns) — inte `…_failed`.

## 4. Uppdatera blueprint

Efter lyckad prod-verify: sätt `ARCANA_GRAPH_READ_ENABLED` och `ARCANA_GRAPH_SEND_ENABLED` till `"true"` i `render.yaml` och push så blueprint matchar runtime.

**Resend (B3b)** är **valfritt** — separat subdomän, se [resend-domain-go-live.md](./resend-domain-go-live.md).  
Bokningsbekräftelse går via Microsoft Graph (`transactionalMailer`) när `ARCANA_GRAPH_SEND_ENABLED=true`.
