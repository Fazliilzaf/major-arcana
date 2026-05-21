# CMO Marketing Copilot Runbook

Version: 1.0  
Datum: 2026-05-20  
Status: AKTIV

---

## Syfte

Operativ runbook för **Arcana Marketing Copilot (CMO)** — utkast, compliance, godkännande, schemaläggning (förslag only) och cross-agent-gates.

---

## Snabbstart

```bash
cd major-arcana
npm run dev:offline
npm run seed:marketing-claims   # idempotent claims whitelist
```

Admin: `/admin` → CMO-panel + Marketing Workspace + Executive feed.

---

## Daglig rutin (OWNER)

1. Öppna **Executive feed** — pending CMO-åtgärder (`approve_campaigns`, `pause_underperforming_ads`, m.m.).
2. Kör **CMO** (`POST /api/v1/agents/CMO/run`) eller orchestrator:
   - Plan: `POST /api/v1/orchestrator/admin-run`
   - Execute: `POST /api/v1/orchestrator/admin-run?mode=execute` med marketing-prompt
3. Granska **complianceReview** och **flaggedClaims** — inget publiceras utan OWNER-godkännande.
4. Godkänn kampanjer i **Marketing Workspace** (`/api/v1/marketing/campaigns/:id/approve`).
5. Bekräfta feed-poster (`POST /api/v1/executive/feed/:entryId/resolve`).

---

## Orchestrator (Fas F)

Intent: `marketing_campaign`  
Agenter: CMO + CLINICAL_GUARD + CAO + COO + CFO

| Gate | Trigger | Feed action |
|------|---------|-------------|
| CAO launch | readiness &lt; 75 / no_go | `review_go_nogo` |
| COO incident | P0/P1 öppna | `pause_all_external_campaigns` |
| CFO budget | spend &gt; cap | `approve_marketing_budget` |

Exempel-prompt: *"Planera Q2 marketing campaign med UTM och publicering"*

---

## Scheduler-jobb

| Jobb | Intervall (default) | Syfte |
|------|---------------------|--------|
| `cmo_weekly_content_plan` | 7d | Kalender + schema + UTM + tracking (förslag only) |

Notifieringar: `cmo.weekly_content_plan`, `cmo.missed_publication` → Executive feed.

Staging-smoke:

```bash
npm run smoke:cmo-staging
ARCANA_SMOKE_BASE_URL=http://localhost:3100 npm run smoke:cmo-staging
```

---

## API-referens (marketing workspace)

| Endpoint | Beskrivning |
|----------|-------------|
| `GET /api/v1/marketing/campaigns` | Lista kampanjutkast |
| `GET /api/v1/marketing/campaigns/:id` | Hämta utkast |
| `PATCH /api/v1/marketing/campaigns/:id` | Uppdatera owner/metadata |
| `POST /api/v1/marketing/campaigns/:id/approve` | OWNER-godkännande |
| `POST /api/v1/marketing/campaigns/:id/reject` | Avvisa med reason |
| `GET /api/v1/marketing/connectors/status` | Connector-status (Google/Meta/LinkedIn/mail) |
| `GET /api/v1/marketing/content-assets` | Lista content assets (refs, ej nested i campaign) |
| `GET /api/v1/marketing/content-assets/:id` | Hämta enskilt content asset |
| `GET /api/v1/marketing/publish-policy` | Kanal-policy / pilot auto-queue (ADR 0002) |
| `POST /api/v1/agents/CMO/run` | Full marketing copilot pipeline |
| `GET /api/v1/executive/feed` | OWNER beslutsfeed |

Analytics (read-only): `POST /api/v1/agents/CMO/run` med `{ "mode": "analytics", "period": "weekly" }`.

### Marketing connectors (v2.2 live)

Fixture (dev):

```bash
export ARCANA_MARKETING_CONNECTORS_ENABLED=true
export ARCANA_MARKETING_CONNECTORS_MODE=fixture
export ARCANA_MARKETING_GOOGLE_ADS_ENABLED=true
export ARCANA_MARKETING_META_ENABLED=true
```

Live Google Ads:

```bash
export ARCANA_MARKETING_CONNECTORS_MODE=live
export ARCANA_MARKETING_CONNECTORS_LIVE_FETCH=true
export ARCANA_MARKETING_GOOGLE_ADS_ENABLED=true
export ARCANA_MARKETING_GOOGLE_ADS_LIVE_FETCH=true
export ARCANA_MARKETING_GOOGLE_ADS_CUSTOMER_ID=1234567890
export ARCANA_MARKETING_GOOGLE_ADS_DEVELOPER_TOKEN=...
export ARCANA_MARKETING_GOOGLE_ADS_ACCESS_TOKEN=...
# valfritt MCC:
export ARCANA_MARKETING_GOOGLE_ADS_LOGIN_CUSTOMER_ID=9876543210
```

Live Meta:

```bash
export ARCANA_MARKETING_META_ENABLED=true
export ARCANA_MARKETING_META_LIVE_FETCH=true
export ARCANA_MARKETING_META_AD_ACCOUNT_ID=123456789
export ARCANA_MARKETING_META_ACCESS_TOKEN=...
```

Live LinkedIn:

```bash
export ARCANA_MARKETING_LINKEDIN_ENABLED=true
export ARCANA_MARKETING_LINKEDIN_LIVE_FETCH=true
export ARCANA_MARKETING_LINKEDIN_AD_ACCOUNT_ID=509567876
export ARCANA_MARKETING_LINKEDIN_ACCESS_TOKEN=...
```

Status:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3100/api/v1/marketing/connectors/status?window=7d"
```

---

## Go/No-Go — automation step 2

| Tillåtet (v1.5) | Blockerat |
|-----------------|-----------|
| Internt schema-förslag | Auto-publish |
| UTM-generering | Auto-spend |
| Veckoplan via scheduler | Bypass compliance/claims |
| OWNER approve + feed resolve | Publicering utan audit |

**Beslut:** Fortsatt **No-Go** för auto-publish och auto-spend. Automation step 2 = scheduler-förslag + workspace-godkännande only.

---

## Eskalering

| Situation | Åtgärd |
|-----------|--------|
| Compliance blocked | Granska claims whitelist, kör om CMO |
| P0/P1 incident | Pausa externa kampanjer (feed: `pause_all_external_campaigns`) |
| Launch gate blocked | Bekräfta `/api/v1/monitor/readiness` före go-live |
| Budget över cap | OWNER godkänner spend-förslag |
| Underperforming ads | Granska analytics, pausa kanal manuellt |

---

## Tester och kvalitet (Fas G)

```bash
node --test tests/capabilities/cmoCapabilityContract.test.js
node --test tests/ops/cmoPhaseG.test.js
npm run test:mutation:cmo   # ~16 min; CI `cmo-mutation`; break ≥30%, low ≥50%, high ≥65% (baseline ~66%)
```

---

## Relaterade dokument

- `docs/ops/cmo-marketing-copilot-ia.md` — UI/API IA
- `docs/ops/developer-handover.md` §18 — teknisk handover
- `docs/strategy/cmo-arcana-marketing-copilot-implementation-plan.md` — Fas A–M (klar)
- `docs/strategy/cmo-v3-rollout-plan.md` — commit, prod connectors, v3 scope
- `docs/adr/0002-cmo-publish-and-spend-boundary.md` — publish/spend-gränser
