# Journal-datamodell, Hair TP Clinic bokningssystem

Underlag för journalföringen i Fazlis egna bokningssystem (Major Arcana / CCO). **Meridiq hålls utanför**, det egna systemet äger journalen.

Källor: originalmallarna i SharePoint (`hairtpclinic1.sharepoint.com /sites/Ledning/.../1. Kunddokument - KVALITETSSÄKRA/2. Hair TP Clinic 2026/`):
- `1. Hälsodeklaration TP, PRP, Microneedling PRF.docx`
- `5. Friskförsäkran TP 2025.docx`
- `6. TP Journal – Behandling FÖRSLAG.docx`
- `Journalföring och dokumentationrutiner.docx` (lagkrav)

Sammanställt 2026-05-21.

---

## 1. Arkitektur, hur journalen hänger ihop med bokningen

```
Patient (1) ──< Bokning/Behandling (n) ──< Journalpost (n)
                                           ├─ Hälsodeklaration   (patient fyller i, vid konsultation)
                                           ├─ Friskförsäkran     (patient + personal, inför ingrepp)
                                           └─ Behandlingsjournal (personal, vid/efter ingrepp: TP eller PRP)
                                           └─ Eftervård/uppföljning (personal, månad 4/8/12)
```

- **Patient** är masterentiteten (unik på personnummer). Allt annat hänger på patient-id.
- **Bokning/Behandling** är ett behandlingstillfälle (kopplat till tjänst: TP/PRP/Microneedling, datum, behandlare).
- **Journalpost** är en versionerad, signerad post kopplad till patient + behandlingstillfälle. Olika typer (hälsodeklaration, friskförsäkran, behandlingsjournal, uppföljning).
- En journalpost ska vara **oföränderlig efter signering** (rättelser görs som ny daterad post/tillägg, aldrig överskrivning, enligt patientdatalagen).

---

## 2. Entiteter och fält

### 2.1 Patient
| Fält | Typ | Obl. | Not |
| --- | --- | --- | --- |
| id | uuid | ja | internt |
| förnamn | text | ja | |
| efternamn | text | ja | |
| personnummer | text (ÅÅÅÅMMDD-XXXX) | ja | unik nyckel |
| adress, postnummer, postort | text | nej | |
| epost | text | nej | |
| telefon | text | nej | |
| längd_cm, vikt_kg | number | nej | |
| skapad, senast_ändrad | timestamp | ja | |

### 2.2 Hälsodeklaration (patient fyller i vid konsultation)
Exakt enligt SharePoint-mallen. Fälttyper: `janej` = Ja/Nej, flera har följdtext vid Ja.
- Röker/nikotin (cigaretter, snus, vape) — janej
- Hjärt-/kärlsjukdom — janej + text (vilken)
- Högt blodtryck — ja/nej/vet ej
- Blodsmitta/blodöverförbar sjukdom — janej + text
- Övriga sjukdomar — janej + text
- Läkemedel — janej + text (namn, styrka, dos)
- Allergisk mot läkemedel — janej + text
- **Blodförtunnande läkemedel** — janej
- **Omega 3 / fiskolja / kosttillskott som påverkar blödning** — janej
- **Rullstol / hjälpmedel** — janej
- **Gravid / ammar** — janej
- **Övrigt om hälsan** — text
- Särskilda önskemål (hår/hud/båda) — text
- Hur kom du i kontakt med oss — text
- Datum — date
- Samtycke: datalagring (patientdatalagen + GDPR) + ev. mailutskick — boolean

> De fyra fetmarkerade + "övrigt" stod som "Dessa saknas" i mallen, dvs. ska ingå.

### 2.3 Friskförsäkran (patient intygar + personal bekräftar, inför ingrepp)
- **ID-kontroll**: legitimationstyp (Pass / Körkort / Nationellt ID / Svenskt ID) + ID-nummer
- Personuppgifter: förnamn, efternamn, personnummer, adress
- **Hälsotillstånd** (intygar fullt frisk; kryssa de tillstånd man HAR): Hepatit A/B/C, HIV, Blödningsrubbning, Läkemedelsallergi, Astma, Epilepsi, Hjärtbesvär, Diabetes (typ 1/2), Lever-/Njursjukdom, Tidigare narkos-/lokalbedövningskomplikation, Pågående infektion/feber, Psykisk ohälsa, Annan sjukdom (text)
- **Medicinering**: ingen / följande (namn, dosering, orsak); specifikt blodförtunnande (Warfarin/NOAK/ASA); annat
- **Allergier**: inga kända / läkemedelsallergi (text) / övriga (latex, födoämnen)
- **Alkohol/nikotin/narkotika**: ej alkohol/narkotika 48h före+efter (bekräftelse); röker/nikotin (med resultat-disclaimer); använder ej nikotin
- **Samtycke**: informerat samtycke (tagit del av info, ställt frågor, samtycker), datalagring
- **Signaturer**: Patient (namn, signatur, datum) + Mottagande personal (namn, signatur, datum)

### 2.4 Behandlingsjournal TP (personal, vid/efter ingrepp), 38 fält enligt mallen
**Ingrepp:** typ fastställd (janej); metod (DHI / FUE / kombination); behandlingsområden (Vikar/Krona/Front/Full skalp/Skägg/Ögonbryn/Ärr/Övrigt); ytterligare områden (text).
**Pre-kontroll:** giltig legitimation visad; informerad om risker/genomförande; fullt frisk?; alkohol/narkotika senaste 48h?; aktuella läkemedel?; ytterligare relevant hälsoinfo (text).
**Vitalparametrar:** blodtryck (mmHg) + puls (slag/min); klockslag för mätning.
**Anteckningar:** allmänna anteckningar (text).
**Under/efter ingrepp:** allmäntillstånd efter (Normalt / Medtagen-Trött); reaktion efter lokalbedövning 1 (Normalt/Känslig); reaktion efter lokalbedövning 2; observationer under ingreppet (flerval: tog längre tid att rita hårlinje, hela skalpen rakad, delar rakade, känslig för adrenalin, ökad blödningsbenägenhet, seg/svårarbetad hud, övrigt); övriga observationer (text).
**Läkemedel:** utlämnade till patient (Dalacin / Betapred / Ibuprofen); informerad om läkemedel + eftervård (janej).
**Grafts:** antal singel / dubbel / trippel / kvadrupel; **totalt antal grafts**.
**Tidsstämplar:** planering (foto+inritning), lokalbedövning donator, extraktion donator, lokalbedövning mottagar, mottagarkanaler, implantation start, implantation slut, patienten lämnar rummet.
**Bedövningsmängder (ml):** Carbocain® (mepivakain m. adrenalin 20 mg/ml); Marcain® (bupivakain m. adrenalin 5 mg/ml); adrenalin 1 mg/ml i NaCl; Tribonat® (buffert).
**Slutanteckning:** övriga anteckningar (text).

### 2.5 Behandlingsjournal PRP (personal), härledd, ingen separat originalmall hittad
Område (Hår/Hud-ansikte/hals/dekolletage/händer/Skägg); datum; behandling i serien (t.ex. 1 av 4); antal blodrör / mängd PRP; teknik (injektion / microneedling+PRP / dermapen); bedövning (janej + typ); vitalparametrar vid behov; läkemedel; komplikationer/anmärkningar; eftervårdsråd givna; behandlare. **Verifiera mot ev. PRP-journalmall i SharePoint innan bygge.**

### 2.6 Uppföljning (personal, månad 4/8/12 enligt patientinformationen)
Datum; tillfälle (mån 4/8/12); bedömning (läkning, tillväxt, täthet, hårfäste); bilder; åtgärd/plan; behandlare.

---

## 3. Patientdatalag-krav som datamodellen/modulen MÅSTE bära
(patientdatalagen 2008:355 + HSLF-FS 2016:40, se `Journalföring och dokumentationrutiner.docx`)

1. **Rollbaserad behörighet** per användare (4 kap. 1-3 §§), bara klinisk personal når journal.
2. **Åtkomstlogg** på varje läsning/ändring (vem, vad, när), 4 kap. 3 + 9-12 §§. Sparas separat och kan granskas (loggkontroll).
3. **Oföränderlighet + signering**: journalpost låses vid signering; rättelse = ny daterad post, ursprunglig bevaras.
4. **Bevarande 10 år** efter senaste anteckning.
5. **EU/EES-lagring** (Render Frankfurt), kryptering i vila och transport.
6. **Säkerhetskopiering** regelbundet (12 §) + driftdokumentation.
7. **Patientens rättigheter**: utdrag/läskopia, spärr; process kopplad till patient-id.
8. **Inget journalinnehåll till OpenAI / tredjelands-AI.**
9. Varje post bär: patient-id, behandlingstillfälle-id, författare (namn + roll/leg), tidsstämpel.

---

## 4. CCO-arkitektur (kartlagd 2026-05-21) + integrationsplan

**Mönster i major-arcana CCO:**
- **Routrar** är factory-funktioner (`createCcoXRouter({ store, authStore, config })`), mountade i `server.js` (~rad 1613-1690) med stores injicerade.
- **Stores** ligger i `src/ops/` och persisteras som **JSON-filer på den persistenta disken** (`ARCANA_STATE_ROOT` = `/var/data` på Render). Mönster: `emptyState()` → `readJson(filePath)` → muterar → `writeJsonAtomic()`. Se `ccoConsultationStore.js`, `ccoAftercareStore.js`.
- **Auth + kontext**: `resolveCcoRouteActor()` + `buildCcoRouteContext()` (i `ccoRouteShared.js`) löser ut actor/tenant/workspace/customer från requesten. Session + MFA via `authStore`.
- **Åtkomstlogg**: `authStore.addAuditEvent({ action, targetType, targetId, ... })` anropas i varje route, detta ÄR patientdatalag-loggen (4 kap.).
- **Roller**: `src/security/roles.js` → `ROLE_OWNER / ROLE_STAFF / ROLE_PATIENT`.
- **Patient360**: ett master-patientregister; konsultationer/eftervård synkar in via `ccoPatient360Bridge` (`syncPatient360FromConsultationCase/...FromAftercareCase`).
- **Arbetsytan** (`ccoWorkspace.js`) är intern ("Endast synlig för teamet · Aldrig för kund") och renderar readouts + köer + paneler för konsultation och eftervård.

**Så hakar TP-journalen i (speglar ccoConsultations + ccoAftercare):**
1. **`src/ops/ccoJournalStore.js`** – ny store, JSON på state-disken, `ensureCase/upsertCase` med de 38 TP-fälten (avsnitt 2.4) + event-timeline + **lås vid signering** (rättelse = ny daterad event, aldrig överskrivning).
2. **`src/routes/ccoJournal.js`** – `createCcoJournalRouter(...)`, `GET/PUT /cco-journal/case` via `handle()` + `resolveCcoRouteActor` + `addAuditEvent` (logg). **Rollspärr** ROLE_STAFF/ROLE_OWNER.
3. **`ccoPatient360Bridge`** – ny `syncPatient360FromJournalCase` så journalen syns i patient360.
4. **`ccoWorkspace.js`** – `buildJournalReadout` + en "Behandlingsjournal"-panel där personalen fyller i TP-fälten (personalspärrad).
5. **`server.js`** – mounta `createCcoJournalRouter` bredvid de andra, injicera `ccoJournalStore`.

**Inget extra behövs för:** behörighet, åtkomstlogg, EU-lagring (Render-disk, verifiera Frankfurt-region), patient-koppling, session/MFA, allt finns redan.

**Att verifiera innan/under bygge:** Render-tjänstens region (EU), exakt PRP-journalmall (bara TP hittades), och din egen designdoc "BOOK Systemets CCO" (Arcana.one, OneNote, gick ej att läsa via API).

## 5. Sync av interima webbformulär
- `/screen` (hälsodeklaration) matchar redan avsnitt 2.2.
- `/friskforsakran` ombyggd 2026-05-21 efter originalmallen (avsnitt 2.3).
- Fältnamnen där bör hållas kompatibla med modellen för smidig migrering in i journalmodulen.
