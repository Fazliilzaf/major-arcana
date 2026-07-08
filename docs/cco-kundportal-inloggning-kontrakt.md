# Kundportal — inloggning (hybrid: magisk länk + BankID)

Kontrakt för hur kunden når den rika kundportalen
(`public/major-arcana-preview/cco-patient-offer-portal-v3.html`) efter
konsultation, medan hen inväntar offert/behandlingsplan. Beslut: **hybrid** —
magisk länk för att _se_, BankID för att _agera_ och _återvända_.

Detta doc är kontraktet. Wiring:en (routes, portal-runtime, session) ägs av
Cursor/Codex enligt `docs/agent-koordinering.md`. Claude rör inte de heta
filerna — resolvern och detta kontrakt är byggstenarna.

## Två åtkomstnivåer

| Nivå                       | Hur                                                              | Får se / göra                                                                                     |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **1. Magisk länk** (finns) | Slumptoken i länken, ingen inloggning (`accessStore.issueToken`) | Läsa offert-/planöversikt (`offerPlan`), skriva icke-akut meddelande, se betänketid               |
| **2. BankID-session** (ny) | Step-up med Mobilt BankID ovanpå nivå 1                          | Signera offert, se journal/medicinskt innehåll, komma tillbaka senare utan ny länk, ladda ned PDF |

Regel: **medicinskt innehåll och signering kräver alltid nivå 2.** Magisk länk
räcker bara för översikt + meddelande. Så tappar vi ingen på tröskeln (låg
friktion att öppna), men trygghetsnivån är rätt för journal/plan.

**Fallback för kunder utan BankID:** kan/vill kunden inte använda BankID stannar
hen på nivå 1 (magisk länk) och personal verifierar identitet med en befintlig
gratismetod (`in_person` · `manual_id_upload` · `selfie_match` i
`patientIdentityVerification.js`). Signering sker då via dagens
`offer-accept-public` med betänketid, inte BankID. Ingen låses ute.

## BankID-leverantör — NULÄGE (viktigt)

**Det finns ingen BankID-integration i repot idag.** Sömmen finns, men den är tom:

- `patientIdentityVerification.js` listar `bankid_se` som _framtida betald
  integration_ — den ytan aktiveras bara om `process.env.BANKID_API_KEY` är satt,
  och **ingen kod anropar faktiskt BankID** (ingen `orderRef`/`autostart`/`collect`).
- `cco-patient-offer-portal-v3.html`:s "Signera med Mobilt BankID" är **mockup-UI**.
  Riktig signering idag = `offer-accept-public?token=` (formulär-POST, gate:ad av
  betänketid) — inte BankID.
- Inga spår av Criipto / Signicat / GrandID / Scrive / direkt BankID-RP.

**Beslut som krävs innan bygge — välj leverantör:**

| Alternativ                | Vad                              | Passar oss                                  |
| ------------------------- | -------------------------------- | ------------------------------------------- |
| **Criipto** (rek.)        | OIDC-broker för BankID/Freja     | Enklast, billigt vid låg volym, dev-vänligt |
| **Signicat**              | OIDC-broker, enterprise          | Om ni vill ha större leverantör/SLA         |
| **GrandID** (Svensk e-id) | Svensk broker                    | Vanlig i vård, svensk support               |
| Direkt BankID-RP          | Eget avtal med bank + certifikat | Tyngst — undvik i första skedet             |

Rekommendation: börja med **Criipto** (OIDC → vi slipper bli bank-RP). Sömmen
`BANKID_API_KEY` blir då leverantörens client-credentials, och steg 2 nedan blir
ett OIDC-login i stället för egen `start`/`collect`.

## Canonical identitet (icke förhandlingsbar)

- Kundens canonical id = `patient.id` (heter `patientId` överallt i UI/API/URL).
- Access-token-storens `customerId` **är** `patientId` — inget eget id-system.
- `cliento_*` / `pipedrive_*` är alias för matchning, ALDRIG nyckel i portal/session.
- BankID-personnummer lagras **inte** som id; det används bara för att verifiera
  och kopplas till `patientId` via patient-mastern (samma som resolvern gör).

## Befintlig infra som återanvänds (bygg inte om)

| Behov                     | Finns redan                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| Mynta magisk token        | `accessStore.issueToken({ tenantId, customerId })` (idempotent, TTL)        |
| Bygg portallänk           | `buildPortalUrl(baseUrl, token)` → `/portal-chat/:token`                    |
| Slå upp token             | `accessStore.resolveToken(token)` → `{ tenantId, customerId, expiresAt }`   |
| Rotera/återkalla          | `accessStore.rotateToken` · `revokeToken`                                   |
| Offert-signering (BankID) | `ccoOfferEsign.js` · `offer-sign-page?token=` · `offer-accept-public`       |
| Offertdata (delad källa)  | `commercialCase.offerPlan` (`offer-plan.v1`), samma som PDF/portal renderar |
| Kund ↔ patient-matchning  | `resolveConversationPatient` (`src/ops/ccoConversationPatientResolver.js`)  |

Portalen renderar redan `offerPlan` via `window.ARCANA_CUSTOMER_OFFER_PLAN`
(se `customer-portal-offer-flow-k1-k2-2026-07-01.md`, K4). Inloggningen ändrar
_hur_ payloaden hämtas, inte _vad_ som renderas.

## Flöde

```
1.  Kund får mejl efter konsultation → magisk länk (nivå 1)
        buildPortalUrl(base, issueToken({tenantId, customerId=patientId}))
2.  Länk öppnar portalen → nivå 1: översikt + meddelande, inget medicinskt
3.  Kund vill signera / se journal → "Logga in med BankID" (step-up)
4.  BankID verifierar → personnummer → patientId (via patient-master)
        måste matcha token-ägarens patientId, annars nekas
5.  Nivå 2-session skapas (kort TTL, http-only cookie) → medicinskt + signering
6.  Återbesök: BankID-inloggning direkt (utan att behöva ny magisk länk)
```

Steg 4:s matchningsregel: BankID-personnumrets `patientId` **måste vara samma**
som den magiska tokenens `customerId`. Matchar de inte → neka (skydd mot att en
läckt länk kombineras med fel BankID).

## Wiring-steg (ägs av Cursor/Codex)

Additivt, i ordning. Varje steg litet.

### 1. Nivå-1-route (mestadels finns)

`GET /portal-chat/:token` → `resolveToken` → rendera portalen i nivå-1-läge.
Nivå-1-payload: `offerPlan` (översikt) + betänketid + meddelandekanal. **Inget**
journal-/medicinskt fält i denna payload.

### 2. BankID step-up (via OIDC-broker)

Med Criipto/Signicat blir detta ett OIDC-login, inte egen `start`/`collect`:

`GET /api/v1/cco-portal/bankid/login` → redirect till brokerns authorize-URL.
`GET /api/v1/cco-portal/bankid/callback` → byt code mot token, läs personnummer
ur claims. Slå personnummer → `patientId` via patient-mastern. Verifiera mot
token-ägarens `patientId`. Sätt http-only session-cookie (TTL 30 min inaktivitet).

Ingen ny live-send. Broker-credentials bakom env-gate (`BANKID_API_KEY` /
`PORTAL_BANKID_LIVE`), dry-run/mock som default precis som övriga send-gates.
(Väljer ni ändå direkt BankID-RP blir det i stället `start`/`collect` mot
`orderRef` — tyngre, se leverantörsbeslutet ovan.)

### 3. Nivå-2-payload

`GET /api/v1/cco-portal/me` (kräver nivå-2-cookie) → full portal-payload:
`offerPlan` + journal-referens + bokningar + signeringsstatus. Läser samma
`commercialCase.offerPlan` som PDF/signeringssida — ingen andra sanning.

### 4. Signering återanvänder esign

Signera-knappen i nivå 2 pekar på befintlig
`offer-accept-public` / `offer-sign-page`-logik. BankID-sessionen från steg 2
kan återanvändas som signeringsbevis (samma personnummer, samma order-referens).

## Scope (bevaras i alla steg)

- Read-only mot patient-master + offerPlan; ingen Drive-skrivning.
- Ingen live-send utan env-gate (dry-run default).
- Medicinskt innehåll bara bakom nivå-2 (BankID).
- Aldrig personnummer, e-post eller cliento-alias i URL — bara opak token / cookie.
- Session-cookie: http-only, secure, SameSite=Lax, kort TTL.

## Två portaler — samma canonical id binder ihop dem

Systemet har **två skilda portaler med skilda auth-modeller**. De "kopplas" inte
via delad inloggning utan via samma canonical `patientId`.

| Portal             | Fil / route                                       | Auth                                                                            | Vem      |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| **Kundportal**     | `cco-patient-offer-portal-v3.html`                | Magisk länk (nivå 1) + BankID (nivå 2) — _detta doc_                            | Kunden   |
| **Personalportal** | `staff-portal.html` · `src/routes/staffPortal.js` | Finns redan: `requireAuth` + `authStore`, roller STAFF/OWNER/nurse/doctor/admin | Personal |

Kopplingen:

- **Delad nyckel = `patientId`.** Personal agerar på ett `commercialCase`
  (skickar offert, godkänner plan) → kunden ser resultatet i sin portal. Samma
  `offerPlan`, samma `patientId`, ingen andra sanning.
- Personalportalen har redan `buildStaffPortalUrl(...)` och bygger
  kund-arbetsposter — deep-linkar redan per case. Kundportalen är motsvarande
  kund-vända yta av samma case.
- **Blanda inte auth:** personalens roll-login (internt personalregister) och
  kundens BankID/magisk länk är två system. En personal loggar aldrig in i
  kundportalen med sin personalroll och vice versa.
- Status-synk: när personal ändrar case-status (offert skickad, betänketid,
  signerad) speglas det i kundportalens payload (steg 3 nedan) via samma
  `commercialCase`. Inget separat kund-status-system.

## Öppna beslut (till Cursor/Codex + Fazli)

- **BankID-leverantör:** ingen finns idag (se nuläge ovan). Rekommendation:
  **Criipto** (OIDC). Kräver Fazlis val + konto innan wiring.
- **Nivå-2-sessionens TTL:** 30 min inaktivitet (beslutat).
- **Magisk länk som fallback:** kunder utan BankID stannar på nivå 1 + personal
  verifierar med gratismetod (beslutat).
- Ska magisk länk kunna _stängas av_ helt för en viss kund (bara BankID)? — via
  `revokeToken` (öppet).
