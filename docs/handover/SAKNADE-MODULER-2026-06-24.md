# Saknade moduler i repot — inventering & byggspec

Datum: 2026-06-24
Status: **✅ KLART — 0 KVAR. Alla 23 `src/ops`-stores byggda + 3 frontend-patchar som ärliga stubbar. Varje `server.js`-require resolvar nu.**

> **Resultat (2026-06-24):** Owner valde _bygga_. Alla 23 saknade `src/ops`-stores
> är nu implementerade enligt byggspecen nedan, var och en med JSON-fil-persistens,
> audit-loggning och enhetstester (**168/168 gröna**). Boot-test bekräftar att
> samtliga tidigare döda CCO-block nu **monterar live** (`[cco-*] monterad` i stället
> för `kunde inte montera`). Endast de 3 frontend-`customers/*`-patcharna återstår —
> de saknar extraherbart kontrakt (öppna `function(app, opts)`-monteringar) och tas
> som separat beslut. Separat datalucka upptäckt: `data/cco-templates.json` saknar
> innehåll (påverkar cco-templates smoke-test, ej store-koden).
>
> **Uppföljning:** Owner valde _ärlig stub_ för frontend-patcharna. `customers/server-patch`,
> `ical-patch` och `real-data-adapter` monterar nu förväntade endpoints men returnerar
> **501 `not_implemented`** i stället för fabricerad kund/PHI-data. Skanningen ger nu
> **0 KVAR** — varje `./`-require i server.js resolvar. Återstår (egna ärenden, ej i denna PR):
> (1) riktig implementation av customers-patcharna när kontraktet är känt, (2) fylla
> `data/cco-templates.json`.

> **Korrigerad slutsats (2026-06-24):** Den tidigare hypotesen — "filerna finns lokalt
> på Mac/iCloud men har inte committats" — är **motbevisad**. Owner körde
> verifierings-snutten lokalt: alla 28 `require()` faller fortfarande (`KVAR`),
> `git status` är ren (`nothing to commit, working tree clean`), och
> `git log --all -- <fil>` ger **0 commits** för varje modul. Filerna existerar
> alltså **inte någonstans** — varken i repot, på Mac:en eller i git-historien.
> De skrevs aldrig. `server.js` `require()`:ar stores som ingen byggt.

## Påverkan

Alla anrop ligger i `(async () => { try { … } catch (err) { console.warn(…) } })()`
-block (lazy `require` inuti route-monteringen). Servern **kraschar därför inte** —
varje block failar tyst med en `console.warn` och **routsen monteras aldrig**.
Resultat: ~20 hela CCO-funktionsblock är **döda i produktion** (tysta 404).

## Bevis

```bash
# 1. Resolvar någon ./-require i server.js inte? (kördes på Mac + remote → 28 KVAR)
node -e 'const f=require("fs"),p=require("path");const s=f.readFileSync("server.js","utf8");
const re=/require\((["\x27])(\.\/[^"\x27]+)\1\)/g;let m,n=0;
while((m=re.exec(s))){try{require.resolve(p.resolve(m[2]))}catch{console.log("KVAR",m[2]);n++}}
console.log(n?n+" kvar saknade":"alla resolvar")'

# 2. Har modulen någonsin funnits i git? (→ 0 för samtliga)
git log --all --oneline -- src/ops/ccoDsrStore.js | wc -l
```

## Byggspec — vad varje saknad modul måste exportera

Härlett ur hur `server.js` (och de redan flyttade `src/routes/*`) anropar varje modul.
Konstruktor-options visar förväntad signatur; metoderna är det API route-koden kräver.
`auditLog` = `ccoAuditLog` (finns i `src/security/`). `filePath` pekar mot `data/cco-*.json`.

### GDPR / compliance (högst prioritet)

| Modul                      | Export                                             | Konstruktor-options                                                     | Metoder som anropas                                                                                                                                                          |
| -------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ccoDsrStore`              | `createCcoDsrStore`                                | `{filePath, auditLog, secureStorage}`                                   | `createRequest, verifyIdentity, extendDeadline, recordPdlBlock, transitionStatus, getById, attachResponsePackage, listAll, listOverdue, listImminent`                        |
| `ccoDsrExportBuilder`      | `buildDsrExport` (fn)                              | —                                                                       | `buildDsrExport(...)` (bygger GDPR export-zip)                                                                                                                               |
| `ccoDataFlowMapStore`      | `createCcoDataFlowMapStore`                        | `{filePath, auditLog}`                                                  | `listSystems, listFlows, listNeedsLegalReview, exportArt30Register, upsertSystem, addFlow, markReviewed`                                                                     |
| `ccoIncidentLogStore`      | `createCcoIncidentLogStore`                        | `{filePath, auditLog, secureStorage}`                                   | `createIncident, updateIncident, transitionStatus, addMitigationAction, markImyNotified, listAll, listImyDeadlineImminent, getById, exportReport`                            |
| `ccoComplianceScanStore`   | `createCcoComplianceScanStore`                     | `{externalVersionsPath, meridiqSchemaPath, templateRegistry, auditLog}` | `getLatestScan, getActiveFlags, listScans, runFullScan`                                                                                                                      |
| `ccoRetentionPolicy`       | default-export (helper)                            | —                                                                       | `retention.readoutForCustomer(...)`                                                                                                                                          |
| `ccoVendorRegisterStore`   | `createCcoVendorRegisterStore`                     | `{filePath, auditLog}`                                                  | `createVendor, updateVendor, getById, listAll, addSubprocessor, exportRegister, listNeedsReview, markDpaReviewed, listLegacyExit, markLegacyExit, markUnderbilaga1Completed` |
| `ccoMarketingConsentStore` | `createCcoMarketingConsentStore`, `VALID_CHANNELS` | `{filePath, auditLog}`                                                  | `getStatus, setOptIn, setOptOut, stats, canSendMarketing, createUnsubscribeToken`                                                                                            |
| `ccoPhotoConsentStore`     | `createCcoPhotoConsentStore`                       | `{filePath, auditLog}`                                                  | `getConsent, setStatus, listGranted, stats`                                                                                                                                  |

### Mail / notiser

| Modul                      | Export                                                                                                       | Konstruktor-options                                                               | Metoder som anropas                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ccoSendActionStore`       | `createCcoSendActionStore`, `isDryRunDefault`, `FORM_TEMPLATES`, `CONSENT_TEMPLATES`, `ALLOWED_MIME_BY_KIND` | `{filePath, auditLog, mailer, baseUrl, https, templateRegistry, snapshotForSend}` | `buildFormPayload, performSend, buildConsentPayload, buildFilePayload, buildEncounterPayload, listSends, stats` |
| `ccoTemplateRegistry`      | `createCcoTemplateRegistry`                                                                                  | `{filePath, auditLog}`                                                            | `list, stats, get, getRevisions, upsert, setLegalReviewStatus, snapshotForSend`                                 |
| `ccoNotificationFeedStore` | `createCcoNotificationFeedStore`, `NOTIFICATION_TYPES`                                                       | `{...}`                                                                           | `getFeed`                                                                                                       |
| `ccoNotificationReadStore` | `createCcoNotificationReadStore`                                                                             | `{...}`                                                                           | `markRead, markAllRead, stats`                                                                                  |

### Övriga CCO-domäner

| Modul                          | Export                                                                                           | Konstruktor-options                                              | Metoder som anropas                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ccoBookingCaseStore`          | `createCcoBookingCaseStore`                                                                      | `{filePath, auditLog}`                                           | `listCases, stats, getCase, createCase, proposeCandidate, transitionState, updateHandoffChecklist, attemptHandoffComplete`                                                                                |
| `ccoOfferDocumentPackageStore` | `createCcoOfferDocumentPackageStore`                                                             | `{filePath, auditLog, timelineStore}`                            | `preparePackage, getById, listByCustomer, updateDocStatus`                                                                                                                                                |
| `ccoOfferQuickStore`           | `createCcoOfferQuickStore`                                                                       | `{filePath, auditLog, sendStore, buildFilePayload, performSend}` | `createOffer, updateDraft, sendOffer, acceptOffer, rejectOffer, deleteDraft, getById, listForCustomer, listAll, stats`                                                                                    |
| `ccoAgreementQuickStore`       | `createCcoAgreementQuickStore`                                                                   | `{...}` (jfr OfferQuick)                                         | `createAgreement, updateDraft, sendAgreement, signAgreement, cancelAgreement, getById, listForCustomer, listAll, stats`                                                                                   |
| `ccoPolicyStore`               | `createCcoPolicyStore`, `createCcoMailSnoozeStore`                                               | `{filePath, auditLog}`                                           | policy: `get, update, reset, evaluateBooking, evaluateCancellation, isOpenNow, shouldAutoReply, assignMail, upsertAutoAssignRule, deleteAutoAssignRule` · snooze: `active, list, ready, snooze, unsnooze` |
| `ccoTelemetryStore`            | `createCcoTelemetryStore`, `createCcoCollaborationStore`                                         | `{filePath, auditLog, bookingCaseStore}`                         | `liveMetrics, teamStats, userStats, leaderboard, topTemplates, coachingInsights, recordDaily, updateUserStats` (collaboration-API ej lokaliserat)                                                         |
| `ccoBrandUserStore`            | `createCcoBrandStore`, `createCcoUserStore`, `createCcoNotificationStore`, `createCronScheduler` | `{...}`                                                          | brand: `get, list, remove, upsert` · user: `get, upsert` · notif: `listCronJobs, listPushSubscriptions, markCronRan, sentLog, smsConfig, subscribePush, unsubscribePush, updateSmsConfig, upsertCronJob`  |
| `ccoIdVerificationStore`       | `createCcoIdVerificationStore`                                                                   | `{filePath, auditLog}`                                           | `getStatus, setStatus, stats`                                                                                                                                                                             |
| `ccoBlockingStore`             | `createCcoBlockingStore`                                                                         | `()`                                                             | `evaluateCustomer, evaluateDashboard`                                                                                                                                                                     |
| `ccoAiService`                 | `draftReply`, `extractFields`, `VALID_TONES`                                                     | — (rena funktioner)                                              | `draftReply(...), extractFields(...)`                                                                                                                                                                     |

### Frontend-patchar (preview/customers)

| Modul                                                     | server.js-rad | Feature                           |
| --------------------------------------------------------- | :-----------: | --------------------------------- |
| `public/major-arcana-preview/customers/server-patch`      |      92       | customers-preview server-patch    |
| `public/major-arcana-preview/customers/ical-patch`        |      97       | `cco-customers` iCal-patch        |
| `public/major-arcana-preview/customers/real-data-adapter` |     12231     | `cco-customers` real-data-adapter |

## Konsekvens för server.js-refaktorn

Routes vars store saknas är **redan döda** — att flytta dem ur monoliten är
beteende-neutralt men ger ingen funktion förrän modulen byggs. Redan mergad flytt
som rör en död store: **#217 cco-vendors** (`ccoVendorRegisterStore`). cco-audit
(#216) är **inte** drabbad (`ccoAuditLog` finns i `src/security/`).

## Beslut: bygga eller städa

Eftersom modulerna aldrig funnits är detta **inte** ett commit-problem. Två vägar:

1. **Bygg modulerna** enligt byggspec ovan — stort, GDPR/consent/compliance-känsligt,
   kräver egna datamodeller och flera iterationer. Varje store behöver en
   JSON-fil-backad implementation med metoderna i specen + `data/cco-*.json`.
2. **Städa bort de döda blocken** ur `server.js` — ~20 IIFE-block som ändå aldrig
   monterar. Reducerar hundratals rader spök-kod; reversibelt via git. Lämnar
   features ofunktionella men gör monoliten ärlig.

Vald väg dokumenteras här när den bestäms.

## Verifiera när moduler kommer in

```bash
# 0 KVAR = alla resolvar; kör ops:suite:strict för montering
node -e '…' # (snutt under "Bevis")
npm run ops:suite:strict
```
