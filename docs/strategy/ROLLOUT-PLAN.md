# Major Arcana — utrullningsplan (6 faser)

Skapad: **2026-05-23**  
Status: **aktiv**  
Relaterat: [PROJECT-CHECKLIST.md](./PROJECT-CHECKLIST.md)

```
Mobil pilot GO
    ↓
Auth/MFA go-live
    ↓
Post-op flow Fas 1
    ↓
Compliance Fas 9
    ↓
Bookingmotor Fas 6–7
    ↓
Agenter + CMO live + patientkanal
```

Varje fas har **mål**, **uppgifter**, **GO-kriterier** och **verifiering**. Nästa fas startar först när föregående är GO.

---

## Fas 1 — Mobil pilot GO

**Mål:** Personal kan journalföra med mobil (Ta bild, galleri, deep link) i riktiga konsultationer utan utvecklarstöd.

**Uppskattning:** 1–2 veckor (beroende på personalens schema)  
**Ägare:** Klinik + Fazli (facilitering)

### Förutsättningar (klara)

- [x] Kod deployad prod (`/staff`, journal-API, HEIC, PWA)
- [x] 5 pilotkunder + deep links (`npm run verify:mobile-pilot-prod`)
- [x] `ARCANA_STAFF_JOURNAL_OPEN_ACCESS=true` (pilotläge)
- [x] Instruktion: [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md)

### Uppgifter

| # | Uppgift | Typ |
|---|---------|-----|
| 1.1 | Skicka instruktion + deep links till ≥2 personal | Ops |
| 1.2 | **Fas 5.5** — test per enhet: iPhone Safari, Android Chrome, iPad | Test |
| 1.3 | **Fas 5.6** — ≥5 konsultationer, fyll tabell + 5 feedbackfrågor | Test |
| 1.4 | Dokumentera incidenter (nätverk, kamera, format) | Ops |
| 1.5 | Beslut GO/NO-GO i [cco-mobile-staff-pilot-checklist.md](./cco-mobile-staff-pilot-checklist.md) | Beslut |

### GO-kriterier

- ≥2 personal testat
- ≥5 konsultationer med bild uppladdad
- Medel ≥4 på fråga 1–2 (hitta kund, Ta bild)
- Inga blockerande buggar (kamera/upload på HTTPS)
- Alla enhetsrader ikryssade i 5.5-tabellen

### NO-GO → åtgärd

| Problem | Åtgärd |
|---------|--------|
| Kamera/upload fail | Debug prod, ev. kodfix + ny deploy |
| Auth förvirring | Vänta till Fas 2; håll open access under fix |
| >2 allvarliga incidenter | Stopp, root cause, ny pilotomgång |

### Verifiering

```bash
npm run verify:mobile-pilot-prod
bash scripts/verify-all-pilot-journey-prod.sh
curl -fsS https://arcana.hairtpclinic.se/readyz
```

---

## Fas 2 — Auth / MFA go-live

**Mål:** Skarp drift — endast inloggad STAFF/OWNER når journal; OWNER MFA på.

**Uppskattning:** 2–3 dagar (1 dag config + 1 dag test + underhållsfönster)  
**Blocker:** Fas 1 GO  
**Ägare:** Fazli + IT

### Förutsättningar

- [ ] Fas 1 GO signerad
- [ ] STAFF-konton skapade (minst 2)
- [ ] OWNER MFA secret/recovery sparade säkert
- [ ] Underhållsfönster kommunicerat (~15 min)

### Uppgifter

#### 2.1 Konton (före env-byte)

| # | Uppgift | Referens |
|---|---------|----------|
| 2.1.1 | Skapa STAFF-användare (API eller befintligt admin-flöde) | [tenant-onboarding-playbook.md](../ops/tenant-onboarding-playbook.md) |
| 2.1.2 | Verifiera OWNER login + MFA setup lokalt mot prod | `npm run owner:mfa:setup` |
| 2.1.3 | Spara recovery-koder offline | — |

#### 2.2 Render env (underhållsfönster)

| Env | Nu (pilot) | Go-live |
|-----|------------|---------|
| `ARCANA_STAFF_JOURNAL_OPEN_ACCESS` | `true` | **`false`** |
| `ARCANA_AUTH_OWNER_MFA_REQUIRED` | `false` | **`true`** |
| `ARCANA_PREFLIGHT_READINESS_CHECKS` | `cors_strict` | **`cors_strict,owner_mfa_enforced`** (eller motsv. i prod) |

Uppdatera `render.yaml` + merge via blueprint/CI heal. **Ingen restart direkt efter env PUT** om CI heal körs (befintlig policy).

#### 2.3 Kod (minimal — mest config)

| # | Uppgift | Fil/område |
|---|---------|------------|
| 2.3.1 | Uppdatera `render.yaml` defaults för go-live | `render.yaml` |
| 2.3.2 | Ev. script: `scripts/verify-auth-go-live-prod.sh` | Nytt |
| 2.3.3 | Uppdatera mobilinstruktion (login krävs) | `cco-mobile-staff-instructions.md` |
| 2.3.4 | Dokumentera rollback (sätt open access tillbaka) | `docs/ops/runbooks/` |

#### 2.4 Test efter byte

- [ ] `/staff` kräver login (401/redirect)
- [ ] STAFF kan logga in + nå journal + Ta bild på mobil
- [ ] OWNER login kräver MFA
- [ ] Deep links fungerar efter login
- [ ] Pilot 5/5 journey fortfarande grön (`verify-all-pilot-journey-prod.sh`)

### GO-kriterier

- Open access av i prod ≥24 h utan incidenter
- Alla STAFF testat login på egen telefon
- OWNER MFA enforced i readiness/preflight
- Rollback-plan dokumenterad

### Verifiering

```bash
# Open access ska vara false
curl -fsS https://arcana.hairtpclinic.se/api/v1/_diag/env | jq .env.ARCANA_STAFF_JOURNAL_OPEN_ACCESS

BASE_URL=https://arcana.hairtpclinic.se \
  ARCANA_OWNER_EMAIL=... ARCANA_OWNER_PASSWORD=... \
  npm run smoke:public
```

---

## Fas 3 — Post-op flow Fas 1

**Mål:** Efter sista uppföljning — operatör triggar mail → patient laddar upp efter-bilder + samtycke → CTA Google-omdöme.

**Uppskattning:** ~3 arbetsdagar kod + 1 dag staging  
**Blocker:** Fas 2 GO (+ 4 beslut nedan)  
**Spec:** [post-op-review-photo-flow.md](./post-op-review-photo-flow.md)

### Beslut före kod (open questions)

- [ ] **Patientkanal-tolkning** — transactional touch OK enligt canon?
- [ ] **Avsändare** — `info@hairtpclinic.com` via Graph?
- [ ] **Foto-retention** — 365 d utan consent / obegränsat med consent?
- [ ] **CCO-UI** — vem godkänner mock för knappen "Markera sista uppföljning klar"?

### Leveranspaket

| Del | Innehåll | Status |
|-----|----------|--------|
| **3.1 Backend** | `RequestPostOpReview` capability, store, routes, token | ✅ Kod klar |
| **3.2 Patientvy** | `/uppfoljning/[token]` — upload, consent, GBP-länk | ✅ Kod klar |
| **3.3 CCO-UI** | Knapp i booking/case-vy, status + retry | ✅ Kod klar |
| **3.4 Test/docs** | Unit + runbook | ✅ Unit + runbook |

### Huvuduppgifter

- [x] `data/post-op-reviews.json` + `data/post-op-photos/` store
- [x] Booking case: `follow_up_completed`, events (`findCaseByRef` + `updateStatus`)
- [x] Capability via ExecutionGateway
- [x] `POST .../mark-follow-up-completed` + send via Graph
- [x] Publik token-route (multer, EXIF-strip, size cap)
- [x] Audit-events + GDPR export/anonymize post-op metadata
- [x] Runbook: `docs/ops/runbooks/post-op-review-runbook.md`
- [ ] Graph send live i prod (secrets + beslut)
- [ ] Playwright smoke `/uppfoljning/[token]`

### GO-kriterier

- E2E: mark completed → email draft/send → patient upload → consent sparad
- 0 lint-fel, gateway audit-kedja komplett
- Playwright smoke på `/uppfoljning/[token]`
- **Fas 2 auto-trigger** — utelämnad medvetet (Q4 2026)

**Verifiering:**

```bash
npm run run:rollout-sweep
node --test tests/capabilities/requestPostOpReview.test.js
```

---

## Fas 4 — Compliance Fas 9

**Mål:** Juridiskt underlag för journalsystem i drift — retention, GDPR-rättigheter, registerförteckning.

**Uppskattning:** 1–2 veckor  
**Blocker:** Fas 2 GO (kan delvis parallellt med Fas 3 efter auth)

### Uppgifter

| # | Uppgift | Leverans |
|---|---------|----------|
| 4.1 | Retention 10 år i config + dokumenterad policy | `src/config.js`, legal doc |
| 4.2 | GDPR export-endpoint (patient data bundle) | Route + test |
| 4.3 | GDPR spärr/radering workflow (med audit) | Route + runbook |
| 4.4 | Uppdatera Art. 30 + PUB (Personuppgiftsbiträde) | `docs/legal/` |
| 4.5 | PDL-bedömning — Arcana som journalsystem | Uppdatera befintlig bedömning |
| 4.6 | Render EU-region dokumenterad | Ops evidence |
| 4.7 | Cron: rensa foton enligt retention (post-op + journal) | Scheduler job |

### GO-kriterier

- Legal docs signerade internt (OWNER)
- Export/spärr testad på pilotpatient (testdata)
- Preflight/readiness inkluderar compliance-checks
- Backup + retention dokumenterade i runbook

### Verifiering

```bash
npm run test:unit -- --grep -i gdpr   # när tester finns
npm run preflight:readiness
```

---

## Fas 5 — Bookingmotor Fas 6–7

**Mål:** Egen online-bokning (Plan A: online möte, fysisk konsult, uppföljning HT) — Cliento ut som motor; påminnelser.

**Uppskattning:** 4–8 veckor (inkrementellt)  
**Blocker:** Fas 2 GO; avtalsgate redan klart  
**Spec:** [cco-booking-mvp-spec.md](./cco-booking-mvp-spec.md), [cco-booking-plan-a-go-live.md](./cco-booking-plan-a-go-live.md)

### Fas 5A — Bookingmotor Fas 6 (4–6 v)

| # | Uppgift | Status idag |
|---|---------|-------------|
| 5A.1 | Plan A go-live på hairtpclinic.com (webb → Arcana API) | Engine finns, E2E återstår |
| 5A.2 | Operatörsbekräftelse (reservation ≠ confirm) | Delvis byggt |
| 5A.3 | Koppling bokning → behandlingstillfälle → journal | Spec i build-plan 6.3 |
| 5A.4 | Resend live (bekräftelsemail) | Mock utan API-nyckel |
| 5A.5 | Prod readiness checklist grön | [cco-booking-prod-readiness-checklist.md](./cco-booking-prod-readiness-checklist.md) |

### Fas 5B — Påminnelser Fas 7 (2 v efter 5A)

| # | Uppgift |
|---|---------|
| 5B.1 | Scheduler: påminnelse före besök |
| 5B.2 | Eftervård / formulär / återbesök triggers |
| 5B.3 | Koppling till post-op Fas 2 auto-trigger (Q4) |

### GO-kriterier

- Webb bokar Plan A end-to-end i staging → prod
- Avtal-gate respekteras fortfarande för behandlingsbokning
- Operatör ser case i CCO inom 60 s efter reservation
- Påminnelser skickade i test utan dubletter (idempotency)

---

## Fas 6 — Agenter + CMO live + patientkanal

**Mål:** Executive OS expanderar — agenter i produktion, marketing live, patientkanal enligt canon (sist).

**Uppskattning:** Q4 2026 → 2027 (löpande)  
**Blocker:** Fas 4 compliance + Phase 2 säkerhet (A1–A6) i stort sett grön

### 6A — CCO-agent Fas 8 (2–3 v)

- [ ] Daglig rapport: saknade formulär/samtycken
- [ ] Journalutkast med human approval (gateway)
- [ ] Scheduler + OWNER notify

### 6B — CMO live (Fas O–P)

Källa: [cmo-v3-rollout-plan.md](./cmo-v3-rollout-plan.md)

| Steg | Innehåll |
|------|----------|
| O | Prod connectors live (Google/Meta/LinkedIn read) |
| P | Live publish efter OWNER-gate |
| Q–R | Observability, mutation ≥70% |

Prod idag: `ARCANA_MARKETING_CONNECTORS_MODE=fixture` — medvetet av.

### 6C — CAO admin-operator

Källa: [cao-arcana-admin-operator-implementation-plan.md](./cao-arcana-admin-operator-implementation-plan.md)

Mall-QC, incident/SLA, Go/No-Go briefs — separat roadmap.

### 6D — Patientkanal (canon: sist)

- [ ] Phase 2 Workstream A säkerhet grön (MFA all roles, audit immutability, …)
- [ ] Risk + policy gates verifierade under last
- [ ] Patient guardrails + beta-gate (redan delvis byggt)
- [ ] Formell GO/NO-GO: [arcana-master-plan-punktvis.md](./arcana-master-plan-punktvis.md) §9

Post-op upload räknas som **transactional touch** — full patientchat kommer senare.

### GO-kriterier (Fas 6 helhet)

- CMO metrics live read-only i prod
- CCO-agent daglig brief utan PII-läckage
- Patientkanal-beslut dokumenterat; ingen oplanerad chat-go-live

---

## Tidslinje (indikativ)

| Vecka | Fas | Milstolpe |
|-------|-----|-----------|
| W1–W2 | 1 | Mobil pilot GO |
| W3 | 2 | Auth/MFA go-live |
| W4 | 3 | Post-op Fas 1 staging |
| W5–W6 | 4 | Compliance Fas 9 |
| W7–W12 | 5 | Booking Plan A + påminnelser |
| Q4+ | 6 | Agenter, CMO, patientkanal |

---

## Snabbreferens — env per fas

| Fas | Viktiga env |
|-----|-------------|
| 1 (pilot) | `ARCANA_STAFF_JOURNAL_OPEN_ACCESS=true` |
| 2 (go-live) | `…=false`, `ARCANA_AUTH_OWNER_MFA_REQUIRED=true` |
| 3 (post-op) | Graph send enabled, allowlist |
| 5 (booking) | `RESEND_API_KEY`, publik webb-URL |
| 6 (CMO) | `ARCANA_MARKETING_CONNECTORS_MODE=live` |

---

## Referenser

- [PROJECT-CHECKLIST.md](./PROJECT-CHECKLIST.md)
- [cco-mobile-staff-pilot-checklist.md](./cco-mobile-staff-pilot-checklist.md)
- [post-op-review-photo-flow.md](./post-op-review-photo-flow.md)
- [cco-booking-mvp-spec.md](./cco-booking-mvp-spec.md)
- [cmo-v3-rollout-plan.md](./cmo-v3-rollout-plan.md)
- [arcana-phase-2-masterplan.md](./arcana-phase-2-masterplan.md)
