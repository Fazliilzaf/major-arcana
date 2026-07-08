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

### 2. BankID step-up

`POST /api/v1/cco-portal/bankid/start` → startar BankID-ordersession.
`POST /api/v1/cco-portal/bankid/collect` → pollar tills klar.
Vid klar: slå personnummer → `patientId` via patient-mastern. Verifiera mot
token-ägarens `patientId`. Sätt http-only session-cookie (kort TTL).

Ingen ny live-send. BankID-leverantör bakom env-gate (t.ex. `PORTAL_BANKID_LIVE`),
dry-run/mock som default precis som övriga send-gates.

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

## Öppna beslut (till Cursor/Codex + Fazli)

- BankID-leverantör (Criipto / Signicat / Svensk BankID direkt) — vilken redan finns?
- Nivå-2-sessionens TTL (förslag: 30 min inaktivitet).
- Ska magisk länk kunna _stängas av_ helt för en viss kund (bara BankID)? — via
  `revokeToken`.
