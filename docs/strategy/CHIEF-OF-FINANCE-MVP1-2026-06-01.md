# Chief of Finance MVP 1 — Implementation Report

**Sprint:** CF.2 · **Datum:** 2026-06-01
**Scope:** Finance Dashboard + Receipt Inbox
**Inga:** payroll · bokföringsmotor · extern AI/OCR · ny tredjepartsintegration · Fortnox-write

---

## 0 · TL;DR

**MVP 1 levererat:** Finance Dashboard + Receipt Inbox med upload, secure storage, audit, RBAC, CCO-kundkort-koppling, Fortnox/Swish-status. **Inga writes till Fortnox.** **Inga kvitton i GitHub.** **Ingen extern AI.**

| | |
|---|---|
| Nya filer | 3 (ccoReceiptStore · ccoFinanceDashboardBuilder · finance.html) |
| Modifierad | 1 (server.js — store-mount + 7 routes) |
| Nya routes | **7** (`/api/v1/cco-cf/dashboard` + 6 receipt-routes) |
| Nya audit-kinds | **7** (cf.dashboard.viewed · cf.receipt.uploaded/updated/categorized/rejected/exported/downloaded) |
| Nya RBAC-roller | `finance` + befintlig `revisor` (read-only) |
| Secure storage path | `receipts/YYYY-MM/<sha8>-<uuid>.{pdf\|jpg\|png\|webp}` |
| UAT-regress | ✅ 13 PASS · 1 PARTIAL · 0 FAIL · 0 buggar (oförändrat) |
| Smoke-test receipt-store | ✅ upload + update + audit + summary fungerar |

---

## 1 · Vad är byggt

### 1.1 `src/ops/ccoReceiptStore.js` (ny, ~180 rader)

Receipt-store med:
- **Status-machine:** `new → needs_review → categorized → exported` (eller `→ rejected`)
- **15 kategorier** (utrustning, förbrukning, lokal, personal, utbildning, resor, mat_representation, marknadsföring, administrativ, it_telefoni, försäkring, juridik_konsult, bank_finansiell, skatter_avgifter, annat)
- **7 sourceSystem** (manual_upload · mobile_photo · receipt_mail_import · drive_import · fortnox_import · bank_csv_import · swish_import)
- **CCO-koppling:** `customerId · encounterId · treatmentId · offerId` per kvitto
- **Audit på allt:** uploadReceipt → `cf.receipt.uploaded` · updateReceipt → `cf.receipt.updated` · auto-`cf.receipt.categorized` när kategori sätts · transitionStatus → `cf.receipt.rejected` / `.exported`
- **Secure storage:** `secureStorage.putObject(storageKey, buffer)` med SHA256
- **Persist:** JSON i `data/cco/receipts.json` (gitignore'at)

API: `uploadReceipt({buffer, mimeType, originalFileName, actor, sourceSystem, metadata})` · `updateReceipt({id, patch, actor})` · `transitionStatus({id, newStatus, reason, actor})` · `listReceipts({status, sourceSystem, customerId, limit})` · `getById(id)` · `summary()`

### 1.2 `src/ops/ccoFinanceDashboardBuilder.js` (ny, ~150 rader)

Aggregator för dashboard. **READ-ONLY**. Läser från:
- `ccoFortnoxStore.getPublicStatus()` → connection-status
- `ccoSwishStore.getPublicStatus()` → connection-status
- `ccoCommercialStore.listAll()` → outstanding / paid today/week/month / deposit-summary
- `ccoReceiptStore.summary()` → receipt-counts per status/category/source
- `ccoFortnoxInvoiceLister` → noteras (full sync är MVP 3)

**Gissar aldrig:**
- `partial: true` om Fortnox ej ansluten
- `note: 'Fortnox connected — full invoice sync är MVP 3'` när Fortnox är på men inte alla kunder synkade
- Anomalies: `overdue_invoices · receipts_need_review · fortnox_not_connected · swish_not_connected`

### 1.3 `public/finance.html` (ny, ~280 rader)

Vellum-warm UI som matchar resten av CCO. Innehåller:
- **8 KPI-kort:** Idag/Vecka/Månad-betalt · Utestående · Förfallna · Depositioner · Kvitton att hantera · Kvitton totalt
- **Integration-pills:** Fortnox + Swish med ✓ ansluten / ej kopplad
- **Anomalies-strip:** röd för high (overdue/fortnox_off) · gul för medium (receipts_need_review/swish_off)
- **Upload-card:** drag-and-drop / klick → multipart/form-data till `/api/v1/cco-cf/receipts/upload`
- **Receipt Inbox:** lista med filter (Alla · Ny · Behöver granskas · Kategoriserad · Exporterad · Avvisad)
- **Per-kvitto-rad:** thumb · supplier/kategori/datum/källa · belopp · status-badge · Visa-knapp (öppnar `/api/v1/cco-cf/receipts/:id/download`)
- **Kund-koppling:** `→ kundkort`-länk när `customerId` är satt (går till `/kunder.html?customer=...`)
- **Mobile-friendly:** responsive grid; KPI-kort 2 kolumner under 680px

**Auto-refresh:** ingen (manuell ↻-knapp). Eventuell future-feature.

### 1.4 7 routes i `server.js` (`/api/v1/cco-cf/*`)

| Route | RBAC | Audit-kind |
|-------|------|------------|
| `GET /dashboard` | owner/finance/revisor | `cf.dashboard.viewed` |
| `GET /receipts?status=&limit=` | owner/finance/revisor | — (read) |
| `GET /receipts/:id` | owner/finance/revisor | — (read) |
| `POST /receipts/upload` (multer 20MB) | owner/finance | `cf.receipt.uploaded` |
| `PATCH /receipts/:id` | owner/finance | `cf.receipt.updated` / `cf.receipt.categorized` |
| `POST /receipts/:id/status` | owner/finance | `cf.receipt.rejected` / `cf.receipt.exported` |
| `GET /receipts/:id/download` | owner/finance/revisor | `cf.receipt.downloaded` |

**`revisor` är read-only** — får inte upload/patch/transition.

---

## 2 · Vilka stores/routes används

**Lästa (read-only):**
- `ccoFortnoxStore` — connection-status
- `ccoSwishStore` — connection-status
- `ccoCommercialStore` — listAll() för income/outstanding/deposit-aggregering
- `ccoFortnoxInvoiceLister` — finns men full sync är MVP 3

**Skrivna (nytt skikt):**
- `ccoReceiptStore` — uppladdade kvitton (egen JSON-fil i `data/cco/receipts.json`)
- `ccoAuditLog` — audit-trail för CF-mutationer
- `ccoSecureStorageProvider.putObject/getObject` — kvitto-binärfiler

**Tidigare existerande, ej rörda:**
- `ccoPaymentStatusAdapter` (för patientkort `ekonomi`-sektion — fungerar oförändrat)
- `ccoPatientCardSectionBuilder` (oförändrat)
- `ccoVendorRegisterStore` (PUB-info, inte fakturor)

---

## 3 · Vad är mock/partial

| Område | Status | Notering |
|--------|--------|----------|
| **Fortnox dashboard-KPI:er** | PARTIAL | Visas men flaggas `partial: true` när Fortnox ej ansluten. Aggregeras från `ccoCommercialStore` som fallback. |
| **Income today/week/month** | PARTIAL | Från `ccoCommercialStore.listAll()` — finns bara om commercial-cases skapas via offert-flödet idag. När Fortnox-sync är wireat (MVP 3) blir det fullt. |
| **Receipt OCR / auto-categorization** | MISSING (medvetet) | Kräver owner-GO för extern AI. Inte med i MVP 1. |
| **Mail-källa till receipt-inbox** | MISSING | Cursor-spår-arbete. `receipt_mail_import` finns i `VALID_SOURCE_SYSTEMS` redo att konsumera. |
| **Drive-källa** | MISSING | Cursor-spår-arbete. `drive_import` finns redo. |
| **Fortnox-källa** | MISSING | MVP 3. `fortnox_import` finns redo i sourceSystem-listan. |
| **Bank-CSV-källa** | MISSING | Framtida. |
| **Refund-flöde** | MISSING | Framtida MVP. |
| **SIE-export** | MISSING | MVP 5. |

---

## 4 · Vad kräver Fortnox OAuth

För att flytta från PARTIAL till DONE på dashboard-KPI:er krävs:
1. Owner triggar Fortnox OAuth via `GET /api/v1/cco-fortnox/connect` (~5 min)
2. Verifiera connection via `GET /api/v1/cco-fortnox/status`
3. När ansluten visar dashboard automatiskt `partial: false` för invoice-summary

**Inget extra wire-jobb krävs i Claude-spåret för Fortnox-anslutning** — bara owner-action.

---

## 5 · Vad kräver owner-GO

| # | Beslut | För att gå vidare |
|---|--------|-------------------|
| 1 | Lägg `finance`-role i tenant-config | Owner skapar role + tilldelar staff. Befintlig `revisor` redan tillgänglig. |
| 2 | Fortnox OAuth-trigger | ~5 min owner-action (se ovan) |
| 3 | Eventuell receipt-OCR med extern provider | MISSING i MVP 1 by-design — owner-GO krävs för Tesseract-installation eller cloud-OCR |
| 4 | MVP 2 (expense categorization) | ~14h — owner-GO för scope |
| 5 | MVP 3 (full Fortnox invoice/payment-sync) | ~10h — owner-GO för scope |

---

## 6 · Vad är redo för intern test

✅ **Idag, utan ytterligare action:**
- Öppna `/finance.html` när server kör → dashboard visas (med `partial: true` om Fortnox ej ansluten)
- Ladda upp kvitto (drag-drop eller klick) → hamnar i `receipts/YYYY-MM/...` secure storage
- Filtrera kvitto-listan på status
- Klicka "Visa" → öppnar kvittot via `/api/v1/cco-cf/receipts/:id/download`
- Klicka "→ kundkort"-länk om customerId är satt på kvittot
- Audit-trail i `data/cco-audit.jsonl` för alla mutationer

⏸ **Kräver owner-action innan full test:**
- Fortnox OAuth → full Fortnox-status syns
- Skapa `finance`-role + tilldela en test-user

⏸ **Kräver MVP 2-3 byggnation:**
- Auto-kategorisering
- Fortnox voucher-creation från godkända kvitton
- Cron-job för Fortnox-invoice-sync

---

## 7 · Säkerhetsregler hållna

| Regel | Status | Verifierat |
|-------|--------|------------|
| Inga kvitton i GitHub | ✅ | Lagrade via `secureStorage.putObject` → `data/cco/` (gitignore'at) |
| Inga bankfiler i repo | ✅ | Bank-CSV är MISSING — ingen kod skriver bankdata |
| Inga löneunderlag i repo | ✅ | Payroll är MISSING — ingen kod skriver lönedata |
| Inga Drive-länkar | ✅ | Drive-källa är MISSING; framåtskott via existerande `ccoAssetImportPipeline` |
| Ingen extern AI på journaldata | ✅ | Ingen AI-import alls i MVP 1 |
| Secure storage med checksum | ✅ | SHA256 per kvitto, lagrad i `r.checksum` |
| Audit på alla mutationer | ✅ | 7 nya audit-kinds wireat |
| RBAC enforced | ✅ | Alla 7 routes har `attachRole + requireAnyRole(['owner','finance','revisor'])` med write-routes begränsade till `['owner','finance']` |
| Inga råa filnamn som huvudtext | ✅ | UI visar `supplier` först, fallback till `originalFileName` |
| Ingen patientdata till CF | ✅ | CF läser bara customerId-string. Skapar inte patient-records. |

---

## 8 · Test-bevis (smoke-test 2026-06-01)

```
✓ syntax: ccoReceiptStore.js
✓ syntax: ccoFinanceDashboardBuilder.js
✓ syntax: server.js

Snabbtest av receipt-store:
  Uploaded: rcpt_f2aef260deef1843 status=new
  Total: 1 · senaste status=categorized
  Audit-events: cf.receipt.uploaded · cf.receipt.categorized · cf.receipt.updated
  Summary: {total:1, byStatus:{categorized:1}, byCategory:{utrustning:1},
            bySource:{manual_upload:1}, totalAmountSek:1234, needsReviewCount:0}

UAT-regress: 13 PASS · 1 PARTIAL · 0 FAIL · 0 buggar (oförändrat)
```

---

## 9 · Stopp-villkor (icke uppfyllda)

| Villkor | Status |
|---------|--------|
| Patientdata riskerar GitHub | ✅ NEJ — receipts/data/ är gitignore'at |
| Kvitto/bankfil i repo | ✅ NEJ — secure storage only |
| Extern AI/OCR behövs | ✅ NEJ — MVP 1 har ingen OCR |
| Ny tredjepartsintegration krävs | ✅ NEJ — använder existerande Fortnox/Swish/Commercial |
| Fortnox OAuth kräver manuell owner-action | ⚠️ JA — men det blockar inte MVP 1 (PARTIAL-flagga visas) |

**Inga stopp-villkor utlösta.** MVP 1 levererad.

---

## 10 · Nästa steg

1. **Owner-action:** trigger Fortnox OAuth (~5 min) för att gå från PARTIAL → DONE på dashboard-KPI:er
2. **Owner-action:** lägg `finance`-role + tilldela test-user
3. **Intern test:** öppna `/finance.html` mot demo-data → ladda upp test-kvitto → verifiera secure storage + audit-trail
4. **När redo:** Owner-GO för CF.3 (MVP 2 — expense categorization + Fortnox voucher-sync, ~14h)

---

**Sprint CF.2 leverans:** 3 nya filer · 1 modifierad · 7 routes · 7 audit-kinds · 1 ny role-tier (`finance` + read-only `revisor`). Inga writes till Fortnox. Inga kvitton i GitHub. Ingen extern AI. UAT-regress fortfarande grön.
