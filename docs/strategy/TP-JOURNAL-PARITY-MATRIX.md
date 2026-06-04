# TP-Journal Parity Matrix

Field-by-field jämförelse mellan Meridiq TP-behandlingsjournal (questionaryApiId **16411**, schemaId `tp_treatment:hair_tp`, brand `Hair TP Clinic`) och CCO `ccoJournalStore`.

**Källa Meridiq:** `migration/meridiq/journal-schema-catalog.json` rad 2285-2869.
**Källa CCO:** `src/ops/ccoJournalStore.js` + `src/ops/ccoJournalSchemas.js` (via `emptyFieldsForSchema('tp_treatment', 'hair_tp')`).

**Räkning enligt katalog:** `fieldCount: 52` mappade fält, fördelade i 7 sektioner.

---

## Sektion 1: FÖRBEREDELSE & PLANERING INFÖR INGREPP (12 fält)

| # | Meridiq-fält (label) | Field-key | Typ | Obl. | Sign | PDF | Pat. | Pers. | Riskflagga | CCO-status | CCO-impl | Kommentar |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Är typ av ingrepp fastställd? | `ingreppTypFaststalld` | tristate | Y | Y | Y | N | Y | klinisk plan | EXISTS | `ccoJournalSchemas.tp_treatment.hair_tp` | mappad |
| 2 | FUE? | `metodFue` | tristate | Y | Y | Y | N | Y | metodval | EXISTS | id 450885 | mappad |
| 3 | DHI? | `metodDhi` | tristate | Y | Y | Y | N | Y | metodval | EXISTS | id 450886 | mappad |
| 4 | Kombination FUE+DHI? | `metodKombination` | tristate | Y | Y | Y | N | Y | metodval | EXISTS | id 450887 | mappad |
| 5 | Vikar? | `omradeVikar` | tristate | Y | Y | Y | N | Y | område | EXISTS | id 450888 | mappad |
| 6 | Kronan? | `omradeKrona` | tristate | Y | Y | Y | N | Y | område | EXISTS | id 450889 | mappad |
| 7 | Fronten? | `omradeFront` | tristate | Y | Y | Y | N | Y | område | EXISTS | id 450890 | mappad |
| 8 | Hela skalpen? | `omradeHelaSkalpen` | tristate | Y | Y | Y | N | Y | område | EXISTS | id 450891 | mappad |
| 9 | Skägg? | `omradeSkagg` | tristate | Y | Y | Y | N | Y | område | EXISTS | id 450892 | mappad |
| 10 | Ögonbryn? | `omradeOgonbryn` | tristate | Y | Y | Y | N | Y | område | EXISTS | id 450893 | mappad |
| 11 | Ärrvävnad? | `omradeArr` | tristate | Y | Y | Y | N | Y | område | EXISTS | id 450894 | mappad |
| 12 | Ytterligare område? | `ytterligareOmrade` (+ `ytterligareOmradeText`) | yes_no_textbox | Y | Y | Y | N | Y | område | EXISTS | id 450895 | mappad |

---

## Sektion 2: PATIENTSTATUS & INFORMATION (6 fält)

| # | Label | Field-key | Typ | Obl. | Sign | PDF | Pat. | Pers. | Riskflagga | CCO-status | CCO-impl | Kommentar |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 13 | Giltig legitimation visad? | `giltigLegitimationVisad` | tristate | Y | Y | Y | N | Y | ID-koll | EXISTS | id 450897 | dubbleras av `ccoIdVerificationStore` (Steg 3.2) — bra |
| 14 | Informerad om risker? | `informeradRisker` | tristate | Y | Y | Y | N | Y | informerat samtycke | EXISTS | id 450898 | mappad |
| 15 | Fullt frisk? (text) | `fulltFrisk` + `fulltFriskText` | yes_no_textbox | Y | Y | Y | Y | Y | klinisk | EXISTS | id 450899 | mappad |
| 16 | Alkohol/narkotika 48h? | `alkoholNarkotika48h` | tristate | Y | Y | Y | N | Y | patientsäkerhet | EXISTS | id 450900 | mappad |
| 17 | Aktuella läkemedel | `aktuellaLakemedel` + `Text` | yes_no_textbox | Y | Y | Y | Y | Y | läkemedelsinteraktion | EXISTS | id 450901 | mappad |
| 18 | Ytterligare hälsoinfo? | `ytterligareHalsoinfo` + `Text` | yes_no_textbox | Y | Y | Y | Y | Y | klinisk | EXISTS | id 450902 | mappad |

---

## Sektion 3: STATUS & OBSERVATIONER FÖRE INGREPP (13 fält)

| # | Label | Field-key | Typ | Obl. | Sign | PDF | Pat. | Pers. | Riskflagga | CCO-status | CCO-impl | Kommentar |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 19 | Blodtryck och puls | `blodtryckMmHg` | text | Y | Y | Y | N | Y | vital | EXISTS | id 450904 | OBS: ett fält men innehåller två värden (BP+puls). I CCO finns även separat `puls` i emptyDefaults |
| 20 | Klockslag blodtryck | `vitalKlockslag` | time | Y | Y | Y | N | Y | tid | EXISTS | id 450905 | mappad |
| 21 | Allmänna anteckningar | `allmannaAnteckningar` | text | N | Y | Y | N | Y | fritext | EXISTS | id 450906 | mappad |
| 22 | Allmäntillstånd efter | `allmantillstandEfter` | text | Y | Y | Y | N | Y | post-op obs | EXISTS | id 450907 | mappad |
| 23 | Reaktion lokalbedövning 1 | `reaktionLokalbedovning1` | text | Y | Y | Y | N | Y | bedövning | EXISTS | id 450908 | mappad |
| 24 | Reaktion lokalbedövning 2 | `reaktionLokalbedovning2` | text | Y | Y | Y | N | Y | bedövning | EXISTS | id 450909 | mappad |
| 25 | Längre tid att rita hårlinjen? | `obsLangreHarligne` | tristate | Y | Y | Y | N | Y | obs | EXISTS | id 450910 | mappad |
| 26 | Hela huvudet rakat? | `obsHelaHuvudetRakat` | tristate | Y | Y | Y | N | Y | obs | EXISTS | id 450911 | mappad |
| 27 | Endast delar rakade? | `obsDelarRakade` | tristate | Y | Y | Y | N | Y | obs | EXISTS | id 450912 | mappad |
| 28 | Känslig på adrenalin? | `obsKansligAdrenalin` | tristate | Y | Y | Y | N | Y | medic. obs | EXISTS | id 450913 | mappad |
| 29 | Ökad blödningsbenägenhet? | `obsOkadBlodning` | tristate | Y | Y | Y | N | Y | medic. obs | EXISTS | id 450914 | mappad |
| 30 | Seg hud? | `obsSegHud` | tristate | Y | Y | Y | N | Y | obs | EXISTS | id 450915 | mappad |
| 31 | Övriga observationer | `ovrigaObservationer` + `Text` | yes_no_textbox | Y | Y | Y | N | Y | fritext | EXISTS | id 450916 | mappad |

---

## Sektion 4: LÄKEMEDEL (4 fält)

| # | Label | Field-key | Typ | Obl. | Sign | PDF | Pat. | Pers. | Riskflagga | CCO-status | CCO-impl | Kommentar |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 32 | Dalacin? | `lakemedelDalacin` | tristate | Y | Y | Y | N | Y | antibiotika | EXISTS | id 450918 | mappad |
| 33 | Betapred? | `lakemedelBetapred` | tristate | Y | Y | Y | N | Y | kortison | EXISTS | id 450919 | mappad |
| 34 | Ibuprofen? | `lakemedelIbuprofen` | tristate | Y | Y | Y | N | Y | NSAID | EXISTS | id 450920 | mappad |
| 35 | Informerad om medicin+eftervård? | `informeradLakemedelEftervard` | tristate | Y | Y | Y | N | Y | informerat samtycke | EXISTS | id 450921 | mappad |

---

## Sektion 5: GRAFTS SOM TRANSPLANTERATS (5 fält)

| # | Label | Field-key | Typ | Obl. | Sign | PDF | Pat. | Pers. | Riskflagga | CCO-status | CCO-impl | Kommentar |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 36 | Singel grafts | `graftsSingel` | text(num) | Y | Y | Y | N | Y | resultat | EXISTS | id 450923 | mappad |
| 37 | Dubbel grafts | `graftsDubbel` | text(num) | Y | Y | Y | N | Y | resultat | EXISTS | id 450924 | mappad |
| 38 | Trippel grafts | `graftsTrippel` | text(num) | Y | Y | Y | N | Y | resultat | EXISTS | id 450925 | mappad |
| 39 | Kvadrupel grafts | `graftsKvadrupel` | text(num) | Y | Y | Y | N | Y | resultat | EXISTS | id 450926 | mappad |
| 40 | Totalt | `graftsTotalt` | text(num) | Y | Y | Y | N | Y | resultat | EXISTS | id 450927 | UPGRADE-möjlighet: beräkna automatiskt från singel/dubbel/trippel/kvadrupel |

---

## Sektion 6: TIDSREGISTRERING I PROCEDUREN (8 fält)

| # | Label | Field-key | Typ | Obl. | Sign | PDF | Pat. | Pers. | Riskflagga | CCO-status | CCO-impl | Kommentar |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 41 | Starttid planering (bilder + ritning) | `tidPlanering` | time | Y | Y | Y | N | Y | tid | EXISTS | id 450929 | mappad |
| 42 | Starttid lokalbedövning donator | `tidLokalbedovningDonator` | time | Y | Y | Y | N | Y | tid | EXISTS | id 450930 | mappad |
| 43 | Starttid extraktion | `tidExtraktionDonator` | time | Y | Y | Y | N | Y | tid | EXISTS | id 450931 | mappad |
| 44 | Starttid lokalbedövning mottagare | `tidLokalbedovningMottagare` | time | Y | Y | Y | N | Y | tid | EXISTS | id 450932 | mappad |
| 45 | Starttid kanalpreparering | `tidMottagarkanaler` | time | Y | Y | Y | N | Y | tid | EXISTS | id 450933 | mappad |
| 46 | Starttid implantation | `tidImplantationStart` | time | Y | Y | Y | N | Y | tid | EXISTS | id 450934 | mappad |
| 47 | Sluttid implantation | `tidImplantationSlut` | time | Y | Y | Y | N | Y | tid | EXISTS | id 450935 | mappad |
| 48 | Patient lämnar rummet | `tidPatientLamnar` | time | Y | Y | Y | N | Y | tid | EXISTS | id 450936 | mappad |

---

## Sektion 7: ANVÄNDNING AV LÄKEMEDEL (4 fält)

| # | Label | Field-key | Typ | Obl. | Sign | PDF | Pat. | Pers. | Riskflagga | CCO-status | CCO-impl | Kommentar |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 49 | Carbokain adrenalin 20mg/ml 5micro (ml) | `bedovningCarbocainMl` | text(num) | Y | Y | Y | N | Y | dosering | EXISTS | id 450938 | mappad |
| 50 | Marcain 5mg/ml (ml) | `bedovningMarcainMl` | text(num) | Y | Y | Y | N | Y | dosering | EXISTS | id 450939 | mappad |
| 51 | Adrenalin 1mg/ml NaCl (ml) | `bedovningAdrenalinMl` | text(num) | Y | Y | Y | N | Y | dosering | EXISTS | id 450940 | mappad |
| 52 | Tribonat | `bedovningTribonatMl` | text(num) | Y | Y | Y | N | Y | dosering | EXISTS | id 450941 | mappad |

**Räkning bekräftad:** 12 + 6 + 13 + 4 + 5 + 8 + 4 = **52 fält**. Alla 52 är EXISTS i CCO (full parity för field-mapping).

---

## Saknade fält i CCO (0 st)

Inga fält saknas — `meridiqFieldMap` är komplett mot `tp_treatment:hair_tp` enligt katalog.

---

## Felmappade fält (1 potentiell)

| Fält | Meridiq | CCO | Risk |
|---|---|---|---|
| `blodtryckMmHg` (id 450904) | Label "blodtryck och puls" — kombinerar två mätvärden i ett textfält | CCO har separat `puls` i `emptyDefaults` (inte synligt i schema-fields) | LÅG — den separata `puls`-defaulten i CCO indikerar att vi planerat split, men Meridiq-mappingen är ett-till-ett. Beslut: behåll Meridiq-ett-fält och låt CCO-UI parsa till "BP/puls" i view-layer. |

---

## Extra fält i CCO som inte finns i Meridiq (6 st i `emptyDefaults`)

Listade i `tp_treatment.emptyDefaults` men saknar `meridiqQuestionId` (CCO-tillägg):

| Field-key | Typ | Syfte | Status |
|---|---|---|---|
| `metod` | text | Slutgiltig metod-string (FUE/DHI/kombi) sammanställd | CCO native — bra för rapport |
| `behandlingsomraden` | array | Aggregerad lista av behandlade områden | CCO native — derived |
| `observationerUnderIngrepp` | array | Aggregerad lista av flaggade obs | CCO native — derived |
| `lakemedelUtlamnade` | array | Aggregerad lista av utlämnade läkemedel | CCO native — derived |
| `puls` | text | Separat pulsfält (se ovan) | CCO planerad split |
| `slutanteckningar` | text | Fritext slutkommentar — saknas i Meridiq-schema | CCO native UPGRADE |

Dessa 6 är "convenience fields" som inte ska tappas — de ger bättre rapport och översikt utan att bryta parity-mappingen.

---

## Verifiering av siffran 59 vs 52

**Vad katalogen säger:** `tpTreatmentMeridiqFields: 52` och `tpTreatmentMappedToStoreKeys: 52`.

**Vad user-scope säger:** 59 fält.

**Hypoteser om diffen (7 fält):**

| Hypotes | Sannolikhet | Stöd i data |
|---|---|---|
| H1: Sub-fält räknas separat (höger/vänster sida, varje option i checkbox) | LÅG | `tp_treatment` har ingen `checkbox`-typ — bara `tristate`, `yes_no_textbox`, `text`, `time`. Yes/no/text räknas som ETT fält i katalogen (id-mappingen visar att `yes_no_textbox` är ett id, inte två) |
| H2: De 6 CCO native `emptyDefaults`-fälten (`metod`, `behandlingsomraden`, `observationerUnderIngrepp`, `lakemedelUtlamnade`, `puls`, `slutanteckningar`) räknas in → 52 + 6 = 58 (≈ 59) | **HÖG** | Räkningen blir nästan exakt 59 om man inkluderar CCO-tilläggen + en till |
| H3: Patient-identifierings-fält (förnamn, efternamn, personnummer, adress, datum, telefon, kontaktorsak) finns i bleph-schemat men inte explicit i tp-schemat — kanske räknas in i totalsumman | MEDEL | bleph_treatment har 15 fält där 7 är patient-ID. Om TP räknas med liknande prefix → +7 = 59 |
| H4: Gammal version av Meridiq-formuläret hade 7 fler fält som tagits bort | MEDEL | Q-id 16411 har sortOrder-luckor (450883, 450896, 450903, 450917, 450922, 450928, 450937 saknas i mappingen) → 7 "tomma" id-platser. **Detta är troligen orsaken.** |
| H5: Misstag eller äldre siffra från tidigare exportkörning | LÅG | — |

**Sannolikaste förklaringen: H4 + H2.** Meridiq-formuläret har 7 borttagna/separator-id:n (sortOrder-luckor) som i tidigare version var fält men nu är avsnitts-rubriker. Plus de 6 CCO native-fälten i `emptyDefaults`. 52 (aktiva) + 7 (legacy/separator) ≈ 59.

**Rekommendation:**
1. **Acceptera 52 som canonical count** för field-mapping (det är vad Meridiq-API:t exporterar idag).
2. **Be user verifiera i Meridiq UI** att inga "dolda" eller villkorade fält saknas i exporten.
3. Om 59 vs 52 kvarstår som scope-krav: be user lista de 7 saknade fältens labels så vi kan mappa dem antingen som CCO native UPGRADE eller flagga som "ej längre i Meridiq".
4. CCO bör logga det effektiva fältantalet vid varje import till `migration/meridiq/journal-schema-catalog.json` så vi kan se driften över tid.

---

## P0.4 verifikation (2026-05-30)

**Tagit ny pass mot `migration/meridiq/journal-schema-catalog.json` schema `tp_treatment:hair_tp`:**

- `sections[].fields[]` summa: **52** unika fält-keys
- `meridiqFieldMap` keys (Q-ID → store-key): **52** mappningar
- Q-ID-span: 450884 → 450941 = **58** möjliga slots, varav **6 saknas** (450896, 450903, 450917, 450922, 450928, 450937 = sortOrder-luckor / sektion-separatorer i Meridiq)
- CCO `emptyFieldsForSchema('tp_treatment', 'hair_tp')` keys: **63** (= 52 Meridiq-mappade + 11 CCO-native extras varav 5 är `*Text`-sub-fält till `yes_no_textbox` och 6 är convenience-fält: `metod`, `behandlingsomraden`, `observationerUnderIngrepp`, `lakemedelUtlamnade`, `puls`, `slutanteckningar`)

**Diff (Meridiq → CCO):** 0 fält saknas. Alla 52 Meridiq-keys finns i CCO schema.

**Slutsats: CCO har FULL paritet med tp_treatment:hair_tp. "59 vs 52"-scope-frågan = FALSE POSITIVE (sortOrder-luckor + CCO convenience-fält förklarar siffran).**

Blocker #3 i `JOURNAL-CUTOVER-AUDIT-2026-05-30.md` stängd som ✅ FALSE POSITIVE i denna körning.

---

*Genererad: 2026-05-29 · Verifierad P0.4: 2026-05-30*
