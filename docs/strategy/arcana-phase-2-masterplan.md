# Arcana Executive OS — Phase 2 Masterplan

Status: `STABILISERA`  
Gäller efter Pilot 1 (intern adminplattform live)

## 1) Mål med Phase 2

Göra Arcana till en driftbar, säker och mätbar SaaS-kärna innan patientkanal:

- Säkerhetshärdning till enterprise-minimum.
- Incident/SLA-operativ förmåga (inte bara loggning).
- Automatiserad drift (scheduler, backup, restore drills, alerts).
- Kalibrerad riskprecision med verifierbara mätetal.
- Tydlig Go/No-Go-gate för patientkanal.

---

## 2) Prioriteringsordning (låst)

1. Säkerhetshärdning  
2. Incident & SLA-system  
3. Scheduler & automation  
4. Risk precision iteration  
5. Observability-härdning  
6. UI/UX full polish  
7. Patientkanal beta

---

## 3) Workstream A — Säkerhetshärdning (BLOCKER)

### A1. Session security hardening
- **Task:** Session-rotation vid login, global session-invalidation vid lösenordsbyte.
- **Owner:** Backend.
- **DoD:** Ny session skapas vid login, gamla sessioner kan revokas deterministiskt, verifierat i testfall.

### A2. MFA för OWNER
- **Task:** Tvingande MFA-flow för OWNER.
- **Owner:** Backend/Auth.
- **DoD:** OWNER kan inte logga in utan MFA-challenge; recovery-flow finns; MFA-events loggas.

### A3. Strict CORS
- **Task:** Tenant-/miljöstyrd origin allowlist, inga wildcard.
- **Owner:** Backend.
- **DoD:** Endast explicita origins tillåts; negativa tester ger block.

### A4. Rate limiting (API + auth)
- **Task:** Begränsning på auth, risk/orchestrator och publika endpoints.
- **Owner:** Backend.
- **DoD:** Dokumenterade limiter + verifierad throttling under lasttest.

### A5. Secrets rotation-struktur
- **Task:** Nyckelrotation för API/provider keys + dokumenterad process.
- **Owner:** DevOps.
- **DoD:** Minst en full rotation genomförd i staging/prod-runbook.

### A6. Audit immutability
- **Task:** Append-only audit med checksum/hash-chain verifiering.
- **Owner:** Backend/Storage.
- **DoD:** Inga update/delete-paths för audit; integritetsverifiering körbar.

---

## 4) Workstream B — Incident & SLA-system (BLOCKER)

### B1. Incident object
- **Task:** Standardiserad incidentmodell för L4/L5 (`severity`, `owner`, `slaDeadline`, `status`, `resolutionTs`).
- **Owner:** Backend/Product.
- **DoD:** L4/L5 skapar incident automatiskt och syns i UI.

### B2. SLA-timer
- **Task:** Nedräkning och breach-detektion.
- **Owner:** Backend/UI.
- **DoD:** Timer visas i UI; breach markeras och loggas.

### B3. Eskalering
- **Task:** Auto-eskalering om ägare ej agerar inom SLA.
- **Owner:** Backend.
- **DoD:** Simulerad breach triggar eskalering och audit event.

### B4. Owner assignment + alerting
- **Task:** Alla incidenter har ansvarig + notifiering.
- **Owner:** Backend/DevOps.
- **DoD:** Inga oägda L4/L5; notifiering verifierad.

---

## 5) Workstream C — Scheduler & automation (BLOCKER)

### C1. Nightly pilot report
- **Task:** Schemalagd KPI-/risk-/incidentrapport.
- **Owner:** DevOps.
- **DoD:** Rapport genereras nattligen och lagras enligt retention.

### C2. Backup automation
- **Task:** Daglig backup, retention och prune-policy.
- **Owner:** DevOps.
- **DoD:** Automatiska körningar verifierade, failure alert finns.

### C3. Restore drill
- **Task:** Regelbunden återläsningstest i staging.
- **Owner:** DevOps.
- **DoD:** Restore-test utfört senaste 30 dagar med dokumenterad RTO/RPO.

### C4. Alert-trigger tester
- **Task:** Simulerade fel för incident/restore/auth-anomali.
- **Owner:** DevOps/Backend.
- **DoD:** Alla kritiska alerts bekräftat fungerande.

---

## 6) Workstream D — Risk precision iteration (BLOCKER)

### D1. Gold set (>=150 cases)
- **Task:** Minst 50 safe, 50 borderline, 50 critical.
- **Owner:** Risk Owner.
- **DoD:** Versionerat dataset i repo + körbart testflöde.

### D2. Confusion matrix
- **Task:** Mät FP/FN/precision/recall per risknivå.
- **Owner:** Risk Owner/Backend.
- **DoD:** Rapport per release + trendhistorik.

### D3. Threshold versioning + rollback
- **Task:** Versionshantering av risktrösklar/regler.
- **Owner:** Backend.
- **DoD:** Rollback till föregående version inom minuter.

### D4. Owner-governed calibration
- **Task:** Ingen automatisk regeländring utan owner-godkännande.
- **Owner:** Backend/Product.
- **DoD:** Alla ändringar är signerade i auditkedjan.

---

## 7) Workstream E — Observability-härdning

### E1. Core metrics
- **Task:** p95 latency, auth-fel, riskfördelning, incidentfrekvens, SLA-breach-rate.
- **Owner:** Backend/DevOps.
- **DoD:** Dashboard per tenant + global vy.

### E2. Structured logs + correlation IDs
- **Task:** Konsistent correlation-id genom orchestrator/risk/policy/audit.
- **Owner:** Backend.
- **DoD:** Spårbar end-to-end trace för varje kritisk händelse.

### E3. SLO/SLI
- **Task:** Definiera och publicera driftmål.
- **Owner:** Product/DevOps.
- **DoD:** Minst availability + incident response SLO i drift.

---

## 8) Agent roadmap (aktiveringsordning)

1. **COO-agent** (daglig prioritering och driftfokus)  
2. **CAO-agent** (admin/mall-optimering)  
3. **CFO-agent** (kostnad/runway/risk-kostnad)  
4. **CMO-agent** (internt content/outreach, fortfarande gated)  
5. **Patient Agent** (extern kanal, sist)

Gemensam pipeline (obligatorisk):

`Request -> Input Risk -> Agent -> Output Risk -> Policy Floor -> Persist -> Audit -> Notify`

---

## 9) Go/No-Go matris för patientkanal

## BLOCKER-kategorier som måste vara gröna

- Säkerhetshärdning (A)
- Incident/SLA-operativ (B)
- Scheduler/automation + restore drill (C)
- Riskprecision kalibrerad (D)

## Automatiska No-Go triggers

- Output kan lämna systemet utan output risk + policy gate.
- Policy floor kan kringgås.
- L5 kan gå live utan manuell intervention.
- Restore-test ej verifierat senaste 30 dagar.
- Auditkedjan är inte immutable.
- Tenant-isolation saknar edge-case verifiering.

## Readiness score

- `<75`: No-Go  
- `75–84`: Begränsad beta  
- `>=85`: Kontrollerad Go

---

## 10) Fasbeslut

- Nuvarande rekommenderad fas: **STABILISERA**
- Gå till **EXPANDERA** först när blocker-kategorierna är gröna och Go/No-Go matrisen klarar tröskeln.

