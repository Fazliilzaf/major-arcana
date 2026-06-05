# ORD-24 — Dokument-segment backend (schema + endpoints + integration)

**Skapad:** 2026-06-05
**Owner-spår:** Cursor (write — backend datamodell + endpoints)
**Claude-spår:** UAT efter deploy + frontend-konsumtion via ORD-25 Fas C
**Prio:** P1
**Status:** **PENDING** — owner-svar 2026-06-05 lockade alla 6 open questions, ORD klar för Cursor

---

## Bakgrund

Owner levererade canonical dokument-katalog 2026-06-05 (`docs/reference/HAIRTP-DOCUMENT-INVENTORY-2026-06-05.md`) — **36 dokument fördelade på 3 grupper** (15 kund-formulär · 11 personal-formulär · 10 info-dokument). Varje dokument ska klassificeras längs **5 axlar** (filler/category/journeyStep/flow/language) plus bonus-fält (requiredFor/formProvider/legallySensitive).

Detta ORD bygger backend-datalagret som driver:

- v11 dokument-segmentvyn (ORD-25 Fas C) — 4 grupper med filter-rad
- Smart Next Step (ORD-3+18) — `requiredFor` blockerar nästa-steg-actions
- Triage-engine — auto-routar inkommande dokument till rätt patient + flow + step

Utan detta är v11 Fas C blockerad och visar tom-state.

---

## Scope (strikt)

### 1. `ccoDocumentTypeRegistry` (static catalog)

Ny modul: `src/ops/ccoDocumentTypeRegistry.js`

Innehåller alla 36 dokument-typer som static catalog (read-only). Shape (uppdaterad efter owner-svar 2026-06-05):

```js
{
  id: 'haelso_tp_sve',
  name: 'Hälsodeklaration · Hair TP Clinic',
  clinic: 'hairtp',                    // hairtp | curatiio (Profhilo → curatiio)
  filler: 'patient',                   // patient | staff | system_auto
  category: 'intake',                  // intake | commit | treatment | follow_up | info | internal
  journeyStep: 3,                      // 1–9 eller 'cross'
  flowApplies: ['tp'],                 // tp | prp_hair | prp_skin | microneedling | prf | profhilo | all
  language: 'sv',                      // sv | en | sv+en
  requiredFor: ['konsultation'],       // vilka journey-steg som blockeras
  formProvider: 'meridiq_g4',          // meridiq_g4 | manual | email_template | sms_template | static
  legallySensitive: true,              // → kräver e-sig + audit-log
  surfaces: ['document_group'],        // hero_briefing | journal_pdf | document_group | attachment
  alsoUsedAs: null,                    // ex. 'attachment' för före/efter-bildmallar
}
```

**Special-cases från owner-svar 2026-06-05:**

- **Profhilo-flöde (Offert · Profhilo #9 m.fl.):** `clinic: 'curatiio'` (systerklinik, inte Hair TP)
- **Journal · PRP/PRF/Microneedling (#21):** EN entry med `flowApplies: ['prp_hair','prp_skin','prf','microneedling']`
- **Konsultationsmall (#23):** `surfaces: ['hero_briefing', 'journal_pdf']` — key fields extraheras till hero, hela PDF:en lever i journal
- **Före/efter-bildmallar (#35):** `surfaces: ['document_group', 'attachment']` + `alsoUsedAs: 'attachment'`
- **Internt SMS (#36):** `surfaces: ['document_group']` — syns i kundvy auto-dokument
- **Ångerfrist #10 + #11:** två separata entries (olika juridiska scenarier)

Export: `getAllDocumentTypes()`, `getDocumentTypeById(id)`, `filterDocumentTypes({ clinic, filler, category, journeyStep, flow, language, surface })`.

**Initial data:** Importera från `docs/reference/HAIRTP-DOCUMENT-INVENTORY-2026-06-05.md` tabellerna. 36 entries.

### 2. `ccoDocumentInstanceStore` (per-patient state)

Ny store: `src/ops/ccoDocumentInstanceStore.js` (analog till `ccoJournalReadAudit` / `ccoJournalFillAuditStore` per ORD-23).

Track per dokument-instans:

- `instanceId`
- `patientId`
- `documentTypeId` (refererar registry)
- `status` (`pending` | `sent` | `viewed` | `filling` | `filled` | `signed` | `delivered` | `archived`)
- `createdAt`
- `sentAt`, `filledAt`, `signedAt`, `deliveredAt` (per status-transition)
- `actor` (vem genomförde varje state-transition)
- `payload` (länk till PDF / form-data / mail-id beroende på provider)
- `auditRef` (back-ref till ccoAuditTrail)

Actions: `createInstance(patientId, documentTypeId)`, `transition(instanceId, newStatus, actor)`, `listForPatient(patientId)`.

### 3. Aggregator: `buildPatientDocumentBundle(patientId)`

Ny modul: `src/ops/ccoPatientDocumentAggregator.js`

Returnerar **alla 4 v11-grupper i form som UI kan render:a**:

```js
{
  counts: { total: 14, klara: 8, vantar: 1, kommer: 5 },
  filtersAvailable: {
    fillerCounts: { patient: 8, staff: 4, system_auto: 2 },
    flowCounts: { tp: 9, prp_hair: 5, all: 0 },
  },
  groups: {
    offerter: [
      { instanceId, documentType, status, flow, beloppKr, sentAt, signedAt }
    ],
    haelsoSamtycke: [
      { instanceId, documentType, status, signedBy, signedAt, plannedFor }
    ],
    journaler: [
      { instanceId, documentType, status, filledBy, filledAt, plannedFor }
    ],
    autoDokument: [
      { instanceId, documentType, status, channel, deliveredAt }
    ],
  }
}
```

Logik: hämta `ccoDocumentInstanceStore.listForPatient()`, joina mot `ccoDocumentTypeRegistry`, gruppera per category-bucket (`commit` → offerter, `intake+treatment(patient)` → haelsoSamtycke, `treatment(staff)+follow_up` → journaler, `info+internal` → autoDokument), beräkna counts + filtersAvailable.

### 4. Endpoint: `GET /api/v1/cco-patient-master/patient/document-bundle`

```
GET /api/v1/cco-patient-master/patient/document-bundle?patientId=X
```

Returnerar `buildPatientDocumentBundle(X)`. RBAC: `customers.read`. Patientdata redacted enligt befintliga regler.

### 5. Integration i `dossier-bundle` (ORD-23-endpoint)

Utöka `GET /api/v1/cco-patient-master/patient/dossier-bundle` att inkludera `documents: { offerter, haelsoSamtycke, journaler, autoDokument, filtersAvailable, counts }` som top-level key. Frontend (v11) behöver bara ETT API-call.

### 6. Triage-engine integration (när inkommande dokument klassas)

I `src/cm/cmAiExtractor.js` (eller liknande triage-modul): vid inkommande mail/form-submit, klassificera dokumentet mot `ccoDocumentTypeRegistry` (regex på subject + flow-detection) och skapa `ccoDocumentInstanceStore.createInstance()` med rätt patientId + documentTypeId.

### 7. Smart Next Step koppling

I `src/ops/ccoSmartNextStepStore.js`: när `requiredFor`-fält är satt på en document-type, blockera de listade journey-stegen tills instansen är `signed` / `filled`. Befintlig logik utökas med dokument-readiness-check.

---

## OUT OF SCOPE

- **Form-rendering** — Meridiq G4 äger formulär-rendering, vi lagrar bara state
- **PDF-generering** — separat infrastruktur (befintlig `ccoOfferDocumentPackageBuilder`)
- **Mail/SMS-skickande** — befintliga adapters används, vi lagrar bara att de skickats
- **v11 frontend-render** — ligger i ORD-25 Fas C, konsumerar denna backend
- **Profhilo-flöde** om owner svarar "subkategori under skin-injektion" → då behöver registry-strukturen justeras (väntar svar)

---

## ✅ OPEN QUESTIONS — LOCKED 2026-06-05

Alla 6 frågor besvarade av owner. Decisions inbakade i scope ovan. Se `docs/reference/HAIRTP-DOCUMENT-INVENTORY-2026-06-05.md` "Owner-svar 2026-06-05" för detalj.

**1 follow-up question kvar (icke-blockerande):** PRP-skin (#6) + Microneedling (#7+#14) + PRF (#8) — tillhör även dessa Curatiio? Default `clinic: 'hairtp'` tills owner bekräftar. Kan ändras post-deploy via registry-edit utan migration.

---

## Acceptance Criteria

- [ ] `ccoDocumentTypeRegistry` exporterar 36 entries (justeras efter open-Q-svar)
- [ ] `ccoDocumentInstanceStore` har create/transition/list-actions + audit-hook
- [ ] `GET /api/v1/cco-patient-master/patient/document-bundle?patientId=X` returnerar 4-grupps payload
- [ ] `dossier-bundle`-endpoint inkluderar `documents`-section
- [ ] Triage-engine skapar instanser för inkommande dokument
- [ ] Smart Next Step blockerar steg baserat på `requiredFor`
- [ ] `npm test` PASS
- [ ] Nya unit-tester för registry-filter + aggregator-grouping
- [ ] verify-script 13/13 oförändrat

---

## Risker + Mitigation

| Risk                                                            | Mitigation                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Owner svar på open Q ändrar registry-shape efter implementation | Vänta svar INNAN handover (status DRAFT just nu)                                     |
| 36 entries hårdkodade blir svåra att uppdatera                  | Importera från JSON-fil (`src/data/document-types.json`) som registry läser vid boot |
| Bundle-payload blir för stor per patient                        | Lazy-load: bundle returnerar bara IDs + counts initialt, sektioner laddas on-demand  |
| Triage-engine miss-klassificerar inkommande dokument            | Fallback: skapa instans utan documentTypeId, flagga för manuell triage               |

---

## När Cursor klar — Claude UAT

1. `curl /api/v1/cco-patient-master/patient/document-bundle?patientId=TEST` — verifiera 4-grupps shape
2. Verifiera registry-counts: 36 entries totalt (eller justerat efter open-Q-svar)
3. Verifiera `dossier-bundle` inkluderar `documents`-section
4. Test triage-engine med sample inkommande mail → instans skapas?
5. Test Smart Next Step → blockerad action när `requiredFor`-dok saknas?
6. `node scripts/verify-ord16-progress.js` 13/13 PASS

---

## Referens

- **Document inventory:** `docs/reference/HAIRTP-DOCUMENT-INVENTORY-2026-06-05.md`
- **v11 frontend-konsument:** `docs/handover/ORDERS/ORD-25-kundkort-v11-port.md` (Fas C)
- **Backend-kontext:** ORD-23 (allergi + journey-state + dossier-bundle) — denna utökar dossier-bundle
- **Triage-modul:** `src/cm/cmAiExtractor.js` (befintlig)

---

_Status: DRAFT 2026-06-05 · väntar owner-svar på 6 open questions innan handover till Cursor + Notion_
