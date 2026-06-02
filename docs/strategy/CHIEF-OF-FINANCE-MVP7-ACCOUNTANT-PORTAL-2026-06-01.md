# Chief of Finance MVP 7 (CF.8) — Accountant Review Portal

**Sprint:** CF.8 · **Datum:** 2026-06-01
**Scope:** Dedikerad revisor-vy · read-only + review-status · komplett export-paket med manifest + receipt-bilagor
**Status:** ✅ **LEVERERAT · 71/71 PASS · 11/11 acceptance**

---

## 0 · TL;DR

| | |
|---|---|
| Nya filer | 3 (`ccoFinanceReviewStore.js` · `ccoFinanceReviewPackager.js` · `public/finance-review.html` · CF.8-rapport) |
| Modifierade filer | 2 (`server.js` · `ccoFinanceDashboardBuilder.js`) |
| Nya routes | **7** (review-list + detail + status + note + build-package + manifest + attachment) |
| Nya audit-kinds | **8** (review.opened/export_downloaded/marked_reviewed/needs_correction/accepted/rejected/note_added/package_built) |
| Smoke-test | ✅ **71/71 PASS · 0 fail** |
| Acceptance | ✅ 11/11 uppfyllda |
| Säkerhet | ✅ ingen AI/OCR · ingen Fortnox-write · ingen Drive-länk · revisor är read-only på expenses |

---

## 1 · Vad är byggt

### 1.1 `src/ops/ccoFinanceReviewStore.js` (ny, ~210 rader)

Review-status per export-batch (1:1-relation). Revisor lämnar bara review-status + notes — **rör aldrig original-expense**.

**Status-machine:**
```
pending → reviewed → accepted_for_bookkeeping (final)
        ↘
          needs_correction (kräver owner/finance-action)
        ↘
          rejected_with_reason (final)
```

**Final statuses (`accepted_for_bookkeeping`, `rejected_with_reason`) är låsta** — kan inte ändras.

**API:**
- `getOrCreateForBatch({batchId, actor})` — auto-create med `pending` vid första åtkomst → audit `cf.review.opened`
- `setStatus({batchId, newStatus, reason, actor})` → audit per status-kind
- `addNote({batchId, text, actor})` → audit `cf.review.note_added`
- `recordDownload({batchId, fileType, sizeBytes, actor})` → audit `cf.review.export_downloaded`
- `attachManifest({batchId, manifestKey, packageKey, attachmentKeys, actor})`
- `getByBatchId(id)` · `listReviews({status, reviewerId, batchId, limit})` · `summary()`

**Fält per review:**
- `id, batchId, status, reviewer, reviewedAt, decidedAt`
- `notes[]` — chronological lista (revisor + system-anteckningar från status-byten)
- `manifestKey, packageKey, attachmentKeys[]` — sätts av packagern
- `history[]` — full status-historik

### 1.2 `src/ops/ccoFinanceReviewPackager.js` (ny, ~180 rader)

Bygger **komplett revisor-paket** för en export-batch:
1. Hittar existerande CSV + JSON i secure storage (sökt bakåt 12 månader UTC)
2. Plockar receipt-attachments för alla expenses i batch (via `receiptStore.getById`)
3. Bygger **manifest med fixed schema:**
   - `manifestId, batchId, createdAt, createdBy, period`
   - `numberOfExpenses, numberOfReceipts`
   - `totals: { totalGrossSek, totalNetSek, totalVatSek, totalDeductibleVatSek, totalNonDeductibleVatSek, reverseChargeCount, reverseChargeAmountSek }`
   - `files: [{ kind, storageKey, sizeBytes, checksum, mimeType, ... }, ...]` — CSV + JSON + alla bilagor
   - `fortnoxStatus: 'BLOCKED_INTEGRATION ...'`
   - `securityNotes: [...]`
4. Sparar manifest som `exports/reviews/YYYY-MM/<batchId>-manifest.json` i secure storage
5. Anropar `reviewStore.attachManifest` så review-objektet pekar på manifest
6. Audit `cf.review.package_built`

**SHA256-checksum per fil** för integritetsverifiering. **Inga externa länkar** — bara storage-keys.

### 1.3 `server.js` — 7 nya CF.8-routes

| Method | Path | RBAC | Audit-kind |
|---|---|---|---|
| GET | `/api/v1/cco-cf/review/exports` | owner/finance/revisor | — |
| GET | `/api/v1/cco-cf/review/exports/:batchId` | owner/finance/revisor | `cf.review.opened` (om ny) |
| POST | `/api/v1/cco-cf/review/exports/:batchId/status` | owner/finance/revisor | `cf.review.marked_reviewed/needs_correction/accepted_for_bookkeeping/rejected` |
| POST | `/api/v1/cco-cf/review/exports/:batchId/note` | owner/finance/revisor | `cf.review.note_added` |
| POST | `/api/v1/cco-cf/review/exports/:batchId/build-package` | owner/finance/revisor | `cf.review.package_built` |
| GET | `/api/v1/cco-cf/review/exports/:batchId/manifest` | owner/finance/revisor | `cf.review.export_downloaded` |
| GET | `/api/v1/cco-cf/review/exports/:batchId/attachment/:receiptId` | owner/finance/revisor | `cf.review.export_downloaded` |

**RBAC-nyans:** Alla 3 roller (owner/finance/revisor) får skriva på review-objekt (set status, add note, build package). Men **bara owner/finance får skriva på själva expense/receipt** (via existerande `cfMutateRBAC`). Revisor är därmed read-only på affärsdata men write på review-metadata.

Attachment-routen **verifierar** att receiptId är länkad till en expense i batchen — annars 403.

### 1.4 `public/finance-review.html` (ny, ~280 rader)

Dedikerad revisor-portal · vellum-warm design konsistent med `/finance.html`.

**Layout:**
- Header med role-badge + meta
- "📋 Read-only granskning"-banner som förklarar revisorns mandat
- 6 KPI-kort: Pending review · Reviewed · Accepted · Needs correction · Rejected · Senaste aktivitet
- Filter-panel: status · sök (batchId/leverantör) · från-datum · till-datum · refresh
- Batch-lista med status-pillar i färg
- Detail-panel som öppnas vid klick på batch:
  - Totals-grid (batch-id · datum · expenses · receipts · brutto · moms · avdragsgill · status)
  - Action-buttons: ⬇ CSV · ⬇ JSON · 📦 Bygg manifest-paket · ⬇ Manifest · ✓ Reviewed · ⚠ Needs correction · ✓✓ Accept · ✗ Reject
  - Per-expense-rad med 📄 kvitto-länk (om kopplad)
  - Notes-tråd med textarea för nya notes (dolt vid final status)

### 1.5 `src/ops/ccoFinanceDashboardBuilder.js` (utökad)

Nytt `dashboard.review`-block med `total, byStatus, pendingCount, reviewedCount, acceptedCount, needsCorrectionCount, rejectedCount, latestActivityAt`.

**2 nya anomalies:**
- `review_pending` (medium)
- `review_needs_correction` (high)

---

## 2 · Smoke-test (71/71 PASS)

```
A1  · getOrCreateForBatch — auto-create pending   4/4 PASS
A2  · setStatus → reviewed                        5/5 PASS
A3  · needs_correction + reason → notes           3/3 PASS
A4  · addNote                                     2/2 PASS
A5  · accepted_for_bookkeeping är final           4/4 PASS
A6  · Okänd status kastar                         1/1 PASS
A7  · rejected_with_reason                        2/2 PASS
A8  · End-to-end export-batch                     1/1 PASS
A9  · buildReviewPackage + manifest verifierat   12/12 PASS
A10 · recordDownload audit                        1/1 PASS
A11 · Revisor kan INTE ändra original-expense     5/5 PASS
A12 · Dashboard review-block + KPI                4/4 PASS
A13 · Server routes (alla 7)                      7/7 PASS
A14 · Revisor-portal HTML                         8/8 PASS
A15 · Säkerhet                                    5/5 PASS
A16 · Alla 7 audit-kinds verifierade              7/7 PASS

✓ ALL PASS — 71 assertions · 0 fail
```

---

## 3 · Acceptance-check (alla 11 från owner-spec)

| # | Krav | Status | Bevis |
|---|---|---|---|
| 1 | Revisor kan öppna read-only portal | ✅ | `/finance-review.html` med read-only-banner · RBAC `cfRBAC` (owner/finance/revisor) |
| 2 | Revisor kan se expenses och kvitton | ✅ | GET `/review/exports/:batchId` returnerar expenses[] + receipts[] · UI visar per-expense med kvittolänk |
| 3 | Revisor kan filtrera underlag | ✅ | UI: status · datum from/to · sök · A14d verifierad |
| 4 | Revisor kan ladda ner exportpaket | ✅ | A10 + UI: ⬇ CSV · ⬇ JSON · ⬇ Manifest · 📄 kvitto via secure-storage-proxy |
| 5 | Export manifest skapas | ✅ | A9 — `buildReviewPackage` skapar manifest med 12 verifierade fält + checksum per fil |
| 6 | Revisor kan markera reviewed/needs_correction/accepted | ✅ | A2/A3/A5/A7 — alla 4 status-transitions + audit per kind |
| 7 | Revisor kan inte ändra original-expense | ✅ | A11 — review-store saknar updateExpense/setVatMode/etc · RBAC: write-routes (PATCH `/expenses/:id`) är `cfMutateRBAC` (owner+finance only) — inte revisor |
| 8 | Audit fungerar | ✅ | A16 — 7 nya kinds verifierade (8 totalt med package_built) |
| 9 | RBAC fungerar | ✅ | Alla 7 routes har `requireAnyRole(cfRBAC)` · attachment-route verifierar batch-koppling (403 om ej kopplad) |
| 10 | Inga filer i repo | ✅ | `data/cco/finance-reviews.json` gitignored · manifest + bilagor i secure storage |
| 11 | Ingen Fortnox-write · Ingen AI/OCR | ✅ | A15 — 0 anrop till fortnox/openai/anthropic/tesseract · ingen Drive-länk |

---

## 4 · Säkerhet (alla regler hållna)

| Regel | Status | Detalj |
|---|---|---|
| Inga kvitton/bankfiler i GitHub | ✅ | Reviews i `data/` gitignored · bilagor i secure-storage-rot (Migration-data) |
| Inga patientdata i CF-export | ✅ | Manifest exponerar bara expense-fält + storage-keys · ingen patient-data hämtas av packager |
| Secure storage | ✅ | Alla bilagor + manifest via `secureStorage.putObject/getObject` · ingen direkt fs-access |
| RBAC enforced | ✅ | Alla 7 routes har `requireAnyRole(cfRBAC)` · attachment-route har extra batch-koppling-check |
| Read-only för revisor | ✅ | Revisor kan SKRIVA på review-objekt (review-status/notes) men INTE på expense/receipt — A11 verifierat |
| Audit på allt | ✅ | 8 nya kinds emittas med både `action` + `kind`-fält |
| Ingen extern AI/OCR | ✅ | A15a/c — 0 anrop |
| Ingen Fortnox-write | ✅ | Manifest noterar `fortnoxStatus: 'BLOCKED_INTEGRATION'` |
| Ingen bank-CSV-import | ✅ | CF.8 läser inte bank-data |
| Ingen payroll | ✅ | CF.8 berör inte löner |
| Inga Drive-länkar | ✅ | A14h + A15d — 0 träffar på `drive.google.com`/`onedrive` |

---

## 5 · End-to-end workflow

**Initial setup (en gång):**
1. Owner skickar revisor `https://major-arcana-frankfurt.onrender.com/finance-review.html` + revisor-konto

**Per period (månadsvis/kvartalsvis):**
1. Owner/finance bygger export-batch via `/finance.html` → "Bygg exportpaket"
2. Revisor öppnar `/finance-review.html` · ser ny batch som `pending`
3. Revisor klickar batch → detail-panel visar alla expenses + totals + kvittolänkar
4. Revisor klickar **📦 Bygg manifest-paket** → server skapar manifest med checksums + listar alla bilagor
5. Revisor laddar ner CSV/JSON/manifest/individuella kvitton för granskning
6. Revisor lämnar notes via textarea (audit per note)
7. Revisor markerar status: **✓ Reviewed** → **✓✓ Accept for bookkeeping** (final)
   - ELLER **⚠ Needs correction** (med reason) → owner/finance gör fix → revisor reviewar igen
   - ELLER **✗ Reject** (med reason, final)
8. Audit-trail visar full review-historik

**Per status-kind audit:**
- `cf.review.opened` när first öppnad
- `cf.review.marked_reviewed` vid `reviewed`-status
- `cf.review.needs_correction` med reason
- `cf.review.accepted_for_bookkeeping` (decidedAt sätts)
- `cf.review.rejected` (decidedAt sätts)
- `cf.review.note_added` per note
- `cf.review.export_downloaded` per CSV/JSON/manifest/attachment-download
- `cf.review.package_built` vid manifest-skapande

---

## 6 · Vad är MISSING (medvetet)

| Område | Status | Notering |
|---|---|---|
| Email-notifikation till revisor vid ny batch | MISSING | Kräver mail-pipeline (CCO-spår) eller separat notif-modul |
| Zip-paket (alla filer i en bundle) | MISSING | Manifest pekar på enskilda storage-keys — revisor laddar ner per fil. Framtida polish. |
| Revisor-rapport-template (PDF) | MISSING | Manifest är JSON · framtida PDF-template kan läggas till |
| Multi-period-jämförelse | MISSING | Idag en batch i taget · framtida cross-period-vy |
| Skatteverkets SIE-format | MISSING | CF.5+ separat sprint |
| Fortnox voucher-sync från accepterade batches | MISSING (BLOCKED) | CF.9 efter Fortnox OAuth |

---

## 7 · Owner-action (icke-blockerande)

| # | Action |
|---|---|
| 1 | Lägg `revisor`-role i tenant-config + tilldela revisor-user |
| 2 | Skicka URL `/finance-review.html` till revisor |
| 3 | Skapa minst en export-batch via `/finance.html` så revisor har något att granska |
| 4 | Testa workflow: revisor öppnar batch → 📦 Bygg paket → ⬇ Manifest → ✓✓ Accept for bookkeeping |

---

## 8 · Stoppvillkor (icke utlösta)

| Villkor | Status |
|---|---|
| Patientdata till GitHub | ✅ NEJ |
| Kvitton/bankfiler i repo | ✅ NEJ — allt via secureStorage |
| Extern AI/OCR | ✅ NEJ |
| Fortnox-write | ✅ NEJ |
| Drive-länkar | ✅ NEJ |
| Externa URL:er i manifest | ✅ NEJ — bara storage-keys |
| Bank-CSV | ✅ NEJ |
| Payroll | ✅ NEJ |

---

## 9 · Sammanfattning

| | |
|---|---|
| Filer skapade | 3 (`ccoFinanceReviewStore.js` · `ccoFinanceReviewPackager.js` · `public/finance-review.html`) + rapport |
| Filer modifierade | 2 (`server.js` · `ccoFinanceDashboardBuilder.js`) |
| Routes tillagda | 7 |
| Audit-kinds tillagda | 8 (review.opened/export_downloaded/marked_reviewed/needs_correction/accepted/rejected/note_added/package_built) |
| Smoke-test | ✅ **71/71 PASS** |
| Acceptance | ✅ 11/11 |
| Säkerhet | ✅ 11/11 regler hållna |
| CF.4-CF.7 backåtkompatibel | ✅ — CF.8 är additivt · review-objekt är 1:1 med export-batch |

---

**Sprint CF.8 leverans:** 3 nya filer · 2 modifierade · 7 routes · 8 audit-kinds · 71-assertion smoke-test grön · 11/11 acceptance ✅. Revisor får dedikerad read-only-portal med komplett export-paket (CSV+JSON+manifest+checksum+bilagor) — allt via secure storage. Inga säkerhetsregler brutna.

**Rapport-författare:** Claude (Sprint CF.8)
**Datum:** 2026-06-01
