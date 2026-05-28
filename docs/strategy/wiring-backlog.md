---
owner: CCO
status: active
---

# Wiring-backlog — scaffolds som väntar på att kopplas in

Filer som finns i repot men **inte är wirade in** i `server.js` eller anropas
från övriga app:en. Tester kör isolerat. Varje rad är en konkret kandidat
till nästa svep — när den är wired ska raden flyttas till `MASTER-TODO.md`
som ☑.

**Skapad:** 2026-05-26 efter avbrutet svep (svepet körde i bakgrund och
producerade följande filer, men hann inte koppla in dem innan main-commit).

---

## Kö 1 — P6.10.7 Kommersiella mail (scaffold ☑)

| Fil | Status |
|-----|--------|
| `src/templates/bookingConfirmationEmail.js` | scaffold ☑ — använder `emailLayout`, ICS-bilaga |
| `src/templates/offerEmail.js` | scaffold ☑ |
| `src/templates/treatmentPlanEmail.js` | scaffold ☑ |
| `src/ops/ccoCommercialMailDispatch.js` | dispatchers ☑ — `dispatchOfferEmail`, `dispatchTreatmentPlanEmail`, `dispatchBookingConfirmationEmail`, idempotensskydd via `patientCareStateStore.wasReminderSent` |
| `tests/templates/*.test.js` × 3 | testtäckning ☑ |
| `tests/ops/ccoCommercialMailDispatch.test.js` | dispatch-test ☑ |

### Wiring som krävs
1. **Bokningsbekräftelse** — hooka `dispatchBookingConfirmationEmail` i
   `ccoBookingEngineStore.confirmBooking` eller i `routes/ccoBookingEngine.js`
   confirm-routen. Mönster: identiskt med `dispatchBookingCancellationEmail`
   som redan triggas vid cancel.
2. **Offert** — hooka `dispatchOfferEmail` när offert skickas
   (sök `ccoOfferEsign.js`, `ccoCommercialStore.js`). Lägg till audit
   `offer_email_dispatched`.
3. **Behandlingsplan** — hooka `dispatchTreatmentPlanEmail` när behandlings­plan
   delas med patient. Sök trigger i `ccoConsultationStore.js` / patient-hub.

### Acceptanskriterier
- [ ] Confirm-flow skickar bekräftelse (Resend → Graph fallback) med ICS
- [ ] Offert-skicka triggar `dispatchOfferEmail`, idempotent
- [ ] Behandlingsplan-utskick triggar `dispatchTreatmentPlanEmail`, idempotent
- [ ] MASTER-TODO P6.10.7 ☑

---

## Kö 2 — Curatiio Fas 1 brand-separation ☑ (wired)

| Fil | Status |
|-----|--------|
| `migration/curatiio-services-seed.json` | seed ☑ — 5 tjänster (Botox, Fillers, Profhilo, Ögonlocksplastik, Microneedling) |
| `src/ops/curatiioCatalogRuntime.js` | runtime ☑ — slår ihop seed in i engine-state |
| `src/ops/ccoBookingEngineStore.js` | wiring ☑ — `mergeCuratiioCatalogIntoEngineState` kallas i init, `brand`-filter i `listAvailability` |
| `src/routes/publicBookingEngine.js` | wiring ☑ — skickar `brand` till engine i catalog/availability |
| `tests/ops/ccoBookingEngineStore.curatiio.test.js` | brand-isolation-test ☑ |

### Återstår
- [ ] Verifiera att MASTER-TODO P6.2.9 markeras [~] (Fas 1 ☑, Fas 2/3 kvar)
- [ ] Fas 2: curatiio.se widget (separat svep)
- [ ] Fas 3: publik go-live

---

## Kö 3 — P6.14.3 Drive close (scaffold ☑)

| Fil | Status |
|-----|--------|
| `scripts/audit-missing-drive-file-ids.js` | script ☑ — listar patienter utan `driveFileId` |
| `scripts/backfill-drive-file-ids.js` | script ☑ — försöker matcha mot Drive |
| `tests/scripts/auditMissingDriveFileIds.test.js` | smoke-test ☑ |

### Wiring som krävs
1. **npm-scripts** — lägg till i `package.json`:
   - `audit:drive-files` → kör audit-scriptet
   - `backfill:drive-files` → kör backfill (med torrkörning som default)
2. **Kör mot prod** — `audit:drive-files` mot prod-state, generera rapport.
3. **MASTER-TODO** — P6.14.3 från [~] (570 kvar) → uppdatera siffran efter
   körning. Om manuellt arbete krävs för rest: dokumentera blocker.

### Acceptanskriterier
- [ ] npm-scripts mountade
- [ ] Audit körd mot prod, rapport sparad i `artifacts/`
- [ ] Backfill kört (torrkörning), antal löst-via-backfill rapporterat
- [ ] MASTER-TODO P6.14.3 uppdaterad

---

## Process

1. Plocka **en kö åt gången** (Kö 1, 2 eller 3).
2. Wira in enligt "Wiring som krävs".
3. Bocka alla acceptanskriterier.
4. `npm run check:syntax && npm run lint:no-bypass && npm run test:unit`.
5. Commit + push, uppdatera MASTER-TODO, ta bort kön från denna fil.

När alla tre köer är klara — radera filen.
