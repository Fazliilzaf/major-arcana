---
owner: Compliance
status: active
---

# Patient Safety Incident Runbook

Version: 1.0
Datum: 2026-05-13
Status: AKTIV

---

## Syfte

Steg-för-steg-process för hantering av patientsäkerhetsincidenter i Arcana.
Separata från drift-incidenter (se `incident-runbook.md`).

---

## Definitioner

| Term | Beskrivning |
|------|-------------|
| **Patient Safety Incident (PSI)** | Händelse där AI-genererat eller systemförmedlat innehåll kan ha orsakat eller riskerat skada för patient |
| **Near Miss** | PSI som upptäcktes före leverans till patient |
| **Clinical Escalation** | Eskalering till namngiven medicinsk personal |

---

## Severity-nivåer

| Nivå | Beskrivning | Åtgärdstid |
|------|-------------|------------|
| **PSI-1 (Critical)** | Direkt risk för patientsäkerhet — felaktig medicinsk rådgivning levererad | Omedelbart (< 30 min) |
| **PSI-2 (High)** | Potentiell risk — felaktig information i aktiverad mall | < 2 timmar |
| **PSI-3 (Medium)** | Near miss — fångad av risk gate/policy floor innan leverans | < 24 timmar |
| **PSI-4 (Low)** | Observation — anomali i risk-scoring utan faktisk felinformation | < 72 timmar |

---

## Steg 1: Identifiera och rapportera

**Vem kan rapportera:** Alla (OWNER, STAFF, patient via kontakt)

**Rapporteringskanaler:**
1. Admin-panel → Incidenter → Ny incident (severity PSI-1 till PSI-4)
2. E-post till klinikens dataskyddsansvarig
3. Telefon vid PSI-1

**Rapportera:**
- Vad som hände
- Vilken mall/utkast/chatt-svar som var involverad
- Vilken patient (om känd)
- Tidpunkt
- Hur det upptäcktes

---

## Steg 2: Omedelbar åtgärd

### PSI-1 (Critical)
1. **Aktivera kill-switch** om patientkanalen är involverad:
   ```
   ARCANA_PUBLIC_CHAT_KILL_SWITCH=true
   ```
   Deploy omedelbart.
2. **Arkivera mallen** via `POST /api/v1/templates/:id/versions/:vid/archive`
3. **Kontakta patienten** direkt via telefon
4. **Eskalera till medicinsk ansvarig** (Verksamhetsansvarig)
5. **Logga incidenten** i audit via admin-panel

### PSI-2 (High)
1. **Arkivera mallen** omedelbart
2. **Granska alla aktiva versioner** av samma mall-kategori
3. **Kör CAO ValidateDisclaimers** på alla aktiva mallar:
   ```bash
   curl -X POST /api/v1/agents/CAO/run -d '{"strictDisclaimers": true}'
   ```
4. **Kontakta berörda patienter** om mallen använts i utskick

### PSI-3/PSI-4 (Near Miss / Observation)
1. **Dokumentera** i audit-logg
2. **Granska risk-evaluation** som fångade felet
3. **Justera risk-settings** om tröskeln var för generös:
   ```bash
   PATCH /api/v1/risk/settings
   ```

---

## Steg 3: Utredning

1. **Spåra i audit-loggen:**
   ```bash
   GET /api/v1/audit/events?action=template.activate&limit=100
   GET /api/v1/audit/events?action=gateway.run.decision&limit=100
   GET /api/v1/admin/audit/trace?action=orchestrator.admin_run&limit=50
   ```

2. **CAO admin-vy (incidenter + SLA):**
   ```bash
   GET /api/v1/admin/incidents/admin-view?status=open
   POST /api/v1/agents/CAO/run
   ```
   Granska `SummarizeIncidentAdmin` och executive feed (`GET /api/v1/executive/feed`).

3. **Kör risk gold set-rapport:**
   ```bash
   npm run risk:goldset:report
   ```
   Jämför FP/FN mot baseline.

4. **Kontrollera policy floor:**
   ```bash
   GET /api/v1/policy/floor
   ```
   Verifica att floor-regler inte kringgåtts.

5. **Kör AnalyzeRiskTrend:**
   ```bash
   curl -X POST /api/v1/agents/COO/run -d '{}'
   ```
   Kontrollera om risk-trenden visar degradering.

---

## Steg 4: Korrigerande åtgärd

| Åtgärd | Vem | Tidsfrist |
|--------|-----|-----------|
| Arkivera felaktig mall | OWNER | Omedelbart |
| Uppdatera risk-trösklar | OWNER + Risk Owner | < 24h |
| Kör CAO disclaimer-check på alla mallar | OWNER | < 24h |
| Lägga till fall i risk gold set | Risk Owner | < 72h |
| Uppdatera policy floor om lucka identifierad | Backend | < 1 vecka |
| Rapportera till IVO (om PSI-1 med faktisk skada) | Verksamhetsansvarig | Enligt lag |

---

## Steg 5: Uppföljning

1. **Readiness-kontroll:**
   ```bash
   npm run ops:suite:strict
   ```
   Verifiera att Go/No-Go inte visar nya blockers.

2. **Lägg till i gold set:**
   Mall-innehållet som orsakade incidenten ska läggas till som testfall i `docs/risk/gold-set-v1.json`.

3. **Stäng incidenten** i admin-panelen med resolution och root cause.

4. **Återaktivera kill-switch** (om den stängdes) först efter:
   - Risk gold set-rapport visar godkänt
   - CAO disclaimer-check visar 100% compliant
   - OWNER godkänner i audit

---

## Kontaktlista

| Roll | Namn | Kontakt |
|------|------|---------|
| Verksamhetsansvarig | [Sätts före launch] | |
| Dataskyddsansvarig | [Sätts före launch] | |
| Teknisk drift | [Sätts före launch] | |

---

## Relaterade dokument

- `docs/ops/runbooks/incident-runbook.md` — drift-incidenter
- `docs/ops/runbooks/cao-admin-operator-runbook.md` — CAO drift & scheduler
- `docs/ops/runbooks/rollback-runbook.md` — rollback-procedur
- `docs/risk/README.md` — riskmodell
- `docs/legal/gdpr-dpa-template.md` — DPA-mall
