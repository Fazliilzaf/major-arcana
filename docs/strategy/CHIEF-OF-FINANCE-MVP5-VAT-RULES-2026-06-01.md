# Chief of Finance MVP 5 (CF.6) — Momsregler + Reverse

> **Update 2026-06-02T17:25Z:** CF API mount-fix på prod (404 → 403 via 8 stub-moduler). Server.js orörd. RBAC enforces. Detalj: `CCO-PERSONAL-PRESENTATION-READINESS-2026-06-04.md` §Refresh. Charge

**Sprint:** CF.6 · **Datum:** 2026-06-01
**Scope:** Svenska momsregler (25/12/6/0%) + EU/non-EU reverse-charge + ej avdragsgill + representation 50% — CCO-native utan AI
**Status:** ✅ **LEVERERAT · 86/86 PASS · 9/9 acceptance**

---

## 0 · TL;DR

| | |
|---|---|
| Nya filer | 2 (`ccoExpenseVatRules.js` · CF.6-rapport) |
| Modifierade filer | 4 (`server.js` · `ccoExpenseStore.js` · `ccoFinanceDashboardBuilder.js` · `public/finance.html` + `ccoExpenseExporter.js`) |
| Nya routes | **3** (vat-modes enum + setVatMode + suggestVatMode) |
| Nya audit-kinds | **3** (cf.expense.vat_suggested · cf.expense.vat_approved · cf.expense.vat_marked_review) |
| Smoke-test | ✅ **86/86 PASS · 0 fail** |
| Acceptance | ✅ 9/9 uppfyllda |
| Säkerhet | ✅ ingen AI/OCR · ingen Fortnox-write · ingen bank-CSV · human approval på allt |

---

## 1 · Vad är byggt

### 1.1 `src/ops/ccoExpenseVatRules.js` (ny, ~210 rader)

**Pure functions.** Ingen state, inga side-effects.

**10 vatMode-värden:**

| vatMode | Label | Deductible % |
|---|---|---|
| `standard_25` | 25 % moms | 100 % |
| `standard_12` | 12 % moms | 100 % |
| `standard_6` | 6 % moms | 100 % |
| `standard_0` | 0 % moms | 100 % (men 0 moms) |
| `mixed` | Blandad moms | 0 % (kräver review) |
| `reverse_charge_eu` | EU reverse charge | 0 % (deklareras separat) |
| `reverse_charge_non_eu` | Non-EU reverse charge | 0 % |
| `non_deductible` | Ej avdragsgill moms | 0 % |
| `representation_limited` | Representation 50 % | 50 % |
| `needs_review` | Moms behöver granskas | 0 % (kräver review) |

**API:**
- `calculateVatBreakdown({ amountSek, vatSek, vatRatePercent, vatMode })` → `{ grossAmountSek, netAmountSek, vatAmountSek, deductibleVatSek, nonDeductibleVatSek, reverseCharge, vatMode, calculation }`
- `suggestVatMode({ category, vatRatePercent, supplierCountry, reverseChargeHint })` → `{ suggestedVatMode, confidence, reason }`
- `validateBreakdown(breakdown, tolerance)` → `{ valid, reason? }`

**Kategori→vatMode-default-mapping** för auto-suggest:
- `forsakring/bank_finansiell/skatter_avgifter` → `standard_0`
- `mat_representation` → `representation_limited` (50 % deduktion)
- `utbildning/resor/annat` → `needs_review` (osäkert)
- alla övriga → `standard_25`

**Smart vat-härledning:** Om `vatSek` saknas men `vatRatePercent` finns → räkna `vat = gross * rate / (100 + rate)`.

### 1.2 `src/ops/ccoExpenseStore.js` (utökad)

**Nya fält per expense:**
- `vatMode` — null eller en av 10 valida
- `reverseCharge` — bool (auto-sätts av vatMode)
- `netAmountSek`, `grossAmountSek` — beräknade
- `deductibleVatSek`, `nonDeductibleVatSek` — beräknade
- `vatReviewStatus` — `'pending' | 'reviewed' | 'flagged' | null`
- `vatSuggestion` — separat från category-suggestion

**2 nya store-actions:**
- **`setVatSuggestion({id, suggestion, actor})`** — sparar förslag utan att applicera + `cf.expense.vat_suggested`
- **`setVatMode({id, vatMode, vatRatePercent, markedReview, actor})`** — beräknar breakdown + sätter alla VAT-fält + `cf.expense.vat_approved` ELLER `cf.expense.vat_marked_review`

**Summary utökad** med `byVatMode`, `totalDeductibleVatSek`, `totalNonDeductibleVatSek`, `reverseChargeCount`, `reverseChargeAmountSek`, `nonDeductibleCount`, `vatReviewPendingCount`.

### 1.3 `server.js` — 3 nya routes

| Method | Path | RBAC | Audit-kind |
|---|---|---|---|
| GET | `/api/v1/cco-cf/vat-modes` | owner/finance/revisor | — (enum-list) |
| POST | `/api/v1/cco-cf/expenses/:id/vat` (body: `{vatMode, vatRatePercent?, markedReview?}`) | owner/finance | `cf.expense.vat_approved` / `cf.expense.vat_marked_review` |
| POST | `/api/v1/cco-cf/expenses/:id/vat/suggest` | owner/finance | `cf.expense.vat_suggested` |

**Integration i `POST /api/v1/cco-cf/expenses`:**
Efter vendor-match + rule-engine → om expense saknar vatMode → `suggestVatMode` → sparas i `vatSuggestion` (utan att applicera).

### 1.4 `src/ops/ccoExpenseExporter.js` (utökad)

**CSV-headers utökade** med 8 nya kolumner:
`supplierId, vatMode, reverseCharge, deductibleVatSek, nonDeductibleVatSek, vatReviewStatus, netAmountSek (✓ redan)`, plus `grossAmountSek`-alias.

**JSON-payload utökad** med samma fält per expense + `totals.totalDeductibleVatSek` + `totals.totalNonDeductibleVatSek` + `totals.reverseChargeCount` + `totals.reverseChargeAmountSek`.

### 1.5 `src/ops/ccoFinanceDashboardBuilder.js` (utökad)

`dashboard.expenses` nu med:
- `byVatMode` — antal per mode
- `totalDeductibleVatSek` · `totalNonDeductibleVatSek`
- `reverseChargeCount` · `reverseChargeAmountSek`
- `nonDeductibleCount` · `vatReviewPendingCount`

**3 nya anomalies:**
- `vat_review_pending` (medium)
- `reverse_charge_expenses` (low)
- `non_deductible_vat` (low)

### 1.6 `public/finance.html` (utökad)

**3 nya KPI-kort:**
- Moms behöver granskas
- Reverse charge
- Ej avdragsgill moms (SEK-belopp)

**Ny filter-pill:** "Moms granska" — visar expenses med `vatReviewStatus='pending'` eller `vatSuggestion`-objekt.

**Per expense-rad: VAT-chip** (färgkodad efter mode):
- Blå chip för standard_25/12/6/0
- Lila chip för reverse_charge_eu/non_eu
- Röd chip för `non_deductible`
- Orange chip för `representation_limited`
- Röd "⚠ moms granska"-badge för pending review
- Grön "✓ moms ok" för reviewed

**Editor utökad** med VAT-sektion:
- VatMode-select (10 alternativ)
- Knappar: 💼 Sätt vatMode · ⚠ Markera moms behöver granskas · 🪄 Föreslå moms · ✓ Godkänn momsförslag
- Live-display: `Aktuell: <mode> · netto X · moms Y · avdragsgill Z · ej avdragsgill W`

---

## 2 · Smoke-test (86/86 PASS)

```
A1  · calculateVatBreakdown standard 25%       7/7 PASS
A2  · 12% derived from rate                    3/3 PASS
A3  · Reverse charge EU                        4/4 PASS
A4  · Non-deductible                           2/2 PASS
A5  · Representation 50% deductible            3/3 PASS
A6  · needs_review → 0/0 deductible            1/1 PASS
A7  · Fail-closed okänd vatMode                1/1 PASS
A8  · suggestVatMode (5 scenarios)             5/5 PASS
A9  · validateBreakdown                        2/2 PASS
A10 · Store setVatMode + breakdown             9/9 PASS
A11 · markedReview=true                        3/3 PASS
A12 · vatSuggestion + approve workflow         5/5 PASS
A13 · Reverse charge expense                   4/4 PASS
A14 · Summary VAT-aggregat                     8/8 PASS
A15 · Dashboard CF.6-summering + anomalies     5/5 PASS
A16 · Export-paket har VAT-fält                10/10 PASS
A17 · Server routes (3 stycken)                3/3 PASS
A18 · UI vat-chips + filter + KPI              8/8 PASS
A19 · Säkerhet — ingen AI/OCR/Fortnox-write    3/3 PASS

✓ ALL PASS — 86 assertions · 0 fail
```

---

## 3 · Acceptance-check (alla 9 från owner-spec)

| # | Krav | Status | Bevis |
|---|---|---|---|
| 1 | Expense kan få moms-förslag | ✅ | A12 — `vatSuggestion` sparas på expense via auto-trigger i createExpense + `/vat/suggest`-route |
| 2 | Moms-förslag kan godkännas/avvisas | ✅ | A12 — `setVatMode(vatMode)` applicerar förslag · att avvisa = lämna `vatSuggestion` orörd eller välja annan mode |
| 3 | Reverse charge kan markeras | ✅ | A3, A13 — `vatMode='reverse_charge_eu'` eller `_non_eu` sätter `reverseCharge=true` automatiskt |
| 4 | Export innehåller momsdata | ✅ | A16 — CSV + JSON har vatMode/grossAmountSek/netAmountSek/vatAmountSek/deductibleVatSek/nonDeductibleVatSek/reverseCharge + totals |
| 5 | Dashboard visar moms-KPI:er | ✅ | A15 + UI — 3 nya KPI-kort + `byVatMode`-summary + 3 anomalies |
| 6 | Audit fungerar | ✅ | A10/A11/A12 — 3 nya kinds (`vat_suggested/approved/marked_review`) verifierade |
| 7 | RBAC fungerar | ✅ | Routes har `requireAnyRole(cfMutateRBAC)` för write, `cfRBAC` för read |
| 8 | Ingen Fortnox-write | ✅ | A19c · CF.6-koden gör 0 anrop mot fortnox-endpoints |
| 9 | Ingen AI/OCR · Inga filer i repo | ✅ | A19a/b · regelmotorn är ren JS · data/ gitignored |

---

## 4 · Säkerhet (alla regler hållna)

| Regel | Status |
|---|---|
| Ingen Fortnox-write | ✅ — CF.6-koden gör 0 anrop mot fortnox · `fortnoxSyncStatus='blocked_integration'` oförändrad |
| Ingen extern AI/OCR | ✅ — ren math + lookup-tables |
| Ingen bank-CSV-import | ✅ — VAT-koden läser inte bank-data |
| Ingen payroll | ✅ — separate modul |
| Inga kvitton/bankfiler i GitHub | ✅ — VAT-koden persisterar bara metadata på expense (i data/cco/, gitignored) |
| Secure storage oförändrat | ✅ — VAT rör inte secureStorage |
| RBAC owner/finance/revisor | ✅ — write owner+finance · read alla 3 |
| Human approval | ✅ — `vatSuggestion` är förslag tills `setVatMode` anropas (kräver explicit val av owner/finance) |
| Audit på alla mutationer | ✅ — 3 nya kinds med både `action` och `kind`-fält |

---

## 5 · End-to-end workflow

**Auto-suggest vid receipt-upload:**
1. Owner laddar upp kvitto från Apoteket (kategori `forbrukning`)
2. Server skapar expense → vendor-match (CF.5) → rule-engine (CF.4) → **CF.6 suggestVatMode** baserat på category
3. `forbrukning` → `standard_25` (confidence 0.60)
4. `expense.vatSuggestion = { suggestedVatMode: 'standard_25', confidence: 0.60, reason: 'Kategori-default för forbrukning' }`
5. UI visar lila "→ momsförslag"-chip

**Owner godkänner:**
1. Klicka rad → editor öppnas → VAT-sektion visar "Godkänn momsförslag (standard_25)"-knapp
2. Klick → `POST /:id/vat { vatMode: 'standard_25' }`
3. Server kör `calculateVatBreakdown` → sätter `netAmountSek/vatAmountSek/deductibleVatSek=full` + `vatReviewStatus='reviewed'`
4. Audit: `cf.expense.vat_approved`
5. UI visar blå "25%"-chip + grön "✓ moms ok"-badge

**Representation:**
1. Lunch-expense kategori `mat_representation` → suggestVatMode → `representation_limited`
2. Owner godkänner → `deductibleVatSek = vatSek × 0.5`, `nonDeductibleVatSek = vatSek × 0.5`
3. Dashboard `totalNonDeductibleVatSek` ökar

**Reverse charge:**
1. AWS-faktura (2000 SEK, ingen moms)
2. Owner manuellt väljer `vatMode='reverse_charge_non_eu'` → klick "💼 Sätt vatMode"
3. `reverseCharge=true`, `vatAmountSek=0`, `deductible=0`, `nonDeductible=0`
4. Dashboard `reverseChargeCount` ökar

**Behöver granskas:**
1. Resor-expense → suggestVatMode → `needs_review` (6% transport vs 12% hotell vs 25% bilhyra)
2. UI visar "⚠ moms granska" badge
3. Filter "Moms granska" pill samlar alla pending

**Export till revisor:**
1. Owner bygger exportpaket
2. CSV innehåller alla VAT-fält + `vatMode` per rad
3. Totals: `totalDeductibleVatSek`, `totalNonDeductibleVatSek`, `reverseChargeCount/AmountSek`
4. Revisor får komplett underlag för momsdeklaration

---

## 6 · Vad är MISSING (medvetet)

| Område | Status | Notering |
|---|---|---|
| Skatteverket-AGI / momsdeklaration export | MISSING | CF.7+ — egen sprint för deklarations-paket |
| Periodisk momsperiodisering | MISSING | CF.7+ |
| Auto-Bolagsverket org-nr lookup | MISSING | Kräver extern API + owner-GO |
| VAT-history per leverantör | PARTIAL | summary visar byVatMode globalt, inte per vendor |
| Fortnox voucher-sync med VAT | MISSING (BLOCKED) | CF.9 efter Fortnox OAuth |
| Multi-currency / valuta-omräkning | MISSING | Allt antas SEK |

---

## 7 · Owner-action (icke-blockerande)

| # | Action |
|---|---|
| 1 | Testa workflow på `/finance.html` — skapa expenses i olika kategorier, godkänn vat-förslag, observera dashboard |
| 2 | Skapa reverse-charge-expense (utländsk leverantör, sätt manuellt) |
| 3 | Skapa representations-expense (lunch) och se 50% deduktion |
| 4 | Bygg exportpaket och verifiera att CSV/JSON innehåller alla VAT-fält |

---

## 8 · Stoppvillkor (icke utlösta)

| Villkor | Status |
|---|---|
| Patientdata till GitHub | ✅ NEJ |
| Bankfiler/kvitton i repo | ✅ NEJ |
| Extern AI/OCR | ✅ NEJ |
| Bank-CSV-import | ✅ NEJ |
| Payroll | ✅ NEJ |
| Fortnox-write | ✅ NEJ |

---

## 9 · Sammanfattning

| | |
|---|---|
| Filer skapade | 2 |
| Filer modifierade | 5 (server, expense-store, exporter, dashboard-builder, finance.html) |
| Routes tillagda | 3 |
| Audit-kinds tillagda | 3 (vat_suggested/approved/marked_review) |
| KPI-kort tillagda | 3 |
| Anomaly-kinds tillagda | 3 |
| Filter-pillar tillagda | 1 ("Moms granska") |
| VAT-modes stödda | 10 |
| Smoke-test | ✅ **86/86 PASS** |
| Acceptance | ✅ 9/9 |
| Säkerhet | ✅ 9/9 regler hållna |
| CF.4/CF.5 backåtkompatibel | ✅ — VAT är additivt, befintliga flöden funkar oförändrat |

---

**Sprint CF.6 leverans:** 2 nya filer · 5 modifierade · 3 routes · 3 audit-kinds · 86-assertion smoke-test grön · 9/9 acceptance ✅. Svenska momsregler + reverse-charge + representation 50% utan AI/OCR/Fortnox. Inga säkerhetsregler brutna.

**Rapport-författare:** Claude (Sprint CF.6)
**Datum:** 2026-06-01
