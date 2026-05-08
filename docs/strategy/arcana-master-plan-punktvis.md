# Arcana Executive OS — Punktvis Masterplan (ursprung → slutmål)

Skapad: 2026-04-25
Syfte: En enda läsbar plan, punkt för punkt, som binder ihop ursprung, nuläge, Phase 2-låsta workstreams, P0 Architecture Lock, CCO-Ny, agent-roadmap, Go/No-Go-matris och de gap som ännu inte är canon.
Källor: `docs/strategy/arcana-phase-2-masterplan.md`, `docs/Pilot-1-slutrapport.md`, `docs/archives/input/arcana-mal-original-2026-02-25.txt`, `docs/architecture/p0-checklist.md`, `docs/cco-ny-project-lock.md`, `docs/major-arcana-index.md`.

---

## 0. Kompass (en mening)

0.1. "Vi bygger Arcana som ett säkert, spårbart OS för kliniker: först intern adminnytta + kontrollsystem, sedan interna agenter, sist patientkanal."

0.2. Sly-målet bakom kompassen: "Arcana ska kunna driva kliniken operativt utan att du bär allt i huvudet."

---

## 1. Ursprung — varför Arcana finns

1.1. Behovet kom först, inte tekniken: minska mental överbelastning kring drift, ekonomi, kundkommunikation och uppföljning.

1.2. Önskan var aldrig "en AI" utan ett virtuellt team av specialiserade roller:
- 1.2.1. CEO-assistent: prioritering, målbrytning, daglig plan.
- 1.2.2. CFO: kostnader, runway, varningar, budget.
- 1.2.3. CCO: outreach, mail, erbjudanden, uppföljning.
- 1.2.4. COO: projektledning, dagliga tasks, "vad gör jag idag?".

1.3. När det blev tydligt att en chatt aldrig kan vara säker, spårbar eller säljbar, formulerades skiftet: **Arcana Executive OS** — AI-teamet, men byggt som produkt, med Supreme Orchestrator som koordinerar specialiserade agenter under ett globalt säkerhetsgolv.

---

## 2. Icke-förhandlingsbara designval

2.1. **Multi-tenant och white-label**
- 2.1.1. Varje klinik har egen identitet/ton/profil.
- 2.1.2. Ingen cross-tenant dataexponering.
- 2.1.3. TenantConfig styr personlighet, men aldrig safety.

2.2. **Risk och policy från dag 1**
- 2.2.1. Två obligatoriska gates: input risk gate (före agent), output risk gate (efter agent).
- 2.2.2. Risknivå 1–5 med tydliga actions.
- 2.2.3. Policy floor är immutabel: inga diagnoser, inga garantier, eskalering vid critical.

2.3. **Full spårbarhet**
- 2.3.1. Logging + audit på input, agentutkast, Arcana-justeringar, riskbedömning, policyjustering, mallversionsaktivering.
- 2.3.2. Revision-ready — det ska gå att svara externa granskare utan att gräva.

2.4. **AI får aldrig publicera själv**
- 2.4.1. AI genererar utkast.
- 2.4.2. Allt går till draft.
- 2.4.3. Owner aktiverar.
- 2.4.4. High/Critical kräver manuell intervention.

---

## 3. Pilotstrategin (varför inte patientkanal först)

3.1. Beslut: Pilot 0.1 / Pilot 1 byggdes som **Admin Core**, inte demo-chatt.

3.2. Pilot 1 levererade och verifierade:
- 3.2.1. Auth/RBAC + tenant onboarding (OWNER/STAFF, multi-tenant-isolation, tenant-switch).
- 3.2.2. Template engine: create → draft → evaluate → activate/archive/clone, AI-draft + manuell kontroll, owner-gate vid riskutfall.
- 3.2.3. Risk + policy: nivåmodell, `risk/settings|preview|summary`, owner actions, immutabelt policy floor, activation gate.
- 3.2.4. Orchestrator + reporting: intern orchestrator (`meta` + `admin-run`), pilotrapport (`/api/v1/reports/pilot`), monitor-status.
- 3.2.5. Drift/Ops: state backup/list/prune/restore, preflight, smoke local/public, publik embed (`embed.js`).
- 3.2.6. Mail knowledge / seeds: ingest pipeline (mbox/eml/json), insights endpoint, template seed preview/apply/apply-activate.
- 3.2.7. Admin UI/UX: 8 låsta vyer, UI-tokens, glassmorphism, depth, Major Arcana-brand.

3.3. Pilot 1 baseline (verifierat 2026-02-22 mot `arcana.hairtpclinic.se`, tenant `hair-tp-clinic`):
- 3.3.1. Mallar skapade: 62.
- 3.3.2. Aktiva mallar: 62.
- 3.3.3. High/Critical öppna: 0.
- 3.3.4. Publik reachability: healthz/readyz/embed OK.

3.4. Daglig driftrekommendation:
- 3.4.1. `BASE_URL=… ARCANA_OWNER_EMAIL=… npm run pilot:public -- --with-mail-seeds`
- 3.4.2. `npm run backup:state`
- 3.4.3. `npm run backup:prune`
- 3.4.4. Verifiera senaste rapport i `data/reports/`.

3.5. Release-bedömning: Pilot 1 = Go-live klar för intern drift. Patientkanal, tenant self-service risk-sliders och automatisk policy-omskrivning är medvetet ute.

---

## 4. Nuläge — fas STABILISERA

4.1. Codex maturity-bedömning: intern pilot ja, patientkanal no-go.

4.2. Beslutad fas: STABILISERA. Gå till EXPANDERA först när blocker-kategorierna är gröna och Go/No-Go-matrisen klarar tröskeln.

---

## 5. Phase 2 — låst prioriteringsordning

5.1. Workstream A — Säkerhetshärdning (BLOCKER)
- 5.1.1. **A1 Session security**: rotation vid login, global invalidation vid lösenordsbyte. DoD: ny session vid login, gamla revokas deterministiskt, verifierat i test. Owner: Backend.
- 5.1.2. **A2 MFA för OWNER**: tvingande MFA-flow, recovery-flow, MFA-events loggas. Owner: Backend/Auth.
- 5.1.3. **A3 Strict CORS**: tenant-/miljöstyrd allowlist, inga wildcards, negativa tester ger block. Owner: Backend.
- 5.1.4. **A4 Rate limiting**: auth, risk/orchestrator, publika endpoints. Dokumenterade limiter + verifierad throttling under lasttest. Owner: Backend.
- 5.1.5. **A5 Secrets rotation-struktur**: nyckelrotation för API/provider keys, dokumenterad process, minst en full rotation i staging/prod-runbook. Owner: DevOps.
- 5.1.6. **A6 Audit immutability**: append-only audit med checksum/hash-chain, inga update/delete-paths, integritetsverifiering körbar. Owner: Backend/Storage.

5.2. Workstream B — Incident & SLA-system (BLOCKER)
- 5.2.1. **B1 Incident object**: `severity`, `owner`, `slaDeadline`, `status`, `resolutionTs`. L4/L5 skapar incident automatiskt och syns i UI. Owner: Backend/Product.
- 5.2.2. **B2 SLA-timer**: nedräkning + breach-detektion, visas i UI, breach loggas. Owner: Backend/UI.
- 5.2.3. **B3 Eskalering**: auto-eskalering om ägare ej agerar inom SLA, simulerad breach triggar eskalering och audit event. Owner: Backend.
- 5.2.4. **B4 Owner assignment + alerting**: alla incidenter har ansvarig + notifiering, inga oägda L4/L5. Owner: Backend/DevOps.

5.3. Workstream C — Scheduler & automation (BLOCKER)
- 5.3.1. **C1 Nightly pilot report**: schemalagd KPI-/risk-/incidentrapport, lagrad enligt retention. Owner: DevOps.
- 5.3.2. **C2 Backup automation**: daglig backup, retention och prune-policy, failure alert. Owner: DevOps.
- 5.3.3. **C3 Restore drill**: regelbunden återläsningstest i staging, dokumenterat RTO/RPO senaste 30 dagarna. Owner: DevOps.
- 5.3.4. **C4 Alert-trigger tester**: simulerade fel för incident/restore/auth-anomali, alla kritiska alerts bekräftat fungerande. Owner: DevOps/Backend.

5.4. Workstream D — Risk precision iteration (BLOCKER)
- 5.4.1. **D1 Gold set ≥150 cases**: minst 50 safe, 50 borderline, 50 critical, versionerat dataset i repo + körbart testflöde. Owner: Risk Owner.
- 5.4.2. **D2 Confusion matrix**: FP/FN/precision/recall per risknivå, rapport per release + trendhistorik. Owner: Risk Owner/Backend.
- 5.4.3. **D3 Threshold versioning + rollback**: versionshantering av risktrösklar/regler, rollback inom minuter. Owner: Backend.
- 5.4.4. **D4 Owner-governed calibration**: ingen automatisk regeländring utan owner-godkännande, alla ändringar signerade i auditkedjan. Owner: Backend/Product.

5.5. Workstream E — Observability-härdning
- 5.5.1. **E1 Core metrics**: p95 latency, auth-fel, riskfördelning, incidentfrekvens, SLA-breach-rate, dashboard per tenant + global vy. Owner: Backend/DevOps.
- 5.5.2. **E2 Structured logs + correlation IDs**: konsistent correlation-id genom orchestrator/risk/policy/audit, spårbar end-to-end trace. Owner: Backend.
- 5.5.3. **E3 SLO/SLI**: definiera och publicera driftmål, minst availability + incident response SLO i drift. Owner: Product/DevOps.

5.6. Workstream F — UI/UX full polish
- 5.6.1. Språkpolering SV-first.
- 5.6.2. Reducerad textdensitet, tydligare visuell hierarki.
- 5.6.3. Major Arcana-brand fullt genomfört (dark luxury, glass, depth).
- 5.6.4. Dashboard som cockpit, inbox/triage för reviews & incidents.

5.7. Workstream G — Patientkanal beta
- 5.7.1. Slås på sist, gated, först när A–D är gröna och Go/No-Go-matrisen klarar tröskeln.

---

## 6. P0 Architecture Lock — ExecutionGateway

6.1. Hard requirement: ExecutionGateway är **enda vägen** för externa svar (patient/chat/marketing), persist av AI-output (drafts, seeds, generated output) och alla agent-körningar som producerar artefakter.

6.2. Pipeline (immutabel ordning):
- 6.2.1. ingress validation
- 6.2.2. inputRisk
- 6.2.3. agentRun
- 6.2.4. outputRisk
- 6.2.5. policyFloor
- 6.2.6. persist (om allowed)
- 6.2.7. audit (alltid)
- 6.2.8. response (allow eller safe fallback)

6.3. Input contract: `tenant_id`, `actor` (id+role), `channel` (admin|template|patient|marketing|ops), `intent`/`request_type`, `payload`, `correlation_id`, `idempotency_key` (för writes).

6.4. Output contract: `decision` (allow | allow_flag | review_required | blocked | critical_escalate), `risk_summary` (input/output evaluation, versions: ruleSet/threshold/model/fusion/build), `policy_summary` (blocked, reason_codes[]), `artifact_refs`, `audit_refs`, `safe_response` (om blocked).

6.5. Fail-closed: om risk/policy-gate failar eller timeoutar → block + safe fallback.

6.6. No-bypass: routes får inte direktpersist, får inte generera text utan gateway, alla agent runs måste ha gateway-run-id. CI stoppar violations.

6.7. Audit per gateway-run: `gateway.run.start`, `gateway.run.decision`, `gateway.run.persist`, `gateway.run.response` plus route-specifika events (t.ex. `chat.response`).

6.8. Commit-ordning (P0):
- 6.8.1. Commit 0 — Dokumentation (`execution-gateway-contract.md`, `p0-checklist.md`).
- 6.8.2. Commit 1 — Gateway-skelett (`src/gateway/executionGateway.js`).
- 6.8.3. Commit 2 — Gates (`inputRiskGate`, `outputRiskGate`, `policyFloorGate`) med enhetstester.
- 6.8.4. Commit 3 — Pipeline enforcement, exakt ordning, fail-closed.
- 6.8.5. Commit 4 — Chat via gateway: `POST /chat`, `chat.response|chat.blocked|chat.error` audit.
- 6.8.6. Commit 5 — Template generate: eval före persist (blocked drafts till quarantined store).
- 6.8.7. Commit 6 — Template PATCH update + mail-seeds apply: samma fix.
- 6.8.8. Commit 7 — No-bypass CI-lint: förbjudna route-imports.
- 6.8.9. Commit 8 — Audit hardening: `AUTH_AUDIT_APPEND_ONLY=true` i prod, `repairMissing` flyttas till `scripts/audit-repair.js`.
- 6.8.10. Commit 9 — Cross-tenant testsuite i CI (read/write/evaluate/activate/audit-query → 403 + audit event).
- 6.8.11. Commit 10 — Reality audit re-run + uppdaterad readiness-rapport.

6.9. Patient safety rule (för framtiden): inputRisk + outputRisk + policyFloor varje turn, kill-switch, strict tool allowlist, PII redaction, human handoff triggers.

6.10. Evidence-krav per commit: filvägar, diff, testkommando + output, runtimebevis (log/audit). Saknas något räknas det som ej implementerat.

---

## 7. CCO-Ny — den operativa ytan

7.1. Status: intern alpha-staging med live mailbox-stöd för `kons@hairtpclinic.com`.

7.2. Bas: `/Users/fazlikrasniqi/Desktop/Arcana/public/major-arcana-preview`.

7.3. Snabbstart:
- 7.3.1. Offline preview: `http://localhost:3100/major-arcana-preview/` via `npm run dev:offline`.
- 7.3.2. Live preview: `http://localhost:3200/major-arcana-preview/` via `PORT=3200 npm run cco:live`.

7.4. Låsta beslut:
- 7.4.1. `/cco-next` byts inte ut ännu.
- 7.4.2. `/cco` lämnas orörd.
- 7.4.3. Nya CCO byggs additivt i `major-arcana-preview` tills ytan är stabil.
- 7.4.4. `Historik` är delad entry point för arbetskö, fokusyta och kundintelligens.
- 7.4.5. `Nytt mejl` använder `Svarstudio` i compose-läge (inget separat compose-system).
- 7.4.6. Topbaren har global compose-entry; fokusytan har kontextuell compose-entry (`Nytt mejl till kunden`).

7.5. Färdigt i staging:
- 7.5.1. Trekolumnsytan: `ARBETSKÖ`, `FOKUSYTA`, `KUNDINTELLIGENS`.
- 7.5.2. Actionbubblor i alla tre kolumnerna.
- 7.5.3. `Svarstudio`, `Smart anteckning`, `Schemalägg uppföljning`, `Svara senare`.
- 7.5.4. `Klar`, `Radera`, `Senare` i live operator sweep.
- 7.5.5. `Historik` och `Kundhistorik` semantiskt separerade.
- 7.5.6. `kons@hairtpclinic.com` backfillad och i drift som första mailbox.

7.6. Valideringskommandon:
- 7.6.1. `npm run check:syntax`
- 7.6.2. `npm run lint:no-bypass`
- 7.6.3. `npm run test:unit`
- 7.6.4. `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

7.7. Nästa steg:
- 7.7.1. Kör Kons live operativt och fånga nästa friktion ur verklig användning.
- 7.7.2. När Kons är stabil i vardagsanvändning: ta in nästa mailbox.
- 7.7.3. Först därefter: migration prep pass 2 mot `/cco-next`, fortfarande utan att byta skalet.

7.8. Får inte tappas:
- 7.8.1. Compose förblir samma `Svarstudio`.
- 7.8.2. Actionbubblor i alla tre kolumnerna.
- 7.8.3. Historikchips inne i korten.
- 7.8.4. Bubble-roller justeras visuellt, inte byggs om semantiskt utan uttryckligt beslut.
- 7.8.5. `vendor/cconext-upstream` ligger i lokalt arkiv på Mac Studio — hämtas därifrån, inte ur minnet.

---

## 8. Agent-roadmap (aktiveringsordning)

8.1. **COO-agent** — daglig prioritering och driftfokus (först).

8.2. **CAO-agent** — admin/mall-optimering, standardisering, drafts.

8.3. **CCO-agent** — outreach, mail, leadflows (internt).

8.4. **CFO-agent** — kostnad/runway/risk-kostnad (kräver mer data).

8.5. **CMO-agent** — internt content/outreach, fortfarande gated.

8.6. **Patient Agent** — extern kanal, sist.

8.7. Alla går genom obligatorisk pipeline:
`Request → Input Risk → Agent → Output Risk → Policy Floor → Persist → Audit → Notify`.

---

## 9. Go/No-Go-matris för patientkanal

9.1. Blocker-kategorier som måste vara gröna:
- 9.1.1. Säkerhetshärdning (A).
- 9.1.2. Incident/SLA-operativ (B).
- 9.1.3. Scheduler/automation + restore drill (C).
- 9.1.4. Riskprecision kalibrerad (D).

9.2. Automatiska No-Go-triggers:
- 9.2.1. Output kan lämna systemet utan output risk + policy gate.
- 9.2.2. Policy floor kan kringgås.
- 9.2.3. L5 kan gå live utan manuell intervention.
- 9.2.4. Restore-test ej verifierat senaste 30 dagar.
- 9.2.5. Auditkedjan är inte immutable.
- 9.2.6. Tenant-isolation saknar edge-case-verifiering.

9.3. Readiness score:
- 9.3.1. `<75` = No-Go.
- 9.3.2. `75–84` = begränsad beta.
- 9.3.3. `≥85` = kontrollerad Go.

---

## 10. Gap-analys (det som inte är canon ännu)

10.1. **Compliance och juridik**
- 10.1.1. GDPR-DPA-mall för tenants saknas.
- 10.1.2. Retention-policy per datatyp (mail, audit, drafts, patientdata) inte explicit.
- 10.1.3. Ingen plan mot ISO 27001 / SOC 2.
- 10.1.4. Patientdatalagen (PDL) och MDR-bedömning av Patient Agent inte adresserat.
- 10.1.5. Personuppgiftsbiträdesavtal vid LLM-leverantörer inte dokumenterat.

10.2. **Disaster recovery utöver backup**
- 10.2.1. Regional failover saknas.
- 10.2.2. RTO/RPO som kontraktuella mål mot tenants saknas.
- 10.2.3. Leverantörsbortfallsplan (LLM-provider, hosting, Microsoft Graph) saknas.
- 10.2.4. Multi-provider-strategi för LLM (fallback + on-prem-option) inte dokumenterad.

10.3. **Tenant-livscykeln**
- 10.3.1. Onboarding-playbook för ny klinik (white-label-setup, time-to-first-value, ägare, tidsåtgång) saknas.
- 10.3.2. Offboarding/dataexport vid churn saknas.
- 10.3.3. Test-/demoinstans separerad från prod saknas.

10.4. **Affärsmodell**
- 10.4.1. Prismodell per tenant (per säte, per volym, fast) saknas.
- 10.4.2. Billing-infrastruktur saknas.
- 10.4.3. Kostnadstak per tenant (LLM-token/storage) saknas.
- 10.4.4. Modell för hur LLM-kostnader allokeras till tenants saknas — utan detta får CFO-agenten ingen data.

10.5. **Klinisk säkerhet bortom riskgaten**
- 10.5.1. Kliniskt advisory-skikt (namngiven medicinsk granskare) saknas för policy floor och kliniska mallar.
- 10.5.2. Patient safety incident runbook (separat från drift-incident) saknas.
- 10.5.3. Eskaleringsväg till sjukvårdspersonal vid akut signal saknas.

10.6. **Tillgänglighet och språk**
- 10.6.1. WCAG-nivå (mål: AA) inte definierad.
- 10.6.2. Skärmläsarstöd inte testat.
- 10.6.3. Engelsk version för säljbarhet utanför Sverige saknas.

10.7. **Säljberedskap (GTM)**
- 10.7.1. ICP-definition utöver hairtpclinic saknas.
- 10.7.2. Referenscase-strategi och fallstudie-mall saknas.
- 10.7.3. Pris-/säljkollateral saknas.
- 10.7.4. Demoflöde med "låt-så-vara"-data saknas.

10.8. **Kunskapsbas per tenant**
- 10.8.1. RAG/struktur för klinikens egna dokument, prislistor, behandlingsprotokoll saknas.
- 10.8.2. Versionering av tenant knowledge separat från mallar saknas.

10.9. **Telemetri-samtycke och privacy bortom audit**
- 10.9.1. Användarsamtycke för förbättringstelemetri (prompt-justering, tröskelkalibrering) saknas.
- 10.9.2. PII-redaction-regler i telemetri saknas.
- 10.9.3. Opt-out-flöde per tenant saknas.

10.10. **Performance & kapacitet**
- 10.10.1. Lasttester med konkurrent tenants saknas.
- 10.10.2. Kapacitetsplanering / autoskalningspolicy saknas.
- 10.10.3. Performance-budget per route saknas.

10.11. **Kundsupport och SLA mot tenant**
- 10.11.1. Supportkanaler (e-post/portal/telefon) inte definierade.
- 10.11.2. Svarstider per severity inte avtalade.
- 10.11.3. Statussida (status.arcana.*) saknas.

---

## 11. Rekommenderad sekvens framåt (90/180/365 dagar)

11.1. **0–30 dagar (lås P0 + bryt isolerade gap)**
- 11.1.1. Slutför P0 commits 0–10. Reality audit re-run.
- 11.1.2. Lås Workstream A1 (session) + A2 (MFA OWNER) + A6 (audit immutability) som första härdning.
- 11.1.3. Skriv onboarding-playbook (10.3.1) — blockerar tenant nr 2.
- 11.1.4. Skriv DPA-mall (10.1.1) + retention-policy (10.1.2).

11.2. **30–90 dagar (incident/SLA + scheduler + risk precision)**
- 11.2.1. Workstream B (B1–B4) komplett.
- 11.2.2. Workstream C (C1–C4) inkl. första dokumenterade restore drill med RTO/RPO.
- 11.2.3. Workstream D (D1 gold set ≥150) + D2 confusion matrix per release.
- 11.2.4. Aktivera COO-agent internt (8.1).
- 11.2.5. CCO-Ny: ta in nästa mailbox efter Kons (7.7.2).

11.3. **90–180 dagar (observability + UI polish + GTM-bas)**
- 11.3.1. Workstream E (E1–E3) i drift.
- 11.3.2. Workstream F (UI polish) klar.
- 11.3.3. Aktivera CAO-agent (8.2) och CCO-agent internt (8.3).
- 11.3.4. Demoinstans + ICP + pris-/säljkollateral (10.7).
- 11.3.5. WCAG AA-pass (10.6.1–10.6.2).

11.4. **180–365 dagar (Patient Agent beta + multi-tenant skalning)**
- 11.4.1. Klinisk granskare + patient safety runbook (10.5).
- 11.4.2. CFO-agent (8.4) när billing-data finns (10.4).
- 11.4.3. Patientkanal beta (5.7) med Go/No-Go ≥75 (begränsad) → ≥85 (kontrollerad Go).
- 11.4.4. Andra tenant onboardad live.
- 11.4.5. Statussida + supportflöde (10.11).

---

## 12. Definition of Done — hela Arcana-resan

12.1. Internt: Du loggar in och får dagens plan. Systemet säger vad som kräver åtgärd. Risk/incidenter hanteras i workflow. Mallar förbättras löpande. Ekonomi varnar innan problem.

12.2. Operativt: Två eller fler tenants kör live, var och en med egen identitet, utan att safety försvagats.

12.3. Patientkanal: Öppen, gated, med kill-switch och human handoff — utan att bli farlig.

12.4. Affärsmässigt: Säljbar SaaS med dokumenterade SLA, DPA, kostnadsmodell och referenscase.

12.5. Strategiskt: Arcana driver kliniken operativt. Du bär inte allt i huvudet längre.
