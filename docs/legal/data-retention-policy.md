# Arcana Data Retention Policy

Version: 1.0
Datum: 2026-05-13
Status: UTKAST

---

## Syfte

Definierar lagringstider och rensningsregler per datatyp i Arcana Executive OS.
Gäller alla tenants. Tenant-specifika avvikelser dokumenteras i DPA per tenant.

---

## Retentionsregler per datatyp

| Datatyp | Lagringsfil/plats | Retentionstid | Rensningsmetod | Ansvarig |
|---------|-------------------|---------------|----------------|----------|
| **Audit-logg** | `auth.json` (audit events) | 365 dagar | Append-only, ingen automatisk prune | Ops |
| **Templates** | `templates.json` | Obegränsad (versionshanterad) | Manuell arkivering via `archive` action | OWNER |
| **Template-revisioner** | `templates.json` (revisions) | Obegränsad | Ingår i template-livscykel | OWNER |
| **Risk-evalueringar** | `templates.json` (evaluations) | 365 dagar | Manuell prune | Ops |
| **Tenant-config** | `tenant-config.json` | Obegränsad | Raderas vid offboarding | OWNER |
| **Auth/sessions** | `auth.json` | Session: idle timeout (180 min default) | Automatisk invalidering | System |
| **Backups** | `data/backups/` | 50 filer / 30 dagar | Automatisk prune via scheduler | Scheduler |
| **Scheduler-rapporter** | `data/reports/` | 60 filer / 45 dagar | Automatisk prune via scheduler | Scheduler |
| **Patientjournal** | `cco-journal.json` | 10 år (PDL 3 kap. 17§) | Ingen automatisk radering | OWNER + juridik |
| **Mail truth store** | `cco-mailbox-truth.json` | 90 dagar (default lookback) | Automatisk via delta sync | Scheduler |
| **Mail history** | `data/cco/` | 90 dagar | Manuell prune | Ops |
| **CCO conversation data** | `memory.json` | Obegränsad | Manuell rensning | OWNER |
| **Incident-data** | `templates.json` (incidents) | 365 dagar | Manuell prune | Ops |
| **SLO-tickets** | `slo-tickets.json` | 3000 entries max | Automatisk prune | Scheduler |
| **Secret rotation metadata** | `secret-rotation.json` | Obegränsad (fingerprints, ej hemligheter) | Manuell | Ops |
| **Patient signals** | `patient-signals.json` | 180 dagar / 20000 events | Automatisk retention | Scheduler |
| **Capability analysis** | `capability-analysis.json` | 90 dagar | Manuell prune | Ops |

---

## Konfiguration via env

| Variabel | Default | Beskrivning |
|----------|---------|-------------|
| `ARCANA_BACKUP_RETENTION_MAX_FILES` | 50 | Max antal backup-filer |
| `ARCANA_BACKUP_RETENTION_MAX_AGE_DAYS` | 30 | Max ålder för backups |
| `ARCANA_REPORT_RETENTION_MAX_FILES` | 60 | Max antal scheduler-rapporter |
| `ARCANA_REPORT_RETENTION_MAX_AGE_DAYS` | 45 | Max ålder för rapporter |
| `AUTH_SESSION_IDLE_MINUTES` | 180 | Session idle timeout |
| `AUTH_SESSION_TTL_HOURS` | 12 | Session max livstid |
| `ARCANA_PATIENT_SIGNAL_RETENTION_DAYS` | 180 | Patient signal retention |
| `ARCANA_PATIENT_SIGNAL_MAX_EVENTS` | 20000 | Max patient signal events |
| `ARCANA_SLO_TICKET_STORE_MAX_ENTRIES` | 3000 | Max SLO tickets |

---

## Raderingsprocesser

### Automatiska (scheduler)
- **Backup prune:** Daglig — raderar filer äldre än `ARCANA_BACKUP_RETENTION_MAX_AGE_DAYS`
- **Report prune:** Daglig — raderar rapporter äldre än `ARCANA_REPORT_RETENTION_MAX_AGE_DAYS`
- **Patient signal retention:** Löpande — raderar events äldre än 180 dagar
- **Mail truth delta sync:** Var 5:e minut — uppdaterar, raderar inte historik

### Manuella (OWNER)
- **Backup prune:** `npm run backup:prune:apply`
- **Report prune:** `npm run report:scheduler:prune:apply`
- **Tenant offboarding:** `POST /api/v1/tenants/disable` + manuell dataexport/radering
- **GDPR radering:** `POST /api/v1/capabilities/GdprAnonymizeCustomer/run`

### Vid avtalets upphörande
1. Exportera all data via GDPR-export endpoints
2. Disable tenant via API
3. Radera alla tenant-specifika filer
4. Bekräfta radering skriftligt till kliniken

---

## Audit-kedja

Alla raderingar loggas i audit-loggen:
- `backup.prune` — automatisk backup-rensning
- `report.prune` — automatisk rapport-rensning
- `tenants.disable` — tenant inaktiverad
- `gdpr.anonymize` — kunddata anonymiserad
- `gdpr.export` — kunddata exporterad

Audit-loggen själv är append-only och raderas aldrig automatiskt.
