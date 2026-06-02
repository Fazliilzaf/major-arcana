# CCO Journalföring Readiness Report

_Genererad: 2026-06-02 · uppdaterad efter Journalföring Readiness Fix_  
_Miljö: Frankfurt prod (`arcana.hairtpclinic.com`) + read-only prod-data snapshot (`Migration-data/cco-prod`)_  
\*Spår: Cursor — import/write/data · Mail enrichment **pausad\***  
\*CF / Aisia / Claude consumer: **ej scope\***

---

## Executive answer

| Fråga                                                                             | Svar                                                                               |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Kan personal börja journalföra?**                                               | **JA — via kundkort (`kunder.html`) + journal-quick API**                          |
| **Kan personal använda fullt patientkort (tidslinje + formulär + all historik)?** | **JA — med kända begränsningar (se nedan)**                                        |
| **Rekommenderad start**                                                           | Kontrollerad pilot dag 1 med utbildad personal; eskalera osäker identitet till ops |

---

## Fix-spår (2026-06-02) — sammanfattning

| Punkt                   | Resultat                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Root cause**          | CF-deploy `e88a0974` tog bort journal-blocket i `server.js` (journal-feed, journal-timeline, cco-forms). Prod loggade endast `{timeline\|agreements}`. |
| **Deploy**              | `e3a4d51d` live (`dep-d8fce3h9rddc73cis350`)                                                                                                           |
| **Routes fixed**        | `GET /api/v1/cco-customers/:id/journal-feed` · `journal-timeline` · `POST/GET /api/v1/cco-forms/*`                                                     |
| **Runtime dependency**  | `src/ops/ccoAssetNaming/*` committad (`3850fc93`) — krävs av feed/timeline handlers                                                                    |
| **Startup-logg (prod)** | `[cco-customer-deep] monterad: …{timeline\|agreements\|journal-feed\|journal-timeline}` + `[cco-forms] monterad`                                       |
| **Smoke-test prod**     | **PASS** — se avsnitt _End-to-end smoke_                                                                                                               |

---

## End-to-end smoke (prod, 2026-06-02)

Anonym testpatient `cco-readiness-smoke-*` (ingen riktig patientdata i rapport):

| Steg                                  | Resultat                                             |
| ------------------------------------- | ---------------------------------------------------- |
| Skapa journal (consultation_plan)     | PASS                                                 |
| Signera / låsa original               | PASS (`locked=true`)                                 |
| Rättelse som ny post                  | PASS (`correctionOfEntryId` satt)                    |
| Signera rättelse                      | PASS                                                 |
| `GET …/journal-feed`                  | **200** — 2 poster (`cco_journal`)                   |
| `GET …/journal-timeline`              | **200** — 6 events, 2 signed, 1 correction, 1 thread |
| `GET …/cco-forms/patient/:id/missing` | **200**                                              |
| `GET …/cco-journal-quick/entries`     | 2 poster, båda låsta                                 |

**RBAC-notis:** journal-feed/timeline/forms kräver `customers.read` → roller `owner`, `operator`, `konsult`, `personal`. Header `x-cco-role: admin` ger **403** (inte 404).

---

## Sammanfattning (baseline)

CCO har **fungerande journal-backend** (skapa, signera, låsa, rättelse, audit-guards) och **7 217 patienter** i kundmaster med **5 152 historiska journalposter** importerade. Compliance-grund (inga Drive-länkar, inga LINK_ONLY_BLOCKER, audit-logg) är på plats.

**Tidigare blocker (löst):** patientkortet i `kunder.html` anropar `/journal-feed` och `/journal-timeline` — dessa gav **404** efter CF-regression. Efter `e3a4d51d` returnerar de **200** för behöriga roller.

**Sekundärt:** ~885 historiska assets ligger i `needs_review`. Photo Review write är avstängd på prod. Mail enrichment (493 ambiguous) påverkar **inte** journalföring och är pausad.

---

## 1. Kundmaster

| Check                            | Status            | Evidens                                                                                                                  |
| -------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Cliento-kunder i CCO             | **PASS**          | Prod `GET /api/v1/cco-patient-master/stats`: **7 217** patienter                                                         |
| patientId / customerId           | **PASS**          | `cliento_*` och UUID-format fungerar i journal-API                                                                       |
| Inga nya kunder vid osäker match | **PASS (policy)** | Osäker match → review queue, inte auto-create                                                                            |
| Cliento täckning vs export       | **YELLOW**        | Pipedrive-import: **163 ambiguous** (historisk)                                                                          |
| Alla Cliento-kunder matchade     | **PASS**          | `verify-cliento-customer-master.js` (2026-06-02): **7 654** CSV-rader · **0** created · **0** review · **7 575** updated |

---

## 2. Patientkort

| Sektion           | Kod/UI                             | Prod-status                                |
| ----------------- | ---------------------------------- | ------------------------------------------ |
| Kundkort öppnas   | `kunder.html` (200)                | **PASS**                                   |
| Journal-sektion   | `CcoJournalFeed` + `/journal-feed` | **PASS** (efter fix)                       |
| Formulär-sektion  | Asset-tab + `/cco-forms/*`         | **PASS** (API monterad)                    |
| Bilder-sektion    | Asset-tab `bilder`                 | **PARTIAL** — migrerade foton NEEDS_REVIEW |
| Encounter / besök | `encounterId`, `visitLabel`        | **PASS**                                   |
| Timeline          | `/journal-timeline`                | **PASS** (efter fix)                       |
| Audit (UI)        | `/api/v1/cco-audit`                | **PASS (RBAC)** — owner/revisor            |

---

## 3. Journalfunktion

| Check                       | Status   | Evidens                                            |
| --------------------------- | -------- | -------------------------------------------------- |
| Skapa journalanteckning     | **PASS** | `PUT /api/v1/cco-journal-quick/entry`              |
| Signera / låsa              | **PASS** | `POST …/entry/sign`                                |
| Rättelse som ny post        | **PASS** | Prod smoke + `addCorrection`                       |
| Audit läsning/skrivning     | **PASS** | journal-quick audit hooks                          |
| Journal syns på patientkort | **PASS** | feed 200 med poster                                |
| Journal syns i tidslinje    | **PASS** | timeline 200 med events/threads                    |
| Historisk import            | **PASS** | **5 152** historical entries · **1 456** patienter |

---

## 4. Formulär

| Check                                      | Status     | Evidens                                                 |
| ------------------------------------------ | ---------- | ------------------------------------------------------- |
| Hälsodeklaration / friskförsäkran (import) | **PASS**   | Importerade i snapshot                                  |
| Live formulär-API                          | **PASS**   | `/cco-forms/submit`, `/missing` monterade               |
| Prod-signerade nya formulär                | **YELLOW** | API klar; personal-workflow ej full UAT i denna körning |

---

## 5–8. Historik · Bilder · Encounter · Compliance

Oförändrat från baseline — se tidigare avsnitt i git-historik. Kort:

- Historik import: **PASS** (Drive + halso@ + GetAccept)
- Bilder NEEDS_REVIEW: **885** — blockerar **inte** ny journalföring
- Photo Review write: **AV** — korrekt Fas 1
- Compliance: audit, inga Drive-länkar, ingen extern AI på journaltext — **PASS**

---

## Blockers & begränsningar

### Löst i denna fix

1. ~~Prod: montera journal-feed + journal-timeline + cco-forms~~ → **FIXED** (`e3a4d51d`)

### Kvar under pilot (dag 1)

- Historiska **885** assets i `needs_review` — använd **inte** som klinisk sanning
- Photo Review **inte** klar — nya journaler ja, migrerade före/efter-bilder nej
- **4 867** kunder utan importerat innehåll — normalt; ny journal skapas ändå
- Mail enrichment **493 ambiguous** — pausad
- Testpatienter utan kundmaster-post kan journalföras via API men syns bäst när `patientId` matchar befintlig kund
- Vissa valfria CCO-moduler loggar fortfarande `Cannot find module` vid startup (policy/telemetry m.fl.) — **påverkar inte** journal-feed/timeline/forms

---

## Vad personal ska undvika (dag 1)

1. Lita **inte** på dokument under “Behöver granskning” som verifierade journaler
2. Använd **inte** migrerade foton som behandlingsbilder före Photo Review
3. Skapa **inte** nya kunder manuellt vid osäker identitet — eskalera till admin/ops
4. Kopiera **inte** journaltext till externa AI-verktyg
5. Journalför **inte** på fel patient — verifiera identitet (namn, telefon, Cliento-id) före signering
6. Förvänta er **inte** att alla valfria kundkort-moduler (offert/quick-stores) fungerar om relaterade stores saknas på prod — journaldelen är klar

---

## Teknisk bilaga: commits

| Commit     | Beskrivning                                                                 |
| ---------- | --------------------------------------------------------------------------- |
| `3850fc93` | `fix(journal): add ccoAssetNaming runtime dependency`                       |
| `e3a4d51d` | `fix(journal): restore journal-feed, journal-timeline and cco-forms routes` |

_Ingen rå mailtext · inga personnummer · inga patientnamn i denna rapport._
