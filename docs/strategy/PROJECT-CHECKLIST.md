# Major Arcana — projektchecklista

Senast uppdaterad: **2026-05-23**  
Prod: **https://arcana.hairtpclinic.se** · Repo: `~/Code/major-arcana` · Arkiv: `~/Code/MA-Archive/`

**Steg-för-steg utrullning (6 faser):** [ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md)

Använd denna som **en sida att bocka av**. Detaljer finns i länkade planer.

---

## Nu — aktivt fokus

- [ ] **Mobil journal-pilot Fas 5.5** — testa iPhone / Android / iPad ([checklista](./cco-mobile-staff-pilot-checklist.md))
- [ ] **Mobil journal-pilot Fas 5.6** — ≥2 personal, ≥5 konsultationer, feedback + GO/NO-GO
- [ ] **STAFF + OWNER-konton** skapade i prod (krävs före skarp drift)
- [ ] **Personal läst** [mobilinstruktion](./cco-mobile-staff-instructions.md)
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
- [ ] PDL-bedömning uppdaterad (Arcana = journalsystem)
- [ ] Render EU-region dokumenterad/verifierad
- [ ] Pipedrive People+Deals export (nuvarande zip tom)

### Fas 1–5 — Kundmaster, UI, journal, offert ✅

- [x] Migration-index (46 977 filer)
- [x] Kundlista + kundkort (Profil | Journal | Filer)
- [x] Journalmodul (TP 38 fält, signering, historikimport)
- [x] Patient-resa wired (consultations, aftercare, operations)
- [x] Offert + avtal/e-sign

### Fas 10 — Mobil journal (personal)

- [x] Kod: Ta bild, HEIC, PWA, deep link, QR, batch, markera plan
- [x] Prod smoke + deep links (`npm run verify:mobile-pilot-prod`)
- [ ] **Pilot 5.5–5.6** (se [pilotchecklista](./cco-mobile-staff-pilot-checklist.md))

### Fas 6–9 — Ej påbörjat (nästa vågor)

- [ ] **6** Egen bookingmotor (Cliento ut), behandlingskatalog
- [ ] **7** Påminnelser (eftervård, formulär, återbesök)
- [ ] **8** CCO-agent (saknade formulär, journalutkast)
- [ ] **9** Compliance: retention 10 år, GDPR export/spärr, Art. 30

### Blockers innan personal live (bred drift)

- [ ] Migration-index spot-check (≥20 kunder utöver pilot)
- [ ] Minst en personal utbildad
- [ ] Mobil pilot **GO**
- [ ] Skarp auth (se avsnitt D nedan)

---

## C. Infra & ops

- [x] Prod-tjänst `major-arcana` + custom domain
- [x] Render blueprint CCO-Next → `render.yaml` synkad
- [x] Auto env-heal vid push (`arcana-post-deploy-heal`)
- [x] Duplicerade Render-tjänster borttagna
- [x] Post-deploy pilot-verify scripts
- [ ] Full Drive-historik (API eller lokal mirror) — valfritt före bred rollout

**Verifiering (kör vid behov):**

```bash
bash scripts/verify-render-blueprint-link.sh
bash scripts/verify-all-pilot-journey-prod.sh
npm run verify:mobile-pilot-prod
curl -fsS https://arcana.hairtpclinic.se/readyz
```

---

## D. Go-live klinik (efter pilot-GO)

- [ ] Stäng `ARCANA_STAFF_JOURNAL_OPEN_ACCESS=false`
- [ ] `ARCANA_AUTH_OWNER_MFA_REQUIRED=true`
- [ ] STAFF-inloggning testad på mobil
- [ ] Underhållsfönster + rollback-plan dokumenterad
- [ ] Backup journal-photos schemalagd (`npm run backup:journal-photos`)

---

## E. Nästa produktleveranser (efter go-live)

### Post-op foto-flow Fas 1

Källa: [post-op-review-photo-flow.md](./post-op-review-photo-flow.md)

- [ ] Bekräfta 4 open questions (patientkanal-tolkning, avsändare, retention, UI)
- [ ] Backend: capability + store + routes
- [ ] `/uppfoljning/[token]` + CCO-knapp “Markera uppföljning klar”
- [ ] Smoke + runbook

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
| Phase 2 säkerhet (A) | 🔄 Delvis | MFA av i byggfas |
| CCO operativt (C) | 🔄 | Journal nästan live |
| Bookingmotor | ❌ | Fas 6–7 huvudplan |
| Agenter CFO/COO/CMO | 🔄 | CMO fixture |
| Patientkanal | ❌ | Sist enligt canon |
| CAO admin-operator | ❌ | Egen plan |

P0-arkitektur: [architecture/p0-checklist.md](../architecture/p0-checklist.md)  
Äldre master-status: [ops/master-checklist-status-2026-02-26.md](../ops/master-checklist-status-2026-02-26.md)

---

## Snabb ordning (vad först)

Se full plan: **[ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md)**

```
1. Mobil pilot GO          ← DU ÄR HÄR
2. Auth + MFA go-live
3. Post-op flow Fas 1
4. Compliance-grund (Fas 9)
5. Egen bookingmotor (Fas 6–7)
6. Agenter live + CMO + patientkanal
```

---

## Referenser

| Dokument | Innehåll |
|----------|----------|
| [ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md) | **6-fas utrullning** — mål, uppgifter, GO per fas |
| [ma-document-placement-plan.md](./ma-document-placement-plan.md) | Fas A–D + avtalsgate |
| [cco-patient-journal-build-plan.md](./cco-patient-journal-build-plan.md) | Teknisk journal-roadmap |
| [cco-mobile-staff-pilot-checklist.md](./cco-mobile-staff-pilot-checklist.md) | Detalj per enhet/konsultation |
| [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md) | 1-sida för personal |
| [arcana-phase-2-masterplan.md](./arcana-phase-2-masterplan.md) | Executive OS Phase 2 |
