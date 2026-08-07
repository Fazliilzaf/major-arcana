# ORD-86 — Legacy `.se` som inbyggd standard (secret + ~83 hårdkodade fallbacks)

|                 |                                                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bas-commit**  | `ab401504` (origin/main, 2026-07-28)                                                                                                                                                                                                                |
| **Ägare**       | Cowork                                                                                                                                                                                                                                              |
| **GO**          | ~~väntar Fazli~~                                                                                                                                                                                                                                    |
| **Status**      | **LEVERERAD** — steg 2–5 verifierade i kod 2026-08-06. Endast steg 1 (Render-secreten) kvar, och det är Fazlis. Orderfilen uppdaterades aldrig när bygget gick in — samma lucka som ordern själv dokumenterar för ORD-80 och ORD-84.                |
| **Föregångare** | Drift-gatens sex falsklarm (BASE_URL på legacy `.se` + `-L` saknades i `smoke-public.sh`)                                                                                                                                                           |
| **Ordernummer** | ORD-86, ledigt. Verifierat mot git-loggen: ORD-80 är **använt** (`10fd7be4`, BankID-login med esign-token, #1114) men fick aldrig sin orderfil commitad. ORD-84:s orderfil låg i draft-PR #1229 och mergades aldrig. Ingen Notion-avstämning krävs. |

## Verifiering 2026-08-06 — vad som faktiskt finns i koden

Ordern beskriver 84 platser. Vid kontroll mot `e8e7dd41` finns **9 filer** kvar
med `arcana.hairtpclinic.se`, och varje enskild är redovisad:

| Fil                                              | Varfor `.se` star kvar                                      |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `src/config.js`                                  | **Avsiktlig** — redirect-tabellen (steg 3)                  |
| `src/brand/resolveLegacyHostRedirectUrl.js`      | **Avsiktlig** — steg 3                                      |
| `src/brand/brandConfig.js`                       | **Avsiktlig** — `domains` (steg 3)                          |
| `src/brand/canonicalPublicOrigin.js`             | Den delade konstanten steg 2 bad om — **finns**             |
| `scripts/lib/canonical-base-url.js`              | Samma, skript-sidan — **finns**                             |
| `scripts/smoke-public.sh`                        | Testar redirecten, ska inte roras                           |
| `src/ops/icalExport.js:34`                       | iCal-**UID**, inte URL. Byte skulle dubblera kalenderposter |
| `scripts/setup-owner-mfa.js:378`                 | `x-forwarded-host` — testar legacy-varden avsiktligt        |
| `scripts/verify-post-op-uppfoljning-prod.mjs:23` | Endast en kommentar som beskriver svepet                    |

Steg 4 ar ocksa klart: `extract-owner-token.sh:4` defaultar till `.com`, och
raderna 98, 115 och 173 har `-L --max-redirs 5 --post301 --post302 --post303`.

### Steg 1 stangt 2026-08-06 — utlast fran prod

Fazli satte variablerna i Render och deployade. Verifierat mot
`GET /api/v1/_diag/env` pa `aad22ef7`:

```
PUBLIC_BASE_URL         : "https://arcana.hairtpclinic.com"
ARCANA_PUBLIC_BASE_URL  : "https://arcana.hairtpclinic.com"
resolved.publicBaseUrl  : "https://arcana.hairtpclinic.com"
```

**Fynd under verifieringen: det finns TVA variabelnamn, inte ett.** Ordern
namnger bara `ARCANA_PUBLIC_BASE_URL`, men `src/config.js` laser den aldrig:

| Konsument                                                | Vilken vinner                           |
| -------------------------------------------------------- | --------------------------------------- |
| `src/config.js:169` (appens `publicBaseUrl`)             | **bara** `PUBLIC_BASE_URL`              |
| `src/config.js:1296` (Fortnox OAuth-callback)            | **bara** `PUBLIC_BASE_URL`              |
| `src/config.js:1315` (Swish-callback)                    | **bara** `PUBLIC_BASE_URL`              |
| `src/config.js:1327` (foto-review-sparrens vardkontroll) | **bara** `PUBLIC_BASE_URL`              |
| `ccoMailboxSettingsDocument.js:51`                       | `PUBLIC_BASE_URL`, `ARCANA_` som reserv |
| `capabilities/executionService.js:400`                   | `PUBLIC_BASE_URL`, `ARCANA_` som reserv |
| `routes/staffPortal.js:708`                              | `ARCANA_PUBLIC_BASE_URL` forst          |

Hade bara `ARCANA_`-varianten rattats hade sex av sju konsumenter — inklusive
bada betalcallbackarna — fortsatt bygga pa det gamla vardet.

Bada ar nu satta till `.com`, sa fragan ar akademisk i dag. Men divergensen
gick inte att se utifran: `/_diag/env` exponerade nio nycklar och ingen av dem
var en bas-URL. Det ar den blindheten som lat variabeln peka fel i manader.
Atgardat i `fix/diag-exponera-public-base-url` (#1315) — bada namnen plus det
effektiva vardet rapporteras nu, med test som laser dem.

**ORD-86 ar darmed helt stangd.**

## Bas och observation

**Runtime:** prod, mätt 2026-07-28 från sandlådan mot publika domäner. Inget inloggat läge, inga skrivningar.

| Påstående                                   | Fönster                             | Stabilt? | Belägg                                                     |
| ------------------------------------------- | ----------------------------------- | -------- | ---------------------------------------------------------- |
| `.se` svarar 301 → `.com`                   | enstaka anrop, `/healthz`           | ja       | `curl -w '%{http_code} %{redirect_url}'`                   |
| POST utan `-L` mot `.se` ger 301, inte svar | enstaka anrop, `/api/v1/auth/login` | ja       | svarskropp `Moved Permanently. Redirecting to …`, HTTP 301 |
| Samma POST mot `.com` når applikationen     | enstaka anrop                       | ja       | `{"error":"Fel e-postadress eller lösenord."}`, HTTP 401   |
| Signaturbildens `.se`-URL redirectar        | enstaka anrop                       | ja       | 301 → `.com` på `/assets/hair-tp-clinic/…svg`              |
| Antal filer med `arcana.hairtpclinic.se`    | statisk sökning på bas-commit       | ja       | `grep -rl`, exkl. `tests/` och `node_modules`              |

## Problemet

Secreten `ARCANA_PUBLIC_BASE_URL` pekar på legacy `.se`. Det är känt sedan drift-gatens
falsklarm. Men secreten är inte hela felet — den är **en av 84 platser**, och den enda
som Fazli kan rätta.

Fördelning av hårdkodade `https://arcana.hairtpclinic.se`-fallbacks (exkl. `tests/`):

| Katalog                       | Filer | Vad de påverkar                                          |
| ----------------------------- | ----- | -------------------------------------------------------- |
| `scripts/` (+ `scripts/lib`)  | 69    | verifierings- och driftskript                            |
| `src/ops`                     | 5     | patientlänkar, uptime-check, mailboxdokument             |
| `src/capabilities`            | 2     | post-op-granskningslänk, executionService                |
| `src/brand`                   | 2     | patientportal-URL, brand-domänlista                      |
| `src/routes`                  | 1     | post-op-granskning                                       |
| `src/config.js`               | 1     | redirect-tabell (**korrekt** — den ska känna till `.se`) |
| `public/major-arcana-preview` | 2     | signaturens bas-URL, focus-intel-renderare               |

## Varför det inte är kosmetiskt

Redirecten `.se` → `.com` gör att en **webbläsare** alltid landar rätt. Det är därför
det här har kunnat ligga kvar utan att någon märkt något. Men tre konsumenter följer
inte redirects:

**1. `curl` utan `-L` — bevisat.**

```
POST https://arcana.hairtpclinic.se/api/v1/auth/login
  → HTTP 301, kropp: "Moved Permanently. Redirecting to https://arcana.hairtpclinic.com/…"

POST https://arcana.hairtpclinic.com/api/v1/auth/login
  → HTTP 401, kropp: {"error":"Fel e-postadress eller lösenord."}
```

`scripts/extract-owner-token.sh` POSTar med `curl -sS` **utan `-L`** och har `.se` som
fallback (rad 4). Skriptet får redirect-texten i stället för en token och misslyckas med
ett meddelande som inte nämner domänen. Samma mönster som `smoke-public.sh` hade innan
`-L --post301 --post302 --post303` lades till — och just den fixen visade att `-L` ensamt
inte räcker, eftersom `curl` konverterar POST till GET på 301/302/303.

**2. Mailklienter.** `CCO_SIGNATURE_PUBLIC_BASE_URL` (`app.js:3254`) är bas för
signatur-assets på **vår** domän. Många klienter hämtar bilder via en proxy som
inte följer redirects, och en del spam-heuristiker väger en redirectande bild-URL
negativt. Ingen krasch — bara en bild som inte visas hos mottagaren.

> **Rättelse 2026-07-28, under bygget.** Ordern påstod först att detta gäller
> signaturens logotyp. Det stämmer inte. Den **godkända** Fazli/Egzona-signaturen
> hämtar sin logotyp från en extern CDN (`img2.gimm.io`) och berörs inte alls.
> Konstanten träffar bara signaturer vars assets ligger under
> `/assets/hair-tp-clinic/…` — `rewriteApprovedSignatureAssetUrls` skriver om
> `localhost:3000/assets/hair-tp-clinic/` till den. Sådana finns (se
> `tests/capabilities/analyzeInbox.test.js`), så problemet är verkligt, men
> mindre än ordern först hävdade. Även `brandConfig.logoUrl` pekade redan på
> `.com`.

**3. Länkar i patientmail.** `offerAutoFlow.js` (VIP-bokning och `/boka`),
`postOpAutoTrigger.js`, `requestPostOpReview.js`, `routes/postOpReview.js` och
`brandConfig.patientPortalUrl` bygger alla länkar på `.se` när config saknas. De
fungerar i webbläsare, men skickar patienten via en domän vi håller på att avveckla.

## Uppgift

**Steg 1 — secreten (Fazli, blockerande för drift-gaten).**
`ARCANA_PUBLIC_BASE_URL` = `https://arcana.hairtpclinic.com`.
Jag skriver inte hemligheter. Detta är enda steget jag inte kan göra.

**Steg 2 — en delad standard i stället för 83 kopior.**
Inför **en** exporterad konstant för publik bas-URL och låt `src/`-fallbackarna läsa
den. Ingen ny konfiguration, ingen ändrad prioritetsordning — bara sista ledet i varje
`||`-kedja som byts från en litteral till konstanten.

**Steg 3 — `.se` behålls medvetet på exakt tre ställen**, med skälet i koden:
`src/config.js:181` och `src/brand/resolveLegacyHostRedirectUrl.js` (redirect-tabellen
måste känna igen den gamla värden), samt `brandConfig.domains` (domänigenkänning).
Ett test ska falla om någon "städar bort" dem.

**Steg 4 — `-L --post301 --post302 --post303` i `extract-owner-token.sh`**, samma
behandling som `smoke-public.sh` fick. Inte i stället för steg 2 utan utöver: ett skript
ska överleva en felpekad miljövariabel.

**Steg 5 — skripten.** 69 filer, alla dev/drift. Lägst risk, störst volym. Tas som egen
commit efter att steg 2–4 är verifierade, så en misslyckad sweep inte blandas ihop med
produktionskoden.

## Krav

- Varje steg är en egen commit. Steg 5 rör inga filer under `src/` eller `public/`.
- Ett test som POSTar mot en redirectande värd och kräver att svaret är applikationens,
  inte redirectens. Utan det testet är fixen inte bevisad, bara utförd.
- Ett test som låser de tre medvetna `.se`-förekomsterna.
- Ingen ändring av prioritetsordningen i någon `||`-kedja. Miljövariabler ska fortsätta
  vinna över standardvärdet.

## Vad som INTE ingår

- Att stänga av `.se`-redirecten. Den ska ligga kvar; gamla länkar finns i utskickade
  mail och hos patienter.
- `tests/`-filernas `.se`-strängar. Flera av dem testar just redirecten och ska inte röras.
- Mailadresser på `@hairtpclinic.se`. De är en annan domän och en annan fråga.

## Luckor i handover-protokollet — utredda, inte öppna

Två nummer saknade orderfiler i `docs/handover/ORDERS/`. Båda är utredda mot git-loggen:

- **ORD-80** — numret är **använt**. `10fd7be4`, _"feat(portal): ORD-80 — BankID-login
  accepterar esign-token + tokensort-styrt återhopp till rika offer-portalen"_ (#1114).
  Arbetet är mergat; endast orderfilen commitades aldrig.
- **ORD-84** — orderfilen skrevs och öppnades som draft-PR #1229, men mergades aldrig.
  Implementationen gick in via #1231. Den här grenen bär en ersättande version med
  prod-ommätningen och falsifieringen av 13×-siffran; #1229 stängs som ersatt.

**Ingen kollision.** ORD-86 och ORD-87 är lediga. Lärdomen är inte att numren driver —
det gör de inte — utan att **en orderfil i draft är en order som inte finns**. Ett
mergat bygge med en omergad order lämnar inget spår i `ORDERS/`.
