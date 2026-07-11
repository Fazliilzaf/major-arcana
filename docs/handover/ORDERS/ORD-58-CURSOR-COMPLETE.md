# ORD-58 — Cursor sammanfattning (Fas 1 · Intäkt + AOV)

**Datum:** 2026-07-12  
**Agent:** Cursor  
**Status:** Fas 1 implementerad i major-arcana — väntar prod-UAT i CEO-appen (arcana-ceo-agent)

---

## Scope implementerat (Fas 1)

| Krav                                                    | Status | Var                                                                       |
| ------------------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| Periodskuren intäkt (same-day vs föregående månad)      | ✅     | `src/cfo/cfoFortnoxPaidPeriodTotals.js` + `cfoFinanceDashboardBuilder.js` |
| Fortnox betalda fakturor (InvoicePayments) när ansluten | ✅     | `cfoFortnoxInvoiceLister.listAllInvoicePayments`                          |
| Commercial-store fallback (null om saknas)              | ✅     | `cfoFinanceDashboardBuilder.js`                                           |
| `revenueSek` + `avgOrderValueSek` i gateway             | ✅     | `src/ops/clinicPerformance.js`                                            |
| CEO payload oförändrad                                  | ✅     | `GET /api/v1/monitor/clinic-performance`                                  |
| Tester periodskärning + null-honest                     | ✅     | `tests/cfo/*`, `tests/ops/clinicPerformance.test.js`                      |

**Fas 2 (beläggning/utilizationRate)** — ej påbörjad. Kräver kapacitetsmodell (ägarbeslut).

---

## Filer ändrade / tillagda

| Fil                                             | Ändring                                                    |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `src/cfo/cfoFortnoxPaidPeriodTotals.js`         | **Ny** — summerar Fortnox-betalningar per same-day-fönster |
| `src/cfo/cfoFortnoxInvoiceLister.js`            | `listAllInvoicePayments` (paginerad)                       |
| `src/cfo/cfoFortnoxClient.js`                   | `fromdate`/`todate` på invoicepayments                     |
| `src/cfo/cfoFinanceDashboardBuilder.js`         | Fortnox primär, commercial fallback, same-day-cap          |
| `src/ops/clinicPerformance.js`                  | Uppdaterade dataNote/kommentarer (ORD-58)                  |
| `tests/cfo/cfoFortnoxPaidPeriodTotals.test.js`  | **Ny**                                                     |
| `tests/cfo/cfoFinanceDashboardBuilder.test.js`  | Fortnox-prioritet                                          |
| `tests/routes/monitorClinicPerformance.test.js` | Revenue/AOV integration                                    |

Tidigare grund: PR **#504** (`feat(clinic-perf): add same-day revenue and aov trend`).

---

## Verify (lokal)

```bash
node --test tests/cfo/cfoFortnoxPaidPeriodTotals.test.js
node --test tests/cfo/cfoFinanceDashboardBuilder.test.js
node --test tests/ops/clinicPerformance.test.js
node --test tests/routes/monitorClinicPerformance.test.js
npm run check:syntax
```

---

## Prod / CEO acceptans (efter deploy + frys-undantag)

1. `GET /api/v1/monitor/clinic-performance` (owner-token) → `revenueSek.current/previous` och `avgOrderValueSek` ≠ null när Fortnox/commercial har data.
2. CEO-appen `/clinic-performance` → Intäkt + Snittordervärde live (ej "Källa på väg").
3. Hero-chip: **4 mätvärden live** (bokningar, no-show, intäkt, AOV) när alla källor svarar.

---

## Kvar / nästa

- [ ] Owner: frys-undantag + deploy major-arcana
- [ ] CEO-app prod-UAT (arcana-ceo-agent — ej detta repo)
- [ ] **ORD-58 Fas 2** — utilizationRate (separat order efter kapacitetsdefinition)

---

## AOV-metod (dokumenterat)

**Val:** `avgOrderValueSek = revenueSek / bookings` per period (same-day-fönster).  
**Inte** Fortnox ordervärde per faktura — bokningsdata saknar pris per besök; proxy är ärligt deklarerad i `avgOrderValueNote`.
