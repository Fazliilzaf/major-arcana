---
owner: OWNER
status: active
next_step: Håll scheduler-jobb och workspace API uppdaterade vid CAO-ändringar
---

# Arcana Admin Operator — Adminpanel IA

## Sektioner

| Sektion | ID | Innehåll |
|---------|-----|----------|
| Arcana Admin Operator | `#caoSection` | CAO-körning, quality gate, mallbibliotek, admin brief |
| Mallar | `#templatesSection` | Mallredigering (länk från CAO-flaggor) |
| Risk | `#riskSection` | Riskutvärderingar |
| Incidenter | `#incidentsSection` | Incident-SLA |
| Orkestrering | orchestrator-panel | Plan + `mode=execute` för säkra steg |

## Automation

- `scripts/cao-admin-quality-gate-daily.js` — anropar scheduler-jobb `cao_daily_quality_gate` (fallback: HTTP CAO-run).
- Scheduler-jobb (i `src/ops/scheduler.js`):
  - `cao_daily_quality_gate` — daglig CAO quality gate
  - `cao_sla_risk_scan` — SLA/incident-risk
  - `cao_missing_dod_scan` — saknad owner/DoD
- OWNER-notify vid L4+ via `alertNotifier` (konfig: `ARCANA_SCHEDULER_CAO_OWNER_NOTIFY_MIN_RISK`).

## Admin Workspace API (§13)

| Endpoint | Flik |
|----------|------|
| `GET /api/v1/admin/tasks` | Admin tasks |
| `GET /api/v1/admin/incidents/admin-view` | Incidenter / SLA |
| `GET /api/v1/admin/documentation/gaps` | Dokument |
| `GET /api/v1/admin/audit/trace` | Audit |
| `GET /api/v1/admin/readiness/snapshot` | Readiness (shared operational core) |
| `PATCH /api/v1/admin/tasks/:taskId` | Tilldela ägare / uppdatera task-metadata |
| `GET /api/v1/admin/checklists?role=OWNER\|STAFF` | Rollbaserade checklist-mallar |

UI: `#caoAdminWorkspaceSection` + `public/admin/cao-workspace.js` (inkl. readiness-flik + checklist-knappar).

## Readiness-paritet (Fas C)

- **Operational core:** `/api/v1/admin/readiness/snapshot` (`source: shared_operational_core`) — delad evidence med monitor.
- **Auktoritativ Go/No-Go:** `/api/v1/monitor/readiness` — använd för release-beslut (`alignment`, `evidence.operationalCore`).
- **Workspace write:** tasks-fliken har *Tilldela ägare* / *DoD / nästa steg* → `PATCH /admin/tasks/:taskId`.
- CAO `GenerateGoNoGoBrief` är besluts**underlag**, inte auktoritativ gate.
- Monitor har observability-check `cao_scheduler_observability` (required=false) — påverkar inte score.

## Mallutkast

- Seed: `npm run seed:admin-templates` (9 INTERNAL draft-mallar inkl. OWNER/STAFF-checklistor).

## Notify-regler

- L4+ flaggor från CAO → OWNER via executive decision feed (`assign_owner`, `fix_template`, `review_go_nogo`).
- Feed persist: `data/executive-decision-feed.json` — överlever omstart.
- Admin KPI-panel: kvittera via `POST /api/v1/executive/feed/:id/resolve`.
- Ingen auto-notify till patientkanal.

## Staging / pilot

```bash
npm run smoke:cao-staging
# valfritt mot körande server:
ARCANA_SMOKE_BASE_URL=http://localhost:3100 npm run smoke:cao-staging
```
