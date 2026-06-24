# Saknade moduler i repot — inventering

Datum: 2026-06-24
Status: **26 moduler som `server.js` `require()`:ar finns INTE i repot/git.**

> **Upptäckt** under server.js-refaktorn: `server.js` kräver 26 lokala moduler som
> saknas i repot. Alla anrop ligger i `try/catch` (eller IIFE med catch), så de
> **faller tyst** → motsvarande funktioner monteras aldrig och är **döda i
> produktion**. Inget bygg-/genereringsskript skapar dem.
>
> Trolig orsak: filerna finns **lokalt på Mac/iCloud men har aldrig committats** —
> exakt den risk `ORGANISATION.md §0` ("bygg bara från repot") finns för.

## Hur detta verifieras

```bash
# Listar alla ./-require i server.js och visar vilka som ej kan resolvas:
node -e '
const fs=require("fs"),path=require("path");
const src=fs.readFileSync("server.js","utf8");
const re=/require\(([\x27"])(\.\/[^\x27"]+)\1\)/g; const seen=new Set();let m;
while((m=re.exec(src))){const p=m[2];if(seen.has(p))continue;seen.add(p);
  try{require.resolve(path.resolve(p))}catch{console.log("MISSING",p)}}'
```

## Saknade moduler & död funktionalitet

### GDPR / compliance (högst prioritet)

| Modul                              | server.js-rad | Feature / routes som är döda                                     |
| ---------------------------------- | :-----------: | ---------------------------------------------------------------- |
| `src/ops/ccoDsrStore`              |     4029      | `cco-dsr` — GDPR subject data requests (`/api/v1/cco-dsr`)       |
| `src/ops/ccoDsrExportBuilder`      |     4138      | `cco-dsr` — GDPR export-bundle (`/cco-dsr/:id/build-export-zip`) |
| `src/ops/ccoDataFlowMapStore`      |     4248      | `cco-dataflow` — Art. 30-register (`/api/v1/cco-dataflow`)       |
| `src/ops/ccoPolicyStore`           |     4907      | `cco-policies` — policy/öppettider/mail-snooze                   |
| `src/ops/ccoRetentionPolicy`       |     5614      | `cco-retention` — gallringspolicy                                |
| `src/ops/ccoComplianceScanStore`   |     8220      | `cco-compliance-scan` — `/api/v1/cco-compliance-scan`            |
| `src/ops/ccoVendorRegisterStore`   |     4681      | `cco-vendors` — PUB-register (redan flyttad i #217, men **död**) |
| `src/ops/ccoMarketingConsentStore` |     7273      | `cco-marketing` — marknadsföringssamtycke                        |
| `src/ops/ccoPhotoConsentStore`     |     5613      | `cco-photo-consent` — fotosamtycke                               |

### Mail / notiser

| Modul                              | server.js-rad | Feature / routes som är döda                                            |
| ---------------------------------- | :-----------: | ----------------------------------------------------------------------- |
| `src/ops/ccoSendActionStore`       |     8341      | `cco-send` — mail form/consent/file/encounter + history/stats/templates |
| `src/ops/ccoTemplateRegistry`      |     8103      | `cco-templates` — mall-registry (`/api/v1/cco-templates`)               |
| `src/ops/ccoNotificationFeedStore` |     7146      | `cco-notifications-feed` — notisflöde                                   |
| `src/ops/ccoNotificationReadStore` |     7147      | `cco-notifications-feed` — läs-status                                   |

### Övriga CCO-domäner

| Modul                                  | server.js-rad | Feature / routes som är döda                     |
| -------------------------------------- | :-----------: | ------------------------------------------------ |
| `src/ops/ccoBookingCaseStore`          |      127      | `cco-booking-cases`                              |
| `src/ops/ccoIncidentLogStore`          |     3896      | `cco-incidents`                                  |
| `src/ops/ccoOfferDocumentPackageStore` |     4593      | `cco-offer-packages` / `cco-offers`              |
| `src/ops/ccoOfferQuickStore`           |     7757      | `cco-offers` / `cco-agreements`                  |
| `src/ops/ccoAgreementQuickStore`       |     7758      | `cco-offers` / `cco-agreements`                  |
| `src/ops/ccoTelemetryStore`            |     5111      | `cco-telemetry` / `cco-collaboration`            |
| `src/ops/ccoBrandUserStore`            |     5373      | `cco-brands` / `cco-users` / `cco-notifications` |
| `src/ops/ccoIdVerificationStore`       |     7077      | `cco-id-verify`                                  |
| `src/ops/ccoBlockingStore`             |     7625      | `cco-blocking`                                   |
| `src/ops/ccoAiService`                 |     10344     | `cco-ai` — AI-tjänst (`/api/v1/cco-ai`)          |

### Frontend-patchar (preview/customers)

| Modul                                                     | server.js-rad | Feature                           |
| --------------------------------------------------------- | :-----------: | --------------------------------- |
| `public/major-arcana-preview/customers/server-patch`      |      92       | customers-preview server-patch    |
| `public/major-arcana-preview/customers/ical-patch`        |      97       | `cco-customers` iCal-patch        |
| `public/major-arcana-preview/customers/real-data-adapter` |     12231     | `cco-customers` real-data-adapter |

## Konsekvens för server.js-refaktorn

Routes vars store saknas är **redan döda** — att flytta dem ur monoliten är
beteende-neutralt men ger ingen funktion. Två redan mergade flyttar berör döda
stores: **#217 cco-vendors** (`ccoVendorRegisterStore`). cco-audit (#216) är
**inte** drabbad (`ccoAuditLog` finns i `src/security/`).

**Rekommendation:** committa de saknade modulerna (sannolikt lokalt på Mac)
INNAN fler cco-domäner flyttas eller live-verifieras. Domäner vars moduler
_finns_ i repot kan flyttas vidare under tiden.

## Att göra (Codex/owner, lokalt)

1. Kör verifierings-snutten ovan lokalt — bekräfta vilka filer som finns på Mac.
2. `git add` + committa de saknade `src/ops/cco*`-modulerna + 3 frontend-patcharna.
3. Kör smoke/`ops:suite:strict` — bekräfta att CCO-features faktiskt monterar.
4. Bocka av här allteftersom moduler kommer in.
