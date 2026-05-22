# ISO 27001 / SOC 2 Readiness — Gap-analys & Kontrollmappning

Version: 1.0
Datum: 2026-05-14
Status: UTKAST — self-assessment, ej externt granskat.

---

## Syfte

Kartlägger hur Arcana Executive OS förhåller sig till ISO 27001:2022 (Annex A) och SOC 2 Trust Services Criteria. Identifierar vad som redan finns, vad som saknas, och prioriterad åtgärdsplan.

---

## Sammanfattning

| Ramverk | Uppfyllda kontroller | Delvis | Saknas | Total |
|---------|---------------------|--------|--------|-------|
| ISO 27001:2022 Annex A | 58 | 19 | 16 | 93 |
| SOC 2 TSC | 42 | 14 | 9 | 65 |

**Mognadsbedömning:** Arcana uppfyller ~62% av ISO 27001 och ~65% av SOC 2-kraven fullt, med ~20% delvis uppfyllda. De kvarvarande gapen är primärt organisatoriska (inte tekniska).

---

## ISO 27001:2022 Annex A — Kontrollmappning

### A.5 Organisatoriska kontroller

| Kontroll | Krav | Arcana-status | Evidens / Gap |
|----------|------|---------------|---------------|
| A.5.1 | Informationssäkerhetspolicyer | ⚠️ Delvis | DPA-mall finns. Saknar fristående informationssäkerhetspolicy. |
| A.5.2 | Roller och ansvar | ✅ | RBAC (OWNER/STAFF), tydliga roller i kod och docs. |
| A.5.3 | Åtskillnad av uppgifter | ✅ | OWNER/STAFF separation, MFA för OWNER, audit-logg. |
| A.5.4 | Ledningens ansvar | ⚠️ Delvis | Implicit i tenant-modellen. Saknar formell ISMS-ansvarig. |
| A.5.5 | Kontakt med myndigheter | ❌ | Saknar dokumenterad process för IMY/IVO-kontakt. |
| A.5.6 | Kontakt med intressegrupper | ❌ | Saknar. |
| A.5.7 | Threat intelligence | ⚠️ Delvis | Risk-evaluation + AnalyzeRiskTrend. Saknar extern threat feed. |
| A.5.8 | Informationssäkerhet i projektledning | ✅ | Gateway pipeline, risk gates, audit per capability run. |
| A.5.9 | Inventering av tillgångar | ✅ | `ops/state/manifest`, backup-lista, template-inventering. |
| A.5.10 | Acceptabel användning | ❌ | Saknar AUP-dokument. |
| A.5.11 | Återlämnande av tillgångar | ✅ | Offboarding-process i DPA §9 + tenant disable. |
| A.5.12 | Klassificering | ⚠️ Delvis | Implicit (hälsodata = känslig). Saknar formell klassificeringsmatris. |
| A.5.13 | Märkning | ⚠️ Delvis | Tenant-ID i alla data. Saknar formell märkning. |
| A.5.14 | Informationsöverföring | ✅ | HTTPS/TLS, Graph API med OAuth2, signed URLs för bilagor. |
| A.5.15 | Åtkomstkontroll | ✅ | RBAC, MFA, session-rotation, tenant-isolation, rate limiting. |
| A.5.16 | Identitetshantering | ✅ | Auth store, MFA TOTP, recovery codes, session management. |
| A.5.17 | Autentisering | ✅ | MFA OWNER, session idle timeout, global invalidation vid lösenordsbyte. |
| A.5.18 | Åtkomsträttigheter | ✅ | OWNER/STAFF roller, per-tenant isolation, permission-lista. |
| A.5.23 | Molntjänstsäkerhet | ✅ | Render (EU), DPA med underbiträden, env-separerade hemligheter. |
| A.5.24 | Incidenthantering — planering | ✅ | Incident-runbook, patient safety runbook, auto-eskalering. |
| A.5.25 | Incidenthantering — bedömning | ✅ | L3-L5 severity, SLA-timer, breach-detektion. |
| A.5.26 | Incidenthantering — respons | ✅ | Auto-assignment, webhook-alerts, audit-trail. |
| A.5.27 | Lärdomar | ⚠️ Delvis | Scheduler-rapporter. Saknar formell lessons-learned-process. |
| A.5.28 | Bevissamling | ✅ | Append-only audit med hash-chain, integrity-check endpoint. |
| A.5.29 | Informationssäkerhet vid avbrott | ⚠️ Delvis | Backup + restore drill. Saknar formell BCP. |
| A.5.30 | ICT-beredskap för kontinuitet | ⚠️ Delvis | Daglig backup, restore drill. Saknar RTO/RPO-kontrakt. |
| A.5.31 | Juridiska/regulatoriska krav | ⚠️ Delvis | DPA, retention policy. Saknar formell compliance register. |
| A.5.34 | Integritetsskydd | ✅ | DPA, GDPR endpoints, PII redaction i Patient Agent, retention policy. |
| A.5.35 | Oberoende granskning | ❌ | Ingen extern granskning genomförd. |
| A.5.36 | Efterlevnad av policyer | ✅ | CI lint + smoke + ops suite, readiness matris, no-bypass guards. |

### A.6 Personkontroller

| Kontroll | Krav | Status | Gap |
|----------|------|--------|-----|
| A.6.1 | Bakgrundskontroller | ❌ | Ej implementerat (< 5 anställda). |
| A.6.2 | Anställningsvillkor | ❌ | Saknar NDA/sekretessklausul-mall. |
| A.6.3 | Medvetenhet/utbildning | ❌ | Saknar formellt utbildningsprogram. |
| A.6.4 | Disciplinära processer | ❌ | Ej relevant i nuvarande storlek. |
| A.6.5 | Ansvar vid uppsägning | ⚠️ Delvis | Session-revoke finns. Saknar checklista. |
| A.6.7 | Distansarbete | ✅ | Cloud-first, MFA, session-kontroll. |
| A.6.8 | Rapportering av händelser | ✅ | Incident-endpoints, audit-logg, patient safety runbook. |

### A.7 Fysiska kontroller

| Kontroll | Status | Gap |
|----------|--------|-----|
| A.7.1-A.7.14 | ⚠️ Delvis | Cloud-hosted (Render EU). Fysisk säkerhet delegerad till Render. Saknar formell verifiering av Renders fysiska kontroller. |

### A.8 Tekniska kontroller

| Kontroll | Krav | Status | Evidens |
|----------|------|--------|---------|
| A.8.1 | Endpoints | ✅ | Server-side rendering, inga klient-installer. |
| A.8.2 | Privilegierade åtkomsträttigheter | ✅ | OWNER-only för kritiska operationer, MFA. |
| A.8.3 | Restriktion av informationsåtkomst | ✅ | Tenant-isolation, RBAC, API rate limiting. |
| A.8.4 | Åtkomst till källkod | ✅ | GitHub med SSH/MFA, branch protection. |
| A.8.5 | Säker autentisering | ✅ | MFA TOTP, session-rotation, bcrypt passwords. |
| A.8.6 | Kapacitetshantering | ⚠️ Delvis | Monitor/observability. Saknar formell kapacitetsplan. |
| A.8.7 | Skydd mot malware | ✅ | Server-side, inga fil-uppladdningar till disk, saniterad HTML. |
| A.8.8 | Teknisk sårbarhet | ⚠️ Delvis | npm audit, Dependabot. Saknar regelbunden pentesting-cadence. |
| A.8.9 | Konfigurationshantering | ✅ | Env-vars, render.yaml, tenant-config versionshantering. |
| A.8.10 | Radering av information | ✅ | GDPR endpoints, backup prune, retention policy. |
| A.8.11 | Datamaskering | ✅ | PII redaction i Patient Agent, audit-logg exponerar ej hemligheter. |
| A.8.12 | Dataläckageförebyggande | ✅ | Tenant-isolation, CORS strict, no-bypass CI guard. |
| A.8.15 | Loggning | ✅ | Append-only audit, correlation-ID, structured events. |
| A.8.16 | Övervakning | ✅ | Monitor/observability, SLO/SLI, scheduler alerts. |
| A.8.24 | Kryptografi | ✅ | HTTPS/TLS, HSTS, bcrypt, signed URLs. |
| A.8.25 | Säker utveckling | ✅ | CI pipeline (syntax, lint, unit, smoke, ops suite), gateway enforce. |
| A.8.26 | Säkerhetskrav i applikationer | ✅ | Risk gates, policy floor, output risk, kill-switch. |
| A.8.28 | Säker kodning | ✅ | ESLint, no-bypass guard, input validation (Zod-style), HTML sanitizer. |
| A.8.31 | Separation av miljöer | ⚠️ Delvis | Render staging möjlig. Saknar dedikerad staging-instans. |
| A.8.32 | Ändringshantering | ✅ | Git, PR-review, CI gate, release governance. |
| A.8.33 | Testinformation | ⚠️ Delvis | Test-pipeline i CI. Saknar separerat testdata-set. |
| A.8.34 | Audit-system skydd | ✅ | Append-only, hash-chain, integrity-check. |

---

## SOC 2 Trust Services Criteria — Mappning

### CC1: Control Environment
| Status | Evidens |
|--------|---------|
| ✅ | RBAC, audit, OWNER-kontroll, CI gates. Saknar formell Code of Conduct. |

### CC2: Communication and Information
| Status | Evidens |
|--------|---------|
| ✅ | Monitor/status, SLO dashboard, incident alerts, audit events. |

### CC3: Risk Assessment
| Status | Evidens |
|--------|---------|
| ✅ | Risk evaluation per template, gold set, confusion matrix, AnalyzeRiskTrend, Go/No-Go matris. |

### CC4: Monitoring Activities
| Status | Evidens |
|--------|---------|
| ✅ | Scheduler 18 jobb, observability (error rate, p95, slow requests), SLO tickets, readiness score. |

### CC5: Control Activities
| Status | Evidens |
|--------|---------|
| ✅ | Gateway pipeline, policy floor, no-bypass guards, audit immutability. |

### CC6: Logical and Physical Access
| Status | Evidens |
|--------|---------|
| ✅ | MFA, RBAC, session management, tenant isolation, CORS strict, rate limiting. |

### CC7: System Operations
| Status | Evidens |
|--------|---------|
| ✅ | CI/CD, smoke tests, ops suite, backup automation, restore drills. |

### CC8: Change Management
| Status | Evidens |
|--------|---------|
| ✅ | Git, PR, CI gate, release governance, stability window, finalization sweep. |

### CC9: Risk Mitigation
| Status | Evidens |
|--------|---------|
| ✅ | Risk gates, policy floor, kill-switch, human handoff, PII redaction. |

### A1: Availability
| Status | Evidens |
|--------|---------|
| ⚠️ Delvis | Healthz/readyz, SLO availability. Saknar SLA-kontrakt, formell RTO/RPO. |

### C1: Confidentiality
| Status | Evidens |
|--------|---------|
| ✅ | Tenant isolation, HTTPS, signed URLs, DPA, PII redaction. |

### PI1: Processing Integrity
| Status | Evidens |
|--------|---------|
| ✅ | Gateway pipeline, audit hash-chain, integrity check, idempotency keys. |

### P1: Privacy
| Status | Evidens |
|--------|---------|
| ✅ | DPA, retention policy, GDPR endpoints, PII redaction, consent tracking. |

---

## Prioriterad åtgärdsplan

### Fas 1 — Dokumentation (0-30 dagar, blockerar certifiering)

| # | Åtgärd | ISO-ref | Insats |
|---|--------|---------|--------|
| 1 | Skriv fristående informationssäkerhetspolicy | A.5.1 | Liten |
| 2 | Skapa AUP (Acceptable Use Policy) | A.5.10 | Liten |
| 3 | Formell klassificeringsmatris för data | A.5.12 | Liten |
| 4 | Compliance register (lagar/förordningar) | A.5.31 | Medel |
| 5 | BCP (Business Continuity Plan) | A.5.29 | Medel |
| 6 | RTO/RPO-kontrakt per tenant | A.5.30, A1 | Medel |

### Fas 2 — Processer (30-90 dagar)

| # | Åtgärd | ISO-ref | Insats |
|---|--------|---------|--------|
| 7 | Lessons-learned-process efter incidenter | A.5.27 | Liten |
| 8 | Kapacitetsplan | A.8.6 | Liten |
| 9 | Dedikerad staging-miljö | A.8.31 | Medel |
| 10 | Separerat testdata-set | A.8.33 | Medel |
| 11 | NDA/sekretessklausul-mall | A.6.2 | Liten |
| 12 | Kontaktprocess IMY/IVO | A.5.5 | Liten |

### Fas 3 — Extern verifiering (90-180 dagar)

| # | Åtgärd | ISO-ref | Insats |
|---|--------|---------|--------|
| 13 | Regelbunden pentest-cadence (årlig) | A.8.8 | Stor |
| 14 | Oberoende ISMS-granskning | A.5.35 | Stor |
| 15 | Verifiera Renders fysiska kontroller | A.7 | Medel |
| 16 | Formellt utbildningsprogram | A.6.3 | Medel |

---

## Rekommendation

Arcanas tekniska kontroller är starka — gateway, audit, MFA, tenant-isolation, risk gates. De kvarvarande gapen är nästan uteslutande **organisatoriska och dokumentationsmässiga**. Med Fas 1 (6 dokument, ~2 veckors arbete) skulle Arcana kunna starta en formell ISO 27001 / SOC 2 Type I-process.

Rekommenderat nästa steg: Genomför Fas 1 och engagera extern ISMS-konsult för gap-review.
