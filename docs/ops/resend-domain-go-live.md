# B3b — Separat Resend-domän / leverans

**Relaterat:** [graph-resend-go-live.md](./graph-resend-go-live.md) (Graph = B3, Resend = B3b valfritt)

## Varför separat domän?

| Kanal | Avsändare | Syfte |
|-------|-----------|--------|
| **Graph (B3)** | `contact@hairtpclinic.com` | M365-operatörsinkorg, manuell uppföljning |
| **Resend (B3b)** | `booking@notifications.hairtpclinic.com` | Transactional API-leverans (bokning, post-op) |

Separat subdomän ger egen SPF/DKIM/DMARC, isolerar reputation från manuell klinikmail och gör det enkelt att stänga av Resend utan att påverka Graph.

## 1. Resend Dashboard

1. [resend.com/domains](https://resend.com/domains) → **Add domain**
2. Domän: `notifications.hairtpclinic.com` (eller egen subdomän)
3. Lägg DNS hos domänleverantör (SPF, DKIM — Resend visar exakta records)
4. Vänta tills status = **Verified**

## 2. Render env (UI-managed, ej render.yaml)

```bash
RESEND_API_KEY=re_...
RESEND_DOMAIN=notifications.hairtpclinic.com
RESEND_FROM=Hair TP Clinic <booking@notifications.hairtpclinic.com>
RESEND_REPLY_TO=contact@hairtpclinic.com
OPERATOR_NOTIFY_TO=contact@hairtpclinic.com
```

`RESEND_REPLY_TO` säkerställer att patientsvar hamnar i M365-inkorgen, inte Resend-domänen.

## 3. Provision + verify

```bash
# Kräver RESEND_API_KEY + verifierad domän i .env
npm run provision:resend-go-live-prod

# Efter deploy (~1 min):
npm run verify:resend-domain-prod

# Hårt krav att prod ska använda Resend (inte Graph):
STRICT=1 npm run verify:resend-domain-prod
```

Förväntat efter B3b live:

- Audit-event `reservation_confirmation_sent` med `metadata.provider: "resend"`
- Avsändare i patientens inkorg: `booking@notifications.hairtpclinic.com`
- Svar går till `contact@hairtpclinic.com`

## 4. Fallback

Om `RESEND_API_KEY` saknas på Render fortsätter `transactionalMailer` med **Graph send** (B3). Ingen kodändring krävs — bara env.

## 5. Felsökning

| Symptom | Åtgärd |
|---------|--------|
| `domain not verified` | Vänta på DNS + verifiera i Resend dashboard |
| `403 domain mismatch` | `RESEND_FROM` måste matcha verifierad domän |
| Prod `provider: graph` | Kör `provision:resend-go-live-prod`; kontrollera Render env |
| Mail i spam | Kontrollera DKIM + DMARC på subdomänen |
