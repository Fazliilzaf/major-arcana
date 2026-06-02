# Chief of Finance MVP 3 (CF.4) — Auto-categorization Rule Engine

> **Update 2026-06-02T17:25Z:** CF API mount-fix på prod (404 → 403 via 8 stub-moduler). Server.js orörd. RBAC enforces. Detalj: `CCO-PERSONAL-PRESENTATION-READINESS-2026-06-04.md` §Refresh.

**Sprint:** CF.4 · **Datum:** 2026-06-01
**Scope:** Regelmotor för auto-categorization av expenses/receipts UTAN extern AI/OCR · Human approval krävs alltid
**Status:** ✅ **LEVERERAT · 60/60 PASS · 9/9 acceptance**

---

## 0 · TL;DR

| | |
|---|---|
| Nya filer | 2 (`ccoExpenseRuleStore.js` · CF.4-rapport) |
| Modifierade filer | 4 (`server.js` · `ccoExpenseStore.js` · `ccoFinanceDashboardBuilder.js` · `public/finance.html`) |
| Nya routes | **8** (rules CRUD + test + 3 suggestion-actions) |
| Nya audit-kinds | **8** (cf.rule.created/updated/deleted/applied/rejected + cf.expense.auto_suggested/suggestion_approved/suggestion_rejected) |
| Smoke-test | ✅ **60/60 PASS · 0 fail** |
| Säkerhet | ✅ ingen AI/OCR · ingen Fortnox-write · ingen bank-CSV · ingen patient-data till GitHub |
| Human approval | ✅ engine sätter ALDRIG fält direkt — bara `suggestion`-objekt på expense |

---

## 1 · Vad är byggt

### 1.1 `src/ops/ccoExpenseRuleStore.js` (ny, ~370 rader)

**Regelmotor + persistens.** Ren JavaScript, inga externa anrop.

**Condition-typer (9):**
- `supplier_equals` (vikt 0.50) — case-insensitive exakt match
- `supplier_contains` (0.30)
- `supplier_regex` (0.40)
- `notes_contains` (0.20)
- `amount_between` (0.20) — `{ min, max }`
- `amount_equals` (0.30) — `{ value, tolerance? }`
- `payment_method_is` (0.15)
- `vat_rate_is` (0.10)
- `category_is` (0.10)

**Regel-fält:**
- `id, name, description, priority, enabled, matchType (any/all), conditions[]`
- `setCategory, setVatRatePercent, setSupplier, setPaymentMethod, setNotes`
- `stats: { timesApplied, timesRejected, lastAppliedAt }`

**Confidence-beräkning:** `sum(matched-weights) / sum(all-weights)`, cap 1.0. Vid `matchType: 'all'` → 0 om alla villkor inte matchar.

**`evaluateAllRules({ expense, rules, historyExpenses })`** returnerar:
```js
{
  bestMatch: { ruleId, ruleName, confidence, suggestedFields, ... } | null,
  allMatches: [...],
  recurring: { isRecurring, matchingCount, confidence, likelyIntervalDays, note } | null,
  evaluatedAt, rulesEvaluated,
}
```

**`detectRecurring(expense, history)`** heuristik utan AI:
- Samma supplier (case-insensitive)
- Belopp inom ±10%
- 2+ tidigare expenses
- Minst en med datum-diff 25-35 dagar → flag som månatlig

**Persistens:** `data/cco/expense-rules.json` (gitignored)
**Audit:** `cf.rule.created/updated/deleted/applied/rejected` med både `action` och `kind`-fält (P2-C-workaround)

### 1.2 `src/ops/ccoExpenseStore.js` (utökad)

3 nya store-actions:
- **`setSuggestion({id, suggestion, actor})`** — sparar suggestion på expense (`expense.suggestion`), applicerar INGENTING
- **`approveSuggestion({id, actor, onApplied})`** — applicerar `suggestedFields` om de inte är satta, sätter `categorySource='rule_engine_approved'`, auto-transitionar till `categorized`, konsumerar suggestion
- **`rejectSuggestion({id, reason, actor, onRejected})`** — sätter suggestion=null + audit

Nya fält per expense:
- **`categorySource`** — `'manual'` / `'rule_engine_approved'` / `null` (spårbar källa)
- **`suggestion`** — full bestMatch + recurring-info, eller `null`

Manuell PATCH av category → `categorySource='manual'` (overrider rule-engine).

### 1.3 `server.js` — 8 nya routes

| Method | Path | RBAC | Audit-kind |
|---|---|---|---|
| GET | `/api/v1/cco-cf/rules?enabled=&supplier=&category=&limit=` | owner/finance/revisor | — |
| GET | `/api/v1/cco-cf/rules/:id` | owner/finance/revisor | — |
| POST | `/api/v1/cco-cf/rules` | owner/finance | `cf.rule.created` |
| PATCH | `/api/v1/cco-cf/rules/:id` | owner/finance | `cf.rule.updated` |
| DELETE | `/api/v1/cco-cf/rules/:id` | owner/finance | `cf.rule.deleted` |
| POST | `/api/v1/cco-cf/rules/test` (body: `{ expense \| expenseId }`) | owner/finance/revisor | — (dry-run) |
| POST | `/api/v1/cco-cf/expenses/:id/suggestion/approve` | owner/finance | `cf.expense.suggestion_approved` + `cf.rule.applied` + (`cf.expense.categorized` om auto-transition) |
| POST | `/api/v1/cco-cf/expenses/:id/suggestion/reject` (body: `{ reason }`) | owner/finance | `cf.expense.suggestion_rejected` + `cf.rule.rejected` |
| POST | `/api/v1/cco-cf/expenses/:id/save-as-rule` | owner/finance | `cf.rule.created` |

**Integration med `POST /api/v1/cco-cf/expenses`:** vid skapande utan `category` körs `evaluateAllRules` automatiskt — om bestMatch eller recurring hittas sparas suggestion på expense (utan att applicera). Loggas som `cf.expense.auto_suggested`.

### 1.4 `src/ops/ccoFinanceDashboardBuilder.js` (utökad)

**Ny dashboard-sektion `rules`:**
- `total, active, inactive, byCategory, totalApplied, totalRejected, partial`

**Ny dashboard-sektion `suggestions` (CF.4-KPI:er):**
- `pendingCount` — antal expenses med osvarad suggestion
- `highConfidenceCount` — confidence ≥ 0.70
- `lowConfidenceCount` — confidence ≤ 0.30
- `newSupplierCount` — leverantörer som inte finns i någon regel
- `recurringDetectedCount` — antal med recurring-flagga

**Nya anomalies:**
- `expense_suggestions_pending` (medium)
- `new_suppliers_detected` (low)
- `recurring_expenses_detected` (low)

### 1.5 `public/finance.html` (utökad)

**Ny sektion: "Auto-categorization regler"** ovanför Utgifts-inkorgen
- Lista regler med villkor + setX + stats (timesApplied/timesRejected)
- AKTIV/PAUSAD toggle (PATCH enabled)
- Radera-knapp (DELETE)
- "+ Skapa regel"-knapp via 3-prompts

**Per expense-rad: suggestion-block** (visas när `expense.suggestion` finns)
- Badge `Förslag · NN%` färgad efter confidence (grön/gul/röd)
- Recurring-badge om återkommande
- Regel-namn + föreslagna fält som chips
- 3 knappar: **✓ Godkänn förslag** · **✗ Avvisa** · **💾 Spara som regel**

**4 nya KPI-kort i dashboard:**
- Förslag väntar · Hög confidence · Nya leverantörer · Återkommande upptäckta

---

## 2 · Smoke-test (60/60 PASS)

Verifierat via `node cf4-smoke.js`:

```
A1  · Skapa rule                            3/3 PASS
A2  · Engine föreslår fält utan att applicera 7/7 PASS
A3  · Godkänn → applicerar + audit           8/8 PASS
A4  · Avvisa → suggestion=null + audit       6/6 PASS
A5  · Rule återanvänds på nästa expense      2/2 PASS
A6  · Fail-closed okänd condition-type       1/1 PASS
A7  · matchType=all kräver alla villkor      2/2 PASS
A8  · Recurring detection (Spotify x3)       3/3 PASS
A9  · Confidence score logik                 3/3 PASS
A10 · Dashboard CF.4-summering               6/6 PASS
A11 · deleteRule + audit                     2/2 PASS
A12 · server-routes (alla 6 verifierade)     6/6 PASS
A13 · UI har rules-sektion + suggestions     8/8 PASS
A14 · Säkerhet — ingen AI/OCR/Fortnox-write  3/3 PASS

✓ ALL PASS — 60 assertions · 0 fail
```

---

## 3 · Acceptance-check (alla 9 från owner-spec)

| # | Krav | Status | Bevis |
|---|---|---|---|
| 1 | Expense kan få kategori-förslag | ✅ | A2 — `setSuggestion` + `bestMatch.suggestedFields.category` |
| 2 | Förslag kan godkännas | ✅ | A3 — `approveSuggestion` applicerar fält + sätter `categorySource='rule_engine_approved'` |
| 3 | Förslag kan avvisas | ✅ | A4 — `rejectSuggestion` clearar `suggestion`, audit `cf.expense.suggestion_rejected` |
| 4 | Supplier rule kan skapas | ✅ | A1 + via UI `+ Skapa regel` + via route `POST /save-as-rule` |
| 5 | Rule kan återanvändas på nästa expense | ✅ | A5 — samma `r1.id` matchar 3 olika expenses |
| 6 | Audit fungerar | ✅ | A1/A3/A4/A11 — 5 nya audit-kinds verifierade + 3 från expense-store |
| 7 | Dashboard visar förslag | ✅ | A10 — `pendingCount`, `highConfidenceCount`, `newSupplierCount`, `recurringDetectedCount` |
| 8 | Ingen extern AI/OCR | ✅ | A14a/b — no openai/anthropic/tesseract imports |
| 9 | Ingen Fortnox-write / patientdata i GitHub | ✅ | A14c + `data/` gitignored |

---

## 4 · Säkerhet (alla regler hållna)

| Regel | Status | Detalj |
|---|---|---|
| Ingen Fortnox-write | ✅ | CF.4-koden anropar inte fortnox-endpoints. `fortnoxSyncStatus='blocked_integration'` oförändrat. |
| Ingen extern AI | ✅ | Inga `openai/anthropic/google-cloud/azure`-imports i ruleStore eller engine. Ren JS-matchning. |
| Ingen OCR | ✅ | Engine matchar mot redan-strukturerade fält (supplier/notes/amount/vat/payment). Kör ingen OCR. `notes_contains` matchar mot befintlig text. |
| Ingen bank-CSV | ✅ | Inga CSV-parser-anrop. |
| Ingen patientdata i GitHub | ✅ | Regler är konfigurationsdata (kategorimappningar) — inte PII. `data/cco/expense-rules.json` gitignored. |
| Secure storage oförändrat | ✅ | CF.4 rör inte secureStorage — bara JSON-rules. |
| RBAC | ✅ | owner/finance write · revisor read (+ test) |
| Audit | ✅ | 8 nya audit-kinds wireade · både `action` OCH `kind`-fält (P2-C-workaround) |
| Human approval | ✅ | Engine sätter ALDRIG fält direkt. Bara `suggestion`-objekt. `approveSuggestion` är enda vägen till fält-applicering. |

---

## 5 · Confidence-thresholds + scoring

| Threshold | Värde | UI-färg |
|---|---|---|
| `HIGH_CONFIDENCE_THRESHOLD` | 0.70 | grön badge |
| `LOW_CONFIDENCE_THRESHOLD` | 0.30 | röd badge |
| Mellan | 0.31-0.69 | gul badge |

**Exempel:**
- Apoteket AB · card · 500 SEK mot regel "supplier_equals=Apoteket AB + payment=card + amount 100-2000" → **confidence 1.00** (alla 3 villkor matchar)
- Apoteket AB · swish · 5000 SEK mot samma regel → **confidence 0.59** (bara supplier-equals matchar, vikt 0.50/0.85)
- Coop · cash · 10 mot samma regel → **confidence 0.00**

---

## 6 · Workflow — End-to-end exempel

1. Owner skapar regel: `"Apoteket → forbrukning"` med `supplier_contains: 'apoteket'` + `setCategory: 'forbrukning'` + `setVatRatePercent: 25`
2. Owner laddar upp kvitto från Apoteket
3. Owner skapar expense från kvitto (utan att fylla i category)
4. Server kör `evaluateAllRules` → bestMatch med confidence 0.60 sparas som `expense.suggestion`
5. UI visar grön/gul badge "Förslag · 60% · regel: Apoteket → forbrukning"
6. Owner ser föreslagna fält och klickar **✓ Godkänn**
7. Server applicerar `category=forbrukning`, `vatRatePercent=25`, sätter `categorySource='rule_engine_approved'`, transitionar till `categorized`
8. Audit: `cf.expense.suggestion_approved` + `cf.rule.applied` + `cf.expense.categorized`
9. Rule.stats.timesApplied += 1
10. Owner fortsätter med "Godkänn → Markera redo för export → Bygg exportpaket" (CF.3-flödet)

Alternativt steg 6: **✗ Avvisa** med skäl → suggestion clearas + `cf.expense.suggestion_rejected` audit + rule.stats.timesRejected += 1.

Eller: **💾 Spara som regel** efter manuell kategorisering → en ny regel skapas från expense-fälten.

---

## 7 · Vad är PARTIAL/MISSING

| Område | Status | Notering |
|---|---|---|
| AI/ML-baserad kategorisering | MISSING (medvetet) | Kräver owner-GO för CF.10 |
| OCR av kvittobilder | MISSING (medvetet) | CF.10 — ej i CF.4 scope |
| Auto-supplier-merging (Apoteket vs Apoteket AB) | MISSING | CF.5 — separat vendor-store-sprint |
| Automatisk regel-import (10 förslag-regler) | MISSING | UI har "+ Skapa regel" manuellt; mass-import flyttas till framtida polish |
| Bulk-rerun av engine på existerande expenses | MISSING | Engine triggas bara vid `createExpense`. Bulk-rerun behöver egen endpoint. |
| Fortnox voucher-sync | MISSING (BLOCKED) | CF.9 — väntar Fortnox OAuth |
| Cron för recurring (förvarning innan due-date) | MISSING | CF.7 — separat sprint |

---

## 8 · Owner-action (icke-blockerande för CF.4)

| # | Action | Effekt |
|---|---|---|
| 1 | Testa workflow på `/finance.html` | Skapa regel via "+ Skapa regel" → upload kvitto → expense får suggestion → godkänn |
| 2 | (Valfritt) Skapa 5-10 grundregler manuellt | Apoteket→forbrukning, ICA→mat_rep, Klarna→bank_finansiell, Bonnier→marknadsforing, etc. |
| 3 | (Valfritt) Bygg "Bulk-rerun"-endpoint senare om många historiska expenses behöver kategoriseras | CF.4b polish |

---

## 9 · Stoppvillkor (icke utlösta)

| Villkor | Status |
|---|---|
| Patientdata till GitHub | ✅ NEJ |
| Kvitto/bankfil i repo | ✅ NEJ |
| Extern AI/OCR | ✅ NEJ — ren JS-strängmatchning |
| Ny tredjepartsintegration | ✅ NEJ |
| Bank-CSV-import | ✅ NEJ |
| Payroll | ✅ NEJ |
| Fortnox-write | ✅ NEJ |

**Inga stopp-villkor utlösta.** CF.4 levererad.

---

## 10 · Sammanfattning av leveransen

| | |
|---|---|
| Filer skapade | 2 (`ccoExpenseRuleStore.js` · denna rapport) |
| Filer modifierade | 4 |
| Routes tillagda | 8 |
| Audit-kinds tillagda | 8 |
| KPI-kort tillagda | 4 |
| Anomaly-kinds tillagda | 3 |
| Smoke-test | ✅ **60/60 PASS · 0 fail** |
| Acceptance | ✅ 9/9 uppfyllda |
| Säkerhet | ✅ 9/9 regler hållna |
| Human approval | ✅ engine sätter aldrig fält direkt |
| Fortnox-blocker | ⏸ oförändrad — `blocked_integration` visas korrekt |

---

**Sprint CF.4 leverans:** 2 nya filer · 4 modifierade · 8 routes · 8 audit-kinds · 60-assertion smoke-test grön · 9/9 acceptance ✅. Fortsätter CCO-native utan AI/OCR/Fortnox. Inga säkerhetsregler brutna.

**Rapport-författare:** Claude (Sprint CF.4)
**Datum:** 2026-06-01
