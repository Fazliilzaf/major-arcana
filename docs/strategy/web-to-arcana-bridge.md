---
owner: CMO
status: active
---

# Web-to-Arcana Bridge

Skapad: 2026-05-18
Syfte: Låsa kontrakten mellan `hairtpclinic.com` och Arcana CCO-booking innan integration byggs. Ersätter steg 4.D.1 + 4.D.4 i `web-hairtpclinic-com-masterplan.md` med en disciplinerad migration som **inte använder Cliento på sikt**.
Status: Fas B/C live på prod. Pass 4 (web-events audit) + abuse guard implementerad 2026-05-20.

Relaterat:
- `docs/strategy/cco-booking-phone-booking-level-1_5-plan.md` — Level 1.5 operator-flöde
- `docs/strategy/cco-booking-prod-readiness-checklist.md` — gates innan live
- `docs/strategy/web-hairtpclinic-com-masterplan.md` — sektion 7 (kopplingspunkter)

---

## 0. Kompass

0.0. **Driftregel (låst, 2026-05-24):** **Ingen Cliento** och **ingen CCO** på hemsidans kundbokning tills CCO-bokning är redo och uttryckligen godkänd.

0.0.1. **Prod-default:** `ARCANA_PUBLIC_WEB_BOOKING_ENABLED=false` och `ARCANA_CLIENTO_INTEGRATION_ENABLED=false` — alla `/api/public/booking-engine/*` svarar `503 public_web_booking_disabled`; `/public/cliento/*` svarar `cliento_booking_disabled`.

0.0.2. **Efter sign-off:** sätt endast `ARCANA_PUBLIC_WEB_BOOKING_ENABLED=true` (aldrig Cliento på `.com`). Se `.cursor/rules/website-booking-policy.mdc`.

0.1. "Webbens roll är att fånga intentionen, Arcanas roll är att äga sanningen — gränsen mellan dem ska vara så smal att en patient inte märker den, men så tydlig att en operatör alltid vet vem som har bollen."

0.2. Konkret: webben visar **läsbart** vad som finns ledigt, och **submittar** en lead med vald tid. CCO-operatören gör den verifierade reservationen.

---

## 1. Strategiskt beslut — Cliento ut, CCO booking-engine in

1.1. Hair TP Clinic ska INTE använda Cliento som långsiktig bokningsmotor. Bekräftat 2026-05-18 av Fazli: *"vi ska inte använda oss av cliento i framtiden vi ska bygga egen CCO booking som vi håller på emd just nu"*.

1.2. Migrationen sker i tre faser:
- 1.2.1. **Fas A (idag):** Webben pollar `/public/cliento/*` (publicClinic.js). Operatören bekräftar manuellt i Cliento. Det här är "Level 1.5 bridge" från prod-readiness-doc.
- 1.2.2. **Fas B (närmaste sprint):** Vi bygger `/public/booking-engine/*` som speglar `/public/cliento/*` men hämtar från `ccoBookingEngineStore` istället. Webben byter `ARCANA_PROVIDER=booking-engine`. Inga Cliento-anrop kvar från webben.
- 1.2.3. **Fas C (efter pilot):** Vi adderar `/public/booking-engine/reservations` som auto-skapar en CCO-thread (`conversationId` syntetiseras från `email + timestamp`) och POSTar `reserveSlots` direkt. Patient får en hold på 15 min, operatören verifierar.

1.3. Detta gör att Cliento kan stängas av i Arcana när Fas B är validerad, utan att webben påverkas (samma client, byt env-var).

---

## 2. Domain-respekt (icke-förhandlingsbart)

2.1. Webben pratar bara med **publika** endpoints på Arcana — aldrig direkt mot `ccoBookingEngine`-routern som kräver auth + conversationId.

2.2. Inga interna stores exponeras: `ccoBookingStore`, `ccoBookingEngineStore`, `ccoPatient360Bridge` är alla internt API.

2.3. Tenant-isolation: webbens host (`hairtpclinic.com`) resolveras till tenant `hair-tp-clinic` via `resolveBrandForHost`. Alla anrop måste skicka `?host=hairtpclinic.com` så Arcana vet vilken brand som frågar.

2.4. `arcana.hairtpclinic.se` är Arcanas drift-domän. Webben deployas separat på Vercel och rör aldrig Render-instansen.

---

## 3. API-kontrakt (publika endpoints)

### 3.1 GET `/api/v1/public/cliento/ref-data` *(Fas A)* / `/api/v1/public/booking-engine/catalog` *(Fas B)*

Hämta tjänster + resurser. Inget auth-token, bara `?host=`.

**Query:**
- `host` (required) — t.ex. `hairtpclinic.com`

**Response:**
```json
{
  "provider": "cliento" | "cco_engine",
  "services": [
    { "id": "consultation", "title": "Konsultation", "durationMinutes": 30, "fromPriceSek": 0 }
  ],
  "resources": [
    { "id": "egzona", "title": "Egzona", "role": "Hårtransplantation" }
  ]
}
```

**Fel-respons:**
- `503 { ok: false, error: "cliento_partner_id_missing" }` — brand saknar Cliento-config

### 3.2 GET `/api/v1/public/cliento/slots` *(Fas A)* / `/api/v1/public/booking-engine/availability` *(Fas B)*

Hämta lediga tider.

**Query:**
- `host` (required)
- `fromDate` (required, ISO date `YYYY-MM-DD`)
- `toDate` (required, ISO date)
- `resIds` (CSV, t.ex. `egzona,fazli`) — Fas A kräver det, Fas B gör det optionellt
- `srvIds` (CSV) — samma som ovan

**Response:**
```json
{
  "provider": "cliento" | "cco_engine",
  "slots": [
    {
      "slotId": "egzona-2026-05-20T10:30:00",
      "start": "2026-05-20T10:30:00+02:00",
      "end": "2026-05-20T11:00:00+02:00",
      "serviceId": "consultation",
      "resourceId": "egzona"
    }
  ]
}
```

### 3.3 POST `/api/v1/public/booking-engine/reservations` *(Fas C — INTE byggd än)*

Auto-skapar CCO-thread och reserverar slot åt en patient via webben.

**Body:**
```json
{
  "host": "hairtpclinic.com",
  "contact": {
    "name": "...",
    "email": "...",
    "phone": "+46..."
  },
  "slot": { "slotId": "...", "start": "...", "end": "...", "serviceId": "...", "resourceId": "..." },
  "notes": "valfritt",
  "consent": { "gdpr": true, "marketing": false }
}
```

**Response:**
```json
{
  "provider": "cco_engine",
  "reservation": {
    "reservationId": "...",
    "expiresAt": "2026-05-20T10:45:00+02:00",
    "slot": { ... }
  },
  "caseId": "...",
  "operatorWillContact": true,
  "operatorEtaMinutes": 60
}
```

**Implementations-noter (för Fas C):**
- Auto-skapa `conversationId` = hash(email + timestamp), spara i `ccoBookingStore` med status `needs_triage`
- Sätt en CCO-task för operatören med risk-classification (A/B/C lead baserat på complete-ness)
- Skicka `confirmation` via Resend (template "Vi har reserverat din tid — operatör hör av sig inom X")

**Säkerhet:**
- Rate-limit: max 5 reservations per IP per timme (befintlig `multiLayerRateLimit.js` kan användas)
- Origin-check: `Origin` måste matcha en allow-list (`hairtpclinic.com`, `www.hairtpclinic.com`)
- GDPR: `consent.gdpr === true` är hård validering
- Honeypot-fält (`website` / `company_url` måste vara tomma) — **live i Arcana**
- Cloudflare Turnstile — aktiveras när `TURNSTILE_SECRET` sätts på Render (valfritt tills keys finns)

### 3.4 POST `/api/public/web-events` *(Pass 4 — live)*

Audit-ingest för icke-bokningshändelser från webben (form utan slot, analyzer, chat-intent, exit-intent, pdf-guide).

**Body (minimum):**
```json
{
  "host": "hairtpclinic.com",
  "eventType": "form_submit",
  "contact": { "email": "...", "name": "..." },
  "page": "/kontakt",
  "submittedAt": "2026-05-20T12:00:00.000Z",
  "metadata": { "service": "konsultation" }
}
```

**Response:**
```json
{
  "ok": true,
  "eventType": "form_submit",
  "runId": "<execution-gateway-run-id>",
  "decision": "allow",
  "correlationId": "...",
  "auditCount": 2
}
```

Alla events går via `ExecutionGateway.run()` och persisteras i `web-bridge-audit.json` (audit trail + event log).

**Publik katalog (E4):** `/catalog` och `/availability` returnerar endast Plan A-resurser (`fazli`, `egzona`, `arya`). Sjuksköterskor finns kvar i engine för intern/PRP-expansion men `publicBookable: false`.

---

## 4. Webb-side klient (`lib/arcana-client.ts`)

4.1. Bor i `next-app/lib/arcana-client.ts` — bara server-side imports (Route Handlers, RSC).

4.2. Env-vars som styr beteendet:
- `ARCANA_BASE_URL=https://arcana.hairtpclinic.se` — utan trailing slash
- `ARCANA_PROVIDER=cliento` | `booking-engine` — växel Fas A → Fas B
- `ARCANA_BRAND_HOST=hairtpclinic.com` — skickas som `?host=` till alla anrop
- `ARCANA_API_TOKEN=<bearer>` — för Fas C när reservations-endpoint kräver auth

4.3. Fallback-beteende: om någon env-var saknas eller om fetch failar → returnera mock-data och logga `console.warn`. Webben kraschar aldrig pga Arcana-incident.

4.4. Timeouts: 8s default på catalog/availability, 3s på healthcheck.

4.5. Caching: `cache: 'no-store'` på alla anrop. Slot-data ändras på sekund-basis när operatörer reserverar.

---

## 5. Failover-strategi

5.1. **Arcana nere:**
- `getCatalog` → mock services + resources
- `getAvailability` → mock-slots (alla vardagar 09:00/11:00/14:00/16:00)
- UI:t visar bara "Boka kostnadsfri konsultation — vi ringer dig" istället för slot-picker

5.2. **Webben nere (vad Arcana-sidan måste tolerera):**
- Inga Arcana-anrop kommer in → CCO fortsätter helt opåverkad
- Operatörer ser inga "web-lead"-events i CCO-inbox under nedtiden — det är okej

5.3. **Race-conditions vid Fas C:**
- Två patienter försöker boka samma slot samtidigt
- `bookingEngineStore.reserveSlots` har redan idempotency via slotId — andra anropet får `409 slot_unavailable`
- Webben visar då: "Tyvärr togs den tiden just innan dig. Här är de tre närmaste alternativen:"

5.4. **Mock vs live diskrepans:**
- När `mocked: true` returneras till UI, visa banner "Demo-läge — vi ringer dig för att bekräfta tid" så vi inte luras patienten att tro mock-tiden är garanterad

---

## 6. Implementations-ordning (rekommenderad)

### Pass 1 — Webben kan visa availability (Fas A)
1.1. Bygg `lib/arcana-client.ts` med Cliento-provider och mock-fallback. **✓ klart 2026-05-18.**
1.2. Sätt `ARCANA_BASE_URL` + `ARCANA_BRAND_HOST` i Vercel (production + preview).
1.3. Lägg till "Välj tid"-step i `/boka` (efter "Foton") som fetchar `/api/v1/public/cliento/slots`.
1.4. Submitta vald slot via `/api/lead` med extra `arcana`-objekt så operatören ser tiden i CCO direkt.
1.5. Locale-paritet — samma flöde på `/en/book`.

### Pass 2 — CCO-egen motor exponeras publikt (Fas B)
2.1. Bygg `src/routes/publicBookingEngine.js` som speglar publicClinic.js men hämtar från `ccoBookingEngineStore`.
2.2. Endpoints: `GET /public/booking-engine/catalog`, `GET /public/booking-engine/availability`.
2.3. Brand-resolution från host, samma som publicClinic.
2.4. Validera mot live ccoBookingEngine-data (resources + services måste konfigureras i Arcana).
2.5. Byt webbens `ARCANA_PROVIDER=booking-engine`. Verifiera /boka fungerar identiskt.

### Pass 3 — Public reservations-endpoint (Fas C)
3.1. Bygg `POST /public/booking-engine/reservations` med rate-limit + origin-check + GDPR-validering.
3.2. Auto-skapa CCO-thread vid reservation. Spara i `ccoBookingStore` med status `needs_triage`.
3.3. Skicka Resend-bekräftelse till patient.
3.4. Webbens `/api/lead` POSTar parallellt till denna endpoint + email-fallback för backup.

### Pass 4 — Audit-trail till Arcana
4.1. ExecutionGateway tar emot alla webb-events (form-submit, AI-analys, exit-intent) för audit. **✓ klart 2026-05-20** — `POST /api/public/web-events`.
4.2. CCO-operatör ser hela patient-journey från första klick till bokning.

---

## 7. Definition of Done

7.1. **Fas A klar när:** patient kan boka konsultation på `/boka` och välja en faktisk Cliento-tid, vald slot loggas i `/api/lead`, operatör ser den i CCO och kan slutföra reservationen manuellt.

7.2. **Fas B klar när:** `ARCANA_PROVIDER=booking-engine` ger samma UX på /boka, men inga Cliento-anrop görs. Cliento-credentials kan tas bort från Arcana env.

7.3. **Fas C klar när:** patient som väljer slot på /boka får en hold i CCO inom 5 sek + Resend-bekräftelse, och operatören ser den som `needs_triage`-case i CCO-inbox.

---

## 8. Risker att hantera

8.1. **Operatör tror att webben gör reservation själv** — UI-text måste vara tydlig: "Vi reserverar din tid och hör av oss inom 1h för att bekräfta". Aldrig "Din bokning är genomförd" i Fas A/B.

8.2. **Cliento + booking-engine returnerar olika slot-IDs samtidigt** — switch-perioden mellan Fas A→B måste vara hård (flagga om, deploy, verifiera). Inga "fallback från B till A om B failar" — då kan vi få dubbel-bokningar.

8.3. **Webb-leads med vald slot men ingen reservation** — operatör måste prioritera dessa över vanliga email-leads. Lösning i Fas C när reservation skapas automatiskt.

8.4. **GDPR — patientens email finns nu i två system** — webb-formulär lagrar email i `/api/lead`-logg, Arcana lagrar i CCO-thread. Båda måste ha samma retention-policy + möjlighet att radera vid begäran.

---

## 9. Snabb-uppslag

- Webb-klient: `next-app/lib/arcana-client.ts`
- Web-route som callar: `next-app/app/api/lead/route.ts` (idag), `next-app/app/api/availability/route.ts` (Fas A att bygga)
- Arcana publika endpoints: `major-arcana/src/routes/publicClinic.js` (idag), `major-arcana/src/routes/publicBookingEngine.js` (Fas B att bygga)
- Booking-engine internt: `major-arcana/src/routes/ccoBookingEngine.js` (656 rader), `major-arcana/src/ops/ccoBookingEngineStore.js` (830 rader)
- Status: `docs/ops/status-web-2026-05-19.md` (denna sprint), `docs/strategy/cco-booking-prod-readiness-checklist.md` (operator-flöde)
