# Major Arcana — samlad faslista (en sida)

Senast uppdaterad: **2026-05-25**  
Prod: **https://arcana.hairtpclinic.se** · Repo: `~/Code/major-arcana`

**Du är här:** **Utrullning Fas 3** (Drive-PDF + bred drift) — journal, avtal och mobil är live; STAFF-konton för sjuksköterskor skapade.

**Notion (bockbar kopia):** [Major Arcana — Master TODO](https://www.notion.so/6d5ae9dabf314678959270ba86a6cbf6)

Detaljspecer: [PROJECT-CHECKLIST.md](./PROJECT-CHECKLIST.md) · [ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md) · [cco-patient-journal-build-plan.md](./cco-patient-journal-build-plan.md) · [ma-document-placement-plan.md](./ma-document-placement-plan.md)

**Tecken:** ☑ klart · ☐ kvar · ~ uppskjutet / valfritt · → pågår

---

## Snabb ordning (vad som kommer härnäst)

```
☑ MA A–D + avtalsgate + journal 0–5 + mobil automation
→ Utrullning 3: Drive-PDF + bred drift          ← DU ÄR HÄR
→ Utrullning 2 polish: rollback-doc, backup
→ Utrullning 4: Post-op Fas 1 live
→ Utrullning 5: Compliance Fas 9
→ Journal 6.3 + Tidslinje B–D (tillfälle per datum)
→ Utrullning 5B + journal 6–8 (påminnelser, agent, full motor)
→ Utrullning 6: CMO + patientkanal
```

---

## DEL 1 — MA klinik & dokument ([ma-document-placement-plan.md](./ma-document-placement-plan.md))

### Fas MA-A — Arkiv & dokumentindex ☑

- [x] MA-A.1 `MA-Archive/` (juridik, cliento, journal-zips, offert-word, sharepoint)
- [x] MA-A.2 Juridik-index + Gabrielle Handler-flöde
- [x] MA-A.3 SharePoint-sync (`scripts/sync-sharepoint-archive.sh`)
- [x] MA-A.4 Offertmallar 14 docx (`scripts/sync-offert-archive.sh`)
- [x] MA-A.5 `JOURNAL-DATAMODELL.md` i repo

> **Verify 2026-05-24:** `MA-Archive/` OK (5/5 SharePoint, 14 docx under `offert-word/Offertmallar/`). Juridik-index: `docs/legal/juridik-gdpr/INNEHALL-OCH-NYCKELPUNKTER.md`.

### Fas MA-B — Pilotkunder ☑ (prod delvis)

- [x] MA-B.1 5 pilotkunder + `data/pilot-patients.json`
- [x] MA-B.2 Importerade till prod + historik per kund
- [ ] MA-B.3 Journal (plan, TP, signering) verifierad i prod

> **Verify 2026-05-24:** Alla 5 piloter finns på prod (match via e-post efter J-1-migration; nya UUID i `pilot-patients.json`). Filer + `historical_import`-journal (10–12 poster/kund). **Saknas:** `consultation_plan`, hälsodekl, signering i live-journal.

### Fas MA-C — Behandlingsavtal ☑ (kod)

- [x] MA-C.1 Spec + store + routes + UI (Avtal-flik)
- [ ] MA-C.2 Konsultation → offert → avtal → signering utan GetAccept

> **Verify 2026-05-24:** Kod + routes finns. Prod-piloter: inget `commercialCase`, inget `agreement` — flödet ej genomfört på pilotkunder efter migration.

### Fas MA-D — Hälsodekl & friskförsäkran ☑ (kod)

- [x] MA-D.1 Formulär i app + gate före behandlingsplan
- [x] MA-D.2 Signering/lås via journal-API

> **Verify 2026-05-24:** UI + API i repo. Prod: 0 `health_declaration` på alla 5 piloter.

### Fas MA-6 — Bokning vs avtal ☑ (kod) / ☐ E2E prod

- [x] MA-6.1 Bokning spärrad tills `agreementStatus === 'bookable'`
- [ ] MA-6.2 E2E prod alla 5 pilotkunder (`verify-all-pilot-journey-prod.sh`)

> **Verify 2026-05-24:** Unit 7/7 PASS (`ccoTreatmentAgreementStore`, `ccoTreatmentBookingGate`). Prod gate **blocked** för alla 5 (korrekt utan avtal). E2E-script fixat (slutar kräva `totalPatients:5`); kör om när pilotresan är genomförd.

---

## DEL 2 — Journal & migration teknik ([cco-patient-journal-build-plan.md](./cco-patient-journal-build-plan.md))

### Fas J-0 — Förberedelse ☑ **KLART**

- [x] J-0.1 Migration-scripts + npm (`migration:scan`, `migration:import`, `migration:test`)
- [x] J-0.2 Zip-nedlading ersatt med Drive API / lokal mirror
- [x] J-0.3 PDL-bedömning — advokatgodkänd 2026-05-24
- [x] J-0.4 Render EU Frankfurt verifierad
- [x] J-0.5 **Pipedrive People+Deals export** (2026-05-24) — `migration/pipedrive/personer-2026-05-24.csv` (**3 693 personer**) + `affarer-2026-05-24.csv` (**3 487 affärer**), validerad enligt [migration/pipedrive/README.md](../../migration/pipedrive/README.md)

> **Scope J-0.5:** export + validering i repo. Valfri berikning av kundmaster: `npm run migration:import-pipedrive` (körs separat, inte blocker för go-live).

### Fas J-1 — Datamigration & kundmaster ☑ **KLART**

> **Scope J-1:** kundmaster, migration-index och matchning i prod. **Inte** samma sak som U3.1 (PDF-byte streaming från Drive på prod — det är nästa steg).

- [x] J-1.1 Drive scan-scripts (zip, folder, Google Drive API)
- [x] J-1.2 Cliento-import — **7 349 kunder prod** (verify 2026-05-21)
- [x] J-1.3 Match Drive personnummer ↔ Cliento
- [x] J-1.4 `ccoPatientMasterStore.js`
- [x] J-1.5 `ccoMigrationIndexStore.js`
- [x] J-1.6 `ccoPatientMaster.js` router
- [x] J-1.7 `ccoMigration.js` router
- [x] J-1.8 Migration-index — **1 981 Drive-profiler prod** · 57 558 filer indexerade totalt

**Prod-verify:** `npm run verify:customer-list-prod` PASS (7349 kunder, 1981 profiler, sök ~300ms).

### Fas J-2 — Kundkort UI ☑

- [x] J-2.1 Kundlista: sök, filter, flaggor
- [x] J-2.2 Kundkort flikar (Profil | Journal | Filer)
- [x] J-2.3 Chips: Kopplad, Importerad journal, flaggor

### Fas J-3 — Journalmodul ☑

- [x] J-3.1 `ccoJournalStore.js` — signering, låsning, rättelse
- [x] J-3.2 `ccoJournal.js` — audit läsning + skrivning
- [x] J-3.3 TP-journal 38 fält
- [x] J-3.4 Historisk import PDF
- [x] J-3.5 Bildmetadata + journal-photos
- [x] J-3.6 Patient360 bridge
- [x] J-3.7 Journal readout i workspace

### Fas J-4 — Patient-resa ☑

- [x] J-4.1 Mount `ccoConsultations`
- [x] J-4.2 Mount `ccoAftercare` + `ccoOperations`
- [x] J-4.3 Mount `ccoPatientSystemStore`

> **Verify 2026-05-24:** Routers monterade i `server.js` (~rad 2007–2029). Unit **23/23 PASS** (consultations, aftercare, operations, patientSystemStore).

### Fas J-5 — Offerter & avtal ☑ (kod)

- [x] J-5.1 Offertmallar (14 Word)
- [x] J-5.2 Offertmodul + statusflöde
- [x] J-5.3 Avtal/e-sign + betänketid

> **Verify 2026-05-24:** 14 docx i `MA-Archive/`. `ccoCommercial` + `ccoTreatmentAgreement` routes + betänketid i store. Unit **10/10 PASS** (commercial 3, agreement 4, coolingOff 3). Prod-resa på piloter ej genomförd (se DEL 1 MA-C).

### Fas J-10 — Mobil journal (personal) ☑ (automation) / prod auth ⚠

- [x] J-10.1 Ta bild, HEIC, PWA, deep link, QR, batch
- [x] J-10.2 Mobil UX sweep #1–16 prod
- [~] J-10.3 Prod smoke (`verify:cco-mobile-pilot-prod`, `verify:staff-ui-prod`)
- [x] J-10.4 Instruktion: [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md)
- [x] J-10.5 STAFF-konton sjuksköterskor (Clara, Louise, Veronica, Wendela) + första-inloggning lösenord
- [~] J-10.6 **Pilot 5.5** — enhetstabell (iPhone/Android/iPad) — uppskjuten
- [~] J-10.7 **Pilot 5.6** — ≥5 konsultationer i fält — uppskjuten
- [~] J-10.8 Personal läst instruktion — hanteras externt

> **Verify 2026-05-24:** Statisk smoke **PASS** (readyz, PWA, bundle, journal-UI, auth-gates 401). UX sweep unit **PASS**. Auth-beroende smoke **FAIL** lokalt — `get-prod-auth-token` (STAFF + OWNER) misslyckades; uppdatera `.env`-credentials och kör om. Instruktionsdoc + `provision-nurse-staff-prod.js` + `mustChangePassword`-flöde finns i repo.

### Fas J-6 — Bookingmotor

- [x] J-6A Plan A — publik `/boka` GO 2026-05-24
- [x] J-6A Operatörsbekräftelse 3/3 prod
- [x] J-6.1 Full behandlingskatalog på webben (11 Plan A-tjänster)
- [ ] J-6.2 Egen engine — Cliento ut
- [x] J-6.3 **Koppling bokning → behandlingstillfälle → journal**

> **Verify 2026-05-25:** Publik catalog **200** (11 tjänster). Plan A E2E **PASS** (PA-21–24). Webb-reservation → `consultation_plan` + `treatmentEncounterId` **PASS** prod. `ccoJournalBookingBridge` + TL-B.1 (Ta bild→encounter) live. Resend patient-mail **ej live** (se U5A.4).

### Fas J-7 — Påminnelser ~ (scheduler-kö, ej utskick)

- [~] J-7.1 Scheduler triggers per kund
- [~] J-7.2 Eftervård, formulär, återbesök

> **Verify 2026-05-25:** `cco_customer_reminders` scheduler-job + `buildCustomerReminderQueue` (besök ≤48h + aftercare-heuristik). Påminnelser **loggas** i `cco-patient-care-state.json` — **ingen SMS/mail/Resend-utsändning** än (U5B.1–U5B.2 delvis).

### Fas J-8 — CCO-agent ~ (scheduler + ops API, ej full agent)

- [~] J-8.1 Daglig rapport: saknade formulär/samtycken
- [~] J-8.2 Journalutkast (human approval)

> **Underlag (finns i repo):**
> - Spec: [cco-patient-journal-build-plan.md](./cco-patient-journal-build-plan.md) **Fas 8** (8.1–8.2)
> - Utrullning: [ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md) **6A** (rapport + journalutkast + gateway + scheduler/OWNER notify)
> - Arkitektur: [execution-gateway-contract.md](../architecture/execution-gateway-contract.md) (`review_required` pipeline)
> - Masterplan: [arcana-master-plan-punktvis.md](./arcana-master-plan-punktvis.md) §8.3 (CCO-agent) + §8.7 (obligatorisk pipeline)
> - Bokning: [cco-booking-mvp-spec.md](./cco-booking-mvp-spec.md) Fas 3 (agent flaggar saknade steg / saknad dokumentation)
>
> **Relaterat i kod (annat scope än J-8):**
> - Inbox-CCO: `src/agents/ccoInboxAgent.js` + `AnalyzeInbox` (mail/leadflows, `manual_review_required`)
> - Ops KPI: `nightly_pilot_report` → `src/reports/pilotReport.js` (template/risk/audit — **inte** saknade formulär)
> - COO brief + CCO digest: `cooDailyBriefAgent.js`, `dailyDigest.js` / scheduler
>
> **Byggblock för J-8 (delvis):**
> - `ccoPatient360Bridge.js` (consent/status), `ccoTreatmentBookingGate.js`, `ccoJournalStore.js` (draft/signed)
> - `executionGateway.js` (`review_required`), manuella journalutkast i `patient-master-ui.js`
>
> **Verify 2026-05-25:** J-8.1 `cco_daily_missing_forms_report` scheduler + JSON i `reportsDir` + `GET /api/v1/ops/cco-care/missing-forms-report` + manuell `POST /ops/cco-care/run-missing-forms`. J-8.2 `cco_journal_draft_proposals` + pending-förslag i `ccoPatientCareStateStore` + `GET /ops/cco-care/draft-proposals`. **Ej prod-agent:** ingen OWNER-notify, ingen execution-gateway/auto-apply, human approval i UI saknas fortfarande.

### Fas J-9 — Compliance ☐ (delvis)

- [x] J-9.0 PDL juridiskt signerat + Render EU (grund)
- [~] J-9.1 Retention 10 år i config + policy
- [~] J-9.2 GDPR export-endpoint
- [~] J-9.3 GDPR spärr/radering + audit
- [~] J-9.4 Art. 30 + PUB uppdaterade

> **Verify 2026-05-25:** Repo-kopior uppdaterade: `docs/legal/art-30-register-maj-arcana.md` (A1–A7 Arcana-behandlingar) + `docs/legal/personuppgiftspolicy-pub-maj-arcana.md` (utkast). Excel/DOCX i `MA-Archive/juridik-gdpr/` kvar som master — **juristgranskning före sign-off**.

---

## DEL 3 — Utrullning go-live ([ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md))

> **Verify 2026-05-25:** Prod `1d15c0b`. Kundbas **7217** (efter duplicate-cleanup). Drive API **konfigurerad**; migration-index pushad med **49103/57558** `driveFileId`; PDF-stream **200** via Drive (ej zip). Verify-scripts fixade (ignorera stale `ARCANA_OWNER_TOKEN` i `.env`).

### Utrullning 1 — Mobil pilot GO ☑

- [x] U1.1 Kod prod: `/staff`, journal-API, HEIC, PWA, deep link
- [x] U1.2 Mobil UX sweep #1–16
- [x] U1.3 5 pilotkunder + deep links
- [x] U1.4 Prod-automation grön (full kundbas 7217+ efter duplicate-cleanup)
- [x] U1.5 Login krävs (`OPEN_ACCESS=false`)
- [~] U1.6 Manuell enhetspilot 5.5–5.6 — uppskjuten

> **Verify:** Statisk smoke **PASS** (PWA, bundle, journal-UI, 401-gates). UX sweep unit **PASS**. Kundbas **7217** på prod (CL-01 mål ≥7000). Auth-beroende Playwright-smoke kräver fälttest (U1.6).

### Utrullning 2 — Auth / MFA 🔄

- [x] U2.1 `ARCANA_STAFF_JOURNAL_OPEN_ACCESS=false`
- [~] U2.2 OWNER MFA enforced prod (`verify:auth-go-live-prod`)
- [x] U2.3 STAFF-konton (generiskt + 4 sjuksköterskor)
- [~] U2.4 STAFF login verifierad i fält (iPhone/Android) — automation `verify:staff-mobile-login-prod`; fysisk enhet kvar
- [x] U2.5 Rollback-plan + underhållsfönster **dokumenterat** — [auth-go-live-rollback-runbook.md](../ops/runbooks/auth-go-live-rollback-runbook.md) (2026-05-25)
- [x] U2.5b Underhållsfönster **i produkt** — `GET /api/v1/ops/maintenance-window` + STAFF-banner + CSS; env `ARCANA_MAINTENANCE_WINDOW_*`
- [x] U2.6 Backup journal-photos schemalagd (`journal_photos_backup` i scheduler)

> **Verify 2026-05-25 (sweep):** Open access **av**. OWNER MFA **kod klar** men prod env fortfarande `false`. **5 STAFF** på prod. **U2.5b PASS (kod):** maintenance API + banner + CSS + unit tests — **prod endpoint ej deployad än** (`GET /api/v1/ops/maintenance-window` → 404 tills deploy).

### Utrullning 3 — Drive-PDF + bred drift → **AKTIV**

- [x] U3.1 **Drive-PDF på prod** — Google Drive API (ej 86 GB zip på 2 GB disk)
- [~] U3.2 Drive-filer visningsbara i Filer-fliken prod — UI **saknar Drive-koppling** för filer utan `driveFileId`; ~15% kvar (8455/57558)
- [~] U3.3 Personal utbildad + journalför i MA — externt
- [x] U3.4 Notion: verify prod efter duplicate-cleanup (2026-05-25 — readyz, blueprint in_sync, verify:migration-prod PASS, needsReview 0)

> **Verify 2026-05-25 (sweep):** `driveApiConfigured=true`, zipCount=0, **57558** filer / **1981** profiler. Index **49103/57558** `driveFileId` (journal_pdf **3482/5313**). Filer med `driveFileId` streamar **200** (Drive). Filer utan: API `404 drive_link_missing` + Filer-fliken visar etikett **saknar Drive-koppling** (ej trasig länk). Kör `migration:enrich-drive-ids` för resterande matchning.

### Utrullning 4 — Post-op Fas 1 🔄

- [x] U4.1 Backend: capability + store + routes (kod)
- [x] U4.2 `/uppfoljning/[token]` + CCO-knapp (kod)
- [x] U4.3 Unit tests + runbook
- [x] U4.4 Graph send live (`verify:graph-send-prod` / `verify:post-op-graph-prod`)
- [x] U4.5 4 beslut (patientkanal, avsändare, retention, UI) — [u4-post-op-decisions.md](./u4-post-op-decisions.md)
- [x] U4.6 Playwright smoke `/uppfoljning/[token]` (`verify:post-op-uppfoljning-prod`, `test:playwright:post-op`)

> **Verify 2026-05-25:** U4.5 **PASS** (låsta beslut + config defaults). U4.4 **PASS** — `verify:graph-send-prod` grön (Graph sendEnabled + sendMail live). U4.6 **PASS** — `verify:post-op-uppfoljning-prod` fetch smoke + `test:playwright:post-op` lokal submit-flow.

### Utrullning 5 — Bookingmotor & påminnelser 🔄

- [x] U5A.1 Plan A webb → Arcana API
- [x] U5A.2 Operatör confirm prod
- [x] U5A.3 Plan A automated sign-off
- [ ] U5A.4 Bekräftelsemail patient (Resend) — **BLOCKED** (`RESEND_API_KEY` saknas)
- [x] U5A.5 Bokning → tillfälle → journal ( = J-6.3)
- [~] U5B.1 Påminnelse före besök
- [~] U5B.2 Eftervård / formulär / återbesök triggers
- [ ] U5B.3 Post-op auto-trigger (Q4)

> **Verify 2026-05-25:** Publik catalog **200** (3 tjänster). Plan A curl E2E **PASS**. Bokning→journal **PASS**. U5A.4 **BLOCKED:** `RESEND_API_KEY` saknas — kodväg klar (`transactionalMailer`), `@example.com` blockeras; steg: [resend-domain-go-live.md](../ops/resend-domain-go-live.md). **U5B delvis:** samma `cco_customer_reminders`-jobb som J-7 — kö + audit-logg, **ingen patient/operatör-utsändning** (Resend/Graph).

### Utrullning 6 — Agenter + CMO + patientkanal ☐

- [ ] U6A CCO-agent ( = J-8)
- [ ] U6B CMO live connectors (fixture → live) — [cmo-v3-rollout-plan.md](./cmo-v3-rollout-plan.md)
- [ ] U6C CAO admin-operator — [cao-arcana-admin-operator-implementation-plan.md](./cao-arcana-admin-operator-implementation-plan.md)
- [~] U6D Patientkanal (canon: sist)

> **Verify 2026-05-25:** Minimal hub `GET /patient` (länkar till chatt + patientinfo). Monitor-endpoint `GET /api/v1/monitor/patient-channel` oförändrad. **Ej** full patientkanal/conversion-loop i produkt.

---

## DEL 4 — Journal tidslinje / tillfälle (ny UX-roadmap)

Mål: all info (bilder, formulär, journal, offert) i **segment per behandlingstillfälle med datum** — se [JOURNAL-DATAMODELL.md](./JOURNAL-DATAMODELL.md).

> **Verify 2026-05-25:** TL-A live i prod (pilot). **Tidslinje-flik** (desktop + mobil) med enhetlig vy journal+filer per tillfälle + filter. Encounter-store + booking-bridge + foto→`encounterId`. Journal-fliken behåller redigeringsformulär (platt lista).

### Tidslinje A — Nu (pilot) ☑

- [x] TL-A.1 Ta bild → behandlingsplan (öppen plan tills signering)
- [x] TL-A.2 Rutin: ny plan efter signering = nytt besök

> **Verify:** `POST /api/v1/cco-journal/photo` → `ensureConsultationPlan` + attachment på `consultation_plan`. Signerad plan → upload **409** + knapp **Behandlingsplan** (`new-consultation-plan`). Unit **12/12 PASS** (`ccoJournalPlan`, `ccoJournalPhoto`).

### Tidslinje B — Tillfälle + datosegment ☑ (backend + Tidslinje-flik)

- [x] TL-B.1 Auto-skapa `behandlingstillfälle` vid Ta bild eller bokning
- [x] TL-B.2 Nya foton kopplas till `encounterId`
- [x] TL-B.3 Datosegment i **Tidslinje**-flik (enhetlig journal+filer per tillfälle)

> **Verify:** **Bokning + foto:** `ccoJournalBookingBridge` + `patchConsultationPhotoEncounter`. **Tidslinje-flik:** `renderUnifiedTimelinePanel` + filter (Konsultation/Behandling/Uppföljning/Arkiv). **Journal-fliken:** redigeringsformulär (platt lista). **Filer-fliken:** `groupFilesByOccasion` (Kundhistorik).

### Tidslinje C — Alla journaltyper per tillfälle ☐

- [ ] TL-C.1 Hälsodekl + friskförsäkran under rätt tillfälle
- [ ] TL-C.2 TP / PRP / uppföljning under rätt tillfälle
- [ ] TL-C.3 Bokning öppnar rätt segment automatiskt
- [ ] TL-C.4 Signering låser tillfälle

> **Verify:** Hälsodekl/TP/PRP/uppföljning = separata poster i platt journal-lista (ej grupperade per tillfälle). Signering låser **journalpost** (`entry.locked`), inte encounter. Plan visar `treatmentEncounterId` om satt från bokning — ingen auto-scroll till segment.

### Tidslinje D — Enhetlig mobil tidslinje ~ (Tidslinje-flik live)

- [x] TL-D.1 Vy: Profil (identitet) + **Tidslinje** + Filer (mobil + desktop Tidslinje-flik)
- [~] TL-D.2 Drive-import som “Arkiv”-segment längst ner
- [x] TL-D.3 Filter: Konsultation / Behandling / Uppföljning / Arkiv

> **Verify 2026-05-25:** Flikar: **Profil · Journal · Tidslinje · Avtal · Filer** (desktop) / **Profil · Tidslinje · Filer** (mobil). Tidslinje: `renderUnifiedTimelinePanel` + filter (Konsultation/Behandling/Uppföljning/Arkiv) + CSS i `cco-polish.css`. Filer: `timelineLabel` inkl. **Arkiv YYYY**. TL-D.2 Drive-arkiv som segment **delvis** (filer grupperas, full import-segmentation ej komplett).

---

## DEL 5 — Infra & backlog

> **Verify 2026-05-25:** Prod `1d15c0b`. Alla INF-punkter gröna. Backlog medvetet opåbörjad.

### Infra ☑

- [x] INF.1 Prod `major-arcana` + custom domain
- [x] INF.2 Render blueprint + post-deploy heal
- [x] INF.3 Migration state push API
- [x] INF.4 Pilot-verify scripts
- [x] INF.5 Full Drive-historik på prod ( = U3.1)

> **Verify INF.1:** `arcana.hairtpclinic.se` + `ma.hairtpclinic.se` → **200** readyz. Service `srv-d6b11o0boq4c73chm7f0`.
> **Verify INF.2:** `verify-render-blueprint-link.sh` **PASS** (in_sync, autoSync=true). Workflow `arcana-post-deploy-heal` + `post-deploy-prod-heal.sh` finns.
> **Verify INF.3:** `POST /api/v1/cco-migration/push-state-file` i `ccoMigration.js`; `npm run push:migration-state-prod`. Push + restart verifierad (migration-index 51 MB).
> **Verify INF.4:** 10+ verify-skript (`verify-pilot-journey-prod`, `verify-all-pilot-journey-prod`, `verify-cco-mobile-pilot-prod`, m.fl.) + npm scripts i `package.json`.
> **Verify INF.5:** `driveApiConfigured=true`, zipCount=0, **57558** filer / **1981** profiler. PDF-stream **200** via Drive API (ej zip). `verify:migration-prod` + `verify:customer-list-prod` **PASS**.

### Backlog (medvetet senare) ☐

- [ ] BL.1 Mobil månadskalender (#17 UX sweep)
- [ ] BL.2 cco-next-release parity (#18)
- [ ] BL.3 Android enhetstest (valfritt)
- [ ] BL.4 Executive OS expand (CFO/COO agenter) — [arcana-master-plan-punktvis.md](./arcana-master-plan-punktvis.md)

> **Verify BL.1:** UX sweep #17 = **backlog** i `cco-mobile-ux-sweep-plan.md` (dag-kalender finns, full månadskalender saknas).
> **Verify BL.2:** `public/cco-next-release/` mountad i `server.js` men **canonical UI = major-arcana-preview**; parity #18 ej genomförd.
> **Verify BL.3:** Ingen Android Playwright/CI — endast manuell checklista (`cco-mobile-staff-pilot-checklist.md`).
> **Verify BL.4:** CFO/COO-referenser i orchestrator/capabilities finns; full Executive OS-expand enligt masterplan **ej påbörjad**.
> **J-8 underlag:** se Fas J-8 ovan — spec + gateway + byggblock finns; prod-agent saknas.

---

## Snabb verify (kör vid tvivel)

```bash
npm run verify:staff-ui-prod
npm run verify:cco-mobile-pilot-prod
npm run verify:customer-list-prod
npm run verify:auth-go-live-prod
npm run verify:booking-plan-a-prod
curl -fsS https://arcana.hairtpclinic.se/readyz
```

---

## Referens — fasnamn i olika dokument

| Dokument | Faser | Antal |
|----------|-------|-------|
| MA-dokumentplan | A, B, C, D, 6 | 5 |
| Journal-byggplan | 0–10 (+ 6–9 kvar) | 11 |
| Utrullning | 1–6 | 6 |
| Tidslinje UX | A–D | 4 |
| **Denna lista** | **DEL 1–5, ~120 punkter** | **Allt i ordning** |
