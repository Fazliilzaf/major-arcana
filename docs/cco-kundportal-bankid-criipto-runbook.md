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
4. Registrera **Callback/redirect URI** exakt:
   `https://<PUBLIC_BASE_URL>/api/v1/cco-portal/bankid/callback`
   (t.ex. `https://arcana.hairtpclinic.se/api/v1/cco-portal/bankid/callback`).

## Steg 2 — Env

Sätt i miljön (först i staging/test, sen prod):

```
CRIIPTO_DOMAIN=hairtp.criipto.id
CRIIPTO_CLIENT_ID=urn:my:application:identifier:xxxx
CRIIPTO_CLIENT_SECRET=<secret>
BANKID_API_KEY=<valfri icke-tom markör som tänder live-gaten>
PORTAL_BANKID_LIVE=1
PORTAL_SESSION_SECRET=<lång slumpsträng för cookie-signering>
PUBLIC_BASE_URL=https://arcana.hairtpclinic.se
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

## MÅSTE innan prod-live: verifiera id_token-signaturen

`makeCriiptoExchange` avkodar idag `id_token`-payloaden **utan** att verifiera
signaturen. Innan `PORTAL_BANKID_LIVE=1` i produktion:

- Verifiera `id_token` mot Criiptos **JWKS** (`https://<domain>/.well-known/
openid-configuration` → `jwks_uri`), samt `iss`, `aud` (=client_id), `exp` och
  `nonce` (mot state-cookiens `nonce`).
- Enklast: lägg till ett litet JWKS-verifieringssteg i `makeCriiptoExchange`
  (eller injicera en verifierande `exchangeCode`). Utan detta kan en angripare
  med ett förfalskat id_token teoretiskt kringgå — acceptabelt i dry-run/test,
  INTE i prod.

Detta är den enda kända produktionsspärren; allt annat är klart.

## Fallback (redan inbyggt)

Kunder utan BankID stannar på nivå 1 (magisk länk) och verifieras av personal
med gratismetod. Signering sker då via dagens `offer-accept-public`. Ingen låses ute.
