---
owner: CAO
status: active
---

# CAO Admin Operator Runbook

Version: 1.0  
Datum: 2026-05-20  
Status: AKTIV

---

## Syfte

Operativ runbook för **Arcana Admin Operator (CAO)** — daglig kvalitet, scheduler-jobb, Go/No-Go-underlag och OWNER-beslut.

---

## Snabbstart

```bash
cd major-arcana
npm run dev:offline
npm run seed:admin-templates   # idempotent, 9 INTERNAL-mallar
```

Admin: `/admin` → CAO-panel + Admin Workspace + Executive feed (KPI-rad).

---

## Daglig rutin (OWNER)

1. Öppna **Executive feed** (KPI-rad) — pending OWNER-åtgärder från CAO/scheduler.
2. Kör **CAO** (`POST /api/v1/agents/CAO/run`) eller knappen "Kör CAO Agent".
3. Läs **Go/No-Go brief** (CAO light) — bekräfta mot auktoritativ `/api/v1/monitor/readiness`.
4. Granska **Admin Workspace** (tasks, incidenter, readiness-flik).
5. Signera eller eskalera blockers — beslut loggas i audit, inte auto-exekverat.

---

## Scheduler-jobb

| Jobb | Intervall (default) | Syfte |
|------|---------------------|--------|
| `cao_daily_quality_gate` | 24h | Full CAO-körning + quality gate |
| `cao_sla_risk_scan` | 12h | Incident/SLA + unowned scan |
| `cao_missing_dod_scan` | 24h | Saknad owner/DoD på admin tasks |

Notifieringar publiceras till **Executive feed** (`/api/v1/executive/feed`) och webhook om konfigurerad.

Persistens: `data/executive-decision-feed.json` (`EXECUTIVE_FEED_STORE_PATH`) — överlever omstart.

Staging-smoke:

```bash
npm run smoke:cao-staging
ARCANA_SMOKE_BASE_URL=http://localhost:3100 npm run smoke:cao-staging
```

Manuell gate:

```bash
node scripts/cao-admin-quality-gate-daily.js
```

Verifiera i monitor: category C check `cao_scheduler_observability` (observability, påverkar inte score).

---

## Orchestrator execute

- Plan: `POST /api/v1/orchestrator/admin-run` (default `mode=plan`)
- Execute: `POST /api/v1/orchestrator/admin-run?mode=execute`
- L3+ kräver OWNER-bekräftelse i UI före execute.
- Audit: `correlationId`, `executableSteps`, `executedSteps`.

---

## API-referens (workspace)

| Endpoint | Beskrivning |
|----------|-------------|
| `GET /api/v1/admin/tasks` | Admin tasks med filter |
| `GET /api/v1/admin/incidents/admin-view` | COO+CAO incident-vy |
| `GET /api/v1/admin/documentation/gaps` | Docs frontmatter-gap |
| `GET /api/v1/admin/readiness/snapshot` | CAO light readiness |
| `GET /api/v1/admin/checklists?role=OWNER` | Rollbaserade checklist-mallar |
| `GET /api/v1/executive/feed` | OWNER beslutsfeed |

---

## Eskalering

| Situation | Åtgärd |
|-----------|--------|
| Quality gate fail | Tilldela owner på flaggade tasks (feed: `assign_owner`) |
| SLA breach / kritiska incidenter | Öppna incident-panel, eskalera COO |
| Go/No-Go no_go | Stoppa release — kör `npm run ops:suite:strict` |
| L4+ scheduler-notify | Bekräfta i executive feed inom 24h |

---

## Relaterade dokument

- `docs/ops/cao-admin-operator-ia.md` — UI/API IA
- `docs/ops/developer-handover.md` §17 — teknisk handover
- `docs/strategy/cao-arcana-admin-operator-implementation-plan.md` — implementationsplan
- `docs/ops/runbooks/patient-safety-incident-runbook.md` — PSI + CAO-steg
