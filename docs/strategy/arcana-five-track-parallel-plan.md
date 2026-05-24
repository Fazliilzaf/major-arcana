# Arcana — fem parallella spår (A–E)

**Status:** Aktiv koordinering  
**Senast uppdaterad:** 2026-05-23  
**Utanför scope här:** Field pilot Fas 5.6 (annan tråd)

---

## Översikt

| Spår | Namn | Mognad | Kritisk väg nästa |
|------|------|--------|-------------------|
| **A** | CCO Mail-lik Fas 2 | Fas 1 live | Dedupe cache + verify |
| **B** | CCO Bokning Plan A go-live | Kod klar | Prod catalog + Resend + sign-off |
| **C** | Journal / CODE-migration | Pilot live, bulk kvar | Drive scan + spot-check |
| **D** | CMO Marketing Copilot v3 | Fixture i prod | Fas O connectors |
| **E** | Web ↔ Arcana bridge | Fas A–C live | OOM + Resend + ExecutionGateway |

Spåren **delar prod** (`arcana.hairtpclinic.se`), **Render env**, och **STAFF/OWNER-auth** — koordinera deploy-fönster.

---

## A — CCO Mail-lik Fas 2

**Mål:** Mac Mail-känsla vid *varje* öppning — samma tråd, ingen scroll-hop, sync-pill försvinner snabbt.

**Klar (Fas 1):** cache-first boot, `bootLaneLocked`, Synkar-pill, `verify:cco-mail-start-prod`.

### Nästa (prioritet)

| # | Uppgift | Effort | Filer |
|---|---------|--------|-------|
| A1 | **Dedupe cache-vägar** — ta bort/routa legacy Fas 46-block i `app.js` via `applyRuntimeThreadCacheIfAvailable` | S | `app.js`, `runtime-dom-live-composition.js` |
| A2 | **Explicit mailbox-widen** — ersätt kvarvarande `scopeAutoWidenedAt` med UI-action | M | `app.js`, mailbox dropdown |
| A3 | **Utöka verify** — sparad tråd, sync-pill <5s, sparad lane, auth_required | M | `scripts/verify-cco-mail-start-prod.js` |
| A4 | **Mobil mail-start** — iPhone 13 timing på `/staff?view=conversations` | M | samma verify + `cco-mobile-shell` |
| A5 | **IDB workspace snapshot** — tråd + lane i cache (DB v2) | L | `thread-cache-idb.js`, workspace state |

**Verify:** `npm run verify:cco-mail-start-prod` + `verify:cco-mobile-pilot-prod`

**Relaterad doc:** [cco-mail-like-start-plan.md](./cco-mail-like-start-plan.md)

---

## B — CCO Bokning Plan A go-live

**Mål:** Publikt `/boka` med exakt **3 mötestyper** (A1 online, A2 fysisk, A3 uppföljning), operator confirm i CCO, Resend-mail live.

**Klar (kod):** PA-01–30, engine store, public API, CCO UI, mobil slot-picker, local curl grön.

### Nästa (prioritet)

| # | Uppgift | Effort | Blocker |
|---|---------|--------|---------|
| B1 | **Prod deploy** — catalog = 3 services (ej legacy 9) | M | Render deploy |
| B2 | **Prod curl** — `BASE=https://arcana.hairtpclinic.se node scripts/plan-a-verify-curl.mjs` | S | B1 |
| B3 | **Graph send live** — bokningsbekräftelse | S | ✅ `verify:booking-mail-prod` |
| B3b | **Resend separat domän** — `notifications.hairtpclinic.com` | S | DNS + `verify:resend-domain-prod` |
| B4 | **Webb E2E** — Vercel `ARCANA_PROVIDER=booking-engine`, mobil A1 + desktop A2/A3 | M | hairtpclinic-web deploy |
| B5 | **Operator sign-off** — 1 confirm per mötestyp i CCO; fyll sprint-0 log | M | Personal |

**Verify:** `npm run verify:booking-plan-a-prod` · `plan-a-verify-curl.mjs`

**Relaterad doc:** [cco-booking-plan-a-go-live.md](./cco-booking-plan-a-go-live.md) · [cco-booking-plan-a-todos.md](./cco-booking-plan-a-todos.md)

---

## C — Journal / CODE-migration

**Mål:** Historik från Drive/Cliento i Arcana; SharePoint ersatt av repo-spec + kod; skala bortom 5 pilotkunder.

**Klar:** 6 687 kunder, journal-modul, 5 pilotkunder prod, CODE-archive (`~/Code/MA-Archive`).

### Nästa (prioritet)

| # | Uppgift | Effort | Blocker |
|---|---------|--------|---------|
| C1 | **Drive API scan** — `npm run migration:scan-drive-api` | M | ✅ preflight + verify-only |
| C2 | **Bulk journal import** — `migration:import-journals` | L | ✅ `migration:run-bulk` |
| C3 | **Spot-check script** — ≥20 kunder index ↔ patient master | S | ✅ |
| C4 | **SharePoint archive sync** — `npm run migration:sync-sharepoint` | S | ✅ verify script |
| C5 | **PDL + EU region** — `pdl-mdr-assessment.md` §6 Frankfurt | M | ✅ |

**Manuellt kvar:** PRP-mall i SharePoint, OneNote CCO-design, Pipedrive-export.

**Relaterad doc:** [JOURNAL-DATAMODELL.md](./JOURNAL-DATAMODELL.md) · [ma-document-placement-plan.md](./ma-document-placement-plan.md)

---

## D — CMO Marketing Copilot v3

**Mål:** Live read-only metrics (Fas O), sedan kontrollerad publish (Fas P) efter OWNER-sign-off.

**Klar:** Fas A–M + N (CI); prod medvetet **fixture** (`CONNECTORS_MODE=fixture`, publish off).

### Nästa (prioritet)

| # | Uppgift | Effort | Blocker |
|---|---------|--------|---------|
| D1 | **Secrets** — Google/Meta/LinkedIn tokens i Render (staging först) | S | API-konton |
| D2 | **Staging connectors** — `LIVE_FETCH=true`, `smoke:cmo-connectors` | M | D1 |
| D3 | **Prod connectors** — maintenance window, Analys-flik OK | M | D2 stabil ≥1 vecka |
| D4 | **Observability** — alert connector error >15 min | M | — |
| D5 | **Wire GenerateContentSeries** + mutation ≥70% | M | CI |

**Verify:** `node tests/_cmoMutationRunner.js` · `npm run smoke:cmo-connectors`

**Relaterad doc:** [cmo-v3-rollout-plan.md](./cmo-v3-rollout-plan.md)

---

## E — Web ↔ Arcana bridge

**Mål:** Stabil prod, patient får bokningsmail, full audit för icke-boknings-leads.

**Klar:** Fas A–C — slot picker, reservations → CCO case, web-lead UI, 409 double-book.

### Nästa (prioritet)

| # | Uppgift | Effort | Blocker |
|---|---------|--------|---------|
| E1 | **Prod stabilitet** — bekräfta OOM-fix (lookback 7d) 3+ dagar | S | Render monitoring |
| E2 | **Resend go-live** — samma som B3 (delad env) | S | Render |
| E3 | **ExecutionGateway audit** — formulär utan slot, analyzer, chat | L | Gateway design |
| E4 | **Nurse resources** — Veronica/Clara m.fl. i engine store | M | Produktbeslut PRP |
| E5 | **Turnstile/honeypot** — abuse på `/reservations` + web `/api/lead` | M | Cloudflare keys |

**Webb-repo:** `hairtpclinic-web/next-app` — `arcana-client.ts`, `SlotPicker`, `/api/lead`.

**Relaterad doc:** [web-to-arcana-bridge.md](./web-to-arcana-bridge.md) · [web-hairtpclinic-com-masterplan.md](./web-hairtpclinic-com-masterplan.md)

---

## Parallell körordning (rekommenderad)

```
Vecka 1 — Quick wins (ingen prod-risk)
  A1 dedupe cache
  C3 spot-check script
  C4 sharepoint sync
  D1 secrets (staging only)

Vecka 1–2 — Prod-fönster (samordna B + E)
  B1 deploy + B2 curl
  B3/E2 Resend live (en env-ändring, två spår)
  E1 OOM-verifiering

Vecka 2 — Verify + mobile
  A3/A4 mail-start verify
  B4 webb E2E
  B5 operator sign-off

Vecka 3+ — Scale & connectors
  C1/C2 Drive bulk
  D2/D3 CMO staging→prod
  E3 ExecutionGateway (design spike)
```

---

## Delade beroenden

| Resurs | Spår | Action |
|--------|------|--------|
| `RESEND_API_KEY` | B, E | En Render-variabel — gör en gång |
| Prod deploy | A, B, D | Efter merge: `arcana-ci` grön → auto-deploy |
| Render OOM | B, E, D | Övervaka `/readyz`; lookback redan sänkt |
| STAFF-auth | A verify, B operator | `.env` ARCANA_STAFF_* |
| Vercel web | B, E | Separat repo deploy synkad med Arcana |

---

## Kommandon (snabbreferens)

```bash
cd ~/Code/major-arcana

# A — Mail
npm run verify:cco-mail-start-prod

# B — Booking
BASE=https://arcana.hairtpclinic.se node scripts/plan-a-verify-curl.mjs
npm run verify:booking-plan-a-prod

# C — Migration
npm run migration:test
bash scripts/sync-sharepoint-archive.sh

# D — CMO
node tests/_cmoMutationRunner.js
npm run smoke:cmo-connectors

# E — Bridge (via B + status)
npm run run:rollout-sweep
curl -fsS https://arcana.hairtpclinic.se/readyz
```

---

## Definition of done (helheten)

- [ ] **A:** Mail-start verify grön desktop + mobil; Fas 2 plan uppdaterad
- [ ] **B:** Plan A prod sign-off; 3 services; Resend mail mottagen
- [ ] **C:** Spot-check grön; Drive bulk påbörjad eller schemalagd
- [ ] **D:** Fas O prod connectors `ok`; OWNER analytics godkänd
- [ ] **E:** Resend live; OOM stabil; ExecutionGateway spec godkänd

**Field pilot (mobil journal):** spåras i annan tråd — blockerar inte A–E.
