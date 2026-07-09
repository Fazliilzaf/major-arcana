# Runbook — koppla in Criipto (BankID) för kundportalen

Koden är byggd och monterad (PR #714). Den kör **dry-run** tills två saker görs:
ett Criipto-konto + rätt env. Den här runbooken är just de stegen.

Byggt och klart:

- `src/ops/ccoPortalBankIdSession.js` — authorize-URL, pnr→patientId, session.
- `src/routes/ccoPortalBankId.js` — `login` / `callback` / `me`, monterad i `server.js`.
- Live-gate: allt är dry-run tills `BANKID_API_KEY` **och** `PORTAL_BANKID_LIVE=1`.

## Steg 1 — Skapa Criipto-applikation

1. Skapa konto på Criipto (dashboard.criipto.com). Välj **Sweden BankID** som
   identitetstjänst.
2. Skapa en **Application** (OpenID Connect / Authorization Code).
3. Notera:
   - **Domain** (t.ex. `hairtp.criipto.id`) → `CRIIPTO_DOMAIN`
   - **Client ID** (`urn:...`) → `CRIIPTO_CLIENT_ID`
   - **Client secret** → `CRIIPTO_CLIENT_SECRET`
4. Registrera **Callback/redirect URI** exakt (ingen avslutande slash):
   `https://arcana.hairtpclinic.com/api/v1/cco-portal/bankid/callback`
   — måste matcha `PUBLIC_BASE_URL` byte-för-byte. Använd den kanoniska
   `.com`-domänen: `.se` redirectar hit och en redirect på OIDC-callbacken kan
   tappa `?code`/`?state`. Hela kedjan (magisk länk, login, callback, `/me`)
   måste ligga på samma origin, annars skickas inte session-cookien.

## Steg 2 — Env

Sätt i miljön (först i staging/test, sen prod):

```
CRIIPTO_DOMAIN=hairtp.criipto.id
CRIIPTO_CLIENT_ID=urn:my:application:identifier:xxxx
CRIIPTO_CLIENT_SECRET=<secret>
BANKID_API_KEY=<valfri icke-tom markör som tänder live-gaten>
PORTAL_BANKID_LIVE=1
PORTAL_SESSION_SECRET=<lång slumpsträng för cookie-signering>
PUBLIC_BASE_URL=https://arcana.hairtpclinic.com
```

Utan `PORTAL_BANKID_LIVE=1` görs inget skarpt anrop — sömmen svarar `dry_run`.

## Steg 3 — Verifiera flödet

1. Mynta en magisk länk till en testkund (samma `accessStore.issueToken` som idag).
2. Öppna `…/api/v1/cco-portal/bankid/login?token=<token>` → redirect till BankID.
3. Signera med BankID (testpersonnummer i Criiptos testmiljö).
4. Callback ska sätta nivå-2-cookie och skicka tillbaka till
   `/portal-chat/<token>?l2=ok`.
5. `…/api/v1/cco-portal/me` ska svara `{ authenticated: true, level: 2, patientId }`.

Testkundens personnummer måste finnas i patient-mastern (`patient.personnummer`)
och matcha tokenägaren — annars nekas med `l2=owner_mismatch` (avsiktligt).

## id_token-verifiering (JWKS) — BYGGD

`makeCriiptoExchange` verifierar nu `id_token` mot Criiptos **JWKS** innan dess
claims används, via `src/ops/ccoCriiptoIdToken.js` (12 tester):

- RS256-signatur mot publik nyckel (kid → JWK); `alg=none` avvisas.
- `iss` === `https://<CRIIPTO_DOMAIN>`, `aud` innehåller `CRIIPTO_CLIENT_ID`.
- `exp` i framtiden (60 s klock-skew), `nonce` === state-cookiens nonce (replay-skydd).
- JWKS hämtas via OIDC-discovery (`/.well-known/openid-configuration`).

Ett förfalskat eller manipulerat id_token nekas därför automatiskt. Inget kvar
att bygga på kodsidan — det som återstår är enbart Criipto-konto + env ovan.

Tips: verifiera att `iss` matchar exakt vad Criipto sätter (vissa tenants har
domän utan/med avslutande slash). Justera `expectedIssuer` vid behov.

## Säkert test-bevis av hela kedjan UTAN BankID-app

Innan riktigt BankID finns tillgängligt kan hela nivå-2-sömmen bevisas
deterministiskt i kod, utan nätverk, app eller riktig patientdata:

```
npm run verify:portal-bankid-l2-e2e
# eller: node scripts/verify-portal-bankid-l2-e2e.js
```

Scriptet startar routern in-process (Express på en ephemeral port), använder den
riktiga `ccoPortalAccessStore` mot en temp-fil och en fixture-patient-master, och
injicerar Criiptos kodutbyte (`exchangeCode`) så att det returnerar ett valt
testpersonnummer. Det asserterar hela kedjan:

- `login` → 302 till Criipto authorize + signerad state-cookie
- `callback` (matchande pnr) → `verified` → nivå-2-session-cookie → `l2=ok`
- `callback` (fel ägare) → `denied owner_mismatch`, ingen session
- `callback` (okänt pnr) → `denied pnr_unmatched`, ingen session
- `/me` (giltig session) → `authenticated: true, level: 2`, canonical `patientId` + payload
- `/me` (ingen/manipulerad cookie) → 401

Detta bevisar wiring, cookies, `pnr → patientId`, owner-regeln och session — allt
utom det som per definition kräver en extern BankID-signering.

### Ingen prod-bypass

Test-beviset är ett **fristående script**, inte en route. Servern monterar
**ingen** test-callback-simulator, så det finns inget test-läge som kan släppa
igenom en session i skarp prod. Skulle en sådan simulator någonsin behövas måste
den vara hårt grindad (`NODE_ENV !== 'production'` **och** explicit
`PORTAL_BANKID_TEST_SIMULATOR=1`, default av) — men i nuläget är den avsiktligt
inte byggd, eftersom scriptet räcker för beviset. De skarpa säkerhetsreglerna
(owner-match, state/nonce, JWKS-verifiering) är orörda.

## Väg A — testa riktig inloggning utan app (test-eID/simulator)

Prod pekar idag mot Iduras **test**-broker (`hairtpclinic.test.idura.broker`).
Ett **produktions**-BankID kan inte signera mot en test-broker → BankID-appen
svarar "QR-koden är ogiltig". Det är en **miljömatchning**, inte ett kodfel.

För att kunna logga in mot test-brokern utan en fysisk app finns två alternativ:

1. **Aktivera test-eID / simulator för test-brokern (Idura/Criipto).**
   Criipto har en inbyggd test-signeringsupplevelse för icke-produktionsmiljöer
   (test-eID) som låter dig signera med testpersonnummer i webbläsaren istället
   för i den riktiga appen. På hög nivå krävs:
   - att applikationen/domänen i Idura/Criipto är en **test-tenant** (inte prod-cert),
   - att **test-signering/test users** är påslaget för Sweden BankID på den tenanten,
   - att ett **testpersonnummer** som accepteras av test-brokern används, och att
     samma personnummer finns i patient-mastern och matchar tokenägaren.
     Exakta klick i dashboarden styrs av Idura/Criipto och kan skilja mellan konton —
     följ Criiptos officiella dokumentation för test-läget:
   - Test users / test signing: <https://docs.criipto.com/verify/getting-started/test-users/>
   - Swedish BankID (acr_values, test vs prod): <https://docs.criipto.com/verify/e-ids/swedish-bankid/>
     Har du inte tillgång till Idura-dashboarden: be Idura/Criipto-administratören
     aktivera test-eID på test-tenanten. Servern kräver ingen kodändring — bara att
     test-brokern släpper igenom en test-signering.

2. **Riktig BankID-app mot test-brokern.** Kräver att Idura/Criipto uttryckligen
   kopplat ett test-BankID-uppsätt till test-brokern. Utan test-eID/simulator ovan
   fungerar det inte med ett vanligt produktions-BankID.

## Väg till skarp produktion (prod-cert + prod-domän)

När flödet är verifierat och go-live godkänts:

1. Skaffa/aktivera **prod-cert** för Sweden BankID i Criipto/Idura (produktions-
   tenant, inte test-brokern). Då signerar riktiga produktions-BankID.
2. Peka env mot **prod**-brokerns domän och prod-`CRIIPTO_CLIENT_ID`/secret
   (se Steg 2). Behåll `PORTAL_BANKID_LIVE=1` + `BANKID_API_KEY` satt.
3. Registrera prod-callback-URL:en exakt (kanonisk `.com`-domän, ingen slash),
   matchande `PUBLIC_BASE_URL` (se Steg 1).
4. Rök-testa mot prod med ett riktigt BankID och bekräfta `/me` → nivå 2.

Referens för prod vs test-miljöer i Criipto:
<https://docs.criipto.com/verify/getting-started/production/>

## Fallback (redan inbyggt)

Kunder utan BankID stannar på nivå 1 (magisk länk) och verifieras av personal
med gratismetod. Signering sker då via dagens `offer-accept-public`. Ingen låses ute.
