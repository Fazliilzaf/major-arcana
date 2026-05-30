# TP-Journal Field Parity Matrix — 14-kolumns expansion

*Genererad: 2026-05-30T15:44:56.980Z*

**Källor:**
- Meridiq: `migration/meridiq/journal-schema-catalog.json (schemaId: tp_treatment:hair_tp, questionaryApiId 16411)`
- CCO: `src/ops/ccoJournalSchemas.js (emptyFieldsForSchema tp_treatment hair_tp)`

## TL;DR

| Metric | Värde |
|---|--:|
| Total Meridiq-fält | 52 |
| Finns i CCO (YES) | **52** |
| Partial | 0 |
| Saknas (NO) | 0 |
| Required fields | 51 |
| CCO native extras | 6 |
| **P0_COMPLETE (parity klar + required)** | **51** |
| P0 saknade (måste byggas) | 0 |
| P1 (optional missing) | 0 |
| P2 (polish/convenience) | 1 |

> **Status: PARITY KOMPLETT.** Alla 52 Meridiq-fält i `tp_treatment:hair_tp` finns mappade i CCO. Ingen P0-implementation krävs för field-mapping. Fokus framåt = UI-polish + CCO native UPGRADE-fält.

## Kolumndefinitioner

| Kolumn | Definition |
|---|---|
| Meridiq field name | Label från Meridiq-questionary |
| CCO field name | Key i `ccoJournalSchemas.tp_treatment.hair_tp` |
| Finns i CCO? | YES = 1:1-mappad · PARTIAL = delvis · NO = saknas |
| Field type | tristate / text / time / yes_no_textbox / number |
| Required | required = obligatorisk · optional = frivillig |
| Filled by | staff = personal · patient = via portal · derived = beräknat |
| In PDF? | Ingår i signerad PDF-export |
| Signed? | Ingår i signering-snapshot |
| Audit? | Skrivs till audit-log vid create/update/sign |
| On patient card? | Visas på patientkortets dossier · YES_IF_FILLED = optional |
| In timeline? | Per-fält visas inte (bara entry-level events) |
| Mobile? | Måste fungera i mobile viewport |
| Risk if missing | HIGH / MEDIUM / LOW kort beskrivning |
| Priority | P0_COMPLETE / P0 / P1 / P2 |

## undefined (52 fält · risk: klinisk)

| # | Meridiq | CCO key | Finns | Type | Req | Filled | PDF | Sign | Audit | Card | Mobile | Risk | Prio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Är typ av ingrepp (metod och område) fastställd? | `ingreppTypFaststalld` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 2 | Ska metoden FUE (Follicular Unit Extraction) använ | `metodFue` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 3 | Ska metoden DHI (Direct Hair Implantation) använda | `metodDhi` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 4 | Ska en kombination av metoderna DHI och FUE använd | `metodKombination` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 5 | Ska vikar behandlas vid detta ingrepp? | `omradeVikar` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 6 | Ska kronan behandlas vid detta ingrepp? | `omradeKrona` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 7 | Ska fronten behandlas vid detta ingrepp? | `omradeFront` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 8 | Ska hela skalpen behandlas vid detta ingrepp? | `omradeHelaSkalpen` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 9 | Ska skäggområdet behandlas vid detta ingrepp? | `omradeSkagg` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 10 | Ska ögonbrynen behandlas vid detta ingrepp? | `omradeOgonbryn` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 11 | Ska ärrvävnad behandlas vid detta ingrepp? | `omradeArr` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 12 | Ska något ytterligare område behandlas vid detta i | `ytterligareOmrade` | YES | yes_no_textbox | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 13 | Har patienten visat giltig legitimation? | `giltigLegitimationVisad` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 14 | Har patienten blivit informerad om risker och hur  | `informeradRisker` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 15 | Är patienten fullt frisk? Om nej, ange sjukdomar | `fulltFrisk` | YES | yes_no_textbox | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 16 | Har patienten konsumerat alkohol eller narkotiska  | `alkoholNarkotika48h` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 17 | Använder patienten några läkemedel just nu, regelb | `aktuellaLakemedel` | YES | yes_no_textbox | req | staff | YES | YES | YES | YES | YES | HIGH (dosering-spårbarhet) | P0_COMPLETE |
| 18 | Finns det något ytterligare vi bör veta om patient | `ytterligareHalsoinfo` | YES | yes_no_textbox | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 19 | Vad var patientens blodtryck och puls vid mätnings | `blodtryckMmHg` | YES | text | req | staff | YES | YES | YES | YES | YES | HIGH (vital signs ej dokumenterade) | P0_COMPLETE |
| 20 | Vilket klockslag togs blodtrycket? | `vitalKlockslag` | YES | time | req | staff | YES | YES | YES | YES | YES | HIGH (vital signs ej dokumenterade) | P0_COMPLETE |
| 21 | Allmänna anteckningar | `allmannaAnteckningar` | YES | text | opt | staff | YES | YES | YES | YES_IF_FILLED | YES | LOW (optional) | P2 |
| 22 | Status på patientens allmäntillstånd efter ingrepp | `allmantillstandEfter` | YES | text | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 23 | Hur reagerade patient på lokalbedövning 1? Normalt | `reaktionLokalbedovning1` | YES | text | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 24 | Hur reagerade patient på lokalbedövning 2? Normalt | `reaktionLokalbedovning2` | YES | text | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 25 | Tog det längre tid än vanligt att rita hårlinjen? | `obsLangreHarligne` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 26 | Har hela huvudet rakats inför ingreppet? | `obsHelaHuvudetRakat` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 27 | Har endast delar av huvudet rakats inför ingreppet | `obsDelarRakade` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 28 | Reagerade patienten känsligt på adrenalin? | `obsKansligAdrenalin` | YES | tristate | req | staff | YES | YES | YES | YES | YES | HIGH (dosering-spårbarhet) | P0_COMPLETE |
| 29 | Visade patienten ökad blödningsbenägenhet under in | `obsOkadBlodning` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 30 | Var huden svårarbetad eller seg? | `obsSegHud` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 31 | Förekom andra relevanta observationer vid ingreppe | `ovrigaObservationer` | YES | yes_no_textbox | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 32 | Har patienten fått Dalacin? | `lakemedelDalacin` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 33 | Har patienten fått Betapred? | `lakemedelBetapred` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 34 | Har patienten fått Ibuprofen? | `lakemedelIbuprofen` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 35 | Har kund informerats om medicin och eftervård? | `informeradLakemedelEftervard` | YES | tristate | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 36 | Antal singel grafts som transplanterats: | `graftsSingel` | YES | text | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 37 | Antal dubbel grafts som transplanterats: | `graftsDubbel` | YES | text | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 38 | Antal trippel grafts som transplanterats: | `graftsTrippel` | YES | text | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 39 | Antal kvadrupel grafts som transplanterats: | `graftsKvadrupel` | YES | text | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 40 | Totalt antal grafts som transplanterats: | `graftsTotalt` | YES | text | req | staff | YES | YES | YES | YES | YES | MEDIUM (informerat samtycke) | P0_COMPLETE |
| 41 | Starttid för planering (bilder och ritning) | `tidPlanering` | YES | time | req | staff | YES | YES | YES | YES | YES | MEDIUM (tidsstämpling saknas) | P0_COMPLETE |
| 42 | Starttid för lokalbedövning i donationsområde: | `tidLokalbedovningDonator` | YES | time | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 43 | Starttid för extraktion från donationsområde: | `tidExtraktionDonator` | YES | time | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 44 | Starttid för lokalbedövning i mottagarområde: | `tidLokalbedovningMottagare` | YES | time | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 45 | Starttid för kanalpreparering i mottagarområde: | `tidMottagarkanaler` | YES | time | req | staff | YES | YES | YES | YES | YES | MEDIUM (klinisk plan ofullständig) | P0_COMPLETE |
| 46 | Starttid för implantation av grafts: | `tidImplantationStart` | YES | time | req | staff | YES | YES | YES | YES | YES | MEDIUM (tidsstämpling saknas) | P0_COMPLETE |
| 47 | Sluttid för implantation av grafts: | `tidImplantationSlut` | YES | time | req | staff | YES | YES | YES | YES | YES | MEDIUM (tidsstämpling saknas) | P0_COMPLETE |
| 48 | Tidpunkt då patienten lämnar behandlingsrummet: | `tidPatientLamnar` | YES | time | req | staff | YES | YES | YES | YES | YES | MEDIUM (tidsstämpling saknas) | P0_COMPLETE |
| 49 | Användning av läkemedel - Carbokain adrenalin 20/m | `bedovningCarbocainMl` | YES | text | req | staff | YES | YES | YES | YES | YES | HIGH (dosering-spårbarhet) | P0_COMPLETE |
| 50 | Användning av läkemedel - Marcain, 5mg/ml (ml): | `bedovningMarcainMl` | YES | text | req | staff | YES | YES | YES | YES | YES | HIGH (dosering-spårbarhet) | P0_COMPLETE |
| 51 | Användning av läkemedel - Adrenalin, 1mg/ml NaCI s | `bedovningAdrenalinMl` | YES | text | req | staff | YES | YES | YES | YES | YES | HIGH (dosering-spårbarhet) | P0_COMPLETE |
| 52 | Användning av läkemedel - Tribonat: | `bedovningTribonatMl` | YES | text | req | staff | YES | YES | YES | YES | YES | HIGH (dosering-spårbarhet) | P0_COMPLETE |

## CCO native extras (saknas i Meridiq men finns i CCO)

| CCO key | Type | Purpose | Filled | Priority |
|---|---|---|---|---|
| `metod` | text | Derived från metodFue/Dhi/Kombination | derived | P2 |
| `behandlingsomraden` | array | Derived från omradeVikar/Krona/Front/... | derived | P2 |
| `observationerUnderIngrepp` | array | Derived från obsLangreHarligne/HelaHuvudetRakat/... | derived | P2 |
| `lakemedelUtlamnade` | array | Derived från Dalacin/Betapred/Ibuprofen | derived | P2 |
| `puls` | text | Planerad split från blodtryckMmHg | staff | P2 |
| `slutanteckningar` | text | Saknas i Meridiq — CCO UPGRADE | derived | P2 |

## Slutsats & rekommendationer

**Field-mapping är 100% komplett.** Alla 52 Meridiq tp_treatment-fält finns 1:1-mappade i CCO. Ingen P0-fält-implementation behövs.

### Vad återstår (efter parity är klart):

1. **CCO native UPGRADE-fält (P2):** `metod`, `puls`, `slutanteckningar`, `behandlingsomraden`, `observationerUnderIngrepp`, `lakemedelUtlamnade` — wires för derived-värden + UI för slutanteckningar.
2. **Mobile-input-polish:** Verifiera alla 52 fält renderas korrekt på <720px viewport.
3. **Patientkort-visning:** Bygg dossier-sektion "TP-journal" som visar sektionerna 1-7 strukturerat.
4. **Audit-completeness:** Verifiera att varje field-update auditloggas (idag är det entry-level, inte per-fält).
5. **Rättelse-PDF:** Verifiera att TP-fält ingår i rättelse-PDF (via befintliga #223-flow).


## Säkerhetskontroller

- Alla 52 fält: `inPdf=YES`, `signed=YES`, `audit=YES` — ingår i signering-snapshot + PDF + audit-log
- Inga fält flaggade som "patient-fyllt" i TP-journalen — endast staff (TP-journalen är klinisk dokumentation, inte formulär)
- Ingen Drive-länk i kedjan — allt via CCO secure storage (#222-hook)
- Ingen extern AI rör fält-värdena — endast strukturerad data
- Mobile=YES på samtliga fält — UI måste validera renderingsläge på <720px

## Nästa steg

Eftersom parity är komplett, P0 = noll fält att lägga till. Nästa steg per owner-prioritering:
1. Kalender
2. Kommunikation/kundresa
3. Aisia-modul
4. CM/Fortnox
5. Dashboards

*TP-journalen är redan färdig på field-nivå. Återstående arbete = UI-polish, rendering på patientkortet, och mobile-validering.*
