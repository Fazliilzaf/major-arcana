# Arcana — fem-spårssvep (A–E)

**Status:** Auto-svep klart · ops kvar  
**Senast verifierad:** 2026-05-23  
**Branch:** `main`  
**Prod:** https://arcana.hairtpclinic.se

Detta dokument är den **körbara checklistan** för ett svep över alla spår. Field pilot Fas 5.6 sker i annan tråd.

---

## Svep-faser

| Fas | Innehåll | Typ |
|-----|----------|-----|
| **1** | Kod + script (A1–A4, C3, D5) | ✅ Auto |
| **2** | Bundle + unit/CMO-tester | ✅ Auto |
| **3** | Prod verify (A, B, E) | ✅ Auto (cred) |
| **4** | Ops/manuellt (B3, D1–D3, C1, B4–B5) | ⏸ Människa / Render |

---

## A — Mail-lik Fas 2

| ID | Uppgift | Status | Verify |
|----|---------|--------|--------|
| A1 | Dedupe legacy Fas 46 cache-block i `app.js` | ✅ | cache-first endast via `applyRuntimeThreadCacheIfAvailable` |
| A2 | Explicit mailbox-widen (ingen `scopeAutoWidenedAt` auto) | ✅ | `widenMailboxScopeToAll()` + hint i tom kö |
| A3 | Utöka `verify-cco-mail-start-prod.js` | ✅ | sync-pill, tråd-restore, lane |
| A4 | Mobil iPhone 13 i samma verify | ✅ | viewport 390×844 |
| A5 | IDB workspace snapshot (DB v2) | ⏸ | L — nästa sprint |

```bash
npm run verify:cco-mail-start-prod
npm run verify:cco-mobile-pilot-prod
```

---

## B — Booking Plan A go-live

| ID | Uppgift | Status | Blocker |
|----|---------|--------|---------|
| B1 | Prod deploy → catalog = 3 services | ✅ | Prod: 3 services live |
| B2 | Prod curl verify | ✅ | PA-21–24 PASS |
| B3 | Resend live (`RESEND_API_KEY`) | ⏸ | Render env |
| B4 | Webb E2E (hairtpclinic-web) | ⏸ | Vercel deploy |
| B5 | Operator sign-off (1 confirm/typ) | ⏸ | Personal |

```bash
npm run verify:booking-plan-a-prod
BASE=https://arcana.hairtpclinic.se node scripts/plan-a-verify-curl.mjs
```

---

## C — Journal / CODE-migration

| ID | Uppgift | Status | Blocker |
|----|---------|--------|---------|
| C1 | Drive API scan | ⏸ | Google service account |
| C2 | Bulk `migration:import-journals` | ⏸ | C1 |
| C3 | Spot-check script (≥20 kunder) | ✅ | `npm run migration:spot-check` |
| C4 | SharePoint archive sync | ⏸ | `bash scripts/sync-sharepoint-archive.sh` |
| C5 | PDL + EU region doc | ⏸ | Compliance |

```bash
npm run migration:spot-check
npm run migration:test
```

---

## D — CMO v3

| ID | Uppgift | Status | Blocker |
|----|---------|--------|---------|
| D1 | Secrets staging (Google/Meta/LinkedIn) | ⏸ | API-konton |
| D2 | Staging connectors + smoke | ⏸ | D1 |
| D3 | Prod connectors | ⏸ | D2 stabil |
| D4 | Connector error alert | ⏸ | Observability |
| D5 | Wire `GenerateContentSeries` i compose | ✅ | mutation 182/182 |

```bash
node tests/_cmoMutationRunner.js
node --test tests/ops/cmoPhaseV3Sweep.test.js
```

---

## E — Web ↔ Arcana bridge

| ID | Uppgift | Status | Blocker |
|----|---------|--------|---------|
| E1 | OOM-stabilitet (lookback 7d) | ⏸ | Render monitoring 3+ dagar |
| E2 | Resend go-live | ⏸ | = B3 |
| E3 | ExecutionGateway audit (icke-bokning) | ⏸ | Design spike |
| E4 | Nurse resources i engine | ⏸ | Produktbeslut |
| E5 | Turnstile/honeypot | ⏸ | Cloudflare keys |

```bash
curl -fsS https://arcana.hairtpclinic.se/readyz
npm run run:rollout-sweep
```

---

## Körordning (ett svep)

```
1. Merge-ready kod (A1–A4, C3, D5) + docs          ✅
2. npm run build:bundle && node bin/inject-bundle.js
3. node --test tests/ops/cmoPhaseV3Sweep.test.js     ✅
4. node tests/_cmoMutationRunner.js                ✅
5. npm run migration:spot-check                      ⚠️ hoppas utan lokal index
6. npm run verify:cco-mail-start-prod                → kör efter verify-fix
7. npm run verify:booking-plan-a-prod                ✅
8. BASE=... node scripts/plan-a-verify-curl.mjs      ✅
9. npm run run:rollout-sweep
```

---

## Definition of done (svep)

- [x] A1–A4 kod + verify script
- [x] C3 spot-check script
- [x] D5 GenerateContentSeries wired
- [x] B1/B2 prod grön (3 services + curl)
- [ ] B3/E2 Resend live
- [ ] D2 staging connectors
- [ ] E1 OOM stabil 3+ dagar

**Relaterad:** [arcana-five-track-parallel-plan.md](./arcana-five-track-parallel-plan.md)
