---
owner: Compliance
status: active
---

# Arcana Support & SLA Framework

Version: 1.0
Datum: 2026-05-14
Status: UTKAST

---

## 1. Supportkanaler

| Kanal | Tillgänglighet | Målgrupp | SLA |
|-------|---------------|----------|-----|
| **E-post** (support@arcana.se) | Vardag 09-17 CET | Alla tenants | Svar inom SLA per plan |
| **Admin-panel** (in-app) | 24/7 (self-service) | OWNER/STAFF | Omedelbart (automation) |
| **Telefon** | Vardag 09-17 CET | Enterprise | Svar inom 30 min |
| **Status-sida** | 24/7 | Alla | Realtid |

---

## 2. SLA per Plan

### Responstider

| Severity | Free | Starter | Pro | Enterprise |
|----------|------|---------|-----|------------|
| **P0 — Kritisk** (tjänsten nere) | Best effort | 4 timmar | 1 timme | 30 min |
| **P1 — Hög** (funktionalitet degraderad) | Best effort | 8 timmar | 4 timmar | 1 timme |
| **P2 — Medel** (bugg/fråga) | Best effort | 24 timmar | 8 timmar | 4 timmar |
| **P3 — Låg** (feature request/feedback) | Best effort | 72 timmar | 48 timmar | 24 timmar |

### Lösningstider (target, ej garanterade)

| Severity | Starter | Pro | Enterprise |
|----------|---------|-----|------------|
| P0 | 24 timmar | 8 timmar | 4 timmar |
| P1 | 72 timmar | 24 timmar | 8 timmar |
| P2 | 1 vecka | 72 timmar | 48 timmar |
| P3 | Backlog | 2 veckor | 1 vecka |

### Availability SLA

| Plan | Availability | Mätperiod | Credits vid breach |
|------|-------------|-----------|-------------------|
| Free | Ingen garanti | — | — |
| Starter | 99.5% | Månad | — |
| Pro | 99.9% | Månad | 10% av månadskostnad |
| Enterprise | 99.95% | Månad | Avtalsenligt |

---

## 3. Severity-klassificering

| Severity | Kriterier | Exempel |
|----------|-----------|---------|
| **P0 — Kritisk** | Tjänsten helt otillgänglig, data i fara | healthz/readyz ner, dataförlust, säkerhetsintrång |
| **P1 — Hög** | Kärnfunktion degraderad, workaround finns | CCO kan inte skicka mail, login intermittent |
| **P2 — Medel** | Icke-kritisk funktion fungerar inte korrekt | Rapport visar fel KPI, CSS-bugg i admin |
| **P3 — Låg** | Kosmetiskt, feature request, fråga | Önskan om ny mallkategori, dokumentationsfråga |

---

## 4. Eskaleringskedja

```
Tenant rapporterar
  → L1: Self-service (admin-panel, docs, FAQ)
  → L2: Support-mail (support@arcana.se)
  → L3: Teknisk eskalering (utvecklare)
  → L4: Verksamhetsansvarig (medicinsk/juridisk)
  → L5: Krisläge (IMY/IVO om tillämpligt)
```

| Nivå | Ansvarig | Kontakt | Eskalerar till |
|------|----------|---------|----------------|
| L1 | Tenant (self-service) | Admin-panel | L2 |
| L2 | Support | support@arcana.se | L3 |
| L3 | Utvecklare | Internt | L4 |
| L4 | Verksamhetsansvarig | [Sätts före launch] | L5 |
| L5 | Krishantering | [Sätts före launch] | — |

---

## 5. Automatisk SLA-övervakning (redan implementerat)

Arcana har redan intern SLA-infrastruktur:

| Komponent | Endpoint / Fil | Status |
|-----------|----------------|--------|
| Incident-objekt med SLA-timer | `src/routes/capabilities.js` | ✅ |
| Auto-eskalering vid SLA-breach | `src/ops/scheduler.js` (alert_probe) | ✅ |
| SLO/SLI dashboard | `GET /api/v1/monitor/slo` | ✅ |
| SLO-tickets vid breach | `src/ops/scheduler.js` (slo_ticket) | ✅ |
| Availability tracking | `GET /api/v1/monitor/observability` | ✅ |
| Readiness score | `GET /api/v1/monitor/readiness` | ✅ |

### Mapping intern → extern SLA

| Intern (monitor) | Extern SLA-metrik |
|-----------------|-------------------|
| `observability.overallStatus` | Availability |
| `slo.overall.status` | SLO compliance |
| `incidents.breachedOpen` | P0/P1 breach count |
| `readiness.score` | Operativ readiness |
| `metrics.latencyP95Ms` | Performance SLA |

---

## 6. Status-sida

### Krav

| Funktion | Prioritet |
|----------|-----------|
| Real-time system status | Hög |
| Incident-historik | Hög |
| Planerade underhåll | Medel |
| E-post/webhook-notifikationer | Medel |
| Publik URL (status.arcana.se) | Hög |

### Implementation options

| Option | Kostnad | Insats |
|--------|---------|--------|
| **Instatus** (hosted) | $20/mån | Låg — webhook från Arcana alerts |
| **Cachet** (self-hosted) | 0 | Medel — kräver hosting |
| **Egen** (enkel HTML + JSON) | 0 | Medel — endpoint: `GET /api/public/status` |
| **Render status** | 0 | Låg — redan tillgänglig |

**Rekommendation:** Starta med Render status + en enkel `GET /api/public/status` endpoint som returnerar:

```json
{
  "status": "operational",
  "services": {
    "api": "operational",
    "cco": "operational",
    "patientChat": "operational"
  },
  "lastCheckedAt": "2026-05-14T05:00:00Z",
  "incidents": []
}
```

---

## 7. Support-process för tenant

### Ny tenant (onboarding)

1. Tenant skapas via playbook (`docs/ops/tenant-onboarding-playbook.md`)
2. Support-mail konfigureras: `<tenantslug>@support.arcana.se` (framtida)
3. SLA-nivå sätts i tenant-config baserat på plan
4. Välkomstmail med:
   - Admin-panel URL
   - Support-kontakt
   - SLA-nivå
   - Dokumentation-länk

### Incident-rapportering (tenant)

1. **Self-service:** Admin-panel → Drift → SLO/incidenter
2. **Mail:** Beskriv problemet → support@arcana.se
3. **Telefon (Enterprise):** Ring direkt

### Incident-hantering (internt)

1. Incident skapas i Arcana (automatiskt via alert eller manuellt)
2. SLA-timer startar
3. Auto-assignment till owner
4. Lösning → stäng incident
5. Post-mortem vid P0/P1 (se `docs/ops/runbooks/incident-runbook.md`)

---

## 8. SLA-kontraktstext (för DPA/avtal)

> **Tillgänglighet:** Arcana åtar sig att tillhandahålla Tjänsten med en tillgänglighet enligt avtalad plan-nivå, mätt som månatlig uptime för API-endpoints (healthz/readyz). Undantag: planerade underhåll (aviseras 48h i förväg), force majeure.
>
> **Responstid:** Vid driftincident åtar sig Arcana att bekräfta mottagande inom den responstid som gäller för aktuell severity och plan-nivå. Lösningstider är målvärden, inte garantier.
>
> **Mätning:** Tillgänglighet mäts via automatiserad övervakning. Tenant kan följa status i realtid via admin-panelens driftöversikt.
>
> **Kompensation (Pro/Enterprise):** Vid breach av availability SLA under en kalendermånad krediteras tenant enligt avtalad nivå mot nästa faktura.

---

## 9. Åtgärdsplan

| # | Åtgärd | Prioritet | Status |
|---|--------|-----------|--------|
| 1 | Publicera SLA-nivåer per plan | Hög | ✅ Detta dokument |
| 2 | Skapa `GET /api/public/status` endpoint | Hög | ⏳ |
| 3 | Konfigurera support-mail (support@arcana.se) | Hög | ⏳ |
| 4 | SLA-text i DPA/avtal | Hög | ✅ Utkast i §8 ovan |
| 5 | Status-sida (publik URL) | Medel | ⏳ |
| 6 | Tenant-specifik SLA-config | Medel | ⏳ |
| 7 | Webhook-notifikationer vid incident | Medel | ✅ Finns (alert_probe) |

---

## Relaterade dokument

- `docs/ops/runbooks/incident-runbook.md` — Incidenthantering
- `docs/ops/runbooks/patient-safety-incident-runbook.md` — Patientsäkerhet
- `docs/legal/gdpr-dpa-template.md` — DPA-mall
- `docs/strategy/business-model.md` — Priser per plan
- `docs/legal/iso27001-soc2-readiness.md` — Compliance
