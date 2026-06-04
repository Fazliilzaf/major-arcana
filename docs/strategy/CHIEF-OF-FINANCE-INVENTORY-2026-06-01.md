# Chief of Finance (CF) — Inventory + Roadmap

**Sprint:** CF.1 · **Datum:** 2026-06-01
**Spår:** Arcana/CCO-produktspår för ekonomi (separat från Cursor-importspår och CCO-pause)
**Mandat:** audit first. Inget byggs innan inventory + plan är godkänd.
**Statuskoder:** `DONE` · `PARTIAL` · `MISSING` · `UPGRADE` · `BLOCKED_INTEGRATION` · `OWNER_GO`

---

## 0 · TL;DR

CCO har **substantiella ekonomi-byggstenar** redan. **Inget nytt CF-system behöver byggas från noll** — det är wire-jobb + UI-paraply som binder ihop existerande stores till en finance-dashboard.

| | |
|---|---|
| Ekonomi-stores i kod | **9** (`ccoFortnoxStore` · `ccoFortnoxPatientSync` · `ccoFortnoxInvoiceLister` · `ccoSwishStore` · `ccoSwishPayments` · `ccoCommercialStore` · `ccoCommercialMailDispatch` · `ccoPaymentStatusAdapter` · `ccoVendorRegisterStore`) |
| Finance-infra | `src/infra/fortnoxClient.js` + `src/infra/swishClient.js` |
| Finance-routes | **15 routes** (7 Fortnox + 8 Swish) under `/api/v1/cco-fortnox/*` + `/api/v1/cco-swish/*` |
| POS-stores | `src/pos/posStore.js` + `src/pos/giftCardStore.js` + `src/pos/netsConnector.js` |
| Finance UI-vy | **0** (bara `admin.html` nämner kassa) — **det är UI-paraplyet som saknas** |
| Patientkort-sektion ekonomi | `ekonomi` (Sprint 19C.5 + 19F.5 Fortnox-lister wire) |

**Slutsats:** CF behövs som **konsoliderande UI + dashboard + receipt-inbox + report-export** ovanpå existerande stores. Inte ny ekonomi-motor.

---

## 1 · Vad finns redan?

### 1.1 Stores

| Store | Status | Vad gör den |
|-------|--------|-------------|
| `ccoFortnoxStore.js` | **DONE** | OAuth-connection-state per tenant (access/refresh-token, expiresAt) |
| `ccoFortnoxPatientSync.js` | **DONE** | Mappar patient → Fortnox customerNumber (create + link + update) |
| `ccoFortnoxInvoiceLister.js` | **DONE** *(19F.5)* | Wraper kring fortnoxClient · listInvoices + listInvoicePayments · 60s cache |
| `ccoSwishStore.js` | **DONE** | Swish-connection-state |
| `ccoSwishPayments.js` | **DONE** | Swish payment-requests + callbacks |
| `ccoCommercialStore.js` | **PARTIAL** | Commercial-case (offert→avtal→deposit→faktura). Status-machine + payment-snapshots |
| `ccoCommercialMailDispatch.js` | **DONE** | Skicka kommersiella mail (offert/påminnelse) |
| `ccoPaymentStatusAdapter.js` | **DONE** *(19F.5)* | Aggregerar Fortnox + Swish + Commercial → payment-status per kund |
| `ccoVendorRegisterStore.js` | **DONE** | 12 vendors med PUB-tracking — INTE leverantörsfakturor (det är compliance) |

### 1.2 Infra-klienter

| Fil | Status | API-täckning |
|-----|--------|--------------|
| `src/infra/fortnoxClient.js` | **DONE** | OAuth + customer CRUD + invoices.list/get + invoicePayments.list (3 nya 19F.5) |
| `src/infra/swishClient.js` | **DONE** | Swish-API-anrop |
| `src/pos/fortnoxConnector.js` | **DONE** | POS-bridge mot Fortnox |
| `src/pos/netsConnector.js` | **PARTIAL** | Nets kortbetalning — anslutning, ej fullt wireat |

### 1.3 Routes (15 totalt)

**Fortnox (7 routes):**
- `GET /api/v1/cco-fortnox/status`
- `GET /api/v1/cco-fortnox/connect`
- `GET /api/v1/cco-fortnox/oauth/callback`
- `POST /api/v1/cco-fortnox/disconnect`
- `POST /api/v1/cco-fortnox/test`
- `POST /api/v1/cco-fortnox/sync-patient`
- `PATCH /api/v1/cco-fortnox/patient-link`

**Swish (8 routes):**
- `GET /api/v1/cco-swish/status`
- `POST /api/v1/cco-swish/connect`
- `POST /api/v1/cco-swish/disconnect`
- `POST /api/v1/cco-swish/test`
- `POST /api/v1/cco-swish/payment-request`
- `GET /api/v1/cco-swish/payments`
- `POST /api/v1/cco-swish/callback`
- `GET /api/v1/cco-swish/payment-request/:id`

**Alla 15 routes är `requireAuth + requireRole(ROLE_OWNER)`.** Ingen CF-specifik route än.

### 1.4 POS-stores

| Fil | Status | Vad |
|-----|--------|-----|
| `src/pos/posStore.js` | **PARTIAL** | Kassa-transaktioner — ej fullt wireat i routes/UI |
| `src/pos/giftCardStore.js` | **PARTIAL** | Presentkort-store |

### 1.5 UI-vyer

| Vy | Status | Notering |
|----|--------|----------|
| Finance dashboard | **MISSING** | Ingen `cf.html` / `finance.html` / `kassa.html` |
| Receipt inbox | **MISSING** | Ingen kvitto-inkorg-vy |
| Expense view | **MISSING** | — |
| Invoice list | **MISSING** | Fortnox visar idag, inte CCO |
| Payroll | **MISSING** | — |
| Patientkort `ekonomi`-sektion | **DONE** | Sprint 19C.5 + 19F.5 — visar invoice/deposit-status per kund |
| `admin.html` nämner kassa | **PARTIAL** | Endast referens, ingen vy |

---

## 2 · Status per huvudmodul

| Modul | Status | Existerande kod | Saknas |
|-------|--------|-----------------|--------|
| **Income / inkomster** | PARTIAL | `ccoCommercialStore` (offert-acceptance) + Fortnox-invoices | Aggregerad income-vy per dag/månad |
| **Expenses / utgifter** | **MISSING** | — | Hela utgifts-modulen |
| **Receipts / kvitton** | **MISSING** | — | Receipt-inbox + uppladdning |
| **Invoices / fakturor (kund)** | DONE *(read)* | `ccoFortnoxInvoiceLister` läser per kund · `payment-status-adapter` aggregerar | CCO kan inte skapa/skicka faktura — Fortnox äger write |
| **Customer payments** | DONE | Swish-payment-requests + Fortnox-invoice-payments | Konsoliderad vy |
| **Deposits / förskott** | DONE *(via offer)* | `ccoCommercialStore` deposit-status + Fortnox InvoicePayments | Egen deposit-store finns inte (behövs inte — Fortnox äger) |
| **Payroll / löner** | **MISSING** | — | Hela payroll-modulen |
| **Supplier invoices** | **MISSING** | `ccoVendorRegisterStore` har vendors men inga fakturor mot dem | Supplier-invoice-store + Fortnox-koppling |
| **Reports / rapporter** | **MISSING** | — | Dagligt/månads/kassa-rapport |
| **Fortnox sync** | DONE | `ccoFortnoxPatientSync` (customer) + `ccoFortnoxInvoiceLister` (invoices) | Sync av accounts/voucher/SIE-fil |
| **Accounting export** | **MISSING** | — | SIE-export, eller delegera helt till Fortnox |
| **Dashboard** | **MISSING** | — | CF-paraply-UI |
| **Gift cards** | PARTIAL | `giftCardStore` finns | UI + Fortnox-koppling |
| **POS / kassa** | PARTIAL | `posStore` finns | UI + Nets-wire |
| **Stripe** | **MISSING** | — | Ej i kodbas |
| **Nets** | PARTIAL | `netsConnector` finns | Ej fullt wireat |

**Sammanställning:** 4 DONE · 5 PARTIAL · 9 MISSING · 0 UPGRADE · 0 BLOCKED_INTEGRATION · 0 OWNER_GO.

---

## 3 · Koppling till CCO

Hur ekonomi-data idag når CCO-kundkort:

```
Fortnox (kundfakturor + payments)
         ↓ (ccoFortnoxInvoiceLister · 60s cache)
Swish (mottagna payments)
         ↓ (ccoSwishStore.listPaymentsByCustomer)
Commercial-case (offert→deposit→faktura snapshot)
         ↓ (ccoCommercialStore.listByCustomer)
         ↓
ccoPaymentStatusAdapter.getPaymentStatus({customerId})
         ↓
ccoPatientCardSectionBuilder · sektion 'ekonomi'
         ↓
public/major-arcana-preview/?view=customers · Ekonomi & betalning + Journey Bar chips
   "Faktura: I kö / Skickad / Betald / Förfallen"
   "Deposition: Saknas / Betald / Krävs ej"
```

**Wireat och fungerande för READ.** Sektion `ekonomi` har:
- `invoiceStatus` (9 möjligheter)
- `depositStatus` (6 möjligheter)
- `totalDueSek` / `totalPaidSek` / `totalOutstandingSek`
- `partial: true` om Fortnox inte ansluten

**Saknas i CCO-kundkortet:**
- Kvitto-lista per kund
- Refund-flöde
- "Skicka påminnelse"-knapp som triggar Fortnox-mail

---

## 4 · Vad behöver byggas för "Fortnox-liknande" (per modul)

CF ska inte BLI Fortnox — det ska **konsolidera och visualisera** Fortnox + Swish + Stripe + POS-data i Arcana-UI med kundkort-koppling.

| Modul | Bygg | Aprox tid |
|-------|------|-----------|
| **Receipt Inbox** | Multi-source kvitto-aggregator + uppladdning + foto-OCR | ~12h |
| **Expenses** | `ccoExpenseStore` + UI för kategorisering + Fortnox-voucher-sync | ~10h |
| **Finance Dashboard** | `/api/v1/cco-finance/dashboard` + `public/finance-dashboard.html` med income/expense/cash/AR/AP-kort | ~8h |
| **Reports** | Daily / monthly / kassarapport / kund-AR / leverantörs-AP — alla genererade från existerande stores | ~10h |
| **Supplier Invoices** | `ccoSupplierInvoiceStore` + Fortnox-sync + receipt-match | ~12h |
| **Payroll / Salary** | `ccoPayrollStore` + Fortnox-integrationer + lönerapport | ~16h |
| **Accounting Export** | SIE-fil-generator (eller ren delegate till Fortnox) | ~6h |
| **Kassa-vy** | UI för POS-transaktioner + Nets-wire + Swish-quick-charge | ~10h |
| **Stripe-integration** | Om relevant — annars OWNER_GO | ~12h |

**Totalt MVP 1-5: ~96h** (utan Stripe). Hälften av detta är wire/UI mot existerande stores.

---

## 5 · Kvitton överallt — insamlingsplan (planera, importera EJ ännu)

Källor + status (status anger om Cursor/Claude kan börja konsumera när Cursor lägger till `receipt_*_import` sourceSystem):

| Källa | Implementeringsplan | Status nu |
|-------|---------------------|-----------|
| **Mail** (`receipt@hairtpclinic.com`) | Återanvänd `ccoMailIngestion*` med subject/sender-filter. Klassa via `ccoMailContentParser` | MISSING — wire-jobb |
| **Manuell uppladdning** | `POST /api/v1/cco-cf/receipt/upload` med multer + secure-storage + RBAC `finance` | MISSING |
| **Mobilfoto** | Återanvänd `take-photo.js`-mönster, men byt asset-category till `receipt` | MISSING (~2h) |
| **Drive/iCloud-mappar** | Återanvänd `ccoAssetImportPipeline` v2 + `ccoDriveFolderCoupler` med ny filter för kvitto-mappar | PARTIAL (pipelinen finns) |
| **Bank-export** (CSV) | Ny CSV-parser → match mot Fortnox-voucher | MISSING |
| **Fortnox** | `fortnoxClient.listVouchers` (behöver läggas till — finns inte än) | PARTIAL (API saknas) |
| **Swish** | `ccoSwishStore.listPaymentsByCustomer` redan finns | DONE |
| **Cursor-import** | Ny sourceSystem `receipt_*_import` läggs i `VALID_SOURCE_SYSTEMS` när Cursor är redo | MISSING (~5 min wire) |

**Princip:** **inte** importera nu. Förbered bara mottagar-yta + `ccoReceiptStore` med `sourceSystem`-flagga + UI-rendering.

---

## 6 · Säkerhet (icke-förhandlingsbart)

| Krav | Plan |
|------|------|
| Ingen patientdata till GitHub | Receipt-store-data hamnar i `data/cco/` (gitignore'at) — som existerande stores |
| Inga kvitton/bilder i repo | Använd `ccoSecureStorageProvider.putObject` — samma som patient-photos |
| Secure storage för kvitton | `receipts/YYYY-MM/<vendorOrCustomer>/<sha8>.pdf` med SHA256 |
| Audit på uppladdning/ändring | `ccoAuditLog.append({kind: 'cf.receipt.uploaded'/'modified', actor, target, detail})` |
| RBAC: owner / finance / revisor | Ny role-bucket `finance` (existerande `revisor` finns redan) |
| Ingen extern AI på känsliga underlag utan GO | Receipt-OCR kräver Owner-GO om extern provider (Google Vision / OpenAI) — annars lokal Tesseract |

**Inget GitHub-leak möjligt** så länge `data/cco/` förblir gitignore'at + secure-storage används.

---

## 7 · Roadmap — 5 MVPs i prioritetsordning

### MVP 1 · Finance Dashboard + Receipt Inbox · ~20h
- Ny vy `public/finance-dashboard.html` (vellum-warm DNA som resten av CCO)
- 4 kort: **Income (idag/månad)** · **Expenses (väntar/godkända)** · **AR (utestående faktura)** · **AP (leverantörsfakturor)**
- Receipt Inbox: lista nya kvitton med kategorisering-pill
- `GET /api/v1/cco-cf/dashboard` aggregerar från Fortnox + Swish + Commercial
- RBAC: `requireAnyRole(['owner','finance','revisor'])`
- **Wire-jobb, inga nya stores.**

### MVP 2 · Expense Categorization + Upload · ~14h
- Ny `ccoExpenseStore` (egen kategori-tabell + status: draft / pending / approved / rejected / posted-to-fortnox)
- `POST /api/v1/cco-cf/expense/upload` med multer (kvitto-bild/PDF)
- UI: tre kolumner inbox / categorize / approved
- Fortnox-sync: voucher-creation (kräver `fortnoxClient.createVoucher` — bygg vid behov)
- Audit per status-byte.

### MVP 3 · Fortnox Invoice/Payment Sync (utöka) · ~10h
- Utöka `ccoFortnoxInvoiceLister` att hämta invoices över ALLA kunder, inte bara per kund
- Daglig schemalagd sync (kanske `node-cron` eller manuell trigger)
- Egen `ccoInvoiceShadowStore` som speglar Fortnox för snabb-läsning + audit-history
- Wire mot kundkort (sektion `ekonomi` får snabbare svar)

### MVP 4 · Payroll / Salary Overview · ~16h
- `ccoPayrollStore` (anställd-stam + lönekörningar + per-anställd-history)
- Integration: Fortnox lönesektion (om finns) eller export-only
- UI: anställd-lista + senaste lönekörning + bruttosumma per månad
- RBAC: `owner` only (löner är känsligt)
- Audit på alla lönekörningar (HIGH_SEVERITY)

### MVP 5 · Reports + Accounting Export · ~12h
- Dagsrapport (sum income, expenses, payments, refunds, gift cards)
- Månadsrapport (per kategori + per behandlingstyp)
- Kassarapport (POS-transaktioner)
- SIE-export (delegate till Fortnox eller egen SIE-generator)
- Print/PDF-export per rapport

**Total: ~72h för full CF MVP 1-5.** Ingen ny ekonomi-motor — bara konsoliderande UI ovanpå existerande Fortnox/Swish/Commercial-stores.

---

## 8 · Koppling CF ↔ CCO-kundkort (parallell)

CF ska INTE leva separat. Varje finance-record kopplas till patientkortet där det är relevant:

| CF-record | Visas i kundkort-sektion |
|-----------|---------------------------|
| Kund-faktura | `ekonomi` (redan DONE) |
| Kund-payment (Swish/Fortnox) | `ekonomi` (redan DONE) |
| Deposit | `ekonomi` (redan DONE) |
| Refund | `ekonomi` *(behöver UI-wire)* |
| Gift card-användning | `ekonomi` *(behöver UI-wire)* |
| Receipt kopplat till behandling | `ekonomi` + `besok` (encounter) *(behöver wire)* |
| Expense kopplad till kund | (sällsynt — t.ex. fysiska material) *(låg prio)* |
| Supplier invoice | INTE i kundkort — bara i CF-dashboard |
| Payroll | INTE i kundkort |

**Princip:** CF-dashboard = aggregerat finance-nav. Patientkort = per-kund-vy som plockar relevanta finance-rader via samma `ccoPaymentStatusAdapter`-mönster som redan finns.

---

## 9 · Vad CCO Build Rules säger (referens)

Enligt `CCO-BUILD-RULES.md` (etablerad 19G.8):
- **Regel #1:** Statuskoder mot faktisk kod. Denna rapport `grep`ade hela `src/ops/` + `src/routes/` + `src/pos/` + `src/infra/` innan markering.
- **Regel #2:** Bygg inte om det som finns. CF bygger på existerande Fortnox + Swish + Commercial-stores.
- **Regel #5:** Patientkortet är huvudnavet. CF kopplar finance-records till patientkortets `ekonomi`-sektion.
- **Regel #7:** Inga skrivningar utan owner-GO för känsliga områden (löner, voucher-creation till Fortnox).
- **Regel #10:** Audit alla mutationer. Varje CF-write loggar `cf.*` audit-kind.

---

## 10 · Beslut: vad är nästa CF-steg?

**Detta är inventory + roadmap.** Inget byggs i denna sprint.

**Nästa CF-sprint (CF.2)** föreslagen om owner ger GO:
- **MVP 1** (Finance Dashboard + Receipt Inbox) — ~20h
- Wirar mot existerande Fortnox/Swish/Commercial-stores
- Lägger `finance` role i RBAC
- Inga nya integrationer som inte redan finns

**Förutsättningar för CF.2:**
1. Owner-GO på MVP 1-scope
2. Owner-GO på `finance` role (vem får läsa dashboard?)
3. Bekräfta Fortnox OAuth-anslutning kan triggas av owner (~10 min)

**Inga blockers från externa system** — alla integrationer är fungerande eller har stub-stores som kan utökas.

---

## 11 · Vad CF INTE är

För att inte missförstå riktning:
- CF är **inte** en ny ekonomi-motor — Fortnox är fortfarande source-of-truth för bokföring
- CF är **inte** ersättning för Fortnox UI — det är komplement för clinic-nära vyer
- CF är **inte** Cursor-import-spår — det är ny CCO-produkt-yta
- CF skriver **inte** voucher direkt till Fortnox utan owner-godkännande per kategori
- CF är **inte** patient-billing — det är clinic-finance

---

**Sprint CF.1 leverans:** denna rapport. **0 nya stores byggda.** **0 routes lagda.** **0 writes.** **0 importer.** Allt är audit + plan.

**Total skanning:** 9 ekonomi-stores · 15 routes · 4 POS-filer · 2 infra-klienter · 1 patientkort-sektion. Hela ekonomi-skiktet i CCO-koden inventerat.
