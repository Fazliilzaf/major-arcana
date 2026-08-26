# Att lägga in workflow V13 i CCO — vad som ska göras

**Till Fazli · 2026-08-26**
**Källa:** `docs/workflow/cco-workflow-v13.md`
**Metod:** läst koden, inte dokumentationen om koden. Varje påstående har fil
och rad. Det jag inte kunnat kontrollera står i §7.

---

## 0 · Kortversionen

**Motorn finns redan.** CCO har en signalmotor som läser en kunds tillstånd
och säger vad som fattas — `src/ops/ccoAutomationRegistry.js`, 15 regler.
Den är kopplad hela vägen fram till knappen "Smart nästa steg" i V13.

**Men den slutar där kunden blir opererad.** Kundresan i CCO har nio steg
och det sista är foto-samtycke. Workflow-dokumentet har nio faser och
foto-samtycket ligger i mitten. Allt efter operationen — behandlingen,
pengarna, uppföljningarna 4/8/12, resultatet — finns inte som steg, har
ingen signal och ingen automatik.

**Och en enda rad kod hindrar hela eftervårdskedjan från att gå igång.**
Se §1.

Det är därför arbetet inte är "bygg automatisering". Det är **förläng
resan förbi operationen och laga tre brutna länkar.**

---

## 1 · Den trasiga länken

`server.js:5958`:

```js
if (app.locals.ccoBookingCaseStore?.onTransition) {
  app.locals.ccoBookingCaseStore.onTransition(async (caseObj, from, to) => {
    if (to !== 'completed') return;
    await scheduler.scheduleForCompletedEncounter({ ... });
  });
}
```

`createCcoBookingCaseStore` returnerar tolv metoder. **`onTransition` är
inte en av dem.** Villkoret är alltid falskt. Kommentaren två rader ovanför
erkänner det: _"annars måste klient-koden anropa /schedule manuellt."_

Ingen klient-kod gör det. `scheduleForCompletedEncounter` anropas på exakt
två ställen i hela repot: definitionen, och den döda hooken.

**Följd:** ingen behandling schemalägger någonsin en uppföljning. Det är
den verkliga förklaringen till de noll aftercare-jobben jag mätte i
produktion i ORD-110. Jag trodde då att det bara var diskplatsen. Det var
två fel ovanpå varandra.

**Rätt anslutningspunkt finns redan.** `ccoJournalBookingBridge.js:527`,
`lockEncounterOnJournalSign` — när personalen signerar journalen sätts
encountern till `completed` (rad 546). Det är där uppföljningen ska bokas,
inte i booking-case-maskinen. Signerad journal betyder att behandlingen
verkligen är utförd; ett booking-case kan stå på `completed` av
administrativa skäl.

---

## 2 · Vad som redan finns, per sektion

Kort inventering. Detta ska inte byggas om.

### Kunder

| Finns                                                                    | Fil                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------- |
| 17 sektioner i lilla V13, hela WORKSPACE i stora                         | `app/cco-v13-render.js:710`, `:745`               |
| Kundresa, 9 steg, med blockerare per steg                                | `app/cco-kundkort-kkx.js:5-114`, `:365`           |
| "Smart nästa steg" som läser signalmotorn                                | `app/cco-v13-render.js:266`                       |
| 15 journalscheman, variant per behandling                                | `src/ops/ccoJournalSchemas.js:22`                 |
| Op-dagsgrind: ingen journal utan signerad friskförsäkran                 | `src/routes/ccoJournal.js:26`                     |
| Bilder kopplade till både besök och journalpost                          | `src/ops/ccoJournalPhotoStore.js`                 |
| Dokumentkrav per behandling — **15 behandlingar, med `followupCadence`** | `config/cco-treatment-document-requirements.json` |

Den sista är viktig. Konfigfilen är redan workflow-dokumentets §2 i
maskinläsbar form: `fue`, `dhi`, `beard`, `eyebrow` har alla
`["4m","8m","12m"]`, PRP har `["2w_after_each_session","1m_after_final"]`,
och alla femton har `photoConsentPublishing` med `onlyIfShowcaseRequested`.

### Kalender & bokning

| Finns                                                             | Fil                                         |
| ----------------------------------------------------------------- | ------------------------------------------- |
| Bokningsmotor med rum, resurser, tillgänglighetsregler            | `src/ops/ccoBookingEngineStore.js:282`      |
| Bokning → encounter → journalutkast, automatiskt                  | `src/ops/ccoJournalBookingBridge.js:191`    |
| Påminnelser med lead-time per tjänst, var 6:e timme               | `src/ops/scheduler.js:4626`                 |
| Serie-mallar: `prp-hair-3/6`, `prp-skin-3`, `followup-transplant` | `src/ops/recurringBookings.js:23`           |
| Eftervårdsschemaläggare som läser `followupCadence`               | `src/ops/ccoAftercareSchedulerStore.js:148` |

### Konversationer

| Finns                                          | Fil                                          |
| ---------------------------------------------- | -------------------------------------------- |
| Mail-ingestion med tillståndsmaskin och intent | `src/ops/ccoMailIngestion/pipeline.js`       |
| Svarsstudio med tre toner                      | `src/capabilities/prepareResponseDrafts.js`  |
| SMS in via webhook                             | `src/routes/ccoInboundSms.js`                |
| Automatiska utskick syns i tråden direkt       | `src/ops/ccoAutomationConversationBridge.js` |
| Mallregister med revisioner och legal review   | `src/ops/ccoTemplateRegistry.js:82`          |
| Variabelrendering som vägrar skicka ofyllt     | `src/ops/ccoMessageRenderer.js:13`           |

### Signalmotorn — spindeln i nätet

`src/ops/ccoAutomationRegistry.js`. Femton regler:

| Steg | Regel                                                                          |
| ---- | ------------------------------------------------------------------------------ |
| 3    | `customer.missing_health_declaration`                                          |
| 4    | `customer.missing_journal`                                                     |
| 5    | `customer.missing_treatment_plan`                                              |
| 6    | `customer.cooling_off_active` / `_passed`                                      |
| 7    | `customer.missing_agreement_consent_bundle`                                    |
| 8    | `customer.missing_operation_day_insurance`                                     |
| 9    | `customer.missing_photo_consent`                                               |
| —    | `customer.has_photo_review`, `customer.ready_for_treatment`                    |
| —    | fem `conversation.*`-regler (obesvarad, SLA, ton, bokningsintent, uppföljning) |

Kedjan: registret → `ccoAutomationRunner.evaluatePatientSignals` →
`card.automationSignals` → `buildSmartInfoFromSignals`
(`cco-v11-rail-adapters.js:134`) → knappen i `s-next`.

Varje regel bär `risk`, `humanApprovalRequired`, `suggestedRoute` och
`confidence`. Det är en välbyggd grund.

**Två begränsningar:**

1. `dryRun: true` är hårdkodat på två ställen
   (`ccoAutomationRunner.js:49` och `:263`). Motorn kan bara **föreslå**,
   aldrig utföra.
2. Grindad av `ENABLE_AUTOMATION_RUNNER`. Flaggan står **inte** i
   `render.yaml`. UAT-dokumentet från maj
   (`docs/strategy/CCO-END-TO-END-UAT-2026-05-31.md:204`) säger att den var
   satt direkt i Renders gränssnitt. Se §7 — jag har inte kunnat bekräfta
   det idag.

---

## 3 · Vad som saknas — nio faser mot koden

| Fas workflow                 | Motsvarighet i CCO                          | Läge                                |
| ---------------------------- | ------------------------------------------- | ----------------------------------- |
| 1 · Upptäckt & intresse      | webbformulär → `publicWebEvents.js`         | delvis, ingen kundresa-koppling     |
| 2 · Bokning                  | bokningsmotor + AutoMail                    | **klart**                           |
| 3 · Konsultation             | hälsodeklaration, journal, resa-steg 3–4    | **klart**                           |
| 4 · Offert & behandlingsplan | kommersiell store, resa-steg 5              | **klart**                           |
| 5 · Förberedelse             | avtal, betänketid, friskförsäkran, steg 6–8 | **klart**                           |
| 6 · Behandling               | journal + op-dagsgrind                      | journalen finns, **inget steg**     |
| 7 · Betalning 20/80          | `depositAmount`, `deposit_pending` finns    | **ingen 20 %-logik, ingen faktura** |
| 8 · Eftervård 4/8/12         | schemaläggare finns                         | **startas aldrig** (§1)             |
| 9 · Resultat & Instagram     | `photoConsentPublishing` finns i konfigen   | **inget sätter showcase-flaggan**   |

Fas 6–9 är alltså fyra femtedelar av kundens tid hos er, och den del där
pengarna och återkomsten finns. Den delen är omodellerad.

---

## 4 · To-do-listan

Sex block. Ordningen är vald så att varje block gör nästa möjligt.

### Block 1 — Starta eftervården (störst effekt, minst arbete)

- [ ] **1.1 Ta bort den döda hooken** i `server.js:5958-5974`. Den ger
      falsk trygghet — den ser ut som en koppling och är ingen.
- [ ] **1.2 Anropa `scheduleForCompletedEncounter` från
      `lockEncounterOnJournalSign`** (`ccoJournalBookingBridge.js:527`).
      Behandlingsnyckeln finns på encountern, kund-id på journalposten.
- [ ] **1.3 Laga `afterFinal` och `eachSession`.**
      `parseCadenceOffset` (`ccoAftercareSchedulerStore.js:51-52`) sätter
      båda flaggorna och **ingen läser dem**. Följd: väg A och B (PRP,
      3–4 behandlingar) får ett enda jobb två veckor efter första
      tillfället, i stället för ett efter varje. Fel för två av sex vägar.
- [ ] **1.4 Kontrollera mallnamnen.** Koden bygger nu
      `followup_${offset.token}` → `followup_4m`, `followup_8m`,
      `followup_12m` (`ccoAftercareSchedulerStore.js:159`). ORD-111 sa
      `followup_tp_4m`. Ett av namnen är fel — utan matchande mall blir
      jobbet `deferred` och ingenting skickas.
- [ ] **1.5 Testa hela kedjan i produktion:** signera en journal på en
      testkund → kontrollera att tre jobb dyker upp i
      `GET /api/v1/cco-aftercare/jobs` med rätt datum.

### Block 2 — Förläng kundresan förbi operationen

Kundresan (`cco-kundkort-kkx.js:5-114`) har nio steg och slutar vid
foto-samtycke. Workflow-dokumentet fortsätter fyra faser till.

- [ ] **2.1 Lägg till steg 10–13:** Behandling utförd · Förskott betalt ·
      Uppföljning 4/8/12 · Slutresultat & samtycke publicering.
- [ ] **2.2 Skriv sanningsfunktioner för de nya stegen**, som de
      befintliga i `computeStepTruth` (`cco-kundkort-kkx.js:365-419`).
      Steg 10 = signerad behandlingsjournal. Steg 12 = antal genomförda
      uppföljningsbesök mot behandlingens `followupCadence`.
- [ ] **2.3 Ta ställning till vägarna.** Resan är idag skriven för väg C.
      Väg A och B har ingen operation och ingen friskförsäkran. Antingen
      hoppas de stegen över för de vägarna, eller så får resan en variant
      per väg. **Detta är ett beslut du ska ta, inte DeepSeek.**

### Block 3 — Nya signaler för de nya stegen

Fem regler in i `ccoAutomationRegistry.js`, samma form som de befintliga:

- [ ] `customer.treatment_done_no_journal` — behandling utförd, journal
      osignerad. Risk: blocker.
- [ ] `customer.followup_due` — uppföljning förfallen enligt kadens.
- [ ] `customer.followup_not_booked` — jobbet skickat, ingen tid bokad.
- [ ] `customer.deposit_unpaid` — accepterad offert utan förskott.
- [ ] `customer.result_ready_no_publish_consent` — 12-månadersjournal
      klar, publiceringssamtycke saknas.

Varje regel behöver `suggestedRoute` och `humanApprovalRequired`. Följ
mönstret på rad 33–47 — den kommentaren förklarar varför rutten pekar på
personalens yta och inte kundens.

### Block 4 — Automatisk seriebokning

`recurringBookings.js` har redan mallarna. `server.js:10594` anropar
`createRecurringSeries` och **returnerar objektet utan att spara det
någonstans**. Ingen store skrivs, inget UI anropar routen.

- [ ] **4.1 Persistera serien** som riktiga reservationer i
      bokningsmotorn.
- [ ] **4.2 Föreslå serien automatiskt** när en transplantation
      journalförs: tre tider enligt `followup-transplant`. **Förslag, inte
      bokning** — personalen väljer tider, kunden får bekräftelse.
- [ ] **4.3 Koppla PRP-serierna** till väg A och B på samma sätt.

### Block 5 — Fakturering 20/80 in i CCO

- [ ] **5.1 Räkna ut 20 %** ur den accepterade offerten och skriv
      `depositAmount` (fältet finns, `ccoCommercialStore.js:217`).
- [ ] **5.2 Fyll `outstandingBalance`.** Fältet visas i två vyer
      (`cco-v11-rail-adapters.js:214` och `:1864`) och **skrivs aldrig av
      någon produktionskod** — noll träffar i hela `src/`. Idag är
      SKULD-rutan i kundkortet alltid tom eller påhittad från demodata.
- [ ] **5.3 Slutfaktura 80 %** när behandlingen journalförts.

Fortnox-kopplingen finns (`ARCANA_FORTNOX_ENABLED`, av som standard). Om
faktureringen ska ligga kvar där räcker det att CCO visar rätt siffror
och skickar rätt signal — men **det beslutet är ditt**.

### Block 6 — Städa det som ser ut att fungera men inte gör det

Det här är farligare än saker som saknas, eftersom personalen tror att de
har hänt.

- [ ] **6.1 Makron.** `runMacro` (`ccoMacroStore.js:191`) ökar
      `runCount` och `lastRunAt` — **och utför inga av de konfigurerade
      åtgärderna**. `autoCondition` (t.ex. `customer.isVIP === true`)
      tolkas aldrig någonstans. Antingen bygg exekveringen eller ta bort
      Kör-knappen.
- [ ] **6.2 Automation-vyn.** Flikarna Byggare/Analys/Autopilot är
      hårdkodad HTML — "847 körningar", "94.3 % framgång", "124 000 kr
      intäktspåverkan" står i `index.html:5268-5432` och kommer inte från
      någon store. **Här hör signalmotorn hemma.** Byt ut mockupen mot den
      riktiga regellistan och dess utfall.
- [ ] **6.3 Tilldelning av konversationer.** Knapparna finns
      (`index.html:8321`, `:9010`), ingen backend lagrar en ägare, och
      statuspillen visar statiskt "Ej tilldelad" (`index.html:9831`).
- [ ] **6.4 Avboka i mobilkalendern.** Knappen
      (`cco-booking-v1-shell.js:411`) stänger panelen och visar en toast.
      Ingen bokning avbokas.
- [ ] **6.5 `cco-template-fill.html`** är inte länkad från någon
      navigation. Antingen in i menyn eller bort.

---

## 5 · AI — var det faktiskt lönar sig

**Först det viktiga: CCO kör inte generativ AI idag.** `render.yaml:74-75`
sätter `ARCANA_AI_PROVIDER: fallback`, vilket gör `openai`-klienten till
`null` (`src/openai/client.js:5-10`). Allt som heter "AI-förslag" i
gränssnittet är deterministiska mallar och regex. Kodkommentaren på
`server.js:9367` säger det rakt ut.

Av 51 capabilities anropas sju.

**Det är inte ett fel som ska lagas snabbt.** `ccoJournalAiGuard.js`
blockerar journalinnehåll från att lämna systemet till extern AI, och den
spärren ska stå kvar. Frågan är var AI ger nytta **utan** att röra
patientdata.

Tre lägen, i den ordning jag skulle ta dem:

**1 · Sammanfatta en tråd innan personalen svarar.** Konversationer, inte
journal. Datat finns, samtycket är oproblematiskt, tidsvinsten är daglig.
Och kopplingen finns redan hela vägen — `summarizeThread.js` →
`ccoConversation.js:1812` → `app/thread-ai-summary.js`. Den kör bara
deterministiskt i dag, eftersom providern är `fallback`. **Det här är
alltså inte ett bygge utan ett omslagsbeslut**, och därför det billigaste
stället att börja.

**2 · Föreslå vilken behandlingsväg konsultationen pekar mot.** Grundat på
hälsodeklarationens fjorton fält, inte på fritext. Förslag med motivering,
personalen bekräftar. `humanApprovalRequired: true`.

**3 · Formulera uppföljningsmailet efter kundens faktiska förlopp** —
antal grafts, vilken metod, hur många PRP som är gjorda. Här finns redan
mallar och variabler; AI:n väljer formulering, inte innehåll.

**Det jag skulle avråda från:** AI som skriver journaltext. Spärren finns
av ett skäl, och en journal är ett rättsligt dokument.

**En sak saknas helt om AI ska sättas på:** det finns ingen kostnadsspärr.
Ingen budget, ingen token-gräns, ingen daglig limit — sökning i hela `src/`
ger noll träffar. Idag spelar det ingen roll eftersom `fallback` gör varje
anrop gratis. Den dagen provider byts är det första som behöver byggas.

---

## 6 · Ordningen jag föreslår

1. **Block 1** — eftervården. En dags arbete, och det är skillnaden mellan
   att workflow-dokumentets fas 8 existerar eller inte.
2. **Block 6.1 och 6.4** — ta bort knappar som ljuger. Snabbt.
3. **Block 2** — förläng resan. Kräver ditt beslut om vägarna först.
4. **Block 3** — signalerna, när stegen finns.
5. **Block 4** — seriebokningen.
6. **Block 5** — faktureringen, störst och mest beroende av ditt beslut
   om Fortnox.

---

## 7 · Vad jag inte kunnat kontrollera

Jag skriver ut det hellre än att låta det passera som verifierat.

- **`ENABLE_AUTOMATION_RUNNER` i produktion.** Flaggan står inte i
  `render.yaml`. UAT-dokumentet från 2026-05-31 säger att den sattes
  direkt i Renders gränssnitt. Jag försökte fråga produktion idag men
  sessionen hade gått ut (401 på fyra endpoints). **Kontrollera i Render
  innan något byggs ovanpå** — svaret avgör om signalmotorn är levande
  eller sovande just nu.
- **Vilka mallar som faktiskt ligger i produktionsregistret.** Samma 401. Punkt 1.4 hänger på det.
- **Om `s-next` visar rader för en riktig kund.** Jag har sett att
  sektionen renderas, inte att den har innehåll.
