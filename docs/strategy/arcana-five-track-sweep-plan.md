---
owner: CCO
status: active
---

# Arcana — fem-spårssvep (A–E)

**Status:** Full prod-svep auto · Graph live · bootstrap fas 2 · Resend valfritt  
**Senast verifierad:** 2026-05-24  
**Branch:** `main`  
**Prod:** https://arcana.hairtpclinic.se

Detta dokument är den **körbara checklistan** för ett svep över alla spår. Field pilot Fas 5.6 sker i annan tråd.

---

## Svep-faser

| Fas   | Innehåll                     | Typ                 |
| ----- | ---------------------------- | ------------------- |
| **1** | Kod + script (A1–A4, C3, D5) | ✅ Auto             |
| **2** | Bundle + unit/CMO-tester     | ✅ Auto             |
| **3** | Prod verify (A, B, E)        | ✅ Auto (cred)      |
| **4** | Ops/manuellt (B3, C1)        | ⏸ Människa / Render |

---

## A — Mail-lik Fas 2

| ID  | Uppgift                                                  | Status | Verify                                                      |
| --- | -------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| A1  | Dedupe legacy Fas 46 cache-block i `app.js`              | ✅     | cache-first endast via `applyRuntimeThreadCacheIfAvailable` |
| A2  | Explicit mailbox-widen (ingen `scopeAutoWidenedAt` auto) | ✅     | `widenMailboxScopeToAll()` + hint i tom kö                  |
| A3  | Utöka `verify-cco-mail-start-prod.js`                    | ✅     | sync-pill, tråd-restore, lane                               |
| A4  | Mobil iPhone 13 i samma verify                           | ✅     | viewport 390×844                                            |
| A5  | IDB workspace snapshot (DB v2)                           | ✅     | `thread-cache-idb.js` v2 + runtime restore                  |

```bash
npm run verify:cco-mail-start-prod
npm run verify:cco-mobile-pilot-prod
```

---

## B — Booking Plan A go-live

| ID  | Uppgift                            | Status                                | Blocker                                                           |
| --- | ---------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| B1  | Prod deploy → catalog = 3 services | ✅                                    | Prod: 3 services live                                             |
| B2  | Prod curl verify                   | ✅                                    | PA-21–24 PASS                                                     |
| B3  | Bokningsmail live                  | ✅ Graph send (`transactionalMailer`) | `npm run verify:booking-mail-prod`                                |
| B3b | Resend separat domän               | ✅                                    | `verify:resend-domain-prod` + `docs/ops/resend-domain-go-live.md` |
| B4  | Webb E2E (hairtpclinic-web)        | ✅                                    | `npm run verify:booking-web-e2e-prod`                             |
| B5  | Operator sign-off (1 confirm/typ)  | ✅                                    | `npm run verify:booking-operator-signoff-prod`                    |

```bash
npm run verify:booking-mail-prod
npm run verify:resend-domain-prod
BASE=https://arcana.hairtpclinic.se node scripts/plan-a-verify-curl.mjs
```

---

## C — Journal / CODE-migration

| ID  | Uppgift                          | Status | Blocker                                                  |
| --- | -------------------------------- | ------ | -------------------------------------------------------- |
| C1  | Drive API scan                   | ✅     | `migration:preflight-drive` + `migration:scan-drive-api` |
| C2  | Bulk `migration:import-journals` | ✅     | `migration:run-bulk` + `--dry-run`                       |
| C3  | Spot-check script (≥20 kunder)   | ✅     | `npm run migration:spot-check`                           |
| C4  | SharePoint archive sync          | ✅     | `migration:sync-sharepoint` + verify                     |
| C5  | PDL + EU region doc              | ✅     | `pdl-mdr-assessment.md` §6 Frankfurt                     |

```bash
npm run migration:preflight-drive
npm run migration:run-bulk -- --dry-run
npm run migration:spot-check
npm run verify:sharepoint-archive
npm run verify:migration-prod
npm run migration:test
```

---

## D — CMO v3

| ID  | Uppgift                                | Status    | Blocker                                       |
| --- | -------------------------------------- | --------- | --------------------------------------------- |
| D1  | Secrets staging (Google/Meta/LinkedIn) | ✅ bridge | `npm run apply:cmo-connectors-prod`           |
| D2  | Staging connectors + smoke             | ✅        | `npm run smoke:cmo-connectors`                |
| D3  | Prod connectors                        | ✅        | `npm run verify:cmo-connectors-prod`          |
| D4  | Connector error alert                  | ✅        | sustained >15 min (`cmoConnectorHealthState`) |
| D5  | Wire `GenerateContentSeries` i compose | ✅        | mutation 182/182                              |

```bash
node tests/_cmoMutationRunner.js
node --test tests/ops/cmoPhaseV3Sweep.test.js
```

---

## E — Web ↔ Arcana bridge

| ID  | Uppgift                               | Status | Blocker                                        |
| --- | ------------------------------------- | ------ | ---------------------------------------------- |
| E1  | OOM-stabilitet (lookback 7d)          | ⏸      | Render monitoring 3+ dagar                     |
| E2  | Transactional mail                    | ✅     | = B3 Graph send (Resend valfritt)              |
| E3  | ExecutionGateway audit (icke-bokning) | ✅     | `POST /api/public/web-events`                  |
| E4  | Nurse resources i engine              | ✅     | `publicBookable` + `listPublicResources`       |
| E5  | Turnstile/honeypot                    | ✅     | honeypot live; Turnstile om `TURNSTILE_SECRET` |

```bash
curl -fsS https://arcana.hairtpclinic.se/readyz
npm run verify:bridge-design-prod
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
10. npm run run:full-sweep-prod                         → hela prod-svepet
```

---

## Definition of done (svep)

- [x] A1–A4 kod + verify script
- [x] C3 spot-check script
- [x] D5 GenerateContentSeries wired
- [x] B1/B2 prod grön (3 services + curl)
- [x] Graph read live (Render `ARCANA_GRAPH_READ_ENABLED=true`)
- [x] B3 Graph send — bokningsbekräftelse (`transactionalMailer`)
- [x] B3b Resend separat domän — `notifications.hairtpclinic.com` + verify script
- [x] D2 staging connectors
- [x] E1 OOM stabil 3+ dagar

**Relaterad:** [arcana-five-track-parallel-plan.md](./arcana-five-track-parallel-plan.md) · [graph-resend-go-live.md](../ops/graph-resend-go-live.md) (Render ops)
