# Go-live: patientportalens fria kanal

Checklista för att aktivera patient-notiserna skarpt. Portalen (chatt, magisk länk,
dossier, nudge, notiser, mätvärden) är byggd och verifierad end-to-end. Utskicket är
dry-run/mock tills grindarna nedan slås på.

Se även: `src/ops/ccoPortalReplyNotification.js` (patient-notis), `src/ops/ccoPortalSmsNudge.js`
(SMS-nudge), `src/infra/resendMailer.js`, `src/sms/smsConnector.js`.

## Grindar (säkerhetsmodell)

| Grind                    | Styr                                      | Default      |
| ------------------------ | ----------------------------------------- | ------------ |
| `CCO_SEND_LIVE`          | ALLT mailutskick (globalt)                | av (dry-run) |
| `CCO_PORTAL_NOTIFY_LIVE` | Endast patient-portal-notiser (finkornig) | av           |
| `CCO_SMS_LIVE`           | Endast SMS-nudgen                         | av           |

Poängen: `CCO_PORTAL_NOTIFY_LIVE` låter portal-notiserna gå skarpt **utan** att öppna
resten av mailutskicket. Även med grinden på skickas inget förrän en riktig mailer
(`RESEND_API_KEY`) är konfigurerad.

## Fas 0 — Resend + DNS

1. Lägg till avsändardomänen i Resend (t.ex. `notifications.hairtpclinic.com`).
2. Lägg in DNS-posterna Resend genererar: **SPF** (TXT), **DKIM** (CNAME/TXT), gärna
   **DMARC** (TXT, börja med `p=none`).
3. Vänta på **Verified** i Resend innan något skickas (annars skräppost).

## Fas 1 — Miljövariabler (Render)

```
CCO_PORTAL_NOTIFY_LIVE=1
RESEND_API_KEY=re_…
RESEND_FROM=Hair TP Clinic <no-reply@notifications.hairtpclinic.com>
RESEND_REPLY_TO=kons@hairtpclinic.com
PUBLIC_BASE_URL=https://arcana.hairtpclinic.com
```

Lämna `CCO_SEND_LIVE` avstängd — den finkorniga grinden räcker för portal-notiser.

## Fas 2 — Isolerat skarptest (en adress, inte patienter)

1. Deploya. Verifiera `/healthz` = 200.
2. Mynta en portal-länk mot en testkund vars e-post är din egen adress.
3. Skicka ett klinik-svar i portalen → notis-mejlet "Du har ett nytt svar i din portal"
   ska komma med rätt `/portal-chat/…`-länk.
4. Öppna länken → chattsidan ska visa svaret.

## Fas 3 — Kontrollerad utrullning

1. Slå på för en handfull riktiga kunder.
2. Följ **Portal-fliken** i `/admin#cco`: engagerade patienter, nudge-konvertering,
   sparade SMS.
3. Ser det bra ut → bredda. SMS-nudgen (`CCO_SMS_LIVE` + 46elks/Twilio-credentials)
   kan slås på senare, bara för kunder som inte nappar på mejl.

## Rollback

Ta bort `CCO_PORTAL_NOTIFY_LIVE` (eller sätt `=0`) → tillbaka till dry-run direkt.
Inga kunddata påverkas; inget annat utskick berörs.

## SMS-nudge (senare, valfritt)

```
CCO_SMS_LIVE=1
SMS_PROVIDER=46elks
ELKS_API_USERNAME=…
ELKS_API_PASSWORD=…
```

SMS-nudgen är idempotent (en kund nudgas bara en gång) och skickas via
`POST /api/v1/cco/runtime/customer/:id/portal-sms-nudge` (mail.send).
