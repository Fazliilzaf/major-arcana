# CCO — Implementering TODO-lista · cco-workflow-v13 (kund + personal, via portaler)

> **Syfte:** applicera `docs/workflow/cco-workflow-v13.md` (+ Curatiio) i CCO, koppla hela flödet kund↔personal, och styra via **staffportalen** (`public/staff-portal.html`) och **kundportalen** (`public/major-arcana-preview/cco-patient-offer-portal-v3.html`).
> **Källa:** tre agent-audits (CCO-sektioner/funktioner, portalerna, workflow-krav) + `docs/workflow/cco-krav-checklista.md`.
> **Status:** ✔ = gjort/committat i detta arbete · [ ] = kvar.

---

## A. Sektionskarta — workflow → CCO-yta/portal

| Workflow-fas     | CCO-sektion/vy                        | Kundportal                                     | Staff-portal                                        | Backning                                                  |
| ---------------- | ------------------------------------- | ---------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| 1 · Upptäckt     | Webb/Instagram                        | —                                              | —                                                   | marknad                                                   |
| 2 · Bokning      | Kalender · Ny bokning · Bokningsguide | booking-gates                                  | Daglig arbetskö                                     | `ccoBooking(Engine)`, `ccoBookings.js`                    |
| 3 · Konsultation | Kundkort(dossier) · Kunder            | "Din resa"-stege · formulär                    | Sjuksköterska "Mina kunder"                         | `ccoCustomers`, `ccoPatientMaster`, `patientPortal`       |
| 4 · Offert       | Offert/Agreements · Portal Composer   | **Offertportalen v3** (plan, pris, signera)    | Admin "Offerter"                                    | `ccoCommercial`, `ccoTreatmentAgreement`, `ccoOfferEsign` |
| 5 · Förberedelse | Pre-Signering Check · Journal Safety  | "Godkänn din plan" · BankID · bilder           | Preop-checklista · friskförsäkran-status            | `ccoJournal`, `ccoPatientMaster`, `patientDocumentLive`   |
| 6 · Behandling   | Journalbygge · Kundkort               | —                                              | Läkare ordinationsgranskning; sjuksköterska journal | `ccoJournal`, `ccoOfferEsign`, ordination                 |
| 7 · Betalning    | Ekonomi/Finans                        | Betalning 20/80                                | Admin "Kliniköversikt"                              | `cfo`, `ccoFortnox`                                       |
| 8 · Eftervård    | Kalender (uppföljningar) · Journal    | "Eftervård och uppföljning" · bokningar 4/8/12 | Uppföljningar · bilduppladdning                     | `patientPortal`, `ccoAftercareScheduler`, `ccoJournal`    |
| 9 · Resultat     | Showcase · Analys                     | Resultat/foton                                 | Publicera (Instagram)                               | `ccoMarketing`, `ccoJournal`, bildbank                    |

---

## B. Prioriterad TODO

### P0 — Blockers (innan flöde kan köras skarpt)

- [ ] **Curatiio foto-samtycke (ansikte)** — byggas; befintliga gäller hårlinje/krona (aldrig ansikte).
- [ ] **Ordination-recept** → SharePoint/e-recept-koppling (idag stub, ingen Signera).
- [ ] **4m/12m-malltexter** — godkänn av Fazli (8m godkänd; mallar är legal=pending).
- [ ] **CCO_SEND_LIVE** — sätts först när Fazli säger till (allt skarpt körs ej innan).

### P1 — Koppla kärn-flödet till CCO (live) — främst via portaler

- [ ] **Kundportalen** (`cco-patient-offer-portal-v3`): koppla "Din resa"-steg/gates och knytpunkt till faktisk workflow-status (offert skickad → signerad → op → eftervård), så spärrarna följer riktiga händelser, inte bara demo.
- [ ] **Staff-portalen** (`staff-portal.html`): visa kundens workflow-läge (kundresa-stege) per kund i "Mina kunder"/"Alla ärenden" + arbetskö.
- [ ] **Offert → signering → behandling → eftervård** som en sammanhängande kedja i CCO (ingen dubbelregistrering).
- [ ] **Hälsodeklaration** fylls före konsultation (online/länk eller fysiskt) → koppla till kundkort.
- [ ] **Friskförsäkran** enbart på op-dag → koppla till preop-checklista i staff-portal.
- [ ] **Journal per behandlingstyp** (TP-op 52, post-PRP 24, uppfölj 4/8/12, PRP-multi, estetik) — synlig/ifyllbar i staff-flödet.
- [ ] **Eftervård-scheduler** (delad followup-mall `{{treatment}}`, 4/8/12) + **AI-förslag** + **manuell variabel-ifyllning** kopplas in i staff-flödet/sändningen. ✔ delvis gjort (renderer, var-substitution, hard-stop, mallar, AI-förslag, UI). Kvar: verklig performSend-koppling i UI:t.

### P2 — Automatisering (manuellt → auto)

- [ ] **AutoMail-påminnelser ×4** + **påminnelse 24h** (schedule + skicka; idag delvis dry-run/manuell).
- [ ] **Anpassat erbjudande / resultatmail** via AI-förslag (utkast → godkänn → skicka).
- [ ] **Fakturering 20/80** flytta in i CCO (idag befintlig lösning).
- [ ] **Instagram-publicering** delvis auto (samtycke → utkast).
- [ ] **Ordination-godkännande (läkare)** i staff-portal → koppla till journal/behandling (Human-in-the-loop, ej auto-godkänd).

### P3 — Fel & polish (funna avvikelser)

- [ ] `cco-notiser-v3.html`: frontend `/api/v1/cco-notifications/*` → servern monterar `/api/v1/staff/notifications`.
- [ ] `cco-drive-historik-v3.html`: använd riktig route (`src/ops/ccoDriveLinkBuilder.js`) i stället för inline-kopia.
- [ ] `cco-template-fill.html`: pekar på `/api/v1/cco-templates/:id/variables`, `/api/v1/cco-send/render`, `/api/v1/cco-ai/template-draft` — **dessa är nu lagda i server.js** (ORD-111) ✔; verifiera att alla matchar.
- [ ] **Persistens (ORD-110 resten):** flytta GDPR/legal-stores (photo-consents, marketing-consent, dsr, users, agreements…) till `/var/data`; **red ut `cco-customers.json`-duplikatet** (server.js:426 hårdkodad + `config.ccoCustomerStorePath`).

### P4 — Verifiering

- [ ] `test:unit` grön ✔ (fixat de 2 flaky-testerna; nu 7 240 gröna).
- [ ] `smoke:local` · `check:syntax` · `lint:no-bypass` ✔.
- [ ] Vid deploy: `/api/v1/ops/state/manifest` ska visa `cco-templates.json` + `cco-aftercare-jobs.json` under `/var/data`.

---

## C. Styras via portalerna (rekommenderad arkitektur)

**Kundportalen** (offertportal) = kundens transaktionsyta: läsa plan → signera (BankID) → boka uppföljningar → skicka meddelande. **Låses upp per fas** (offert → signerad → op → eftervård). Det är här **kunden styr flödet framåt**.

**Staff-portalen** = operativ yta: arbetskö, ordinationsgranskning (läkare), uppföljningar, preop-checklista, QMS/avvikelser, schemablock. **Personalen driver drift och kvalitet**; kunden ser aldrig intern delegering/ägande.

Målet: inget ska kräva dubbelregistrering — samma CCO-data bärs från kundportalen in i staff-portalen och vidare till journal/ekonomi/eftervård.
