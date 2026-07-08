# Handoff → Cursor: montera kundportalens nivå-2 i UI:t

Claude har byggt och mergat hela backend + frontend-modul + e2e för kundportalens
BankID-inloggning (nivå 2). Två små wiring-steg återstår i **era heta filer** (jag
rör dem inte enligt `docs/agent-koordinering.md`). Det här är vad jag behöver hjälp
med.

## Klart och mergat (Claudes yta — rör inte)

- `src/ops/ccoPortalBankIdSession.js` — authorize-URL, pnr→canonical patientId, session, owner-check.
- `src/ops/ccoCriiptoIdToken.js` — JWKS-verifiering av id_token (RS256/iss/aud/exp/nonce).
- `src/routes/ccoPortalBankId.js` — `/bankid/login`, `/callback`, `/me` (monterad i server.js).
- `src/ops/ccoPortalCustomerPayload.js` — offert + journal-referens + bokningar i `/me`.
- `public/major-arcana-preview/app/cco-portal-level2.js` — frontend-klient (drop-in).
- Bevis: `node scripts/mock-bankid-oidc-e2e.js` → hela live-kedjan grön mot en riktig
  OIDC-server (riktigt token-utbyte + JWKS). `node scripts/smoke-portal-bankid.js` → dry-run.
- Kontrakt: `docs/cco-kundportal-inloggning-kontrakt.md`, runbook:
  `docs/cco-kundportal-bankid-criipto-runbook.md`.

## Steg A — inkludera nivå-2-modulen i portalen (er fil)

Fil: `public/major-arcana-preview/cco-patient-offer-portal-v3.html`.

Lägg där kundens plan/offert ska visas:

```html
<div data-cco-portal-level2></div>
<script src="/major-arcana-preview/app/cco-portal-level2.js"></script>
```

Modulen hämtar själv `/api/v1/cco-portal/me`, injicerar egen CSS, och renderar:

- **utloggad (401)** → "Logga in med BankID" (länkar `/bankid/login?token=<token>`,
  token härleds ur `/portal-chat/<token>` eller `?token=`).
- **inloggad** → offertkort (status: förbereds/betänketid/redo/signerad) + journal-referens + bokningar.

Ingen annan ändring krävs — den är fristående.

## Steg B — koppla "Signera offerten"-knappen (er esign-flöde)

Modulen renderar knappen `<button data-l2-accept>` när `offer.signing.canAccept === true`.
Koppla den till befintlig esign-accept (`offer-accept-public` / `offer-sign-page`).
BankID-sessionen från nivå 2 kan återanvändas som signeringsbevis (samma personnummer).
Se steg 4 i `docs/cco-kundportal-inloggning-kontrakt.md`.

## Steg C (valfritt, er prod-access) — tänd live

Env är delvis satt i Render. När Criipto-nycklarna finns (Fazli skapar kontot):
`CRIIPTO_CLIENT_ID`, `CRIIPTO_CLIENT_SECRET`, sedan `PORTAL_BANKID_LIVE=1` → deploy.
`scripts/apply-portal-bankid-prod.js` (ert script) gör detta. Claude når inte prod/Render.

## Vad Claude INTE behöver hjälp med

Backend/frontend-logik, verifiering, tester — klart och bevisat. Blockeraren för
skarpt prov är **Criipto-kontot** (Fazli) + de två UI-stegen ovan (ni). Inget kodfel.
