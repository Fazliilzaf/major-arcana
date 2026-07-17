# ORD-79 — Ekonomi-aggregat till CEO: intäkt + kostnader + resultat

**Datum:** 2026-07-17  
**Agent:** Cursor  
**Status:** Implementerad i major-arcana — CEO-tiles/CFO-agent (Claude) efter merge  
**Notion:** https://app.notion.com/p/3a0060ccc15b810cbfd9e41812fb15a7

## Krav → leverans

| Krav                                                               | Status | Var                                        |
| ------------------------------------------------------------------ | ------ | ------------------------------------------ |
| `GET /monitor/finance-summary` (samma auth som clinic-performance) | ✅     | `src/routes/monitor.js`                    |
| `revenueSek` same-day + previous                                   | ✅     | Fortnox via `buildFinanceDashboard`        |
| `expensesSek` + `expenseCount` (promotade endast)                  | ✅     | `src/ops/financeSummary.js`                |
| `resultSek` = intäkt − kostnader                                   | ✅     | samma                                      |
| Topp-3 kategorier, ingen PII                                       | ✅     | `topCategories` + `findForbiddenPiiKeys`   |
| Ärlig null + `dataNote` / `notLiveYet`                             | ✅     | Fortnox ej connected → null revenue/result |
| Tester                                                             | ✅     | `tests/ops/financeSummary.test.js`         |

## Payload (kontrakt)

```json
{
  "tenantId": "hair-tp-clinic",
  "period": "2026-07",
  "previousPeriod": "2026-06",
  "source": "live",
  "revenueSek": { "current": 10000, "previous": 8000 },
  "expensesSek": { "current": 1900, "previous": 400 },
  "resultSek": { "current": 8100, "previous": 7600 },
  "expenseCount": { "current": 4, "previous": 1 },
  "topCategories": {
    "current": [{ "category": "marknadsforing", "sumSek": 1000 }],
    "previous": []
  },
  "sources": {
    "revenue": "fortnox_invoice_payments",
    "expenses": "cfo_expense_store_promoted",
    "fortnoxConnected": true
  },
  "notLiveYet": [],
  "dataNote": "…"
}
```

**Kostnadsstatuser som räknas:** `approved` · `ready_for_export` · `exported`  
**Räknas ej:** `new` · `needs_review` · `categorized` · `rejected` (CM-kandidater)

## CEO-uppföljare (Claude, efter merge)

1. CFO-agenten läser aggregatet i stället för blind LLM-resonemang
2. Ekonomi-tiles i CP/Översikt: Intäkt · Kostnader · Resultat med källnoter

## Verify

```bash
node --test tests/ops/financeSummary.test.js
# efter deploy (owner-token):
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://arcana.hairtpclinic.com/api/v1/monitor/finance-summary" | jq .
```
