# ORD-58 · Clinic Performance-fördjupning: intäkt/AOV (fas 1) → Beläggning (fas 2)

**Status:** FAS 1 KLAR I KOD (Cursor 2026-07-12) · FRYS-UNDANTAG GODKÄNT av Fazli 2026-07-11 (denna order + scheduler-env i samma deploy) · Prod/CEO-UAT efter deploy  
**Byggare:** CURSOR (klinik-kod · major-arcana) · **Beställare:** Fazli via CEO-spåret 2026-07-11

---

## Inventering (check-before-code)

| Del                                   | Finns? | Var                                                       | Gap                       |
| ------------------------------------- | ------ | --------------------------------------------------------- | ------------------------- |
| CEO konsumerar revenue/AOV            | ✅ hel | arcana-ceo-agent `clinic-metrics.ts`                      | —                         |
| Gateway `/monitor/clinic-performance` | ✅ hel | `src/routes/monitor.js`                                   | —                         |
| Periodskärning bookings/no-show       | ✅ hel | `src/ops/clinicPerformance.js` (#491–#504)                | —                         |
| Periodskärning intäkt                 | ✅ hel | `src/cfo/cfoFortnoxPaidPeriodTotals.js` + finance builder | Prod-UAT                  |
| Fortnox InvoicePayments               | ✅ hel | `cfoFortnoxInvoiceLister.listAllInvoicePayments`          | Kräver live Fortnox OAuth |
| Beläggning (Fas 2)                    | ❌     | —                                                         | Kapacitetsmodell saknas   |

---

## Fas 1 — Intäkt + AOV ✅ (denna order)

1. **Periodskuren intäkt:** summera betalda Fortnox-fakturor (`InvoicePayments`) per kalendermånad, same-day-jämförelse mot föregående månad (samma logik som bookings).
2. **`revenueSek = {current, previous}`** — null om källan saknar data för perioden.
3. **`avgOrderValueSek = revenueSek / bookings`** per period — dokumenterat i `avgOrderValueNote` (proxy, ej fakturapr per bokning).
4. Befintlig payload till CEO oförändrad.
5. **Tester:** `tests/cfo/cfoFortnoxPaidPeriodTotals.test.js`, `tests/cfo/cfoFinanceDashboardBuilder.test.js`, `tests/ops/clinicPerformance.test.js`, `tests/routes/monitorClinicPerformance.test.js`.

**Handover:** [`ORD-58-CURSOR-COMPLETE.md`](./ORD-58-CURSOR-COMPLETE.md)

---

## Fas 2 — Beläggning (SEPARAT beslut, ej denna order)

`utilizationRate` kräver kapacitetsmodell (behandlingsslots/dag per resurs). **Ägarfråga:** definiera klinikens kapacitet innan fas 2 beställs.

---

## Forbidden

- Frys-undantaget är GIVET för exakt denna deploy — inget annat får åka med.

## Ingår i samma deploy (Fazlis godkända undantag 2026-07-11)

Efter merge, FÖRE deploy: töm/utöka `ARCANA_SCHEDULER_JOBS` i Render-env på arcana
(srv-d8b3i3tckfvc73clgeng) så alla obligatoriska scheduler-jobb (restore-drills,
secret-rotation, audit, pilotrapport) tillåts. OBS: env-ändring kräver DEPLOY,
inte restart (incident-lärdom 2026-06-06). De 7 patientkanal-checkarna grönnar
därefter i takt med att jobben kör.

- Rör inte journal/feed/forms-routes i server.js. Aldrig `git add -A`.
- Inga påhittade siffror — null tills källan är verifierad.

---

## Acceptance (Fas 1)

- [x] Kod: gateway returnerar `revenueSek` + `avgOrderValueSek` med same-day previous
- [ ] Prod: `/clinic-performance` i CEO-appen visar Intäkt + Snittordervärde live
- [ ] Prod: Hero-chippen **4 mätvärden live** (bokningar, no-show, intäkt, AOV)

---

## Verify efter deploy

```bash
# major-arcana (read-only)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://arcana.hairtpclinic.com/api/v1/monitor/clinic-performance" | jq '.revenueSek,.avgOrderValueSek,.notLiveYet'
```

Förväntat när Fortnox/commercial har data: `revenueSek.current` numerisk, `notLiveYet` utan `revenueSek.previous` / `avgOrderValueSek.previous` (om previous också har data).
