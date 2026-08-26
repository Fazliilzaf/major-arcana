# ORD-110 · Inventering: `path.join(__dirname, 'data', ...)` i server.js

> **Uppgift 3 (ingen kod).** Listar alla härdkodade `path.join(__dirname, 'data', ...)` som kringgår `ARCANA_STATE_ROOT` och därmed skrivs till containerns filsystem (raderas vid deploy) i stället för `/var/data`.
> **Kolumn 3 (`Beständig state?`)** = måste innehållet överleva en deploy? **Kolumn 5 (`Bedömning`)** = preliminär: `flytta` / `får vara lokal` / `oklart, fråga`. **Fazli väljer vad som flyttas på riktigt.**
> **Antal:** 25 filer från enkelrad-mönstret + en katalog (`photos`). (Arbetsorderns "29" inkluderar troligen flerradiga varianter.)
> **Metod:** kors-refererat mot `src/config.js` `fileName:`-värden (config-post JA/NEJ).

| Fil                                | Rad i server.js                                 | Beständig state?                                            | Finns config-post? | Bedömning                                                                                          |
| ---------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `cco-customers.json`               | 426 (+ 11304 via `config.ccoCustomerStorePath`) | Ja — kunddata (dock är huvudregistret `cco-patient-master`) | JA                 | **flytta** + ⚠️ **duplikat**: två stores, samma filnamn (426 hårdkodad, 11304 via config). Red ut. |
| `cco-booking-cases.json`           | 240                                             | Ja                                                          | NEJ                | flytta                                                                                             |
| `cco-mailboxes.json`               | 621                                             | Ja (inställningar)                                          | NEJ                | flytta                                                                                             |
| `cco-photo-annotations.json`       | 814                                             | Ja (dokumentinnehåll)                                       | NEJ                | flytta                                                                                             |
| `cco-treatment-plans.json`         | 818                                             | Ja                                                          | NEJ                | flytta                                                                                             |
| `cco-portal-links.json`            | 823                                             | Oklart (magiska token, regenererbara)                       | NEJ                | oklart, fråga                                                                                      |
| `cco-incident-log.json`            | 2178                                            | Ja (audit)                                                  | NEJ                | flytta                                                                                             |
| `cco-dsr.json`                     | 2311                                            | **Ja — GDPR-registerutdrag**                                | NEJ                | flytta                                                                                             |
| `cco-dataflow-map.json`            | 2530                                            | Ja (GDPR Art. 30)                                           | NEJ                | flytta                                                                                             |
| `cco-offer-document-packages.json` | 2937                                            | Ja                                                          | NEJ                | flytta                                                                                             |
| `cco-vendor-register.json`         | 3026                                            | Ja (GDPR-processorlista)                                    | NEJ                | flytta                                                                                             |
| `cco-policies.json`                | 3248                                            | Ja                                                          | NEJ                | flytta                                                                                             |
| `cco-mail-snoozes.json`            | 3252                                            | Nej (användarpreferens)                                     | NEJ                | får vara lokal                                                                                     |
| `cco-telemetry.json`               | 3452                                            | Nej (regenererbar)                                          | NEJ                | får vara lokal                                                                                     |
| `cco-collaboration.json`           | 3457                                            | Oklart                                                      | NEJ                | oklart, fråga                                                                                      |
| `cco-brands.json`                  | 3715                                            | Ja (inställningar)                                          | NEJ                | flytta                                                                                             |
| `cco-users.json`                   | 3719                                            | **Ja — användare/inloggning**                               | NEJ                | flytta                                                                                             |
| `cco-photo-consents.json`          | 3955                                            | **Ja — GDPR-samtycken**                                     | NEJ                | flytta                                                                                             |
| `cco-id-verifications.json`        | 5425                                            | Ja (identitetsverifiering)                                  | NEJ                | flytta                                                                                             |
| `cco-notification-reads.json`      | 5495                                            | Nej (kvitton)                                               | NEJ                | får vara lokal                                                                                     |
| `cco-marketing-consent.json`       | 5633                                            | **Ja — GDPR-samtycke**                                      | NEJ                | flytta                                                                                             |
| `cco-offers-quick.json`            | 6122                                            | Ja (kommersiell)                                            | NEJ                | flytta                                                                                             |
| `cco-agreements-quick.json`        | 6131                                            | **Ja — avtal (juridik)**                                    | NEJ                | flytta                                                                                             |
| `cco-send-actions.json`            | 6736                                            | Ja (sändnings-audit)                                        | NEJ                | flytta                                                                                             |
| `photos` (katalog)                 | 197                                             | Ja (foton)                                                  | NEJ                | oklart, fråga                                                                                      |

## Not om `cco-customers.json`

- `src/config.js:568` → `ccoCustomerStorePath`, använd i `server.js:11304` (rätt väg, följer stateRoot).
- `server.js:426` skapar en **andra** store på samma filnamn med **härdkodad** sökväg. Två stores, samma fil, olika platser → risk för split och att den ena raderas vid deploy.

## Att göra i nästa steg (ej gjort här)

Fazli väljer vilka som ska flyttas till `/var/data` (env-post + `resolveStatePath` i `src/config.js` + byte i `server.js`). **Ingen kod skrevs i denna inventering.**

## Övrigt

- Skriv inte handredigerad state i `data/` — allt ska gå via store/API.
- En gren. Svenska commit-meddelanden. Inga hemligheter.
