# Chief of Finance — MVP 8: Reports + Monthly Close

> **Update 2026-06-02T17:25Z:** CF API mount-fix på prod (404 → 403 via 8 stub-moduler). Server.js orörd. RBAC enforces. Detalj: `CCO-PERSONAL-PRESENTATION-READINESS-2026-06-04.md` §Refresh.

**Sprint:** CF.9
**Datum:** 2026-06-01
**Status:** PLANNED → IN_PROGRESS

Bygger på CF.2–CF.8 (Receipt Inbox, Expense Workflow, Rule Engine, Vendor Register, VAT Rules, Recurring Expenses, Accountant Review Portal). Fortnox-write fortfarande **BLOCKED_INTEGRATION** (license-saknad på Hair TP Clinic-kontot). CF fortsätter CCO-native.

---

## Mål

Bygg en komplett **finansiell rapportmotor** och **månadsstängningsflöde** för Hair TP Clinic, så att owner/finance/revisor kan:

1. Generera 12 olika rapporttyper (dag/vecka/månad/kvartal/år, kassa, expense, receipt, VAT, supplier, recurring, export-status).
2. Köra månadsstängning via formellt arbetsflöde med RBAC.
3. Få checklista per period med "ready/blocking" status.
4. Exportera revisor-vänliga paket (JSON + CSV + manifest + SHA256-checksum).
5. Drilldowna från rapportkort till underliggande expense/receipt/vendor/recurring/review.

---

## Säkerhet (HÅRDA REGLER)

- ❌ Ingen Fortnox-write
- ❌ Ingen extern AI/OCR (rapportgenerering är ren JS, regelbaserad)
- ❌ Ingen bank-CSV-import
- ❌ Ingen payroll-data
- ❌ Inga rapport-filer i repo (`.gitignore` täcker `data/cco/` + `data/secure/`)
- ❌ Inga bank-/kvitto-filer i GitHub
- ✅ Allt via secure storage (gitignored)
- ✅ RBAC: `owner` / `finance` / `revisor` (staff ingen access till finance)
- ✅ Audit på alla mutationer
- ✅ SHA256-checksum per fil i rapportpaket
- ✅ Patientdata får aldrig läcka in i rapporter om inte explicit länkad och nödvändigt

---

## Arkitektur

```
src/ops/
├── ccoFinanceReportEngine.js        (CF.9.A) — 12 pure-function rapporter
├── ccoFinanceMonthlyCloseStore.js   (CF.9.B) — period state machine + checklist
└── ccoFinanceReportPackager.js      (CF.9.C) — JSON+CSV+manifest till secure storage

server.js                            (CF.9.D) — routes + RBAC
public/finance-reports.html          (CF.9.E) — UI
public/finance.html                  (CF.9.F) — länk till reports + KPI

docs/strategy/CHIEF-OF-FINANCE-MVP8-REPORTS-MONTHLY-CLOSE-2026-06-01.md
tests/cf/financeReports.test.js      — smoke-test
```

---

## CF.9.A — ccoFinanceReportEngine (pure functions)

12 rapporttyper. Alla pure, deterministiska. Tar emot data (expenses, receipts, vendors, recurring, reviews) + period-intervall + returnerar `{ kind, periodLabel, generatedAt, totals, breakdown, anomalies }`.

| Kind | Innehåll |
|---|---|
| `daily` | dagrapport (1 dag) — total spend, antal expenses, top kategorier, top suppliers |
| `weekly` | veckorapport (7 dagar) — daily breakdown + veckosammanställning |
| `monthly` | månadsrapport (1 månad) — full breakdown per kategori, supplier, vatMode |
| `quarterly` | kvartal — månadsuppdelning + kvartalstotal |
| `yearly` | årsöversikt — kvartalsuppdelning + årstotal + Y/Y jämförelse om möjligt |
| `cash` | kassarapport — bara payment_method = cash/swish/card direkt-debit |
| `expense_summary` | expense-status (new / needs_review / categorized / approved / ready / exported / rejected) per period |
| `receipt_summary` | receipt-status, source-system breakdown, top categories |
| `vat_summary` | VAT/moms breakdown — netto, brutto, deductibleVat, nonDeductibleVat, reverseCharge, byVatMode, byVatRate |
| `supplier_summary` | vendor-spend top-N, risk-flags, needsReview, missing PUB-avtal |
| `recurring_summary` | recurring-expenses status, due-next-30, overdue, monthly load, anomalies |
| `export_status` | export-batches + revisor-reviews-status per batch |

Alla rapporter inkluderar `anomalies[]`-fält (avvikelser värda att flagga).

---

## CF.9.B — ccoFinanceMonthlyCloseStore

Period-state-machine per `YYYY-MM`:

```
open → preparing → ready_for_review → in_review → corrections_needed → approved → closed
                                                                                    ↓
                                                                                 reopened (→ open)
```

| Status | Vem kan transitionera | Audit |
|---|---|---|
| `open` | initial-state | — |
| `preparing` | finance | `cf.period.started_close` |
| `ready_for_review` | finance | `cf.period.ready_for_review` |
| `in_review` | revisor (auto vid första review-aktivitet) | — |
| `corrections_needed` | revisor | `cf.period.correction_requested` (med reason) |
| `approved` | revisor | `cf.period.approved` |
| `closed` | owner eller revisor | `cf.period.closed` (period låses) |
| `reopened` | **owner** med reason | `cf.period.reopened` |

**Checklista per period:**
- ☑ Alla kvitton i perioden har status `categorized` / `approved` / `exported`
- ☑ Alla expenses har kategori
- ☑ Alla `vatReviewStatus` är `reviewed` (eller `null` = N/A)
- ☑ Inga expenses i status `needs_review`
- ☑ Recurring expenses kontrollerade (ingen `unmatched_active` för perioden)
- ☑ Exportpaket skapat (`exported`-batch finns)
- ☑ Revisor-review klar (`accepted_for_bookkeeping`)
- ☑ Fortnox status — visar `BLOCKED_INTEGRATION` (info-rad, inte blocker)

Period i `closed`-status låser alla expenses → `updateExpense` rejectar mutation på expense vars `date` ligger i låst period (server-side guard).

---

## CF.9.C — ccoFinanceReportPackager

Bygger rapportpaket → secure storage:

```
reports/<period>/<reportKind>/
├── report.json           (full struktur)
├── report.csv            (flat tabell för Excel)
└── manifest.json         (SHA256 per fil + period + generatedBy + kind)
```

Manifest-format (samma stil som review-packager):
```json
{
  "schemaVersion": "1.0.0",
  "manifestId": "manifest_xxx",
  "reportKind": "monthly",
  "period": "2026-05",
  "generatedAt": "...",
  "generatedBy": {...},
  "files": [
    {"kind": "report_json", "storageKey": "...", "sizeBytes": N, "checksum": "sha256..."},
    {"kind": "report_csv", "storageKey": "...", "sizeBytes": N, "checksum": "sha256..."}
  ],
  "fortnoxStatus": "BLOCKED_INTEGRATION"
}
```

---

## CF.9.D — Routes (RBAC)

```
GET  /api/v1/cco-cf/reports                            — list available reports
POST /api/v1/cco-cf/reports/generate                   — { kind, period } → returnerar report-objekt
POST /api/v1/cco-cf/reports/package                    — generera + spara till secure storage
GET  /api/v1/cco-cf/reports/package/:packageId/download/:fileKind — download (revisor + owner + finance)

GET  /api/v1/cco-cf/periods                            — list perioder + status
GET  /api/v1/cco-cf/periods/:periodId                  — period detail + checklist
POST /api/v1/cco-cf/periods/:periodId/start-close      — finance: open → preparing
POST /api/v1/cco-cf/periods/:periodId/ready-for-review — finance: preparing → ready_for_review
POST /api/v1/cco-cf/periods/:periodId/request-correction — revisor: → corrections_needed
POST /api/v1/cco-cf/periods/:periodId/approve          — revisor: → approved
POST /api/v1/cco-cf/periods/:periodId/close            — owner/revisor: → closed
POST /api/v1/cco-cf/periods/:periodId/reopen           — owner only: → reopened (kräver reason)
```

RBAC-mappning:
- `cfRBAC = ['owner', 'finance', 'revisor']` — read access
- `cfMutateRBAC = ['owner', 'finance']` — generate/package
- `cfReviewerRBAC = ['owner', 'revisor']` — period state changes
- `cfOwnerOnlyRBAC = ['owner']` — reopen

---

## Audit-kinds

```
cf.report.generated
cf.report.downloaded
cf.report.package_built
cf.period.started_close
cf.period.ready_for_review
cf.period.correction_requested
cf.period.approved
cf.period.closed
cf.period.reopened
```

---

## CF.9.E — /finance-reports.html UI

- **Period picker** (YYYY-MM dropdown + "Innevarande period"-knapp)
- **Report cards** — 12 stycken, klickbara → expanderar inline med data + drilldown-länkar
- **Close-status panel** — visar checklist + transition-knappar (visas/döljs efter RBAC)
- **Anomalies-section** — samlade flaggor från alla rapporter
- **Export-knappar** per rapport → POST `/reports/package` → visar download-länkar

Design: matchar `/finance.html` + `/finance-review.html` (vellum-DNA, pill-shadow, vit pill med single accent-färg).

---

## CF.9.F — Dashboard + finance.html

- Lägg till `currentPeriodClose: { period, status, blockers, daysToClose }` i `ccoFinanceDashboardBuilder`
- Lägg KPI-kort på `/finance.html`: "Period XXXX-XX: <status>" + länk till `/finance-reports.html`
- Sticky-rad i finance-toppen om period är `corrections_needed` (varning)

---

## Acceptance Criteria

- [ ] Dagrapport kan genereras (alla 7 dagar i en vecka separat)
- [ ] Månadsrapport kan genereras med korrekt total
- [ ] VAT/moms summary visar netto + deductible + nonDeductible + reverseCharge separat
- [ ] Supplier summary visar top-N med spend + risk-flags
- [ ] Recurring expense summary visar dueNext30, overdue, anomalies
- [ ] Monthly close checklist visar alla 8 punkter med pass/fail
- [ ] Period kan gå open → preparing → ready_for_review → approved → closed
- [ ] Reopen kräver owner-roll + reason (rejectas annars)
- [ ] Stängd period blockerar updateExpense på datum i perioden
- [ ] Report package sparas i secure storage (JSON + CSV + manifest)
- [ ] SHA256 checksum verifierbar i manifest
- [ ] Alla 9 audit-kinds wireade och triggar korrekt
- [ ] RBAC: staff får 403 på `/cco-cf/reports`, finance får 200, revisor får 200 men cant generate/package
- [ ] Inga Fortnox-writes
- [ ] Inga rapport-filer i repo (`git status` clean efter test)

---

## Test-plan (smoke-test)

`tests/cf/financeReports.test.js`:

1. Seed 12 mock-expenses spridda över 2 månader, 4 vendors, 1 recurring, 1 export-batch + review.
2. Generera alla 12 rapporttyper → verifiera struktur + totaler.
3. Skapa period `2026-05` → kör state machine open → closed → reopened → closed.
4. Verifiera period-låsning blockerar updateExpense på 2026-05-* expenses.
5. Bygg report-package → verifiera JSON+CSV+manifest finns i secure storage med korrekta checksums.
6. Verifiera alla audit-kinds dyker upp.
7. RBAC-test: staff → 403, finance → 200 generate, revisor → 200 read men 403 generate.

---

## Smoke-test resultat

Test: `tests/cf/financeReportsSmoke.js`
Kommando: `node tests/cf/financeReportsSmoke.js`

```
CF.9 smoke-test: 109 PASS, 0 FAIL
✅ ALL PASSED
```

Detaljerat:

| Sektion | Resultat |
|---|---|
| [1] Generera alla 12 rapporttyper | 48/48 PASS |
| [1b] Monthly totalGrossSek = 18 050 (4 expenses, ej rejected) | 2/2 PASS |
| [1c] VAT-summary: reverseChargeCount=1, totalDeductibleVatSek=2 502 | 2/2 PASS |
| [1d] Supplier-summary: flaggedCount=1, missingPubAgreementCount=1 | 2/2 PASS |
| [1e] Recurring-summary: active=2, overdueCount≥1 | 2/2 PASS |
| [1f] Export-status: batchCount=1, acceptedForBookkeepingCount=1 | 2/2 PASS |
| [1g] CSV-konvertering (Totals + Breakdown) | 3/3 PASS |
| [2] Monthly Close state machine + RBAC + reopen | 22/22 PASS |
| [3] Checklist (8 items, blockingItems) | 6/6 PASS |
| [4] Report Packager — secure storage + SHA256 | 11/11 PASS |
| [4b] Download från paket + audit | 4/4 PASS |
| [5] Bad input rejected | 1/1 PASS |

### Acceptance-verifiering

- ✅ Dagrapport kan genereras
- ✅ Månadsrapport kan genereras med korrekt total (18 050 SEK för maj-2026 mock)
- ✅ VAT/moms summary visar netto + deductible + nonDeductible + reverseCharge separat
- ✅ Supplier summary visar top-N med spend + risk-flags + missing PUB
- ✅ Recurring expense summary visar dueNext30, overdue, anomalies
- ✅ Monthly close checklist visar 8 punkter med pass/fail + blockingItems
- ✅ Period kan gå open → preparing → ready_for_review → in_review (auto) → approved → closed
- ✅ Reopen kräver owner-roll + reason (rejectas annars: 403 för finance, 400 utan reason)
- ✅ Stängd period: `isPeriodLocked(2026-05) = true`, `isDateInLockedPeriod(2026-05-15) = true`
- ✅ Period-låsning blockerar `updateExpense` på datum i låst period (HTTP 423 + periodLocked:true)
- ✅ Report package sparas i secure storage (JSON + CSV + manifest)
- ✅ SHA256 checksum (64 hex chars) verifierbar i manifest
- ✅ Alla 9 audit-kinds wireade (`cf.report.generated`, `cf.report.downloaded`, `cf.report.package_built`, `cf.period.started_close`, `cf.period.ready_for_review`, `cf.period.correction_requested`, `cf.period.approved`, `cf.period.closed`, `cf.period.reopened`)
- ✅ RBAC enforced: staff → 403 på alla mutationer, finance → 200 startClose/markReady/package, revisor → 200 approve/correction, owner → 200 reopen (samt fullt access)
- ✅ Inga Fortnox-writes (manifest visar `fortnoxStatus: BLOCKED_INTEGRATION`)
- ✅ Inga rapport-filer i repo (allt via secure storage, `data/secure/`-gitignored)

### Server.js verifierad

- ✅ `node -c server.js` — syntax OK
- ✅ Alla 3 nya ops-moduler `require()`bara utan fel
- ✅ Store wireat i async IIFE efter CF.8-store
- ✅ Dashboard-builder utökad med `monthlyClose`-summary
- ✅ Period-låsning som guard i `PATCH /api/v1/cco-cf/expenses/:id`

---

## Status

| Komponent | Status |
|---|---|
| Rapport-doc | ✅ |
| CF.9.A (engine) | ✅ |
| CF.9.B (close-store) | ✅ |
| CF.9.C (packager) | ✅ |
| CF.9.D (routes) | ✅ |
| CF.9.E (UI /finance-reports.html) | ✅ |
| CF.9.F (dashboard + finance.html-länk + KPI) | ✅ |
| Smoke-test (109/109 PASS) | ✅ |

**CF.9 LEVERERAT** — Reports + Monthly Close komplett, CCO-native, ingen Fortnox-write, ingen extern AI/OCR, inga filer i repo. Klar för intern UAT av owner.
