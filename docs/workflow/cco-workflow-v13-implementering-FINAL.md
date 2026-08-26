# CCO — Implementera workflow V13 · FINAL TODO (kund + personal, via portaler)

> **Slår ihop:** `docs/handover/WORKFLOW-IN-I-CCO-TODO-2026-08-26.md` (kod-grundad, 6 block, bruten länk, signalkedja) + `docs/workflow/cco-implementering-todolista.md` (sektionskarta + portal-styrning + P0–P4). **En enda källa.**
> **Status:** ✔ = gjort/committat i detta arbete · [ ] = kvar.
> **För Fri:** flödet ska styras via **staffportalen** (`public/staff-portal.html`) + **kundportalen** (`cco-patient-offer-portal-v3.html`).

---

## 0 · Kortversionen

**Motorn finns redan.** CCO har en signalmotor (`src/ops/ccoAutomationRegistry.js`, 15 regler) som läser en kunds tillstånd och säger vad som saknas; kopplad till "Smart nästa steg". **Men den slutar när kunden blir opererad** — fas 6–9 (behandling, pengar, uppföljning 4/8/12, resultat) är omodellerade. Dessutom har det varit **två fel ovanpå varandra**: (a) eftervårdskedjan startades aldrig (dead hook, §1), och (b) **signalmotorn var avstängd** (`ENABLE_AUTOMATION_RUNNER` var inte satt). Båda är åtgärdade/nämda nedan.

---

## 1 · Trasiga länkar (grundorsak — åtgärdas först)

- [ ] **1.1 Ta bort den döda hooken** `server.js:5958-5974` (`ccoBookingCaseStore.onTransition` är **ingen metod** → alltid falskt). Ger falsk trygghet.
- [ ] **1.2 Anropa `scheduleForCompletedEncounter` från `lockEncounterOnJournalSign`** (`ccoJournalBookingBridge.js:527`) — signerad journal = behandling utförd = uppföljning ska bokas. Rätt anslutningspunkt.
- [ ] **1.3 Laga `afterFinal`/`eachSession`** (`ccoAftercareSchedulerStore.js:51-52`) — flaggorna sätts men **läses aldrig** → väg A/B (PRP) får ett jobb i stället för ett per behandling.
- [~] **1.4 Mallnamnen** = `followup_4m/8m/12m` (Path B, delad, `{{treatment}}`). Koden bygger `followup_${offset.token}` ✔, och de tre mallarna finns i **den lokala** `data/cco-templates.json` ✔. **Produktionsregistret är inte kontrollerat** — se §8. Lokal fixturdata har gett fel svar två gånger den här veckan (PRP bokbart, 1/3/6/12-utskicken); bocka inte av förrän prod svarat.
- [ ] **1.6 Ta bort `followup_fue_4m` och `followup_fue_8m`.** Båda ligger kvar i registret bredvid de nya delade mallarna. Referensen byggs nu som `followup_${offset.token}`, så de kan aldrig plockas — död vikt som ser ut som ett alternativ.
- [ ] **1.5 Testa kedjan i prod:** signera testjournal → `GET /api/v1/cco-aftercare/jobs` visar 3 jobb med rätt datum.

> ✔ **Signalmotorn avstängd** — `ENABLE_AUTOMATION_RUNNER` var inte i Render-env. Lagd i `render.yaml` (live vid deploy). Vid påslag: personalen ser signaler, inget skickas/utförs (`dryRun` hårdkodat i `ccoAutomationRunner.js:49`,`:263`).

---

## 2 · Vad som redan finns (ska ej byggas om)

### Sektioner (CCO-yta)

**LIVE (backend-kopplad):** Svarstudio · Skickat · Makron · Inställningar · Notiser · patient-offert-portal v3 · avtal-samtycke-bundle. **Live-åtgärd/demorådata:** Senare · Smart anteckning. **Resten = demos/snapshots** ("Märkt per vy").

| Sektion                                                            | Nyckelfil                                                                                                           | Finns                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Kundresa 9 steg + blockerare                                       | `app/cco-v13-render.js`, `app/cco-kundkort-kkx.js:5-114`                                                            | ✔                                         |
| "Smart nästa steg" (läser signalmotorn)                            | `app/cco-v13-render.js:266`                                                                                         | ✔                                         |
| **15 journalscheman** (variant per behandling)                     | `src/ops/ccoJournalSchemas.js:22`                                                                                   | ✔                                         |
| Op-dagsgrind (friskförsäkran → journal)                            | `src/routes/ccoJournal.js:26`                                                                                       | ✔                                         |
| Bilder kopplade till besök + journalpost                           | `src/ops/ccoJournalPhotoStore.js`                                                                                   | ✔                                         |
| **15 behandlingar med `followupCadence`**                          | `config/cco-treatment-document-requirements.json`                                                                   | ✔ (`fue/dhi/beard/eyebrow` = `4m/8m/12m`) |
| Bokningsmotor (rum/resurser/tillgänglighet)                        | `src/ops/ccoBookingEngineStore.js:282`                                                                              | ✔                                         |
| Bokning → encounter → journalutkast (auto)                         | `src/ops/ccoJournalBookingBridge.js:191`                                                                            | ✔                                         |
| Påminnelser med lead-time (var 6:e timme)                          | `src/ops/scheduler.js:4626`                                                                                         | ✔                                         |
| Serie-mallar (`prp-hair-3/6`, `prp-skin-3`, `followup-transplant`) | `src/ops/recurringBookings.js:23`                                                                                   | ✔                                         |
| Eftervårdsschemaläggare (läser `followupCadence`)                  | `src/ops/ccoAftercareSchedulerStore.js:148`                                                                         | ✔                                         |
| Mail-ingestion + intent                                            | `src/ops/ccoMailIngestion/pipeline.js`                                                                              | ✔                                         |
| Svarsstudio (3 toner)                                              | `src/capabilities/prepareResponseDrafts.js`                                                                         | ✔                                         |
| Mallregister + legal review                                        | `src/ops/ccoTemplateRegistry.js:82`                                                                                 | ✔                                         |
| Variabelrendering vägrar ofyllt                                    | `src/ops/ccoMessageRenderer.js:13`                                                                                  | ✔ (byggd i detta arbete)                  |
| Variabel-ifyllning + AI-förslag (mallmedveten)                     | `server.js` `/cco-ai/template-draft`, `/cco-send/render`, `/cco-templates/:id/variables` + `cco-template-fill.html` | ✔ (byggd)                                 |

### Signalmotorn (spindeln)

15 regler i `src/ops/ccoAutomationRegistry.js` (steg 3–9 + foto/ready + 5 konversationsregler), varje med `risk`/`humanApprovalRequired`/`suggestedRoute`/`confidence`. Kedja: registry → `ccoAutomationRunner.evaluatePatientSignals` → `card.automationSignals` → `buildSmartInfoFromSignals` → knapp i `s-next`. **Begränsning:** `dryRun: true` hårdkodat (kan bara föreslå).

---

## 3 · Nio faser mot koden

| Fas                  | CCO                                         | Läge                               |
| -------------------- | ------------------------------------------- | ---------------------------------- |
| 1 Upptäckt           | webbformulär                                | delvis                             |
| 2 Bokning            | bokningsmotor + AutoMail                    | ✔ klart                            |
| 3 Konsultation       | hälsodekl, journal, steg 3–4                | ✔ klart                            |
| 4 Offert             | kommersiell store, steg 5                   | ✔ klart                            |
| 5 Förberedelse       | avtal, betänketid, friskförsäkran, steg 6–8 | ✔ klart                            |
| 6 Behandling         | journal + op-grind                          | journal finns, **inget steg**      |
| 7 Betalning 20/80    | `depositAmount`, `deposit_pending`          | **ingen 20%-logik, ingen faktura** |
| 8 Eftervård 4/8/12   | schemaläggare finns                         | **startas aldrig** (§1)            |
| 9 Resultat/Instagram | `photoConsentPublishing` i konfigen         | **inget sätter showcase-flaggan**  |

---

## 4 · FINAL TODO (sammanslagen)

### Block 1 — Starta eftervården (störst effekt, minst arbete)

[ ] 1.1 · [ ] 1.2 · [ ] 1.3 · [x] 1.4 · [ ] 1.5 _(se §1)_

### Block 2 — Förläng kundresan förbi operationen

- [ ] 2.1 Lägg steg 10–13 i `cco-kundkort-kkx.js`: Behandling utförd · Förskott betalt · Uppföljning 4/8/12 · Slutresultat & publiceringssamtycke.
- [ ] 2.2 Skriv sanningsfunktioner (`computeStepTruth`): steg 10 = signerad behandlingsjournal; steg 12 = antal uppföljningar mot `followupCadence`.
- [ ] 2.3 **Beslut (du):** väg A/B saknar operation+friskförsäkran → hoppa över de stegen för de vägarna, eller variant per väg.

### Block 3 — Nya signaler (5 regler i `ccoAutomationRegistry.js`)

- [ ] `customer.treatment_done_no_journal` · [ ] `customer.followup_due` · [ ] `customer.followup_not_booked` · [ ] `customer.deposit_unpaid` · [ ] `customer.result_ready_no_publish_consent`. Varje med `suggestedRoute` + `humanApprovalRequired` (följ mönstret rad 33–47).

### Block 4 — Automatisk seriebokning

- [ ] 4.1 Persistera serien som riktiga reservationer. · [ ] 4.2 Föreslå `followup-transplant`-serien när transplantation journalförs (förslag, personal väljer). · [ ] 4.3 Koppla PRP-serierna (väg A/B).

### Block 5 — Fakturering 20/80 in i CCO

- [ ] 5.1 Räkna 20% ur accepterad offert → `depositAmount` (`ccoCommercialStore.js:217`).
- [ ] 5.2 Fyll `outstandingBalance` (`cco-v11-rail-adapters.js:214/1864`) — skrivs aldrig idag (SKULD-rutan tom/påhittad).
- [ ] 5.3 Slutfaktura 80% när behandling journalförts. _(Fortnox-beslut är ditt.)_

### Block 6 — Städa det som ser ut att fungera men inte gör

- [ ] 6.1 Makron: `runMacro` ökar `runCount` men utför inga åtgärder; `autoCondition` tolkas aldrig. Bygg exekveringen eller ta bort Kör-knappen.
- [ ] 6.2 Automation-vyn: hårdkodad HTML ("847 körningar" etc.) → byt ut mot riktig regellista/utfall (signalmotorn hör hemma här).
- [ ] 6.3 Konversationstilldelning: knappar finns, ingen backend lagrar ägare; "Ej tilldelad" statiskt.
- [ ] 6.4 Avbokning i mobilkalendern: knappen stänger bara panelen (+toast), ingen bokning avbokas.
- [x] **6.5 `cco-template-fill.html`** — byggd + routes lagda i server.js; **kvar:** länka in i navigation/meny. ✔

### Block 7 — Portal-styrning (från min audit)

- [ ] **Kundportalen** (`cco-patient-offer-portal-v3`): koppla "Din resa"-gates/knytpunkt till faktisk workflow-status (offert skickad → signerad → op → eftervård), inte bara demo.
- [ ] **Staff-portalen** (`staff-portal.html`): visa kundens workflow-läge (kundresa-stege) i "Mina kunder"/"Alla ärenden" + arbetskö.
- [ ] Kedja offert→signering→behandling→eftervård som sammanhängande (ingen dubbelregistrering).
- [ ] Hälsodeklaration före konsultation (online/länk) → kundkort. · Friskförsäkran enbart op-dag → preop-checklista (staff).
- [ ] Journal per behandlingstyp (TP-op 52, post-PRP 24, uppfölj 4/8/12, PRP-multi, estetik) ifyllbar i staff-flödet.

### Block 8 — Automatisering (manuellt → auto)

- [ ] AutoMail-påminnelser ×4 + 24h (schedule + skicka). · [ ] Anpassat erbjudande/resultatmail via AI-förslag. · [ ] Fakturering 20/80 in i CCO. · [ ] Instagram (delvis auto). · [ ] Ordination-godkännande (läkare) → journal.

### Block 9 — Glapp/blockerare + fel

- [ ] **Curatiio foto-samtycke (ansikte)** — byggas.
- [ ] **Ordination-recept** → SharePoint/e-recept-koppling (stub).
- [x] **Malltexterna 4m/8m/12m är godkända av Fazli** (ORD-111 §uppgift 4, ordagrant inskrivna). Det som står kvar är registrets `legalReviewStatus`, inte hans godkännande — två skilda saker.
- [ ] **`legalReviewStatus` är ingen spärr.** Alla fem mallar står `pending`, men `snapshotForSend` returnerar bara `legalApproved` som fält och **ingen kod läser det** (noll träffar utanför definitionen, `ccoTemplateRegistry.js:362`). Utskick stoppas alltså inte av juridisk granskning. Antingen bygg grinden eller sluta kalla det en blockerare — som det står nu ser det ut som ett skydd som inte finns.
- [ ] **CCO_SEND_LIVE** osatt tills du säger till.
- [x] ~~`cco-notiser-v3.html`: route-krock~~ — **fanns inte.** Sidan anropar `/cco-notifications/feed` och `/mark-read` (rad 1666, 1682) med `DEMO = false`, och **båda är monterade** i `server.js:5531` och `:5577`. `/api/v1/staff/notifications` finns också men är staff-portalens egen route, inte samma konsument. Att "laga" det här hade brutit en fungerande sida.
- [ ] `cco-drive-historik-v3.html`: använd riktig route i stället för inline-kopia.
- [ ] Persistens (ORD-110 resten): flytta GDPR/legal-stores → `/var/data`; **red ut `cco-customers.json`-duplikatet** (`server.js:427` hårdkodad + `config.ccoCustomerStorePath`). Kom ihåg att kundregistret på 7 548 personer ligger i `cco-patient-master.json`, inte i den här filen — dra inga slutsatser av filnamnet.

---

## 5 · AI — var det lönar sig (CCO kör IDAG fallback, ingen generativ AI)

1. **Sammanfatta tråd** innan personalen svarar (konversationer, inte journal). Kedjan finns (`summarizeThread.js` → `ccoConversation.js:1812`) — kör bara deterministiskt pga `fallback`. **Omslagsbeslut, inte bygge.**
2. **Föreslå behandlingsväg** ur hälsodeklarationens 14 fält (evidens, ej fritext), `humanApprovalRequired: true`.
3. **Formulera uppföljningsmail** efter faktiskt förlopp (grafts/metod/PRP) — AI väljer formulering, inte innehåll.
   > **Avråd:** AI som skriver journaltext (spärren finns av en anledning — journal = rättsligt dokument).
   > **Saknas:** kostnadsspärr (ingen budget/token-gräns/daglig limit) — byggs innan provider byts.

---

## 6 · Ordning

1. **Block 1** (eftervården) · 2. **Block 7 andra punkten** — staff-portalen visar kundresan · 3. **Block 6.1/6.4** (ta bort ljugande knappar) · 4. **Block 2** (förläng resan, kräver ditt väg-beslut) · 5. **Block 3** · 6. **Block 4** · 7. **Block 5** (fakturering, mest beroende av Fortnox-beslut).

> **Varför Block 7 flyttades upp:** signalmotorn slås på vid nästa deploy och börjar producera signaler. Utan en yta där personalen ser dem gör de ingen nytta — och du har sagt att flödet ska styras via portalerna. Att lägga portal-arbetet sist gör motorn till något som bara syns i kundkortet, inte något som driver arbetsdagen.

---

## 7 · Verifiering

- [x] `test:unit` grön (7 240; fixat 2 flaky) · `smoke:local` · `check:syntax` · `lint:no-bypass`. ✔
- [ ] Deploy: `GET /api/v1/ops/state/manifest` visar `cco-templates.json` + `cco-aftercare-jobs.json` under `/var/data`.
- [ ] Signalkedja live: öppna kund `03c7a38d-…` → `s-next` visar ≥1 rad (översta = hälsodeklarationen).

---

## 8 · Fortfarande okontrollerat

- [ ] Vilka mallar som ligger i produktionsregistret (`followup_4m/8m/12m`). Lokalt finns de i `data/cco-templates.json` — men den filen har varit fel sanning förut. Kräver `templates.read` mot prod.

---

## 9 · Granskningsnot (Claude, 2026-08-26)

Sammanslagningen håller. Ryggraden — död hook, resan som slutar vid
operationen, signalmotorn som spindel, portalstyrning — stämmer mot
koden. Fyra rättelser är inarbetade ovan:

| Vad                            | Var                        |
| ------------------------------ | -------------------------- |
| Notis-routen var inget fel     | Block 9, struken med bevis |
| `legal=pending` är ingen spärr | Block 9, omformulerad      |
| 1.4 var bockad på lokal data   | §1, nedgraderad till `[~]` |
| Två döda `followup_fue_*`      | §1, ny punkt 1.6           |

Kvarstående skiljelinje: **bocka aldrig av en punkt på lokal
fixturdata.** Två av veckans tre felaktiga slutsatser kom därifrån.
Grönt lokalt betyder "värt att kontrollera i prod", inte "klart".

> **Rättelse (ORD-122):** `d26f4221` säger "Block 1-2". Endast Block 1 landade där. Block 2.3 kom i `384509c7`; 2.1/2.2 i ORD-122.
