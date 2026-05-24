# Major Arcana — projektchecklista

Senast uppdaterad: **2026-05-24**  
Prod: **https://arcana.hairtpclinic.se** · Repo: `~/Code/major-arcana` · Arkiv: `~/Code/MA-Archive/`

> **Följ dagligen:** [MASTER-TODO.md](./MASTER-TODO.md) (en sida) · [Notion — Master TODO](https://www.notion.so/6d5ae9dabf314678959270ba86a6cbf6)

**Steg-för-steg utrullning (6 faser):** [ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md)

Använd denna som **en sida att bocka av**. Detaljer finns i länkade planer.

**Prod snapshot (2026-05-24):** 7 349 kunder · 1 981 Drive-profiler · 5 152 historiska journalposter · `verify:migration-prod` PASS · open access **av** (login krävs).

### Status i ett svep

| Spår | Klart | Kvar |
|------|-------|------|
| **Journal + avtal + migration** | Kundmaster, offert, avtal, 7 349 kunder prod | Drive-PDF på prod, kundlista smoke full skala |
| **Mobil UX sweep** | #1–16 kod + prod (`cco-mobile-ux-sweep-plan.md`) | Android enhet, Fas 5.6 manuellt |
| **Mobil pilot (Fas 1)** | Automation grön (`verify:cco-mobile-pilot-prod`, `run:rollout-sweep`) | 5.5–5.6 tabeller, GO/NO-GO |
| **Auth** | Open access av, STAFF/OWNER finns | MFA enforced, mobil STAFF-login, rollback-doc |
| **Plan A bokning** | Webb + Arcana + operatör confirm 3/3 (automated GO) | Resend patient-mail, bokning→journal |
| **Post-op Fas 1** | Kod + unit + runbook | 4 beslut, Graph live, Playwright smoke |
| **Compliance Fas 9** | PDL signerat externt ✅ | Retention, GDPR, Art. 30 kvar |
| **Backlog (ej nu)** | — | Månadskalender (#17), cco-next (#18) |

**Du är här:** Mobil pilot **Fas 5.5–5.6** + kundlista/Drive på prod + auth polish.

---

## Nu — aktivt fokus

- [ ] **Mobil journal-pilot Fas 5.5** — testa iPhone / Android / iPad ([checklista](./cco-mobile-staff-pilot-checklist.md))
- [ ] **Mobil journal-pilot Fas 5.6** — ≥2 personal, ≥5 konsultationer, feedback + GO/NO-GO
- [x] **Mobil UX sweep** (#1–16) — kod + prod deploy ([sweep-plan](./cco-mobile-ux-sweep-plan.md))
- [x] **STAFF + OWNER-konton** i prod (login krävs; open access av)
- [x] **Plan A bokning** — automated prod sign-off ([go-live](./cco-booking-plan-a-go-live.md))
- [ ] **Personal läst** [mobilinstruktion](./cco-mobile-staff-instructions.md) *(login krävs — uppdatera om den nämner open access)*
- [x] **Kundlista med full data** — API smoke PASS (`verify:customer-list-prod`: 7349, sök ~300ms)
- [ ] **Kundlista mobil UI** — `verify:staff-ui-prod` timeout med full kundbas (desktop PASS)
- [ ] **Drive-PDF på prod** — kräver Google Drive API (86 GB zip får inte plats på 2 GB disk)
- [ ] **OWNER MFA enforced** i prod + STAFF login testad på mobil
- [ ] **Notion 30 maj** — [verify prod efter duplicate-cleanup](https://www.notion.so/369060ccc15b819fbe4cdfcc726653d7)

---

## A. Klinik & journal (MA-dokumentplan)

Källa: [ma-document-placement-plan.md](./ma-document-placement-plan.md)

### Fas A — Arkiv & dokumentindex ✅

- [x] `MA-Archive/` struktur (juridik, cliento, journal-zips, offert-word, sharepoint)
- [x] Juridik-index + Gabrielle Handler-flöde
- [x] SharePoint-sync från GitHub (`scripts/sync-sharepoint-archive.sh`)
- [x] Offertmallar 14 docx (`scripts/sync-offert-archive.sh`)
- [x] `JOURNAL-DATAMODELL.md` i repo

### Fas B — Pilotkunder ✅

- [x] 5 pilotkunder valda + `data/pilot-patients.json`
- [x] Importerade till prod + historik per kund
- [x] Journal (plan, TP, signering) verifierad i prod

### Fas C — Behandlingsavtal ✅

- [x] Spec + store + routes + UI (Avtal-flik)
- [x] Konsultation → offert → avtal → signering utan GetAccept

### Fas D — Hälsodekl & friskförsäkran ✅

- [x] Formulär i app + gate före behandlingsplan
- [x] Signering/lås via journal-API

### Fas 6 — Bokning vs avtal ✅

- [x] Bokning spärrad tills `agreementStatus === 'bookable'`
- [x] E2E prod alla 5 pilotkunder (`verify-all-pilot-journey-prod.sh`)

---

## B. Journal-byggplan (teknik)

Källa: [cco-patient-journal-build-plan.md](./cco-patient-journal-build-plan.md)

### Fas 0 — Förberedelse

- [x] Migration-scripts + Cliento-import (6 687 kunder)
- [x] Bulk migration pushad till prod (7 349 kunder, index, journal)
- [x] PDL + EU Frankfurt dokumenterat (`docs/legal/pdl-mdr-assessment.md` §6)
- [x] PDL juridiskt signerat / slutgranskat externt (2026-05-24)
- [ ] Render EU-region verifierad i Dashboard (Frankfurt)
- [ ] Pipedrive People+Deals export (nuvarande zip tom)

### Fas 1–5 — Kundmaster, UI, journal, offert ✅

- [x] Migration-index (57 558 filer · 1 981 profiler prod)
- [x] Kundlista + kundkort (Profil | Journal | Filer)
- [x] Journalmodul (TP 38 fält, signering, historikimport)
- [x] Patient-resa wired (consultations, aftercare, operations)
- [x] Offert + avtal/e-sign

### Fas 10 — Mobil journal (personal)

- [x] Kod: Ta bild, HEIC, PWA, deep link, QR, batch, markera plan, UX sweep shell
- [x] Prod smoke + deep links (`npm run verify:cco-mobile-pilot-prod`, `run:rollout-sweep`)
- [ ] **Pilot 5.5–5.6** — manuellt med personal ([pilotchecklista](./cco-mobile-staff-pilot-checklist.md))

### Fas 6–9 — Nästa vågor

- [x] **6 (Plan A)** Publik `/boka` — automated GO 2026-05-24 ([go-live](./cco-booking-plan-a-go-live.md))
- [ ] **6 (full)** Egen bookingmotor — Cliento ut, full behandlingskatalog på webben
- [ ] **7** Påminnelser (eftervård, formulär, återbesök)
- [ ] **8** CCO-agent (saknade formulär, journalutkast)
- [ ] **9** Compliance: retention 10 år, GDPR export/spärr, Art. 30

### Blockers innan personal live (bred drift)

- [x] Migration-index spot-check (≥20 kunder · `migration:spot-check` + prod verify)
- [ ] Minst en personal utbildad
- [ ] Mobil pilot **GO** (Fas 5.6)
- [x] Skarp auth (open access av · MFA required · se avsnitt D)
- [x] Kundlista API OK med full kundbas (7 349)
- [ ] Kundlista/journal OK i mobil UI med full kundbas
- [ ] Drive-filer visningsbara i prod (zip-volym)

---

## C. Infra & ops

- [x] Prod-tjänst `major-arcana` + custom domain
- [x] Render blueprint CCO-Next → `render.yaml` synkad
- [x] Auto env-heal vid push (`arcana-post-deploy-heal`)
- [x] Duplicerade Render-tjänster borttagna
- [x] Post-deploy pilot-verify scripts
- [x] Migration state push API (`push-state-file` + `npm run push:migration-state-prod`)
- [ ] Full Drive-historik på prod disk (zip-volym eller API) — krävs för PDF-visning i Filer-fliken

**Verifiering (kör vid behov):**

```bash
bash scripts/verify-render-blueprint-link.sh
bash scripts/verify-all-pilot-journey-prod.sh
npm run verify:cco-mobile-pilot-prod
npm run verify:mobile-staff-regression-prod
npm run verify:booking-web-e2e-prod
npm run verify:customer-list-prod
npm run verify:auth-go-live-prod
curl -fsS https://arcana.hairtpclinic.se/readyz
```

---

## D. Go-live klinik (auth)

- [x] Stäng `ARCANA_STAFF_JOURNAL_OPEN_ACCESS=false`
- [x] `ARCANA_AUTH_OWNER_MFA_REQUIRED=true` (prod verify 2026-05-24)
- [x] STAFF-konto i prod (1 st — `verify:auth-go-live-prod`)
- [ ] STAFF-inloggning testad på mobil (iPhone + Android) — Fas 5.6
- [ ] Underhållsfönster + rollback-plan dokumenterad
- [ ] Backup journal-photos schemalagd (`npm run backup:journal-photos`)

---

## E. Nästa produktleveranser (efter go-live)

### Post-op foto-flow Fas 1

Källa: [post-op-review-photo-flow.md](./post-op-review-photo-flow.md)

- [ ] Bekräfta 4 open questions (patientkanal-tolkning, avsändare, retention, UI)
- [x] Backend: capability + store + routes *(kod klar)*
- [x] `/uppfoljning/[token]` + CCO-knapp “Markera uppföljning klar” *(kod klar)*
- [x] Unit tests + runbook *(kod klar)*
- [ ] Graph send live i prod + Playwright smoke `/uppfoljning/[token]`

### CMO marketing (medvetet av i prod)

- [ ] Live connectors + publish (fixture idag)
- [ ] Se [cmo-v3-rollout-plan.md](./cmo-v3-rollout-plan.md)

---

## F. Arcana Executive OS (lång sikt)

Källa: [arcana-master-plan-punktvis.md](./arcana-master-plan-punktvis.md)

Nuvarande fas: **STABILISERA** → sedan **EXPANDERA**

| Workstream | Status | Notering |
|------------|--------|----------|
| Pilot 1 Admin Core | ✅ | Auth, mallar, risk, orchestrator |
| Phase 2 säkerhet (A) | 🔄 Delvis | Open access av; MFA enforce + mobil STAFF-login kvar |
| CCO operativt (C) | 🔄 | Full kundbas prod; pilot 5.6 + Drive-filer kvar |
| Bookingmotor | 🔄 | **Plan A GO** (automated); påminnelser + full motor kvar |
| Mobil UX sweep | ✅ | #1–16 prod; backlog #17–18 medvetet utelämnat |
| Agenter CFO/COO/CMO | 🔄 | CMO fixture |
| Patientkanal | ❌ | Sist enligt canon |
| CAO admin-operator | ❌ | Egen plan |

P0-arkitektur: [architecture/p0-checklist.md](../architecture/p0-checklist.md)  
Äldre master-status: [ops/master-checklist-status-2026-02-26.md](../ops/master-checklist-status-2026-02-26.md)

---

## Snabb ordning (vad först)

Se full plan: **[ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md)**

```
1. Mobil pilot GO          ← DU ÄR HÄR (5.5–5.6 manuellt)
2. Kundlista/journal med 7 349 kunder + Drive-filer på prod
3. Auth polish (MFA enforced, mobil STAFF-login, rollback-doc)
4. Post-op flow Fas 1 live (beslut + Graph + smoke)
5. Compliance-grund (Fas 9)
6. Påminnelser + full bookingmotor · Agenter + CMO
```

Plan A bokning: **GO (automated 2026-05-24)** — parallellt spår, blockerar inte Fas 1.

---

## Referenser

| Dokument | Innehåll |
|----------|----------|
| [MASTER-TODO.md](./MASTER-TODO.md) | **En sida att följa** — Notion + repo |
| [ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md) | **6-fas utrullning** — mål, uppgifter, GO per fas |
| [ma-document-placement-plan.md](./ma-document-placement-plan.md) | Fas A–D + avtalsgate |
| [cco-patient-journal-build-plan.md](./cco-patient-journal-build-plan.md) | Teknisk journal-roadmap |
| [cco-mobile-staff-pilot-checklist.md](./cco-mobile-staff-pilot-checklist.md) | Detalj per enhet/konsultation |
| [cco-mobile-ux-sweep-plan.md](./cco-mobile-ux-sweep-plan.md) | Mobil UX sweep (#1–16 klart; #17–18 backlog) |
| [cco-booking-plan-a-go-live.md](./cco-booking-plan-a-go-live.md) | Plan A bokning (automated GO) |
| [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md) | 1-sida för personal |
| [arcana-phase-2-masterplan.md](./arcana-phase-2-masterplan.md) | Executive OS Phase 2 |
