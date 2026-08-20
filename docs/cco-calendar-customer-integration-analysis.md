# CCO Kalender–Kund–Konversationer: helhetsanalys

**Datum:** 2026-08-19 (uppdaterad 2026-08-20 med prod-torrkörning)  
**Repo:** `/home/fazli/cco/major-arcana`  
**Syfte:** Kartlägga hela CCO-kalendersegmentet — vad som finns, vad som saknas, och hur kunder, bokningar, historik och anteckningar är (eller inte är) kopplade samman över Kalender, Kunder, Konversationer, Automatisering och Analys.

---

## 1. Sammanfattning

CCO har ett **funktionellt men fragmenterat** kalender-/kundsegment. Backenden innehåller de flesta byggstenarna: bokningsmotor, kalendervyer, kunddossié, enhetlig tidslinje, journal, automationsregler och analys. Men kopplingarna mellan dessa block är ofullständiga eller bräckliga, och UI-ytan är uppdelad i flera separata skal istället för ett enhetligt gränssnitt.

**Det akutaste dataproblemet, verifierat på prod:** av **53 316 Cliento-bokningar** har **noll** ett sparat `patientId`. En torrkörning av samma matchningslogik som `src/ops/ccoKunderBookingEnrichment.js` visar att **42 051 bokningar (78,9 %) skulle kunna kopplas direkt** om vi sparade resultatet:

- **37 623** via `customerEmail`
- **3 826** via `clientoCustomerId`
- **0** via telefon (telefonmatchning överskuggas av e-post/clientoId i nuvarande resolver)

**11 265 bokningar (21,1 %) skulle förbli okopplade:**
- **9 377** saknar alla tre identiteterna (e-post, clientoId, telefon)
- **1 521** har identitet men matchar ingen känd patient
- **367** matchar flera patienter (tvetydig identitet)

Kopplingen beräknas idag vid varje läsning och kastas bort. Det betyder att kalendervyer, bokningsärenden och filter som förväntar sig `patientId` arbetar med tomma värden eller heuristik.

**Den allvarligaste strukturella svagheten är att det finns två parallella kundidentiteter:**

- **`ccoPatientMasterStore`** — kanonisk patientregistret (UUID `patientId`), används av journal, dossier, tidslinje.
- **`ccoCustomerStore`** — kommunikations-/importkatalog (sträng-nycklar som e-post, `cliento_…`), används av import, portal, identitetsroutes.

Dessa två lager är inte explicit länkade. Det gör att samma människa kan finnas i olika delar av systemet med olika ID:n, och att funktioner som "alla kundens bokningar" eller "alla kundens konversationer" riskerar att missa data.

---

## 2. Vad som finns — kategori för kategori

### 2.1 Kalender

| Komponent | Status | Nyckelfiler |
|-----------|--------|-------------|
| Dag-/veckovy | ✅ Finns | `src/routes/calendar.js`, `src/ops/clinicCalendarView.js` |
| iCal-export per resurs | ✅ Finns | `src/routes/calendar.js`, `src/ops/icalExport.js` |
| Kalenderblock | ✅ Finns | `src/ops/ccoBookingEngineStore.js` |
| Skriva i kalendern | ❌ Saknas | Kalendern är read-only; bokning/block sker via separata endpoints |
| Resurs-/schemaläggning | ✅ Delvis | Tjänster, resurser, tillgänglighetsregler finns, men ingen rik personaladministration |

Kalendern är en **read model** som slår samman:
- `ccoBookingEngineStore` (egna bokningar + aktiva reservationer)
- `clientoBookingStore` (importerade legacy-bokningar)
- `mailboxTruthStore` (best-effort konversationstillhörighet)

Dubblettborttagningen är heuristisk (`patientEmail + startMs + service + resource`), vilket är en svag punkt.

**Kalender-UI:t idag (`public/kalender.html` + `cco-kalender-shell.js`)** är read-only (`CCO_CALENDAR_READ_ONLY = true`). Det visar vecko-/dagvy och vid klick på en bokning visas status, resurs, vårdgivare, fyra anteckningstyper och en länk till kundkort — men bara i embed-läge via `postMessage`. Följande är avstängt eller saknas:
- Omboka, no-show, checkin, uppföljning — knappar renderas `disabled`.
- Besökshistorik, ekonomi, filer, konversationstråd, personnummer — visas inte.
- Flera endpoints anropas men finns inte: `/api/v1/calendar/services`, `/cco-bookings/:id/checkin`, `/cco-bookings/:id/no-show`, `/cco-bookings/:id/follow-up`, `/calendar/booking/:id/status-pills`, `/calendar/booking/:id/intelligence`.

**Tre kalendergenerationer ligger i repot**, vilket skapar förvirring om vilken som är sanning:
- `cco-kalender-shell.js` (v6) — den som körs, read-only.
- `cco-calendar-v8-shell.js` — ser modern ut men innehåller **hårdkodad mockdata** (`${namn}@email.se · 070-XXX XX XX`) och laddas inte av någon levererad sida.
- `booking-desktop-week.js` i preview-SPA:t — har fungerande drag-and-drop-ombokning, riktig kunddossié via `patientId`, resurs- och behandlingsfilter samt sex åtgärder (ärende, studio, anteckning, kund, journal, boka). Detta är den mest funktionella kalendern, men den ligger utanför den aktiva produktionsytan.

### 2.2 Bokning

| Komponent | Status | Nyckelfiler |
|-----------|--------|-------------|
| Intern bokningsmotor | ✅ Finns | `src/routes/ccoBookingEngine.js`, `src/ops/ccoBookingEngineStore.js` |
| Publik webbbokning | ✅ Finns | `src/routes/publicBookingEngine.js` |
| Reservation → bekräftelse | ✅ Finns | `ccoBookingEngineStore.reserveSlots()` / `confirmBooking()` |
| Avboka / omboka | ✅ Finns | `cancelBooking()`, `rebookBooking()` |
| Legacy-bokningsrouter | ⚠️ Deprecated | `src/routes/ccoBookings.js`, `src/ops/ccoBookingStore.js` |
| Nya booking cases (state machine) | ✅ Finns | `src/ops/ccoBookingCaseStore.js`, monterade i `server.js:221-388` |
| Cliento-import | ✅ Finns | `src/ops/clientoBookingStore.js`, `src/routes/opsClientoBookingsImport.js` |
| Bokningsbekräftelsemail | ✅ Finns | `src/ops/bookingConfirmationDispatch.js` |
| Påminnelsemail | ✅ Finns | `src/ops/bookingReminderScheduler.js`, `src/ops/ccoPatientCareOps.js` |
| SMS-påminnelser | ⚠️ Halvklar | Kod finns men är märkt som valfri/robust |
| Behandlingsavtalsgrind | ✅ Finns | `src/ops/ccoTreatmentBookingGate.js` |

**Viktig observation:** Det finns **tre överlappande bokningsmodeller**:
1. Legacy `ccoBookingStore` (deprecated men omfattande)
2. Ny `ccoBookingCaseStore` (state machine)
3. `ccoBookingEngineStore` (slots/reservationer/bokningar)

Det skapar förvirring om var sanningen finns.

**Produktionsdata (2026-08-19), torrkörning verifierad på prod:**
- `clientoBookingStore`: **53 316** bokningar, varav **0** med sparat `patientId`.
  - Uppslagsbar till patient: **42 051 (78,9 %)** — 37 623 via e-post, 3 826 via `clientoCustomerId`.
  - Ej uppslagsbar: **11 265 (21,1 %)** — 9 377 saknar identitet, 1 521 matchar ingen patient, 367 är tvetydiga.
- `ccoBookingEngineStore`: **12** bokningar, varav **2** med `canonicalPatientId`.
  - Av de 10 utan: **3** skulle kunna matchas med samma logik.
  - Täckning efter migrering: **5/12 (41,7 %)**.
- Reservationer i egna motorn: **0**.
- `cco-booking-cases.json`: **346** ärenden.

**Fältnamn för kund-ID varierar mellan lagren:**

| Lager | Fält |
|-------|------|
| `clientoBookingStore` | `patientId` + `clientoCustomerId` |
| `ccoBookingEngineStore` | `canonicalPatientId` |
| `ccoBookingStore` (legacy) | inget — bara `customerEmail` |
| `ccoBookingCaseStore` | `patientId` och `customerId` |
| `clinicCalendarView` | inget `patientId` alls (bara namn/e-post/telefon) |

Konsekvens: `src/routes/ccoBookings.js:1166-1169` filtrerar på `bookingCase?.patientId`, men legacy-ärenden har inget sådant fält — filtret nollar därför listan när `?patientId` anges. Samma mönster återfinns i `bookingCalendarSignals.js:164`.

### 2.3 Kunder / patienter

| Komponent | Status | Nyckelfiler |
|-----------|--------|-------------|
| Patientregister (kanoniskt) | ✅ Finns | `src/ops/ccoPatientMasterStore.js` |
| Kundkatalog / import | ✅ Finns | `src/ops/ccoCustomerStore.js` |
| Kunddossié | ✅ Finns | `src/ops/ccoCustomerDossier.js`, `src/routes/ccoCustomerDossier.js` |
| Enhetlig tidslinje | ✅ Finns | `src/ops/ccoUnifiedTimelineBuilder.js` |
| Kundresan (journey) | ✅ Finns | `src/ops/ccoCustomerJourneyStore.js` |
| Dubblett-/merge-hantering | ✅ Delvis | Finns i båda lagren, men de är inte synkroniserade |
| Portal-meddelanden | ✅ Finns | `src/ops/ccoPortalMessageStore.js` |

**Kunddossién aggregerar:** identitet, kontakt, resa, bokningar/cases, trådar, journalmetadata, portalmeddelanden, fotount.

**Den visar medvetet inte journalinnehåll** — bara antal/senast. Det är ett designval, men det betyder att "all info om kunden" inte är all info.

### 2.4 Konversationer

| Komponent | Status | Nyckelfiler |
|-----------|--------|-------------|
| Mailtrådvy | ✅ Finns | `public/konversationer.html`, `src/routes/ccoConversation.js` |
| Tråd → patientlänk | ✅ Finns | `src/ops/ccoConversationPatientResolver.js` |
| Konversationstillstånd | ✅ Finns | `src/ops/ccoConversationStateStore.js` |
| Interna trådanteckningar | ✅ Finns | `src/ops/ccoConversationNotesStore.js` |
| Tråd → bokningsförslag | ✅ Finns | `src/routes/ccoConversation.js` `/bookings` |
| Bokningshändelser i tråd | ✅ Finns | `src/ops/ccoBookingConversationEvent.js` |

### 2.5 Anteckningar / journal

| Komponent | Status | Nyckelfiler |
|-----------|--------|-------------|
| Journalposter | ✅ Finns | `src/ops/ccoJournalStore.js`, `src/routes/ccoJournal.js` |
| Journalfoton | ✅ Finns | `src/ops/ccoJournalPhotoStore.js` |
| Smart anteckning | ✅ Finns | `public/major-arcana-preview/cco-smart-anteckning-v3.html` |
| Workspace-anteckningar | ✅ Finns | `src/ops/ccoNoteStore.js`, `src/routes/ccoWorkspace.js` |
| Bokning → journal | ✅ Finns | `src/ops/ccoJournalBookingBridge.js` skapar `treatmentEncounter` |
| Anteckningar i kunddossié | ⚠️ Begränsat | Endast metadata; anteckningsnycklarna är dessutom inkonsekventa |

### 2.6 Automatisering

| Komponent | Status | Nyckelfiler |
|-----------|--------|-------------|
| Automationsregler (15 signaler) | ✅ Finns | `src/ops/ccoAutomationRegistry.js` |
| Signal-evaluering | ✅ Finns | `src/ops/ccoAutomationRunner.js` |
| Automation API | ❌ **Inte monterat** | `src/routes/ccoAutomationRoutes.js` finns men är aldrig wired i `server.js` |
| Schemalagda vårdjobb | ✅ Finns | `src/ops/ccoPatientCareOps.js`, `src/ops/scheduler.js` |
| Påminnelser | ✅ Finns | `src/ops/bookingReminderScheduler.js` |
| Eftervårds-trigger | ✅ Delvis | `src/ops/postOpAutoTrigger.js` kräver manuell statusmarkering |
| Portal-nudge | ⚠️ Staff-trigger | `src/ops/ccoPortalNudge.js`, route finns men ingen automatisk hook |

**Största gap:** Automation-API:et är byggt men **inte igång**. Alla signaler är dessutom `dryRun: true`.

### 2.7 Analys

| Komponent | Status | Nyckelfiler |
|-----------|--------|-------------|
| CCO dashboard / worklist snapshots | ✅ Finns | `src/ops/ccoStaffDashboardSnapshot.js` |
| Klinikprestanda / funnel | ✅ Delvis | `src/ops/clinicPerformance.js`, `src/ops/clinicConversionFunnel.js` |
| Användningsanalys | ✅ Finns | `src/intelligence/usageAnalyticsEngine.js` |
| Finansdashboard | ✅ Delvis | `src/cfo/cfoFinanceDashboardBuilder.js` (Fortnox blockerad, fallback) |
| QA-dashboard | ✅ Finns | `src/ops/qaDashboard.js` |
| Portal-metrics | ✅ Finns | `src/routes/ccoPortalMetrics.js` |
| CEO/owner dashboard | ✅ Finns | `src/routes/dashboard.js`, `src/routes/monitor.js` |

Flera KPI:er är ärligt markerade som `notLiveYet` eller proxyvärden.

### 2.8 Den saknade patientId-nyckeln — det operativa kärnproblemet

`src/ops/ccoKunderBookingEnrichment.js` (`resolvePatientIdFromClientoBooking`, rad 233–249) beräknar `patientId` vid varje läsning genom att slå upp:

1. explicit `patientId` — finns aldrig på befintliga bokningar
2. `customerEmail` — finns på 72,9 % av bokningarna; ger 37 623 unika matchningar
3. `clientoCustomerId` — finns på 82,4 %; ger 3 826 ytterligare matchningar
4. `customerPhone` — finns på 82,0 %; ger i praktiken 0 matchningar eftersom resolvern prioriterar e-post/clientoId

Resultatet byggs i `buildPatientLookupMaps` (rad 178–227) och kastas bort efter anropet. Nästa läsning gör om hela arbetet. Det innebär att:

- Kalendervyer kan visa namn och e-post, men bär inget `patientId` att länka med.
- Bokningsärenden filtreras på ett fält som inte finns.
- Varje kalenderladdning gör en full uppslagsberäkning över 53 000+ bokningar.

Torrkörningen visar att migreringen är **högt täckande men inte komplett**: 78,9 % av legacy-bokningarna skulle få ett patientId, resterande 21,1 % kräver manuell granskning eller komplettering av identitet.

Endast `POST /cco-booking-engine/create/confirm` tvingar fram en riktig patientmatchning innan bokning skapas (`canonical_patient`-gate, `src/routes/ccoBookingEngine.js:816-825`). Övriga flöden — reservera, bekräfta, omboka, avboka — kräver bara e-post och gör best-effort-uppslag efteråt.

### 2.9 Verifierad torrkörning av patientId-migrering

Skriptet `scripts/dry-run-patientid-on-bookings.js` körde 2026-08-20 mot prod-data på Render (`/var/data`) och skrev ingenting.

**Cliento-bokningar (53 316):**

| Utfall | Antal | Andel |
|--------|------:|------:|
| Kopplade totalt | 42 051 | 78,9 % |
| — via e-post | 37 623 | 70,6 % |
| — via clientoCustomerId | 3 826 | 7,2 % |
| — via telefon | 0 | 0 % |
| — explicit patientId | 0 | 0 % |
| Okopplade totalt | 11 265 | 21,1 % |
| — saknar identitet | 9 377 | 17,6 % |
| — matchar ingen patient | 1 521 | 2,9 % |
| — tvetydig identitet | 367 | 0,7 % |

**Engine-bokningar (12):**

| Utfall | Antal |
|--------|------:|
| Har redan canonicalPatientId | 2 |
| Saknar canonicalPatientId men uppslagsbar | 3 |
| Saknar canonicalPatientId och ej uppslagsbar | 7 |
| Täckning efter migrering | 5/12 (41,7 %) |

**Slutsats:** migreringen är värd att göra för Cliento-delen — den ger en stor och omedelbar förbättring. Den egna bokningsmotorn har för få bokningar för att dra några generella slutsatser; de 7 av 12 som inte går att matcha behöver manuell granskning.

---

## 3. Hur är det kopplat? — integrationskarta

### 3.1 Vad som är väl kopplat

| Flöde | Koppling | Kommentar |
|-------|----------|-----------|
| Bokning bekräftad → journal | `ccoJournalBookingBridge.js` | Skapar/uppdaterar `treatmentEncounter` |
| Bokningshändelse → konversation | `ccoBookingConversationEvent.js` | Uppdaterar trådens `nextActionLabel` |
| Patient 360 ← bokning/vårdärende | `src/ops/ccoPatient360Bridge.js` | Synkar till patientregistret |
| Konversation → patient | `ccoConversationPatientResolver.js` | E-post → patient.id |
| Trådar → tidslinje | `ccoUnifiedTimelineBuilder.js` | Mail, portalmeddelanden, resor, journalmetadata |
| Kunddossié ← trådar/bokningar | `ccoCustomerDossier.js` | Aggregerar från flera stores |

### 3.2 Vad som är svagt eller trasigt kopplat

| Flöde | Problem | Konsekvens |
|-------|---------|------------|
| **Kund-ID över lager** | `ccoCustomerStore` och `ccoPatientMasterStore` är oberoende | Samma person kan ha olika ID:n i import, portal, journal och dossier |
| **Bokning → patient** | Legacy `ccoBookingStore` använder `customerEmail`, inte `patientId` | Dossié missar bokningar om e-post inte matchar exakt |
| **Bokningsmotor → dossier** | `ccoBookingEngineStore` är inte inkopplad i `ccoCustomerDossier.js` | Nya bokningar syns inte i kundkortet (endast legacy/cliento) |
| **Anteckningar** | Tre olika nycklar: `conversationKey`, `customer:${customerId}`, rå `customerId` | Kund- och trådanteckningar kan hamna i olika hinkar |
| **Merge-propagation** | Patient-merge arkiverar secondaries men propagerar inte till `ccoCustomerStore`, journal, konversationstillstånd | Data kan fortsätta ligga under gamla ID:n |
| **Betalningar** | Finans-/betalningsdata finns men är inte kopplad till dossier eller tidslinje | Ekonomisk kundhistorik syns inte i kundkortet |
| **Behandlingsärenden** | `ccoTreatmentEncounterStore` finns men visas inte i dossiern | Genomförda behandlingar syns inte i kundkortet |

---

## 4. De stora gapen

### 4.1 Identitet och kund-ID (kritisk)

Det finns ingen tillförlitlig bro mellan kommunikationslagret (`ccoCustomerStore`) och det medicinska lagret (`ccoPatientMasterStore`). För att "alla kunder ska finnas där med kopplad kund-ID" behövs en av:

- Ett enda kanoniskt kund-ID som alla moduler använder, eller
- En explicit, underhållen mapping-tabell mellan `customerKey` och `patientId`.

Idag är det e-post och heuristisk matchning som gäller.

### 4.2 Bokningsmotor i kundkortet (kritisk)

`ccoBookingEngineStore` är sanningen för nya bokningar, men `ccoCustomerDossier.js` läser bara legacy `ccoBookingStore` och `clientoBookingStore`. Det betyder att kundens aktuella bokningar inte nödvändigtvis syns i kunddossién.

### 4.3 Automation är inte igång (kritisk)

- `src/routes/ccoAutomationRoutes.js` är exporterad men aldrig monterad i `server.js`.
- Alla signaler är `dryRun: true`.
- Det finns ingen central "action executor" som omvandlar signaler till faktiska åtgärder.

Det mesta av automatiseringen är alltså teori just nu.

### 4.4 Enhetligt UI-skal (kritisk)

- Produktion använder fortfarande `major-arcana-preview`-skalet som iframe.
- `public/konversationer.html` är tänkt som baslinje enligt integrationsplanen, men är inte monterad som huvudskal.
- Kunder, Kalender och Konversationer är separata sidor/modaler, inte segment i ett skal.

### 4.5 Behandlingshistorik och betalningar i kundkortet (hög)

- Genomförda behandlingar (`ccoTreatmentEncounterStore`) visas inte.
- Betalningar/fakturor visas inte.
- Journalinnehåll är medvetet exkluderat.

### 4.6 Kalender är read-only (medium)

Operatörer kan inte dra, ändra eller skapa bokningar direkt i kalendern. All skrivning sker via bokningsmotorns separata endpoints.

### 4.7 Dubletter i kalendervyn (medium)

`clinicCalendarView.js` försöker ta bort dubbletter med heuristisk matchning. Om samma bokning har olika e-post eller resurs/service-varianter kan den visas flera gånger.

---

## 5. Risker och beroenden

| Risk | Påverkan |
|------|----------|
| Två parallella kundidentiteter | Felaktig 360-vy, missade bokningar/konversationer, duplicerade kundkort |
| Automation ej monterad | Påminnelser, uppföljningar och health-declaration-jakt kräver manuellt arbete |
| Legacy-bokningsrouter lever kvar | Teknisk skuld; risk att teamet bygger på fel modell |
| UI-skal ej enat | Dålig användarupplevelse, dubbel navigering, svårt att underhålla |
| Cliento vs booking-engine-konflikt i docs | Operativ osäkerhet om vilken datakälla som är sann |
| Demo-/sampledata i `konversationer.html` | Kan läcka till produktion eller ge felaktig upplevelse |

---

## 6. Prioriterade rekommendationer

### P0 — måste göras för att uppfylla "alla kunder med kopplad kund-ID"

1. **Migrera `patientId` till alla 53 316 befintliga bokningar.** Kör samma matchning som `ccoKunderBookingEnrichment.js` redan gör, men spara resultatet på bokningsposterna. Torrkörning visar 78,9 % täckning (42 051/53 316). De återstående 11 265 behöver antingen kompletterande identitet eller en granskingskö (`needs_review_for_patient_link`).
2. **Etablera ett kanoniskt fältnamn.** Använd `patientId` överallt. `canonicalPatientId` och avsaknaden i legacy-ärenden är teknisk skuld som redan orsakar tysta fel.
3. **Exponera `patientId` i kalendervyerna.** `clinicCalendarView.js` måste bära `patientId` så att `/calendar/day` och `/calendar/week` kan länka till kundkort.
4. **Etablera ett kanoniskt kund-ID över lager.** Alla moduler som refererar till en människa ska använda `patientId` från `ccoPatientMasterStore`. `ccoCustomerStore` kan fortsätta vara kommunikationskatalog, men den ska hålla en `patientId`-referens.
5. **Koppla `ccoBookingEngineStore` till kunddossién.** Dossién ska läsa nya bokningar, inte bara legacy/cliento.
6. **Montera automation-API:et och ta det ur dry-run.** Börja med de säkraste signalerna (t.ex. "missing health declaration" → skapa journalutkast).
7. **Bestäm vilken kalender som gäller.** Tre generationer finns; den som körs är read-only, den som har flest funktioner ligger i preview-SPA:t, och v8 är mockdata.

### P1 — viktigt för användbarhet

4. **Enhetligt CCO-skal.** Byt från `major-arcana-preview`-iframes till `public/konversationer.html` som baslinje, och montera Kunder/Kalender/Bokning som segment.
5. **Släck legacy-bokningsroutern.** Flytta över återstående diagnostiska endpoints eller rensa dem.
6. **Behandlingshistorik och betalningar i kundkortet.** Koppla `ccoTreatmentEncounterStore` och finansdata till dossier/tidslinje (med rätt PII-grindar).
7. **Gör kalendern skrivbar.** Tillåt operatörer att skapa/ändra bokningar och block direkt i kalendern.

### P2 — förfining

8. **Enhetlig anteckningsnyckel.** Bestäm om anteckningar är kundnivå, trådnivå eller båda, och använd samma nyckel överallt.
9. **Förbättra dubblettlogiken i kalendervyn.** Använd `bookingId`/reservationId i stället för heuristik.
10. **Dokumentera datakällor tydligt.** Lös motsägelsen mellan Cliento-beroende readiness-checklist och booking-engine-first Plan A.

---

## 7. Öppna frågor jag inte kunde verifiera

- Vilken tenant/klinik är den avsedda piloten? Dokumenten nämner Hair TP, men vissa fallbacks pekar på `hairtpclinic`/`hair-tp-clinic`.
- Vilken bokningsmodell är beslutad som sanning framåt — `ccoBookingEngineStore`, `ccoBookingCaseStore`, eller båda i olika faser?
- Finns det en aktiv policy för hur journalinnehåll ska visas i kundkortet, eller ska det fortsätta vara separat av compliance-skäl?
- Vilka automations-signaler är godkända för skarpa åtgärder (t.ex. påminnelsemail) respektive måste vara förslag?

---

## 8. Filreferenser att börja i

| Ämne | Fil |
|------|-----|
| Kanonisk patientidentitet | `src/ops/ccoPatientMasterStore.js` |
| Kundkatalog / import | `src/ops/ccoCustomerStore.js` |
| Kunddossié | `src/ops/ccoCustomerDossier.js` |
| Enhetlig tidslinje | `src/ops/ccoUnifiedTimelineBuilder.js` |
| Bokningsmotor | `src/ops/ccoBookingEngineStore.js`, `src/routes/ccoBookingEngine.js` |
| Kalendervy | `src/ops/clinicCalendarView.js`, `src/routes/calendar.js` |
| Automation (ej monterad) | `src/routes/ccoAutomationRoutes.js`, `src/ops/ccoAutomationRegistry.js` |
| UI-skal | `public/konversationer.html`, `public/admin.js`, `docs/cco-unified-shell-integration-plan.md` |
| Dokumenterade mål/gap | `docs/strategy/cco-booking-mvp-spec.md`, `docs/strategy/cco-booking-plan-a-go-live.md`, `docs/strategy/cco-booking-prod-readiness-checklist.md` |

---

## 9. Jämförelse med andra agents analyser

Under arbetet har tre separata analyser producerats. Den här sammanställningen försöker fånga det bästa från alla.

### 9.1 Vad denna analys hittade som de andra missade

| Fynd | Varför det är viktigt |
|------|----------------------|
| **Två parallella kundidentiteter** (`ccoPatientMasterStore` vs `ccoCustomerStore`) | Strukturellt — det förklarar varför import, portal, journal och dossier kan se olika kunder. |
| **Automation-API:et är byggt men inte monterat** | `ccoAutomationRoutes.js` exporteras men finns inte i `server.js`. Ingen av de andra noterade att det är helt oåtkomligt. |
| **UI-skal är fragmenterat över hela CCO** — inte bara kalendern | `major-arcana-preview`-iframe används fortfarande som produktionsyta. |
| **Anteckningsnycklarna är inkonsekventa** (`conversationKey`, `customer:${customerId}`, rå `customerId`) | Förklarar varför anteckningar kan hamna i olika hinkar. |
| **Behandlingshistorik och betalningar saknas i kundkortet** | `ccoTreatmentEncounterStore` och finansdata är inte wired till dossier/tidslinje. |
| **Merge-propagation är ofullständig** | Patient-merge arkiverar secondaries utan att propagera till customer store, journal eller conversation state. |

### 9.2 Vad de andra analyserna hittade som denna missade

| Fynd | Källa | Varför det är viktigt |
|------|-------|----------------------|
| **53 316 Cliento-bokningar, 0 med sparat `patientId`** | Coworker (prod-mätning) | Det operativa kärnproblemet — utan detta blir alla "kundkopplingar" best-effort. |
| **Torrkörning: 42 051/53 316 (78,9 %) uppslagsbara till patientId** | Denna analys (prod-torrkörning 2026-08-20) | Ger det verkliga täckningsmåttet och fördelningen per identitetstyp. |
| **`ccoKunderBookingEnrichment.js` beräknar men sparar inte `patientId`** | Coworker | Förklarar varför kalendern är långsam och varför kopplingen försvinner. |
| **Fältnamn varierar kraftigt mellan lager** | Cloud code + Coworker | `canonicalPatientId`, `patientId`, `customerId`, `customerEmail`, inget alls — gör integration bräcklig. |
| **Kalendervyer exponerar inte `patientId`** | Coworker | `/calendar/day` och `/week` kan aldrig länka till kundkort. |
| **`ccoBookings.js` filtrerar på `bookingCase?.patientId` som alltid är `undefined`** | Coworker | Ett tyst fel som nollar listan vid `?patientId`-filter. |
| **Specifika saknade/borttagna endpoints** (`/calendar/services`, `/cco-bookings/:id/checkin`, `/no-show`, `/follow-up`, `/status-pills`, `/intelligence`) | Coworker | UI anropar routes som inte finns; klienten fallbackar till `missing`. |
| **`cco-calendar-v8-shell.js` är mockdata** | Coworker | Viktigt för beslutet om vilken kalender som gäller. |
| **`booking-desktop-week.js` i preview-SPA:t har fungerande ombokning och dossié** | Coworker | Den mest funktionella kalendern ligger utanför produktionsytan. |
| **Automation är helt frikopplad från bokningsmotorn** | Cloud code | Ingen no-show-/påminnelse-/ombokningslogik i automationregistret. |
| **Analys saknas för kalender** | Cloud code | Ingen aggregerad rapportyta för bokningar/patient över tid, no-show, beläggning. |

### 9.3 Gemensamma slutsatser

Alla tre analyserna är överens om:

- Kalendern är **read-only** och kan inte verkställas som operatörsyta utan skrivstöd.
- Det finns **flera överlappande bokningsmodeller** och det är oklart vilken som är sanning.
- **Kund-ID saknas eller är inkonsekvent** på bokningar, vilket blockerar en sammanhängande kundakt.
- **UI:t är uppdelat** i separata sidor/modaler istället för ett enhetligt skal.
- **Automation och analys** är inte kopplade till kalender/bokning på ett användbart sätt.

### 9.4 Rekommendation baserat på alla tre

Den snabbaste vägen till en verkställbar kalender är:

1. **Migrera och spara `patientId` på befintliga bokningar** — torrkörningen visar 78,9 % täckning på Cliento-delen och 41,7 % på engine-delen. Kör skarpt mot en backup, med granskingskö för de 21,1 % som inte går att matcha.
2. **Bestäm en kanonisk kalenderkomponent** — troligen `booking-desktop-week.js` i preview-SPA:t, men den måste flyttas in i huvudskalet.
3. **Exponera `patientId` i kalendervyerna** så att varje bokning kan länka till kundkort.
4. **Laga eller ta bort de saknade endpointsen** som UI:t redan anropar.
5. **Koppla bokningsmotor + kalender + automation** — t.ex. no-show-detektion och påminnelser som reagerar på bokningsstatus.
6. **Först då:** enhetligt UI-skal och analysyta.

---

*Analysen är gjord utifrån läsning av källkod, dokument, tester i repot och en egen torrkörning mot produktionsdata på Render. Torrkörningen läste `/var/data/cco-patient-master.json`, `/var/data/cco/cliento-bookings.json` och `/var/data/cco-booking-engine.json` och skrev ingenting.*
