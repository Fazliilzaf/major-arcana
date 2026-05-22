# CCO Booking — Sprint 0-checklista

Status: **PÅGÅR**  
Varaktighet: **1–2 veckor**  
Mål: Aktivera befintlig booking-engine på webben enligt **Plan A** — online möte, fysisk konsultation, uppföljning hårtransplantation.

Relaterat:

- **[cco-booking-plan-a-go-live.md](./cco-booking-plan-a-go-live.md)** — Plan A scope + testmatris
- [cco-booking-mvp-spec.md](./cco-booking-mvp-spec.md) — MVP Fas 1 scope + acceptanskriterier
- [web-to-arcana-bridge.md](./web-to-arcana-bridge.md) — API-kontrakt
- [cco-booking-prod-readiness-checklist.md](./cco-booking-prod-readiness-checklist.md) — operator-gates (§A–H gäller delvis)
- [cco-booking-phone-booking-level-1_5-plan.md](./cco-booking-phone-booking-level-1_5-plan.md) — parallellt telefonflöde

---

## Definition of Done (Sprint 0)

Sprint 0 är **klar** när alla punkter nedan är uppfyllda:

- [ ] Patient fyller i `/boka` (sv), väljer **konsultation** + ledig tid + kontaktuppgifter
- [ ] Arcana skapar reservation + CCO-case (`needs_triage`) inom 5 s
- [ ] Patient får Resend-bekräftelse (live, inte mock)
- [ ] Operatör ser ärendet i CCO, bekräftar via booking-engine (`confirm`)
- [ ] Slot markeras upptagen — samma tid kan inte reserveras igen
- [ ] State kvar efter sidladdning / server-omstart (persistent disk)
- [ ] Minst **1 operatör** + **1 intern test** dokumenterade i tabellen längst ner

---

## 1. Förutsättningar

### 1.1 Arcana (Render)

| Env-variabel                           | Syfte                                 | Verifiering                      |
| -------------------------------------- | ------------------------------------- | -------------------------------- |
| `ARCANA_CCO_BOOKING_STORE_PATH`        | CCO booking-cases                     | Skrivbar persistent path         |
| `ARCANA_CCO_BOOKING_ENGINE_STORE_PATH` | Engine (slots, reservationer)         | Skrivbar persistent path         |
| `RESEND_API_KEY`                       | Patient + operatör e-post             | `re_…` satt i prod               |
| `RESEND_FROM`                          | Avsändare                             | t.ex. `contact@hairtpclinic.com` |
| `OPERATOR_NOTIFY_TO`                   | Intern bokningsnotis                  | t.ex. `contact@hairtpclinic.com` |
| Brand host mapping                     | `hairtpclinic.com` → `hair-tp-clinic` | `src/brand/resolveBrand.js`      |

**Filer att känna till:**

| Fil                                        | Roll                                       |
| ------------------------------------------ | ------------------------------------------ |
| `src/config.js`                            | Store paths, defaults                      |
| `src/routes/publicBookingEngine.js`        | Publika endpoints                          |
| `src/routes/ccoBookingEngine.js`           | Intern engine (confirm/cancel/rebook)      |
| `src/ops/ccoBookingEngineStore.js`         | Katalog, schema, reservationer             |
| `src/ops/ccoBookingStore.js`               | CCO booking-cases                          |
| `src/templates/bookingReservationEmail.js` | E-postmallar                               |
| `src/infra/resendMailer.js`                | Resend (mock utan nyckel)                  |
| `server.js`                                | Mount av `createPublicBookingEngineRouter` |
| `bin/pre-commit-cco.sh`                    | Regression-guard steg 4/4                  |

**Snabb healthcheck:**

```bash
curl -sS https://arcana.hairtpclinic.se/api/public/status
curl -sS https://arcana.hairtpclinic.se/api/v1/_diag/env | jq '.bookingEngine, .resend'
```

### 1.2 Webb (Vercel — hairtpclinic.com)

| Env-variabel        | Värde (Sprint 0)                 | Syfte                |
| ------------------- | -------------------------------- | -------------------- |
| `ARCANA_BASE_URL`   | `https://arcana.hairtpclinic.se` | Arcana API           |
| `ARCANA_PROVIDER`   | `booking-engine`                 | **Inte** `cliento`   |
| `ARCANA_BRAND_HOST` | `hairtpclinic.com`               | Skickas som `?host=` |

**Filer (webb-repo, om separat):**

| Fil                                      | Roll                                             |
| ---------------------------------------- | ------------------------------------------------ |
| `next-app/lib/arcana-client.ts`          | Provider-växel catalog/availability/reservations |
| `next-app/app/api/availability/route.ts` | Proxy till Arcana                                |
| `next-app/app/api/lead/route.ts`         | `forwardToArcana()` → reservations               |

### 1.3 Cliento (avveckling)

Sprint 0 ** ska inte** kräva Cliento för webben. Cliento-env kan finnas kvar för legacy CCO telefonflöde tills det migreras — men webben ska vara 100% `booking-engine`.

---

## 2. Steg-för-steg — backend (Arcana)

### Steg 0 — Regression-guard

```bash
cd major-arcana
bash bin/pre-commit-cco.sh   # ska visa 4/4 PASS
npm test -- tests/routes/ccoBookingEngine.test.js tests/ops/ccoBookingEngineStore.test.js
```

- [ ] `createPublicBookingEngineRouter` monterad i `server.js`
- [ ] Unit-tester gröna

### Steg 1 — Katalog

**Endpoint:** `GET /api/public/booking-engine/catalog?host=hairtpclinic.com`

```bash
curl -sS "https://arcana.hairtpclinic.se/api/public/booking-engine/catalog?host=hairtpclinic.com" | jq .
```

**Förväntat:**

```json
{
  "provider": "cco_engine",
  "services": [
    {
      "id": "consultation",
      "title": "Kostnadsfri konsultation",
      "durationMinutes": 30
    }
  ],
  "resources": [{ "id": "egzona", "title": "Egzona Krasniqi" }]
}
```

- [ ] `provider: cco_engine`
- [ ] Minst 1 resurs + `consultation` i services
- [ ] Response < 2 s

**Källa:** `ccoBookingEngineStore.js` → `resources[]`, `services[]`

### Steg 2 — Tillgänglighet

**Endpoint:** `GET /api/public/booking-engine/availability`

```bash
FROM=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d tomorrow +%Y-%m-%d)
TO=$(date -v+7d +%Y-%m-%d 2>/dev/null || date -d "+7 days" +%Y-%m-%d)

curl -sS "https://arcana.hairtpclinic.se/api/public/booking-engine/availability?host=hairtpclinic.com&fromDate=${FROM}&toDate=${TO}&srvIds=consultation&resIds=egzona" | jq '.slots | length, .[0]'
```

- [ ] Minst 1 slot returneras för kommande vecka
- [ ] Varje slot har `slotId`, `start`, `end`, `serviceId`, `resourceId`
- [ ] Filtrering på `srvIds` / `resIds` fungerar

**Källa:** `ccoBookingEngineStore.listAvailability()` + `availabilityRules[]`

### Steg 3 — Reservation (Fas C)

**Endpoint:** `POST /api/public/booking-engine/reservations`

Ersätt `SLOT_ID`, `START`, `END` från steg 2:

```bash
curl -sS -X POST "https://arcana.hairtpclinic.se/api/public/booking-engine/reservations" \
  -H "Content-Type: application/json" \
  -H "Origin: https://hairtpclinic.com" \
  -d '{
    "host": "hairtpclinic.com",
    "contact": {
      "name": "Test Patient Sprint0",
      "email": "sprint0-test+booking@hairtpclinic.com",
      "phone": "+46701234567"
    },
    "slot": {
      "slotId": "SLOT_ID",
      "start": "START",
      "end": "END",
      "serviceId": "consultation",
      "resourceId": "egzona"
    },
    "consent": { "gdpr": true, "marketing": false },
    "locale": "sv",
    "leadContext": {
      "source": "sprint0-curl",
      "service": "consultation",
      "healthYes": [],
      "submittedAt": "2026-05-22T12:00:00+02:00"
    }
  }' | jq .
```

**Förväntat:**

```json
{
  "ok": true,
  "provider": "cco_engine",
  "reservation": { "reservationId": "…", "expiresAt": "…" },
  "caseId": "web-…"
}
```

- [ ] `ok: true`
- [ ] `reservationId` + `expiresAt` (~15 min hold)
- [ ] Upprepat anrop samma slot → `409` eller motsvarande unavailable
- [ ] Resend: patient får mail (`reservation_confirmation_sent` event om `RESEND_API_KEY` satt)
- [ ] Operatör får intern notis

**Källa:** `publicBookingEngine.js` → `reserveSlots`, `bookingStore.setCandidateSlots`, `sendEmail`

### Steg 4 — Verifiera persistens

```bash
# Efter reservation — kontrollera att filerna växer (på Render shell eller via diag)
# cco-bookings.json ska innehålla conversationId web-…
# cco-booking-engine.json ska innehålla reservation status
```

- [ ] Case finns i `ccoBookingStore` med status `needs_triage`
- [ ] Event `web_public_reservation` med `leadContext`
- [ ] Omstart av Render-instans → data kvar

---

## 3. Steg-för-steg — webb

### Steg 5 — Provider-växel

- [ ] Vercel prod: `ARCANA_PROVIDER=booking-engine`
- [ ] Redeploy webb
- [ ] Verifiera att **inga** anrop går till `/api/public/cliento/*` (Vercel logs / network tab)

```bash
curl -sS "https://hairtpclinic.com/api/availability?fromDate=${FROM}&toDate=${TO}" | jq '.provider, .mocked'
```

- [ ] `provider: "cco_engine"` (eller `"booking-engine"` enligt klient-mapping)
- [ ] `mocked: false`

### Steg 6 — `/boka` end-to-end (manuell)

| #   | Handling                        | Förväntat                                    |
| --- | ------------------------------- | -------------------------------------------- |
| 1   | Öppna `/boka` på mobil          | Steg-för-steg wizard laddas                  |
| 2   | Välj konsultation               | Tjänst låst till consultation i MVP          |
| 3   | Välj behandlare / första lediga | Slots från engine                            |
| 4   | Fyll kontakt + GDPR             | Validering OK                                |
| 5   | Skicka                          | Success-meddelande — **inte** "bokning klar" |
| 6   | Kolla inkorg                    | Resend-bekräftelse inom 1 min                |

- [ ] `/en/book` paritet (om aktiv)
- [ ] UI visar tydlig copy: operatör bekräftar inom X

**Källa:** `next-app/app/api/lead/route.ts` → `forwardToArcana()`

---

## 4. Operatörsflöde i CCO

### Steg 7 — Hitta web-case

1. Logga in: `https://arcana.hairtpclinic.se/major-arcana-preview/`
2. Hitta case via kö / sök på testpatientens e-post
3. Öppna booking surface

**Verifiera:**

- [ ] Sektion **🌐 Web-formulär** med leadContext
- [ ] Vald tid synlig
- [ ] Status `needs_triage` eller motsvarande

**API (alternativ debug):**

```bash
# Kräver session — använd browser devtools eller authed curl
# GET /api/v1/cco-booking-engine/case-summary?conversationId=web-…&workspaceId=…
```

### Steg 8 — Bekräfta reservation

| Handling                      | API / UI                                  | Förväntat                            |
| ----------------------------- | ----------------------------------------- | ------------------------------------ |
| Granska slot + patientinfo    | Booking surface                           | All data stämmer                     |
| Klicka **Bekräfta** / confirm | `POST /api/v1/cco-booking-engine/confirm` | Reservation → confirmed              |
| Audit                         | Case events                               | `engine_booking_confirmed` + vem/när |

**Telefon-parallellt (Level 1.5):**

- [ ] Operatör kan fortfarande boka via telefon i CCO utan web-lead
- [ ] Distinktion **vald i CCO** vs **bekräftad** följs ([level 1.5-plan](./cco-booking-phone-booking-level-1_5-plan.md))

### Steg 9 — Negativa tester

| Test                                    | Förväntat                                                                |
| --------------------------------------- | ------------------------------------------------------------------------ |
| Samma slot reserveras igen (ny patient) | 409 / alternativt tider                                                  |
| `consent.gdpr: false`                   | 400 `gdpr_consent_required`                                              |
| Ogiltig e-post                          | 400 `invalid_email`                                                      |
| Arcana nere                             | Webb visar fallback / lead utan crash                                    |
| Saknad `RESEND_API_KEY`                 | Reservation OK, event `reservation_confirmation_failed`, operatör ringer |

---

## 5. Koppling till prod readiness

Följande avsnitt i [cco-booking-prod-readiness-checklist.md](./cco-booking-prod-readiness-checklist.md) gäller **direkt** för Sprint 0:

| Prod readiness              | Sprint 0-relevans                                   |
| --------------------------- | --------------------------------------------------- |
| § Booking store persistence | Steg 4 ovan                                         |
| § Session and tenant        | Operatör inloggning                                 |
| § A. CCO shell health       | Steg 7                                              |
| § B. Booking bootstrap      | Web-case skapas                                     |
| § F. Waiting and follow-up  | Efter confirm — nästa steg i UI                     |
| § G. External confirmation  | Motsvarar engine `confirm` (egen motor, ej Cliento) |
| § H. Closure and history    | Reload sanity                                       |
| § Failure modes 1–5         | Steg 9                                              |

**Ej längre blockerande för Sprint 0** (Cliento-specifikt):

- § Cliento reference data / slots — ersatt av booking-engine catalog/availability

---

## 6. Drift & rollback

| Scenario           | Åtgärd                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Engine bugg i prod | Sätt `ARCANA_PROVIDER=cliento` på Vercel **endast** om Cliento fortfarande driftas — annars stäng `/boka` temporärt |
| Massfel e-post     | Resend mock-mode; operatör ringer manuellt                                                                          |
| Felaktig katalog   | Redigera `cco-booking-engine.json` på disk (eller seed-script) — **backup först**                                   |

**Rollback-kriterium:** >2 dubbelbokningar eller dataförlust → stäng publik reservation, behåll read-only availability.

---

## 7. Testlogg (ifylls av team)

| #   | Testare | Datum | Kanal                   | Slot vald | Resend OK | CCO confirm | Reload OK | Sign-off |
| --- | ------- | ----- | ----------------------- | --------- | --------- | ----------- | --------- | -------- |
| 1   |         |       | curl                    | ☐         | ☐         | ☐           | ☐         | ☐        |
| 2   |         |       | /boka mobil             | ☐         | ☐         | ☐           | ☐         | ☐        |
| 3   |         |       | /boka desktop           | ☐         | ☐         | ☐           | ☐         | ☐        |
| 4   |         |       | Operatör telefon (L1.5) | ☐         | n/a       | ☐           | ☐         | ☐        |

**Go / no-go Sprint 0:**

| Beslut    | Krav                                                                                   |
| --------- | -------------------------------------------------------------------------------------- |
| **GO**    | Rad 1–3 gröna; minst 1 riktig operatör confirm; inga P1-buggar                         |
| **NO-GO** | Reservation skapas inte, data försvinner vid omstart, eller dubbelbokning reproduceras |

**Beslut:** ☐ GO ☐ NO-GO  
**Datum:**  
**Sign-off:**

---

## 8. Snabbreferens — endpoints

| Metod | Path                                      | Auth             |
| ----- | ----------------------------------------- | ---------------- |
| GET   | `/api/public/booking-engine/catalog`      | Nej (`?host=`)   |
| GET   | `/api/public/booking-engine/availability` | Nej              |
| POST  | `/api/public/booking-engine/reservations` | Nej (+ Origin)   |
| GET   | `/api/v1/cco-booking-engine/catalog`      | Ja (CCO session) |
| GET   | `/api/v1/cco-booking-engine/availability` | Ja               |
| GET   | `/api/v1/cco-booking-engine/case-summary` | Ja               |
| POST  | `/api/v1/cco-booking-engine/reservations` | Ja               |
| POST  | `/api/v1/cco-booking-engine/confirm`      | Ja               |
| POST  | `/api/v1/cco-booking-engine/cancel`       | Ja               |
| POST  | `/api/v1/cco-booking-engine/rebook`       | Ja               |
| GET   | `/api/v1/cco-bookings/case`               | Ja               |

Webb-proxy (Vercel):

| Metod | Path                                        |
| ----- | ------------------------------------------- |
| GET   | `https://hairtpclinic.com/api/availability` |
| POST  | `https://hairtpclinic.com/api/lead`         |
