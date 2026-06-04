# Drive-integration — Förslag på snygg, smart, AI-driven byggnation

*Genererad: 2026-05-30 · Status: PROPOSAL — inga beslut tagna än*

> Detta dokument följer samma mönster som Cliento-import (steg 9), Meridiq de-dup (steg 9.2),
> SharePoint-template-import (steg SHAREPOINT-IMPORT-REPORT) och Channel Document Inventory
> (steg 10.2). Det är **analys + arkitekturförslag** — ingen kod skrivs förrän owner
> godkänt riktningen och svarat på frågorna i Sektion H.
>
> **Inga patientdata, inga personnummer, inga namn citeras.** Alla siffror är counts eller
> referenser till befintlig metadata i `docs/strategy/`.

---

## Innehåll

- [A. Nuläge — vad finns redan om Drive i repo](#a-nuläge)
- [B. Vad Drive sannolikt innehåller — hypoteser](#b-vad-drive-sannolikt-innehåller)
- [C. Förslag på systemarkitektur — 3-tier-stack](#c-systemarkitektur)
- [D. 6 AI-features som gör integrationen fantastisk](#d-ai-features)
- [E. UI-design — var Drive landar i CCO](#e-ui-design)
- [F. Implementation-fas-plan](#f-fasplan)
- [G. Compliance-prep](#g-compliance-prep)
- [H. Öppna frågor till owner](#h-öppna-frågor)

---

## A. Nuläge

### A.1 Befintlig kod (Drive)

| Fil | Vad den gör |
|---|---|
| `src/lib/googleDriveClient.js` | Service-account JWT-auth, `streamDriveFileToResponse`, `listCustomerPhotos` (per-customer search), `uploadCustomerPhoto` (multipart upload med namnmönster `{customerId}_{timestamp}.{ext}`). |
| `scripts/migration/lib/googleDriveApi.js` | Låg-nivå Drive v3 API: `getAccessToken` (RS256-JWT), `listAllDriveFiles` (rekursiv crawl med token-refresh), `openDriveFileReadStream` (binär passthrough). Stödjer Shared Drives via `supportsAllDrives=true`. |
| `scripts/migration/scanGoogleDriveApi.js` | Steg C1 av migration-runbook: indexerar hela Drive-mappen → `data/migration-index.json` med profiler, journal-PDF-counts, bild-counts. Stödjer `--verify-only` (sample-crawl max 3 mappar). |
| `scripts/migration/preflightDriveApi.js` | Verifierar credentials, token, root folder, sample-children. JSON-läge för CI. |
| `scripts/migration/scanDriveFolder.js` | Skannar **lokal** Drive-mirror (kräver `ARCANA_DRIVE_MIRROR_ROOT`) — för dev utan API. |
| `scripts/migration/scanDriveZips.js` | Legacy: skannar zip-arkiv av Drive (innan API:t togs i bruk). |
| `scripts/migration/lib/driveFileMatch.js` | Lookup-strukturer för matchning Drive→Cliento (exact + loose + relative-path keys). |
| `scripts/migration/proposeMojibakeDriveMatches.js` | Förslag på Drive-filer vars namn fastnat i mojibake (`Ã¥` → `å`). |
| `scripts/migration/enrichIndexWithDriveIds.js` | Backfill `driveFileId` på filer som indexerades innan API:t var aktivt. |
| `scripts/apply-drive-api-prod.js` | Aktiverar Drive API på prod (Render). |
| `scripts/audit-missing-drive-file-ids.js` | Hittar filer i index utan `driveFileId` (PII-saving-bug-hunt). |
| `scripts/backfill-drive-file-ids.js` | Skriver in saknade IDs i index. |
| `scripts/setup-drive-service-account.sh` | Bash-onboarding för ny service account. |
| `src/routes/ccoPatientMaster.js` | Använder `streamDriveFileToResponse` när filen i migration-index har `driveFileId` (rad 277–296 + fallback rad 321–334). |
| `src/migration/reconciliationEngine.js` | Reconciliation-pipeline som beräknar `hasDriveFolder`, `driveFileCount`, `missingDriveFileIdCount` per kund. |

### A.2 Befintliga rutter (server.js)

| Endpoint | Roll | Plats |
|---|---|---|
| `GET /api/drive/files/:id` | Public proxy som streamar binär från Drive (auth-skyddad via session, ej Drive-token exponerad). | `server.js:4027` |
| `GET /api/v1/cco-patient-master/file?fileId=…` | OWNER/STAFF — streamar fil från Drive **eller** lokal folder **eller** zip (multi-source fallback). | `src/routes/ccoPatientMaster.js:259` |

### A.3 Tester

| Fil | Vad den täcker |
|---|---|
| `tests/ops/googleDriveClient.test.js` | Service-account auth, list, upload, stream-mock |
| `tests/ops/driveFileMatch.test.js` | Mojibake-tålig matchning, exact+loose lookup |
| `tests/scripts/auditMissingDriveFileIds.test.js` | Audit-script som hittar fildata utan IDs |

### A.4 Runbook & strategi-referenser

| Dokument | Vad det säger om Drive |
|---|---|
| `docs/ops/migration-drive-sharepoint-runbook.md` | C1–C5 pipeline: preflight → scan-drive-api → import → spot-check. **Prod-läge på Render använder Drive API live** (86 GB zip för stort för disk). |
| `docs/strategy/CHANNEL-DOCUMENT-INVENTORY.md` § 4 | "Drive: ❌ inget i repo. ~1 981 patientprofiler nås via Drive API i produktion. **Saknas i repo** — kan endast nås live." |
| `docs/strategy/MERIDIQ-SOURCE-OF-TRUTH-MATRIX.md` | Drive = sekundärkälla för journaler, primärkälla för historiska Word/PDF-mallar (men inget exporterat). |
| `.cursor/rules/cco-communication-compliance-audit.mdc` | "Google Drive is historical patient file/archive source — actively used for journal-PDF + before/after-photos." |
| `.cursor/rules/cco-migration-reconciliation.mdc` | Reconciliation-fält: `hasDriveFolder`, `driveFileCount`, `missingDriveFileIdCount`. |
| `.cursor/rules/meridiq-journey-extraction.mdc` rad 113 | "Drive är endast referensplats — får inte vara primärkälla." |
| `config/cco-treatment-document-requirements.json` | Drive nämns som källa för historiska behandlingsdokument. |
| `config/external-template-versions.json` | Drive-referenser i revisionsspårning. |

### A.5 GAP — vad som saknas idag

| Område | Status | Konsekvens |
|---|---|---|
| **Inventering** | ❌ Ingen `DRIVE-INVENTORY.md` (motsvarande SharePoint) | Vi vet inte vilken mapp-struktur Drive har, vilka brand som blandas, hur många foton vs PDFs. |
| **Dump till iCloud** | ❌ Ingen export till `Migration-data/drive-YYYY-MM-DD/` | Vi kan inte göra paritetstest mot Meridiq off-line. CHANNEL-INVENTORY åtgärd rad 202 olöst. |
| **AI-lager** | ❌ Inget RAG, ingen klassifiering, ingen tidslinje | Drive är en passiv "fil-streamer" — ingen intelligens läggs på innehållet. |
| **UI-vy** | ❌ Ingen dedikerad Drive-tab i `/major-arcana-preview customers-view`-dossier (bara foto-tile) | OWNER kan inte se Drive-inventory eller söka i Drive från CCO. |
| **Compliance-rule** | ❌ Ingen `.cursor/rules/cco-drive-integration.mdc` | Drive-pattern är spritt över 3 olika rules-filer. |
| **Coverage-rapport** | ❌ Ingen DRIVE-COVERAGE-REPORT (motsvarande MERIDIQ-DEDUP) | Vi vet inte hur många av 7 250 Cliento-kunder som har Drive-foto/PDF, eller om de 1 981 Drive-profilerna är subset/superset. |
| **Per-fil-klassificering** | ❌ Bara `mimeType`-bucket | Drive-fil "IMG_2024.JPG" säger inget om före/efter, vilken behandling, samtycke-status. |
| **Versionsmedvetenhet** | ❌ Ingen koppling Drive→`external-template-versions.json` | Historiska mallar (Word-versioner av avtal/samtycke) kan inte diffas mot dagens templates. |

*Status: PROPOSAL — inga beslut tagna än*

---

## B. Vad Drive sannolikt innehåller

Baserat på `CHANNEL-DOCUMENT-INVENTORY.md` ("~1 981 profiler"), `MERIDIQ-SOURCE-OF-TRUTH-MATRIX.md`
(referens till "5 152 historiska journalposter på prod") och Cursor-rules nämner
"journal-PDF + before/after-photos" som primäranvändning, är följande hypoteser rimliga:

### B.1 Sannolika innehållstyper

| # | Typ | PII-grad | Volym-hypotes | Källa till hypotes |
|---:|---|---|---|---|
| 1 | Patientfoton — före/efter (TP, PRP, Profhilo) | HÖG (biometrisk) | 50–200 per patient × 1 981 = ~50k–400k | `googleDriveClient.uploadCustomerPhoto` + `ccoJournalPhotoStore.js` |
| 2 | Journalexport-PDFs från Meridiq | HÖG | ~5 152 (per matris) | MERIDIQ-MATRIX rad 61 |
| 3 | Signerade avtal-PDFs (GetAccept-arkiv) | HÖG | ~14 mall-typer × X aktiva = ~3–6k | CHANNEL-INVENTORY § 7 |
| 4 | Hälsodeklarationer (ifyllda) | HÖG | ~2k | Meridiq questionary-catalog antal × patienter |
| 5 | Friskförsäkran (signerad) | HÖG | ~1–2k (endast TP-patienter) | `fitness_certificate_*` templates |
| 6 | Konsultations-anteckningar (DOCX/handskrift-foton) | MEDIUM | ~500–2k | Refererat i `cco-patient-journal-build-plan.md` |
| 7 | Email-arkiv (msg/eml export) | HÖG | okänt | Refererat i `NOTION-SYNC-MANIFEST.md` |
| 8 | Behandlingsplaner (offerter) DOCX | LÅG-MEDIUM | ~1–3k | `ccoOfferDocumentStore.js` arbetsflöde |
| 9 | Marketing-material (logos, brand assets) | NOLL | okänt | Antagligen separat mapp |
| 10 | Mall-arbetskopior (historiska Word) | NOLL (men juridiskt känsliga) | ~50–100 | CHANNEL-INVENTORY § 5–6 |
| 11 | Foto-samtycken (papper, scannade) | HÖG | ~500–1 500 | `ccoPhotoConsentStore.js` |
| 12 | Ortopedi-intyg / röntgen-bilder | HÖG | låg volym | Curatiio ortopedi-spår |

### B.2 Klassificerings-buckets (mappat till CCO-vokabulär)

| Bucket-tag | Vilka av B.1 | GitHub-OK? | CCO-store-mål |
|---|---|---|---|
| `patient_photo` | 1, 11 (foton) | ❌ NEJ | `ccoJournalPhotoStore` |
| `patient_document` | 2, 3, 4, 5, 6, 7, 12 | ❌ NEJ | `ccoMigrationIndexStore` + `ccoPatientMasterStore` |
| `clinical_template` (historisk) | 10 | ⚠️ versions-metadata OK | `config/external-template-versions.json` |
| `business_asset` | 9 | ✅ JA (om ej PII) | inget — separat asset-mapp |
| `working_copy` | 8 (om mall) | ⚠️ versions-metadata OK | `ccoOfferTemplateStore` |
| `unknown` | okänd | flagga manuell review | `ccoBlockingStore` |

### B.3 Förväntad mapp-struktur (hypotes)

Baserat på `scanDriveFolder.js` walk-pattern + Drive-filnamn-mönster i `googleDriveClient.js`
(`{customerId}_{timestamp}.{ext}`) är de mest sannolika rotmappar:

```
<DRIVE_ROOT>/
├── Patienter/
│   ├── <Personnummer eller Namn YYYYMMDD-XXXX>/
│   │   ├── Före/         (foton)
│   │   ├── Efter/        (foton)
│   │   ├── Journal/      (PDF-export från Meridiq)
│   │   ├── Avtal/        (signerade PDF)
│   │   └── Samtycke/     (signerade PDF)
│   └── ...
├── Mallar/               (versionerade Word/PDF)
├── Marketing/            (brand assets)
└── Arkiv/                (gamla kunder, ev. krypterat)
```

Men: **vi vet inte detta för säker** — Sektion H fråga 2 ber owner verifiera.

*Status: PROPOSAL — inga beslut tagna än*

---

## C. Systemarkitektur — 3-tier-stack

Modellerad efter SharePoint-template-import (3 steg: inventory → import → DOCX-parse) och
Cliento-flödet (CSV → store → audit-rapport). Drive-stacken har **3 tier**: index, sync,
AI-lager.

```
┌─────────────────────────────────────────────────────────┐
│  TIER 3 — Drive AI Layer                                 │
│  Klassifiering · Tidslinje · NL-sökning · Anomaly        │
│  Migration-helper · Auto-tagging                          │
└──────────────────────────────────────────────────────────┘
                          ▲
┌─────────────────────────────────────────────────────────┐
│  TIER 2 — Drive Sync Engine                              │
│  Inkrementell crawl · Tag-extrahering · Stream-proxy     │
│  Photo-thumbnail-cache · Audit-log                       │
└──────────────────────────────────────────────────────────┘
                          ▲
┌─────────────────────────────────────────────────────────┐
│  TIER 1 — Drive Inventory & Index                        │
│  Full mapp-crawl · Per-fil-klassificering ·              │
│  drive-inventory.json + DRIVE-INVENTORY.md               │
└──────────────────────────────────────────────────────────┘
                          ▲
┌─────────────────────────────────────────────────────────┐
│  EXISTERANDE — googleDriveApi.js + googleDriveClient.js  │
└──────────────────────────────────────────────────────────┘
```

### C.1 TIER 1 — Drive Inventory & Index

**Vad den gör:** Full one-shot-crawl av hela Drive-roten, kategoriserar varje fil enligt
B.2-buckets, producerar TVÅ artefakter:

1. `data/drive-inventory.json` (PII-fritt — namn-hashar, antalsamlingar) — gitignored som default men kan committas efter PII-scan
2. `docs/strategy/DRIVE-INVENTORY.md` (mänskligt läsbar tabell — bucket-counts per mapp)

**Integration med CCO-stores:**

| Store | Vad som matas in från Tier 1 |
|---|---|
| `ccoMigrationIndexStore` | Per-fil-record med `driveFileId`, `personnummer` (om matchat), `bucket`, `mimeType`, `relativePath` |
| `ccoBlockingStore` | Filer som klassats som `unknown` eller har konflikter (samma personnummer som annan kund) |
| `ccoTemplateRegistry` | Historiska mall-Word-filer (bucket=`clinical_template`) med `legalReviewStatus: drive_legacy_pending_review` |

**API/endpoint-design:**

```bash
# CLI
node scripts/import-drive-inventory.js [--verify-only] [--max-folders N] [--commit]

# Render-style env
ARCANA_GOOGLE_DRIVE_FOLDER_ID=...
ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON=/secrets/sa.json
ARCANA_DRIVE_INVENTORY_OUT=data/drive-inventory.json
```

**HTTP-endpoint:** `GET /api/v1/cco-drive/inventory` (OWNER-only) returnerar count-only-summary.

**Compliance-implikationer:**

- Inga filinnehåll lagras i Tier 1, bara metadata.
- `personnummer`-extrahering från filnamn sker LOKALT (inget skickas till extern AI).
- Audit-event: `cco.drive.inventory.scan` per körning.
- Default `--verify-only` (Cliento-mönstret); `--commit` krävs för full crawl.

**Test-strategy:** `tests/scripts/importDriveInventory.test.js` med fixture av 50 fake-files
(ingen PII). Coverage gate: ≥95 % filer klassade till en av B.2-buckets, ≤5 % `unknown`.

### C.2 TIER 2 — Drive Sync Engine

**Vad den gör:** Inkrementell sync via Drive `changes.list` API (poll varje 10 min). När en ny
fil dyker upp → klassifiera → uppdatera `ccoMigrationIndexStore` → emit event till
`ccoNotificationFeedStore`.

**Integration med CCO-stores:**

| Store | Sync-flow |
|---|---|
| `ccoMigrationIndexStore` | upsert per `driveFileId` |
| `ccoJournalPhotoStore` | när bucket=`patient_photo` + matchad patient → spegel-thumbnail till lokal disk för snabb listning |
| `ccoNotificationFeedStore` | "Ny journal-PDF för patient X uppladdad i Drive" → notis i staff-feed |
| `ccoComplianceScanStore` | när bucket=`patient_document` utan matchad samtycke → flagga blocker |
| `ccoTreatmentEncounterStore` | när bucket=`patient_photo` med datum nära behandlings-datum → auto-länka till encounter |

**API/endpoint-design:**

```bash
# Background-cron i src/ops/scheduler.js
arcana_cron_drive_sync()  # var 10:e min

# Manual trigger
POST /api/v1/cco-drive/sync  (OWNER)
GET  /api/v1/cco-drive/sync/status
```

**Compliance-implikationer:**

- Drive `changes` API har `pageToken` — krävs persistens i `data/drive-sync-state.json`.
- Borttagna filer i Drive → tombstone i `ccoMigrationIndexStore`, BEHÅLLS (PDL 10 år).
- Stream-proxy `/api/drive/files/:id` har redan auth — utöka med `requireRole(OWNER, STAFF)`.
- Photo-thumbnail-cache lagras under `data/journal-photos/<tenant>/<patient>/thumb_<id>.jpg`
  (gitignored).

**Test-strategy:** Mocked Drive change-set med 10 events (5 create + 3 update + 2 delete).
Verifiera idempotens (samma event 2 gånger → ingen dubbel insert).

### C.3 TIER 3 — Drive AI Layer

**Vad den gör:** Lägger ett **lokalt** AI-lager ovanpå Tier 1+2. **All AI körs lokalt eller via
Claude API med strikt PII-redaktion** (per `meridiq-journey-extraction.mdc` regel
"AI får aldrig journaldata").

**Tekniska komponenter:**

| Komponent | Vad | Modell-val |
|---|---|---|
| Foto-klassificerare | Före/efter/handskrift/dokument-scan | Lokal CLIP/Vit-modell ELLER Claude Vision (med foto-samtycke) |
| Filnamn-embedding | Sökindex för NL-queries | Lokal `sentence-transformers/all-MiniLM-L6-v2` (cosine-sim) |
| OCR | Handskrivna anteckningar | Tesseract lokal + macOS Vision API |
| Anomaly-detector | Saknade docs före behandling | Rules-engine (ingen LLM) |
| Auto-tagger | Bucket-tilldelning | Hybrid: regex på filnamn + filename-embedding-NN |
| Tidslinje-byggare | Per-patient kronologi | Lokal Node-logik (ingen LLM) |

**Integration med CCO-stores:**

| Store | AI-trigger |
|---|---|
| `ccoAiService` | Utökas med `classifyDriveFile()`, `embedFileName()`, `extractTimelineEvents()` |
| `ccoJournalAiGuard` | Gate: kontrollerar att foto har `consent_photo_*` template-signed innan AI ser bilden |
| `ccoPhotoPublishConsent` | Bestämmer om foto får skickas till extern modell |

**API/endpoint-design:**

```bash
POST /api/v1/cco-drive/ai/classify       (body: { driveFileId })  → bucket + confidence
POST /api/v1/cco-drive/ai/search         (body: { query, customerId? })  → ranked files
GET  /api/v1/cco-drive/ai/timeline/:cid  → kronologisk patient-event-list
POST /api/v1/cco-drive/ai/anomaly-scan   (body: { customerId, treatmentId })  → missing-doc-rapport
```

**Compliance-implikationer:**

- Foto-klassificering på server: tillåten **bara** om `consent_photo_internal` v≥2.0.0 signerad.
- NL-search-embeddings: filnamn skickas till lokal embedding-modell (ingen extern API).
- OCR: helt lokal. Resultat lagras inte permanent — bara i RAM under search.
- Audit-event per AI-anrop: `cco.drive.ai.<action>` med `driveFileId` (inte innehåll).

**Test-strategy:** Mocka klassificeraren med deterministisk regex-fallback (filnamn-baserad).
Verifiera att ingen `customerId` läcker till extern API i loggar.

*Status: PROPOSAL — inga beslut tagna än*

---

## D. AI-features

### D.1 Översikt

| # | Feature | Värde | Komplexitet | UI |
|--:|---|---|---|---|
| 1 | AI Smart Search | HÖG | Medium | /major-arcana-preview customers-view dossier + ny `drive.html` global |
| 2 | AI Foto-klassifierare | HÖG | Hög | /major-arcana-preview customers-view dossier "Foton"-tab |
| 3 | AI Patient-tidslinje | HÖG | Medium | /major-arcana-preview customers-view dossier "Tidslinje"-tab (ny) |
| 4 | AI Auto-tagging | MEDIUM | Medium | drive.html staging-vy |
| 5 | AI Anomaly-detector | KRITISK för compliance | Låg | ai-triage.html + kalender.html pre-behandlings-card |
| 6 | AI Migration-helper | HÖG (en-gång) | Medium | drive.html → migration-vy |

### D.2 Feature 1 — AI Smart Search

**Use-case:** OWNER skriver "visa alla PRP-bilder från våren 2025 för Curatiio-patienter med
samtycke" och får tillbaka ranked-lista på 5 sekunder.

**Tech-stack:**
- Embedding: `all-MiniLM-L6-v2` (lokal, ~80MB)
- Index: `data/drive-search-index.json` (gitignored) — sparse vector + metadata
- Query-pipeline: Claude (text-to-filter-DSL) → vektor-search → re-rank på metadata
- Anrop: `POST /api/v1/cco-drive/ai/search`

**UI:** Söklåda högst upp i `drive.html` + cmd+k-overlay i `/major-arcana-preview customers-view`.

**ETA:** 2 dagar för MVP (filnamn-only), +3 dagar för OCR-extended search.

**Beroenden:** Tier 1+2 körda; `npm i sentence-transformers-node` eller liknande.

### D.3 Feature 2 — AI Foto-klassifierare

**Use-case:** För varje foto i Drive: avgör automatiskt
`{ area: "scalp"|"crown"|"face"|"eye"|"body", phase: "pre"|"post_immediate"|"post_3m"|"post_6m"|"post_12m", quality: 0-1, contains_face: bool }`.
Anonymisera ansikten innan extern publicering.

**Tech-stack:**
- Lokal classifier: tränad CLIP-finetune ELLER macOS Vision framework (anonymitet via blur av detekterade ansikten)
- Fallback: Claude Vision med foto-redaction (svart-blur på ansikte INNAN upload)
- Resultat sparas i `ccoJournalPhotoStore` som `aiClassification`-fält

**UI:** Foto-grid i `/major-arcana-preview customers-view` dossier visar bucket-pill (`Före` / `Efter 3m`) som overlay.
Vid hover: confidence-meter.

**ETA:** 3 dagar lokal classifier; +2 dagar för Claude Vision-route med consent-guard.

**Beroenden:** `ccoPhotoPublishConsent` v2.0+ måste vara signerad per patient. Tier 1 körd.

### D.4 Feature 3 — AI Patient-tidslinje

**Use-case:** Klicka "Tidslinje" i en kund-dossier → visuell timeline med ikoner per event:
- 2025-03-12: Konsultation-PDF (från Drive)
- 2025-03-15: Hälsodeklaration signerad
- 2025-03-20: 1 st före-foto (4 vinklar)
- 2025-03-22: FUE-avtal signerat (Nordbro v3.0)
- 2025-04-15: 1 st 1-mån-foto
- 2025-09-15: 6-mån-uppföljning + foto-set

**Tech-stack:**
- Pure Node-logik som joinar `ccoMigrationIndexStore` (Drive-filer) + `ccoBookingStore` +
  `ccoJournalStore` + `ccoTreatmentEncounterStore`
- Sortering på `modifiedTime` från Drive + `createdTime` från CCO-stores
- Render: SVG-timeline i ren JS (samma stil som kalender-mockup-v8.html)
- Ingen LLM behövs — bara strukturell join.

**UI:** Ny tab "Tidslinje" i `/major-arcana-preview customers-view`-dossier mellan "Översikt" och "Foton". Mobile: vertikal,
desktop: horisontell scrollbar.

**ETA:** 2 dagar render + 1 dag join-logik.

**Beroenden:** Tier 1 körd, alla CCO-stores hydraterade.

### D.5 Feature 4 — AI Auto-tagging

**Use-case:** För 1 981 Drive-profiler: föreslå automatiskt vilken CCO-kund varje fil tillhör
baserat på filnamn + mapp + metadata. OWNER granskar 50 osäkra; resten auto-bekräftas.

**Tech-stack:**
- Regex på personnummer-mönster i filnamn (`\d{12}` eller `\d{6}[-\s]?\d{4}`)
- Mojibake-tålig matchning från `scripts/migration/lib/driveFileMatch.js`
- Fallback: filnamn-embedding-nearest-neighbor mot Cliento-kundnamn
- Confidence-score per match; <0.7 → `ccoBlockingStore` review queue

**UI:** `drive.html` staging-vy med tre kolumner:
- "Auto-confirmed" (score≥0.95) — bulk-accept-knapp
- "Needs review" (0.7–0.95) — kort med 3 förslag, klick för att välja
- "Unmatched" (<0.7) — fritext-sök för manuell tilldelning

**ETA:** 1 dag regex+lookup; +2 dagar UI; +1 dag review-flow.

**Beroenden:** Tier 1 körd, `ccoCustomerStore` har 7 250 kunder (klart).

### D.6 Feature 5 — AI Anomaly-detector

**Use-case:** 24h före behandling: scanna kundens dossier (Drive + CCO). Om något saknas
(`fitness_certificate`, `agreement`, `consent_photo`, `health_declaration`) → röd flagga i
`ai-triage.html` + email till patient + notis till staff.

**Tech-stack:**
- Pure rules-engine (ingen LLM)
- Input: `cco-treatment-document-requirements.json` per behandling
- Diff mot `ccoMigrationIndexStore` Drive-filer + `ccoTemplateRegistry` signed-documents
- Output: `missingDocuments: [{ templateId, severity, action }]`

**UI:**
- `ai-triage.html`: Ny "Pre-behandling-check"-kort högst upp med röd/gul/grön badge
- `kalender.html` v5+: Behandlings-bokningar med saknade docs visas med röd kant och hover-tooltip "Saknar: friskförsäkran, foto-samtycke"

**ETA:** 1 dag rules-engine; +2 dagar UI-integration; +1 dag notis-flow.

**Beroenden:** `cco-treatment-document-requirements.json` finns (klart),
`ccoMigrationIndexStore` har Drive-filer (Tier 1).

### D.7 Feature 6 — AI Migration-helper

**Use-case:** OWNER trycker "Föreslå migration" → CCO scannar Drive och föreslår vilka filer
som bör in i CCO-databasen som strukturerade objekt (vs lämnas som passiva referenser).

Exempel:
- 1 451 historiska journal-PDFs → föreslås importeras till `ccoJournalStore` som `historical_import` med `aiExtractedFields`
- 234 foton utan motsvarande encounter → föreslås länkas till närmsta booking
- 89 mall-Word-versioner → föreslås matchas mot `external-template-versions.json` för revisions-spårning

**Tech-stack:**
- Per fil: extract-pass (Claude med PII-redaction) → struktur-förslag
- OBS: foto + journal-PDF som har PII går aldrig till extern AI; bara filnamn + metadata
- Förslags-batch lagras i ny store `ccoDriveMigrationProposalStore`
- OWNER approve/reject per förslag

**UI:** `drive.html` "Migration-helper"-flik. Lista 50 förslag åt gången. Bulk-accept-checkbox.

**ETA:** 4 dagar (proposal-store + UI + approve-flow). +3 dagar för Claude-integration med
PII-guard (kan göras i fas 5).

**Beroenden:** Tier 1+2 körda. Feature 4 (auto-tagging) klar.

*Status: PROPOSAL — inga beslut tagna än*

---

## E. UI-design

### E.1 Var Drive bor i CCO

**Förslag:** En ny global vy `public/drive.html` + tabs inom `public/major-arcana-preview/?view=customers` dossier.

| Plats | Innehåll | Rationale |
|---|---|---|
| `public/drive.html` (NY) | Global Drive-explorer, AI-search, migration-helper, inventory-status | OWNER behöver översikt över hela Drive (1 981 profiler), inte bara per-kund |
| `public/major-arcana-preview/?view=customers` dossier → "Drive"-tab (NY) | Per-kund-filer: foton, PDFs, anteckningar, tidslinje | Per-kund-fokus är 90 % av staff-användning |
| `public/kalender.html` v8+ → behandlings-card | Anomaly-badge (saknade docs) | Pre-behandlings-check vid bokningsvyn |
| `public/ai-triage.html` → ny "Drive Compliance"-sektion | Anomaly-listor över alla kunder | Daily ops-vy för OWNER |

### E.2 Tre mockup-koncept (text-only)

#### Mockup A — `drive.html` global explorer

```
┌─ Drive ──────────────────────────────────────────────────┐
│                                                            │
│  [🔍 Sök i Drive: "PRP-foton våren 2025"]   [⚙️ Sync nu]  │
│                                                            │
│  📊 1 981 patientprofiler · 124 312 filer · senast: 14:32 │
│                                                            │
│  ┌─ Filterchipsbar ────────────────────────────────────┐  │
│  │ [Foton] [PDF] [Avtal] [Samtycke] [Mall] [Okänd 37] │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌─ AI-insikter (kort, scrollbar) ─────────────────────┐  │
│  │ 🟡 234 foton saknar samtycke före publicering       │  │
│  │ 🔴 12 patienter saknar journal-PDF                  │  │
│  │ 🟢 1 947 patienter har komplett dossier              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌─ Mapp-träd ──────────┐  ┌─ Innehåll ───────────────┐   │
│  │ ▾ Patienter (1 981)  │  │ Filnamn → bucket → status│   │
│  │   ▸ TP-kunder (842)  │  │ ...                       │   │
│  │   ▸ Curatiio (1 139) │  │ ...                       │   │
│  │ ▾ Mallar (78)        │  │                           │   │
│  │ ▾ Arkiv (12 433)     │  │                           │   │
│  └───────────────────────┘  └────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

**Design-DNA:** Pastel-rosa header (#FCE7F3), studio-vit-card (#FFFFFF), Inter+Lora typografi,
samma som `kalender-mockup-v8.html`.

#### Mockup B — `/major-arcana-preview customers-view` dossier "Drive"-tab

```
┌─ Anna K · Översikt · Bokningar · Foton · DRIVE · Tidslinje ┐
│                                                              │
│  📁 Drive-mapp: /Patienter/199501XX-XXXX  ·  [Öppna i Drive]│
│                                                              │
│  ┌─ Klassificerade filer (24) ──────────────────────────┐   │
│  │                                                        │   │
│  │  📷 Före-foton (8)        [▼ visa]                    │   │
│  │  📷 Efter-foton 3m (6)    [▼ visa]                    │   │
│  │  📷 Efter-foton 6m (4)    [▼ visa]                    │   │
│  │  📄 Friskförsäkran v2.3   [✅ signerad 2025-03-15]    │   │
│  │  📄 Behandlingsavtal      [✅ Nordbro v3.0, 2025-03-20]│  │
│  │  📄 Hälsodeklaration      [✅ signerad 2025-03-15]    │   │
│  │  📄 Journal (PDF)         [📥 Meridiq export, 2025-09]│  │
│  │  ❓ Okänd fil (1)          [⚠️ kräver review]          │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                              │
│  [+ Ladda upp till Drive]  [🤖 Auto-klassificera nya]       │
└──────────────────────────────────────────────────────────────┘
```

**Design-DNA:** Identisk med befintlig /major-arcana-preview customers-view-dossier-stil. Tab-rad får ett nytt
"DRIVE"-element med fil-count-badge.

#### Mockup C — `kalender.html` v8 behandlings-card med anomaly

```
┌─ Mån 02 jun · 14:00 ──────────────────┐
│                                          │
│  Anna K · FUE Hårtransplantation         │
│  3.5h · Sal 2 · Behandlare: Wendela     │
│                                          │
│  🔴 Saknar inför behandling:             │
│   • Foto-samtycke v2.0                   │
│   • Före-foton (0 av 4 vinklar)          │
│                                          │
│  [📧 Påminn patient]  [📋 Öppna Drive]  │
└──────────────────────────────────────────┘
```

**Design-DNA:** Rosa-pastel-bg på cardet (`bg-pink-50`), röd-orange anomaly-text
(`text-rose-700`), samma kort-radius som kalender-v8.

### E.3 Designprinciper

| Princip | Hur |
|---|---|
| **Synlighet utan PII** | Drive-vyn visar ALDRIG fullt personnummer i text — bara `19XX****` (5 sista maskeras) |
| **AI-överlagring, ej ersättning** | AI-pill `★ AI` på allt AI-genererat, klickbart för att se rationale |
| **Audit per klick** | Varje öppnad fil → `cco.drive.file.viewed` event |
| **Snabb laddning** | Thumbnails cachade lokalt, full bild lazy-loaded |
| **Mobile-first** | Foto-grid är 2-kol mobile, 4-kol tablet, 6-kol desktop |

*Status: PROPOSAL — inga beslut tagna än*

---

## F. Fasplan

### Fas 1 — Drive Inventory & Audit (vecka 1)

| Steg | Output | ETA |
|---|---|---|
| 1.1 | `scripts/import-drive-inventory.js` — inventory-script | 1 dag |
| 1.2 | Full inventory-körning på prod-Drive | 0.5 dag |
| 1.3 | `docs/strategy/DRIVE-INVENTORY.md` — analog till `SHAREPOINT-TEMPLATE-INVENTORY.md` | 0.5 dag |
| 1.4 | `docs/strategy/DRIVE-COVERAGE-REPORT-YYYY-MM-DD.md` — counts: Cliento-overlap, brand-distribution, bucket-distribution | 0.5 dag |
| 1.5 | `.cursor/rules/cco-drive-integration.mdc` (alwaysApply) | 0.25 dag |
| **Summa Fas 1** | 2.75 dagar |

**Gate till Fas 2:** OWNER har läst inventory + signat på buckets.

### Fas 2 — Auth, Sync Engine & Index-store (vecka 2)

| Steg | Output | ETA |
|---|---|---|
| 2.1 | Drive `changes.list`-poll i `src/ops/scheduler.js` | 1 dag |
| 2.2 | Utvidga `ccoMigrationIndexStore` med `bucket`, `aiClassification`, `lastSyncedAt` | 0.5 dag |
| 2.3 | Photo-thumbnail-cache (`data/drive-thumb-cache/`) | 1 dag |
| 2.4 | `POST /api/v1/cco-drive/sync` + `GET /sync/status` + audit-events | 1 dag |
| 2.5 | Tester: idempotens, tombstone, tokens-refresh | 1 dag |
| **Summa Fas 2** | 4.5 dagar |

**Gate till Fas 3:** Sync kör grön på prod i 48h, 0 fel.

### Fas 3 — AI-features 1, 4, 5 (vecka 3)

| Steg | Output | ETA |
|---|---|---|
| 3.1 | Feature 4 — Auto-tagging (regex + filnamn-embedding) | 4 dagar |
| 3.2 | Feature 5 — Anomaly-detector (rules-engine + integration ai-triage.html) | 4 dagar |
| 3.3 | Feature 1 — Smart Search MVP (filnamn-only, ingen OCR än) | 2 dagar |
| **Summa Fas 3** | 10 dagar |

**Gate till Fas 4:** 3 AI-features körs i staging utan extern API-anrop med PII.

### Fas 4 — UI-vy + UX (vecka 4)

| Steg | Output | ETA |
|---|---|---|
| 4.1 | `public/drive.html` global explorer (Mockup A) | 4 dagar |
| 4.2 | `public/major-arcana-preview/?view=customers` Drive-tab (Mockup B) | 3 dagar |
| 4.3 | `public/kalender.html` v8 anomaly-badge (Mockup C) | 1 dag |
| 4.4 | `public/ai-triage.html` Drive Compliance-sektion | 2 dagar |
| **Summa Fas 4** | 10 dagar |

**Gate till Fas 5:** OWNER har använt UI i 1 vecka utan blocker.

### Fas 5 — AI-features 2, 3, 6 + polish (vecka 5)

| Steg | Output | ETA |
|---|---|---|
| 5.1 | Feature 3 — Patient-tidslinje | 3 dagar |
| 5.2 | Feature 2 — Foto-klassificerare (lokal first, Claude Vision opt-in) | 5 dagar |
| 5.3 | Feature 6 — Migration-helper med proposal-store | 5 dagar |
| 5.4 | Polish: animations, empty states, error-recovery, undo-flow | 3 dagar |
| **Summa Fas 5** | 16 dagar |

**Total budget:** ~6,5 veckor solo-utveckling. Med parallell front-/backend kan Fas 3+4 köras
överlappande → ~4,5 veckor.

*Status: PROPOSAL — inga beslut tagna än*

---

## G. Compliance-prep

### G.1 Ny cursor-rule (alwaysApply)

Fil: `.cursor/rules/cco-drive-integration.mdc`

Måste innehålla:

```yaml
---
description: Drive är historiskt patientarkiv — aldrig primärkälla, alltid auditerad, AI får aldrig se PII utan signerad consent
alwaysApply: true
---
```

**Regler i mdc:n:**

1. Drive-fil-innehåll får aldrig commitas till GitHub. Endast metadata (filnamn-hash, bucket, mimeType, count).
2. Foto-klassificering med extern AI kräver `consent_photo_internal` v≥2.0.0 OCH `consent_photo_publish` v≥2.0.0 OCH explicit OWNER-toggle per session.
3. NL-search-embeddings genereras lokalt; om Claude används för query-DSL skickas BARA query-text, aldrig filnamn med personnummer.
4. Per Drive-fil-anrop ska `cco.drive.<action>` audit-event skrivas till `ccoAuditLog`.
5. Drive-files med `bucket=unknown` får inte serveras till staff utan OWNER-review.
6. Drive `changes.list` pageToken sparas i `data/drive-sync-state.json` (gitignored).
7. Personnummer i filnamn ska maskeras i alla logg-utskrifter (`19XXXXXXXXXX` → `19XX****`).
8. Drive får inte skriva tillbaka i runtime (no upload) under Fas 1–4 — read-only.
9. Drive-export till `Migration-data/drive-YYYY-MM-DD/` är OWNER-only-operation som kräver flagga `--commit --i-understand-pii`.
10. PDL 10-års retention: Drive-tombstones behålls i index även när fil raderats i Drive.

### G.2 GitHub-OK-matris

| Artefakt | I GitHub? | Plats |
|---|:---:|---|
| `drive-inventory.json` (count-only, hashade namn) | ⚠️ valbar — säkrast nej | `data/` (gitignored) |
| `DRIVE-INVENTORY.md` (PII-fri) | ✅ JA | `docs/strategy/` |
| `DRIVE-COVERAGE-REPORT-YYYY-MM-DD.md` | ✅ JA | `docs/strategy/` |
| `import-drive-inventory.js` | ✅ JA | `scripts/` |
| `cco-drive-integration.mdc` | ✅ JA | `.cursor/rules/` |
| Foton, PDFs, signerade docs | ❌ NEJ | endast Drive + ev. `Migration-data/` (iCloud) |
| Drive sync-state JSON | ⚠️ pageToken behöver inte vara PII men sparas utanför | `data/` (gitignored) |
| `aiClassification`-fält i `migrationIndex` | ⚠️ NEJ — kan innehålla foto-ID:n | `data/` (gitignored) |

### G.3 Backup-strategi

| Lager | Vad | Plats | Frekvens |
|---|---|---|---|
| Primär | Google Drive (live) | Google Workspace | runtime |
| Spegel | `Migration-data/drive-YYYY-MM-DD/` | iCloud (utanför repo) | månadsvis |
| Index | `data/migration-index.json` | Render persistent disk + iCloud backup | dagligen |
| Thumbnails | `data/drive-thumb-cache/` | Render persistent disk | regenererbart, ej backupkritiskt |

### G.4 PDL 10-års-retention

- Patientfoton + journaler i Drive: 10 år från sista vårdkontakten (PDL § 10).
- Index-tombstones behålls även när Drive-fil raderats — för att kunna bevisa att en fil
  fanns vid en viss tidpunkt.
- `ccoRetentionPolicy.js` får ny case: `drive_file` → samma 10-års-regel som journal.

*Status: PROPOSAL — inga beslut tagna än*

---

## H. Öppna frågor

Owner-beslut krävs på följande 10 frågor innan Fas 1 kan starta:

### H.1 Drive-typ och scope

**Fråga:** Är det Google Drive (Workspace eller personal) eller OneDrive eller flera samtidigt?

**Bakgrund:** Befintlig kod är Google Drive-fokuserad (`googleDriveApi.js`), men SharePoint
nyttjas redan för mallar (`SHAREPOINT-TEMPLATE-INVENTORY.md`). OneDrive Personal har inte
service-account-stöd — kräver delegated OAuth.

**Beslut behövs på:**
- [ ] Endast Google Drive Workspace (nuvarande)
- [ ] Google Drive + OneDrive samtidigt (kräver multi-provider abstraction)
- [ ] Migrera från Google Drive till SharePoint för all data

### H.2 Mapp-struktur i Drive

**Fråga:** Hur är Drive strukturerad **idag**? Sektion B.3 är hypotes. Vilka rotmappar
existerar? Är patientmappar namngivna med personnummer, kundnamn, eller hybrid?

**Bakgrund:** `scripts/migration/scanGoogleDriveApi.js` har redan logik för
`personnummer`-extrahering ur mappnamn (`buildFileRecord`), men vi vet inte den faktiska
strukturen.

**Beslut behövs på:** Fazli kör `npm run migration:preflight-drive -- --json` och delar
output. Kan göras innan Fas 1 startar.

### H.3 AI-feature-prioritet

**Fråga:** Vilken av de 6 AI-features ger högst värde för kliniken NU?

**Min hypotes:** Feature 5 (Anomaly-detector) ger omedelbar compliance-win. Feature 3
(Tidslinje) ger största "wow"-faktorn. Feature 2 (Foto-klassificerare) tar längst tid och
bör vänta.

**Beslut behövs på:** Ranking 1–6 från owner.

### H.4 Budget för extern AI

**Fråga:** Får vi spendera $X/månad på Claude API för foto-klassificering och search-DSL?

**Estimat:**
- Filnamn-embeddings: 0 kr (lokal)
- Anomaly-detector: 0 kr (rules)
- Smart Search query-DSL: ~$10/mån (få anrop, korta queries)
- Foto-klassificerare via Claude Vision: ~$500–2000/mån beroende på volym + frekvens

**Beslut behövs på:** Budget-tak per månad → vi designar därefter.

### H.5 Foto-samtyckes-status

**Fråga:** Hur många av 1 981 patientprofiler har dokumenterat foto-samtycke (v2.0+)
**signerat**?

**Bakgrund:** Utan signerat samtycke får foton **inte** skickas till extern AI. Om <50 % är
signerade → Feature 2 blir nästan oanvändbar tills retroaktiv-samtycke-flow byggs.

**Beslut behövs på:**
- Behöver vi bygga retroaktiv consent-utskick-flow först?
- Får intern-only AI (utan extern API) köras utan foto-samtycke?

### H.6 Drive-export till iCloud

**Fråga:** Får jag dumpa hela Drive-roten (~86 GB enligt runbook) till
`iCloud/Migration-data/drive-2026-05-30/` för paritetstest?

**Bakgrund:** CHANNEL-INVENTORY rad 202 säger "Skapa export-script som dumpar alla 1 981
Drive-profiler". Aldrig gjort.

**Beslut behövs på:**
- [ ] Ja, kör en full dump
- [ ] Nej, kör bara metadata-sync (ingen binär kopia utanför Drive)
- [ ] Endast sample (100 patientprofiler)

### H.7 Hantering av "okända" filer

**Fråga:** För filer som bucket=`unknown` (mappen Marketing, gamla testar, slumpvisa
upload): radera, arkivera, eller låta vara?

**Bakgrund:** Antagligen finns ~5–10 % filer som inte är patientdata och inte är
production-mallar. De skräpar i inventory.

**Beslut behövs på:**
- [ ] Vi flyttar dem till `<DRIVE_ROOT>/_AUDIT_UNKNOWN/` automatiskt
- [ ] Vi flaggar i UI men rör inget
- [ ] OWNER granskar manuellt en gång

### H.8 Real-time vs batch-sync

**Fråga:** Behöver Drive-sync vara real-time (webhook) eller är 10-min-polling OK?

**Bakgrund:** Google Drive stöder push-notifications via `watch`-endpoint. Kräver public
HTTPS-endpoint på prod. 10-min-polling är enklare men kan missa kortlivade filer.

**Beslut behövs på:** Polling-frekvens (5/10/30 min) eller webhook.

### H.9 Multi-tenant: Hair TP + Curatiio

**Fråga:** Är Drive-roten **delad** mellan Hair TP och Curatiio, eller har varje brand egen
mapp/drive?

**Bakgrund:** Cliento delar kundbas (per import-cliento-customers.js note rad 25).
SharePoint har separata mappar per brand. Drive okänt.

**Beslut behövs på:** Mapp-namn för respektive brand om delad rot, annars två
folder-IDs i env.

### H.10 Cutover-plan

**Fråga:** När Drive-integrationen är klar — fortsätter klinik att ladda upp till Drive,
eller flyttar de helt till CCO?

**Bakgrund:** Om Drive blir read-only → vi behöver upload-flow i CCO UI som skriver
**direkt till CCO storage** (inte Drive). Om Drive fortsätter → bibehåll dubbel-write.

**Beslut behövs på:**
- [ ] Drive fortsätter som primär uppladdning (CCO är sekundär läsare)
- [ ] CCO blir primär — Drive blir read-only-arkiv (cutover-datum krävs)
- [ ] Dubbel-write tills cutover (definiera cutover-trigger)

*Status: PROPOSAL — inga beslut tagna än*

---

## Summering

Drive-integration är inte ett nybygge — det finns redan ~10 scripts, en server-route, en
proxy-endpoint och 3 cursor-rules som berör Drive. Vad som **saknas** är:

1. En **inventory-rapport** i samma stil som `SHAREPOINT-TEMPLATE-INVENTORY.md`
2. En **coverage-rapport** som visar Drive vs Cliento-overlap
3. Ett **AI-lager** som lyfter Drive från "passiv filserver" till "smart patient-arkiv"
4. En **dedikerad UI-vy** (`drive.html` + dossier-tab) som speglar SharePoint-mönstret
5. En **konsoliderad compliance-rule** (`cco-drive-integration.mdc`)

Det 5-fas-plan som beskrivs ovan följer exakt samma rytm som Cliento → Meridiq →
SharePoint-flödet (preflight → import → audit → store → UI), med Tier 3 som det nya
AI-tilläggsteget.

**Nästa konkreta steg om owner godkänner:**

1. Owner svarar på H.1 + H.2 + H.6 (lägstanivå för Fas 1)
2. Jag kör `npm run migration:preflight-drive -- --json` och bekräftar mapp-struktur
3. Jag skapar `scripts/import-drive-inventory.js` (1 dag)
4. Vi får `DRIVE-INVENTORY.md` (analog till SHAREPOINT) inom 2,75 dagar

*Status: PROPOSAL — inga beslut tagna än*
