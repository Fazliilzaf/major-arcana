# Meridiq Historisk Journal-Import — Gap Analysis

*Genererad: 2026-05-30 · P0.7 · Read-only-gap-rapport*
*Styrande regel: `.cursor/rules/cco-journal-cutover-first.mdc#Definition of Done` punkt 3*
*Skeleton-script: `scripts/import-meridiq-historical-journals.js` (DRY-RUN-funktional)*
*Compliance: 0 patientnamn, 0 personnummer, 0 emails, 0 telefonnummer — counts + endpoint-skiss endast.*

---

## TL;DR

- **Vi har INTE access till Meridiq journal-text-API ännu.** Skeleton-scriptet kan iterera över 6 268 eligible patienter (`meridiqMeta.hasJournal === true`) i dry-run-läge, men `--commit` blockeras tills en `--meridiq-api-token` levereras OCH endpoint är verifierad live.
- **Workaround under tiden:** personalen läser Meridiq parallellt via ett maskerat sök-link per patientkort (`https://app.meridiq.com/clients?search=<maskerat>`). Patch landad i P0.7-batch (`ccoMasterPatientCardStore.meridiqReadLink`).
- **ETA till GREEN på DoD #3:** 5–6 dagar efter att Meridiq read-only-API är levererat (eller alternativt 12–14 dagar för XLSX-export-flöde per patient).

---

## 1. Vad vi har (today, 2026-05-30)

| Tillgång | Status | Källa |
|---|---|---|
| Meridiq patient-metadata (id + via + hasJournal-flagga) | ✅ | `data/cco-customers.json#tenants.hair_tp.customerState.directory[k].meridiqMeta` (6 268 records) |
| Meridiq formulär-katalog (16 questionaries) | ✅ | `migration/meridiq/questionary-catalog.json` |
| Meridiq consent-katalog (39 consents) | ✅ | `migration/meridiq/consent-catalog.json` |
| Meridiq journal-schema (14 schemas, 217 fält) | ✅ | `migration/meridiq/journal-schema-catalog.json` |
| Meridiq service-bindings (82 services) | ✅ | `migration/meridiq/service-bindings-catalog.json` |
| **Meridiq journal-text-data (per patient)** | ❌ **MISSING** | Inget API + ingen XLSX-export levererad |
| **Meridiq PDF-arkiv (signerade journaler)** | ❌ **MISSING** | Drive-folders förmodade men ej service-account-verifierade |
| Meridiq questionary-svar-data (per patient) | ❌ **MISSING** | Samma blocker som journal-text |
| Meridiq photo-arkiv (per behandling) | ⚠️ partial | Förmodat i Drive — ej ännu importerat |

---

## 2. Vad som krävs för bulk-import

### Option A — Meridiq read-only REST-API (preferens)

Owner måste skaffa **read-only OAuth-credentials** (eller API-key) från Meridiq-leverantören. Med dessa kan vi anropa:

| Endpoint (förslag) | Syfte | Förväntad volym |
|---|---|---:|
| `GET /api/v1/clients?limit=500&offset=...` | Patient-lista för att verifiera meridiqPatientId-mapping | 6 391 |
| `GET /api/v1/clients/:meridiqId/journals` | Lista alla journal-entries per patient | ~6 268 × N ≈ 30 000–80 000 |
| `GET /api/v1/clients/:meridiqId/journals/:journalId` | Hämta full journal-text + fält | per entry |
| `GET /api/v1/clients/:meridiqId/journals/:journalId/pdf` | Hämta signerad PDF (om finns) | per entry |
| `GET /api/v1/clients/:meridiqId/questionaries/responses` | Hämta patient-svar på formulär | per patient |
| `GET /api/v1/clients/:meridiqId/consents` | Hämta signerade samtycken | per patient |
| `GET /api/v1/clients/:meridiqId/photos` | Lista bild-metadata | per patient |

**Rate-limit-antagande:** 10 req/s = ~80 000 calls ≈ 2.2 h. Med 1-dags marginal för retry/throttle: **5–6 dagar** end-to-end (inkl. mock→real switch + smoke-test + audit + dashboard-verifiering).

### Option B — XLSX-export per patient (fallback)

Om API inte är möjligt:

1. Personalen exporterar journal-XLSX per patient via Meridiq-UI (kräver `~6 268 × 1 min ≈ 105 timmar manuellt arbete`).
2. Vi bygger en parser för Meridiq-XLSX-schemat.
3. Bulk-import via `scripts/import-meridiq-historical-journals.js --xlsx-dir=./meridiq-xlsx-exports`.

**ETA:** 12–14 dagar (inkl. manuell export).

---

## 3. Data-shape vi förväntar (per Meridiq journal-entry)

```jsonc
{
  "meridiqEntryId": "<uuid>",
  "meridiqPatientId": "<uuid>",
  "schemaId": "<int>",                      // matchar journal-schema-catalog.json
  "schemaVersion": "<string>",
  "signedAt": "2024-MM-DDTHH:MM:SSZ",       // ISO 8601
  "signedByName": "<string>",               // läkar-namn (lagras separat med RBAC)
  "treatmentDate": "2024-MM-DD",
  "treatmentType": "tp|consultation|aftercare",
  "fields": [
    { "qid": 450896, "label": "Hårtäthet före", "value": "<text>" },
    { "qid": 450903, "label": "Skalp-status", "value": "<text>" }
    // ... 52–59 fält per TP-paritet (P0.4)
  ],
  "pdfUrl": "<signed-url-or-blob>",         // signerad PDF om finns
  "photoIds": ["<id>", "<id>"]              // länkar till Meridiq photos
}
```

Mapping till CCO:

| Meridiq | CCO (`ccoJournalStore.createEntry`) |
|---|---|
| `meridiqPatientId` | resolve via `meridiqMeta.meridiqPatientId === <id>` → `ccoPatientId` |
| `signedAt` | `signedAt`, `status: 'signed'`, `locked: true` |
| `fields[]` | `body.fields[]` (normaliserade till TP-paritet) |
| `pdfUrl` | downloaded + sparad i `data/cco-journal-pdfs/<entryId>.pdf` + `applyPdfArtifact()` |
| `photoIds[]` | bilder importeras separat till `ccoPhotoStore` med `source: 'meridiq_import'` + `encounterId = entryId` |
| (alltid) | `journalType: 'historical_import'`, `importMeta.source: 'meridiq'`, `importMeta.meridiqEntryId`, `importMeta.fetchedAt` |

---

## 4. Workaround under tiden — Meridiq read-link per patient

Eftersom journal-data inte kan importeras innan API levereras, måste personalen kunna **läsa originalet i Meridiq parallellt**. Patchen i P0.7 lägger till ett maskerat sök-link på varje master-patientkort där `meridiqMeta` finns:

- **Fält:** `card.meridiqReadLink`
- **Format:** `https://app.meridiq.com/clients?search=<maskerat-prefix>`
- **Maskering:** vi exponerar BARA första 2 tecken av `meridiqPatientId` (eller `pnrSuffix` om sant) — INGA fulla identifierare i frontend.
- **Vem ser link:** roller `nurse`, `doctor`, `admin` (RBAC-gate på `journal.read_own` / `journal.read_any`).
- **Audit:** `journal.meridiq_readlink_clicked` när någon följer länken.

Detta är **inte** en cutover-grön åtgärd — det är ett brott mot single-system-of-record-principen. Men under övergångsfönstret (5–6 dagar med API, 14 dagar utan) är det enda sättet att inte tappa journalkontinuiteten.

---

## 5. Vad blockeringen kostar — i siffror

| Metric | Värde | Källa |
|---|---:|---|
| Patienter som behöver bulk-import | **6 268** | `meridiqMeta.hasJournal === true` |
| Estimerade entries (medel ~2 per patient) | ~12 500 | erfarenhetsbaserad estimering |
| Estimerade signed PDFs | ~10 000 | (vissa är samtals-anteckningar utan signerad PDF) |
| Estimerade bilder att hämta | 3 000–8 000 | per `JOURNAL-CUTOVER-AUDIT-2026-05-30.md#9` |
| Patienter UTAN journal (leads) | 989 | `noMeridiqJournal === true` — ingen åtgärd krävs |
| Patienter med duplicerings-kandidat-flagga | 28 | `duplicateCandidate === true` — separat Review Queue-flöde |
| Patienter som matchats via `name` (osäkra) | 15 | `meridiqMeta.via === 'name'` — manuell verifiering före auto-import |

Skeleton-scriptet räknade exakt 6 268 eligible i tester 2026-05-30, matchar audit-rapport.

---

## 6. Vad scriptet redan kan göra (utan API)

`scripts/import-meridiq-historical-journals.js` kan i dag:

- Iterera över hela `directory` och räkna eligible (6 268).
- Producera per-patient mock-payload (2 entries default) som visar EXAKT vilken shape `ccoJournalStore.createEntry` kommer att få.
- Validera CLI-flaggor: `--limit`, `--mock-entries-per-patient`, `--dry-run`, `--commit`, `--meridiq-api-token`, `--tenant`.
- Vägra `--commit` utan token (exit-code 2).
- Vägra `--commit` MED token (exit-code 3) tills `MERIDIQ_BASE`-endpoint är verifierad — för att skydda mot att test-token aktiverar fel pipeline.

Det enda som saknas för att flippa till live är:

1. `MERIDIQ_BASE` URL-konstant i scriptet.
2. Riktig `fetch()`-call istället för mock-loop.
3. `ccoJournalStore`-instans (server.js har den redan wirad) — scriptet ska köras via en lightweight bootstrap som loadar storen.
4. Audit-wrapper koppla in `ccoAuditLog.append({ action: 'journal.historical_import_bulk', ... })`.

Total kod-diff när token finns: ~80 LOC + tester.

---

## 7. Beslutspunkter för owner

| Beslut | Alternativ | Rekommendation |
|---|---|---|
| API vs XLSX | (A) Meridiq REST-API, (B) XLSX-export per patient, (C) hybrid (API där möjligt, XLSX som backup) | **A**: enda väg till <7 dagars cutover |
| Import-pace | (1) all-at-once batch, (2) rolling per patient på read (lazy), (3) prio-listad (signed-first) | **3**: importera signerade PDFs först (juridiskt viktigast), sen text-fält, sen bilder |
| Read-link i master-kort | (J) ja under övergång, (N) nej (tvinga 100% CCO direkt) | **J**: 5-14 dagars övergångsbehov, audit-spårad |
| Rättelse-policy för historisk-import | (1) markera som "historiska — kan inte rättas i CCO" (rättelser sker i Meridiq tills sunset), (2) tillåt rättelser i CCO med tamper-hash-uppdatering | **1**: minimera split-brain under övergång |

---

## 8. När är gap stängt?

Gap är stängt (DoD #3 = ✅ GREEN) när:

- [ ] Meridiq API-credentials levererade och verifierade i staging
- [ ] `scripts/import-meridiq-historical-journals.js --commit` har körts ren mot staging
- [ ] >= 6 200 av 6 268 eligible patienter har minst 1 `historical_import`-entry (98 % coverage-tröskel)
- [ ] Resterande 1–2 % i Migration Review Queue
- [ ] Audit-rader `journal.historical_import` matchar entry-count
- [ ] QA-dashboard (P0.9) visar `block3.patientsWithHistoricJournal >= 6 200`
- [ ] Cutover Readiness Report (P0.10) visar #3 = ✅

---

## 9. Compliance-check (denna rapport)

- [x] Inga patientnamn — verifierat manuellt + regex
- [x] Inga personnummer — regex `\d{6}[-\s]?\d{4}` och `\d{12}` → 0 träffar
- [x] Inga emails — regex `@[a-z]+\.(com|se)` → 0 träffar
- [x] Inga telefonnummer — regex `\+46\d{8,10}` → 0 träffar
- [x] Alla siffror är counts/percentages/endpoint-skisser — inga patient-records återges

---

## 10. Referenser

- `.cursor/rules/cco-journal-cutover-first.mdc#Definition of Done` — DoD-punkt 3
- `docs/strategy/JOURNAL-CUTOVER-AUDIT-2026-05-30.md` — blocker #5
- `docs/strategy/MERIDIQ-DEDUP-REPORT-2026-05-30.md` — match-resultat
- `docs/strategy/MERIDIQ-CCO-GAP-ANALYSIS.md` — formulär/consents-coverage
- `scripts/import-meridiq-historical-journals.js` — DRY-RUN-skeleton
- `src/ops/ccoMasterPatientCardStore.js` — `meridiqReadLink` (P0.7 patch)

---

*Senast uppdaterad: 2026-05-30 · Status: BLOCKED på Meridiq API-access · Owner-action required.*
