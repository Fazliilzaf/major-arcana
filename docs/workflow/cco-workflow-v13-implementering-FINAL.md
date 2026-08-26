# CCO — Implementera workflow V13 · FINAL TODO (kund + personal, via portaler)

> **Slår ihop:** `docs/handover/WORKFLOW-IN-I-CCO-TODO-2026-08-26.md` (kod-grundad, 6 block, bruten länk, signalkedja) + `docs/workflow/cco-implementering-todolista.md` (sektionskarta + portal-styrning + P0–P4). **En enda källa.**
> **Status:** ✔ = gjort/committat i detta arbete · [ ] = kvar.
> **För Fri:** flödet ska styras via **staffportalen** (`public/staff-portal.html`) + **kundportalen** (`cco-patient-offer-portal-v3.html`).

---

## 0 · Kortversionen

**Motorn finns redan.** CCO har en signalmotor (`src/ops/ccoAutomationRegistry.js`, 15 regler) som läser en kunds tillstånd och säger vad som saknas; kopplad till "Smart nästa steg". **Men den slutar när kunden blir opererad** — fas 6–9 (behandling, pengar, uppföljning 4/8/12, resultat) är omodellerade. Dessutom har det varit **två fel ovanpå varandra**: (a) eftervårdskedjan startades aldrig (dead hook, §1), och (b) **signalmotorn var avstängd** (`ENABLE_AUTOMATION_RUNNER` var inte satt). Båda är åtgärdade/nämda nedan.

---

## 1 · Trasiga länkar (grundorsak — åtgärdas först)

- [ ] **1.1 Ta bort den döda hooken** `server.js:5958-5974` (`cc oBookingCaseStore.onTransition` är **ingen metod** → alltid falskt). Ger falsk trygghet.
- [ ] **1.2 Anropa `scheduleForCompletedEncounter` från `lockEncounterOnJournalSign`** (`ccoJournalBookingBridge.js:527`) — signerad journal = behandling utförd = uppföljning ska bokas. Rätt anslutningspunkt.
- [ ] **1.3 Laga `afterFinal`/`eachSession`** (`ccoAftercareSchedulerStore.js:51-52`) — flaggorna sätts men **läses aldrig** → väg A/B (PRP) får ett jobb i stället för ett per behandling.
- [x] **1.4 Mallnamnen** = `followup_4m/8m/12m` (Path B, delad, `{{treatment}}`) — **verifierat** via API i detta arbete; koden bygger `followup_${offset.token}` ✔. (Motgår `followup_tp_4m` i ORD-111-notisen.)
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
- [ ] **4m/12m-malltexter** (Fazli godkänna; 8m godkänd) — mallar `legal=pending`.
- [ ] **CCO_SEND_LIVE** osatt tills du säger till.
- [ ] `cco-notiser-v3.html`: `/api/v1/cco-notifications/*` → `/api/v1/staff/notifications`.
- [ ] `cco-drive-historik-v3.html`: använd riktig route i stället för inline-kopia.
- [ ] Persistens (ORD-110 resten): flytta GDPR/legal-stores → `/var/data`; **red ut `cco-customers.json`-duplikatet** (server.js:426 + `config.ccoCustomerStorePath`).

---

## 5 · AI — var det lönar sig (CCO kör IDAG fallback, ingen generativ AI)

1. **Sammanfatta tråd** innan personalen svarar (konversationer, inte journal). Kedjan finns (`summarizeThread.js` → `ccoConversation.js:1812`) — kör bara deterministiskt pga `fallback`. **Omslagsbeslut, inte bygge.**
2. **Föreslå behandlingsväg** ur hälsodeklarationens 14 fält (evidens, ej fritext), `humanApprovalRequired: true`.
3. **Formulera uppföljningsmail** efter faktiskt förlopp (grafts/metod/PRP) — AI väljer formulering, inte innehåll.
   > **Avråd:** AI som skriver journaltext (spärren finns av en anledning — journal = rättsligt dokument).
   > **Saknas:** kostnadsspärr (ingen budget/token-gräns/daglig limit) — byggs innan provider byts.

---

## 6 · Ordning

1. **Block 1** (eftervården) · 2. **Block 6.1/6.4** (ta bort ljugande knappar) · 3. **Block 2** (förläng resan, kräver ditt väg-beslut) · 4. **Block 3** · 5. **Block 4** · 6. **Block 5** (fakturering, mest beroende av Fortnox-beslut).
   > Kod-grundad ordning från kod-auditen. **Portal-styrning (Block 7/8/9)** flätas in löpande — särskilt Block 7 eftersom du vill styra via portaler.

---

## 7 · Verifiering

- [x] `test:unit` grön (7 240; fixat 2 flaky) · `smoke:local` · `check:syntax` · `lint:no-bypass`. ✔
- [ ] Deploy: `GET /api/v1/ops/state/manifest` visar `cco-templates.json` + `cco-aftercare-jobs.json` under `/var/data`.
- [ ] Signalkedja live: öppna kund `03c7a38d-…` → `s-next` visar ≥1 rad (översta = hälsodeklarationen).

---

## 8 · Fortfarande okontrollerat

- [ ] Vilka mallar som ligger i produktionsregistret (namn `followup_4m/8m/12m` vs `followup_tp_*`). _(Lokalt verifierat i detta arbete; prod kräver `templates.read` vid deploy.)_
