# Major Arcana — samlad faslista (en sida)

Senast uppdaterad: **2026-05-25** (Resend live + Plan A 3-tjänster + Notion-sync)  
Prod: **https://arcana.hairtpclinic.se** · Repo: `~/Code/major-arcana`

**Du är här:** **U5A.4 Resend ☑** · **Plan A katalog ☑** (3 möten) · **U2.2 MFA** (väntar go-live) · **U5B.3** Q4.

**Notion (bockbar kopia):** [Major Arcana — Master TODO](https://www.notion.so/6d5ae9dabf314678959270ba86a6cbf6) — synkad 2026-05-25 Resend-svep (se `NOTION-SYNC-MANIFEST.md`)

Detaljspecer: [PROJECT-CHECKLIST.md](./PROJECT-CHECKLIST.md) · [ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md) · [cco-patient-journal-build-plan.md](./cco-patient-journal-build-plan.md) · [ma-document-placement-plan.md](./ma-document-placement-plan.md)

**Tecken:** ☑ klart · ☐ kvar · ~ uppskjutet / valfritt · → pågår

---

## Snabb ordning (vad som kommer härnäst)

```
☑ MA A–D + avtalsgate + journal 0–5 + mobil automation
☑ Utrullning 3: Drive-PDF + bred drift (PDF-stream live)
☑ G4 våg 1: schema-katalog + hälsodekl/friskförsäkran/TP-journal UI
☑ G4 våg 2a: PRP-journal (16412/14988)
☑ G4 våg 2b: Uppföljning (16407/16409/16390)
☑ G4 våg 3: Ögonlocksjournal (16388)
☑ TL-C: journaltyper grupperade per tillfälle
☑ Prod-verify: pilotresan 5/5 (`verify-all-pilot-journey-prod.sh` — MA-B.3, MA-C.2, MA-D, MA-6.2)
☑ Kundmaster §1 ([CCO-SYSTEM-SCOPE.md](./CCO-SYSTEM-SCOPE.md) — merge, GDPR-export, journalspärr, etiketter)
☑ Utrullning 4: Post-op Fas 1 live (Graph + patient-UI smoke)
☑ U3.2 Drive enrich + index push prod
☑ Paket A: compliance/docs/verify + underhållsfönster + mobil smoke + TL-D.2
☑ Paket B: U5A.4 Resend live · publik webb-API av (policy)
☑ J-7 + U5B.1–2 backend (`verify:cco-care-sweep-prod` CC-08–11)
→ U2.2 OWNER MFA (explicit go-live)
→ Utrullning 6: CMO + patientkanal
```

---

## Doc-sync svep ☑ (2026-05-25)

Prod-audit + `npm run verify:cco-care-sweep-prod` — avbockat i repo:

| Punkt | Verdict | Evidens |
|-------|---------|---------|
| J-7.1 / J-7.2 | ☑ | Scheduler `cco_customer_reminders`; CC-11 queue total 20 |
| J-8.1 | ☑ | `missing-forms-report` API + STAFF UI (`ArcanaCcoCarePanel` formulär-flik); CC-09 200 patients |
| U5B.1 / U5B.2 | ☑ | = J-7 (operatörs-digest, ej patient-SMS) |
| U2.5b | ☑ | CC-02 `GET /ops/maintenance-window` |
| J-8.2 | ☑ | API + scheduler + kundkort UI (`review-draft-proposal`) |
| U2.2 MFA | ~ | `ARCANA_AUTH_OWNER_MFA_REQUIRED=false` prod — **ej enforced** |
| Publik webb-bokning | av | Catalog **503** `public_web_booking_disabled` (policy) |

---

## Resend + Plan A svep ☑ (2026-05-25)

| Punkt | Verdict | Evidens |
|-------|---------|---------|
| U5A.4 Resend | ☑ | `RESEND_API_KEY` på Render · `resend.configured=true` prod · OWNER `POST /ops/mail/transactional-probe` → `provider: resend`, `mode: live` |
| Plan A publik katalog | ☑ | `72f852a` — `PLAN_A_PUBLIC_SERVICE_IDS` = 3 möten · staff catalog **3/3** `publicBookable` (prod verify) |
| Resend domän | ☑ | `verify:resend-domain-prod` RB3b-01–04 PASS (`hairtpclinic.com` verified, `booking@hairtpclinic.com`) |

> **Policy oförändrad:** publik `/api/public/booking-engine/*` **503** tills explicit go-live. Resend gäller CCO/intern bokning + transactional mail.

---

## Paket A + B (status efter audit)

| Paket | Punkter | Status |
|-------|---------|--------|
| **A** | J-9.1 · J-9.4 · J-10.3 · U2.5b · TL-D.2 | ☑ |
| **B** | U5A.4 Resend | ☑ |
| **B** | U2.2 OWNER MFA enforced | ~ (väntar `apply:auth-go-live-prod`) |
| **Policy** | Publik `/api/public/booking-engine/*` | av (503 tills explicit go-live) |

> Nästa kod-svep: **BL.5 adaptive layout** eller **J-6.2**. MFA (D) sist. U5B.3 Q4.

---

## Kundmaster — scope §1 ☑ ([CCO-SYSTEM-SCOPE.md](./CCO-SYSTEM-SCOPE.md))

- [x] Unikt patientregister (personnummer, kontakt, flaggor)
- [x] Cliento-import + Drive-filkoppling
- [x] Kundlista: sök, filter, profil/journal/filer
- [x] Sammanfoga dubbletter (Identitet: grupper, merge, ignorera)
- [x] GDPR-utdrag (`GET /cco-patient-master/patient/gdpr-export` + UI)
- [x] Journalspärr per patient (`PUT /patient/access`, skriv blockeras)
- [x] Importerad / webbokning / ny — chips (`patientOrigin`)

> **Verify 2026-05-25:** Prod `09b7884` deploy + Render restart. Unit PASS. Pilot 5/5 PASS efter E2E-återställning. Testa GDPR-export + journalspärr i kundkort.

---

## DEL 1 — MA klinik & dokument ([ma-document-placement-plan.md](./ma-document-placement-plan.md))

### Fas MA-A — Arkiv & dokumentindex ☑

- [x] MA-A.1 `MA-Archive/` (juridik, cliento, journal-zips, offert-word, sharepoint)
- [x] MA-A.2 Juridik-index + Gabrielle Handler-flöde
- [x] MA-A.3 SharePoint-sync (`scripts/sync-sharepoint-archive.sh`)
- [x] MA-A.4 Offertmallar 14 docx (`scripts/sync-offert-archive.sh`)
- [x] MA-A.5 `JOURNAL-DATAMODELL.md` i repo

> **Verify 2026-05-24:** `MA-Archive/` OK (5/5 SharePoint, 14 docx under `offert-word/Offertmallar/`). Juridik-index: `docs/legal/juridik-gdpr/INNEHALL-OCH-NYCKELPUNKTER.md`.

### Fas MA-B — Pilotkunder ☑

- [x] MA-B.1 5 pilotkunder + `data/pilot-patients.json`
- [x] MA-B.2 Importerade till prod + historik per kund
- [x] MA-B.3 Journal (plan, TP, signering) verifierad i prod

> **Verify 2026-05-25:** Alla 5 piloter på prod. Efter `run-pilot-e2e-prod.sh` (×5): `health_declaration:1`, `consultation_plan:1` per kund. `verify-all-pilot-journey-prod.sh` **5/5 PASS** (gate open, offert accepted, avtal bookable). Återställning efter oavsiktlig full state-push av journal.

### Fas MA-C — Behandlingsavtal ☑

- [x] MA-C.1 Spec + store + routes + UI (Avtal-flik)
- [x] MA-C.2 Konsultation → offert → avtal → signering utan GetAccept

> **Verify 2026-05-25:** Prod-piloter: `offert=accepted`, `avtal=bookable`, gate open (5/5). Flödet genomfört via E2E + verify-script.

### Fas MA-D — Hälsodekl & friskförsäkran ☑ (kod)

- [x] MA-D.1 Formulär i app + gate före behandlingsplan
- [x] MA-D.2 Signering/lås via journal-API

> **Verify 2026-05-25:** Prod: `hälsodekl=1` på alla 5 piloter (signerad via E2E). UI + API i repo.

### Fas MA-6 — Bokning vs avtal ☑

- [x] MA-6.1 Bokning spärrad tills `agreementStatus === 'bookable'`
- [x] MA-6.2 E2E prod alla 5 pilotkunder (`verify-all-pilot-journey-prod.sh`)

> **Verify 2026-05-25:** Unit 7/7 PASS. Prod **5/5 PASS** — Dino Placo, Jonas Lundvall, Johan Nguyen, Oscar Sandklef, Axel Meijer (`gate=open`, `hälsodekl=1`, `plan≥1`). Script: `bash scripts/verify-all-pilot-journey-prod.sh`.

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
- [x] J-3.3 TP-journal — **52 Meridiq-fält** schema-driven (mall **16411**, `journal-tp-schemas.js`)
- [x] J-3.3b PRP-journal — **schema-driven** (`journal-prp-schemas.js`, mall **16412** + **14988**)
- [x] J-3.3c Uppföljning 4/6/12 mån — schema-driven (`journal-follow-up-schemas.js`)
- [x] J-3.3d Ögonlocksjournal — schema-driven (`journal-bleph-schemas.js`, mall **16388**)
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
- [x] J-10.3 Prod smoke (`verify:cco-mobile-pilot-prod`, `verify:staff-ui-prod`) — Paket A ☑
- [x] J-10.4 Instruktion: [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md)
- [x] J-10.5 STAFF-konton sjuksköterskor (Clara, Louise, Veronica, Wendela) + första-inloggning lösenord
- [~] J-10.6 **Pilot 5.5** — enhetstabell (iPhone/Android/iPad) — uppskjuten
- [~] J-10.7 **Pilot 5.6** — ≥5 konsultationer i fält — uppskjuten
- [~] J-10.8 Personal läst instruktion — hanteras externt

> **Verify 2026-05-24:** Statisk smoke **PASS** (readyz, PWA, bundle, journal-UI, auth-gates 401). UX sweep unit **PASS**. Auth-beroende smoke **FAIL** lokalt — `get-prod-auth-token` (STAFF + OWNER) misslyckades; uppdatera `.env`-credentials och kör om. Instruktionsdoc + `provision-nurse-staff-prod.js` + `mustChangePassword`-flöde finns i repo.

### Fas J-6 — Bookingmotor

- [x] J-6A Plan A — publik `/boka` GO 2026-05-24 *(API av på prod: `ARCANA_PUBLIC_WEB_BOOKING_ENABLED=false`)*
- [x] J-6A Operatörsbekräftelse 3/3 prod
- [x] J-6.1 Publik Plan A — **3 möten** på webben *(intern katalog 11 tjänster; `72f852a` fix)*
- [x] J-6.2 Egen engine — Cliento ut *(CCO Plan A live; publik API + Cliento av — policy)*
- [x] J-6.3 **Koppling bokning → behandlingstillfälle → journal**

> **Verify 2026-05-25:** Plan A E2E **PASS** (CCO/intern). Staff catalog **3** publika tjänster (`consultation-online`, `consultation-physical`, `followup-transplant`). **Publik webb-API av** (`public_web_booking_disabled` — policy). **Cliento proxy av** (`cliento_booking_disabled`). Resend **live** (U5A.4 — Render key + transactional-probe). Bokning→journal **PASS** (J-6.3).

### Fas J-7 — Påminnelser ☑ (backend)

- [x] J-7.1 Scheduler triggers per kund
- [x] J-7.2 Eftervård, formulär, återbesök

> **Verify 2026-05-25:** `cco_customer_reminders` enabled prod. `buildCustomerReminderQueue` (besök + aftercare). Operatörs-digest via Graph — **ej patient-SMS**. `npm run verify:cco-care-sweep-prod` CC-11 PASS.

### Fas J-8 — CCO-care ☑

- [x] J-8.1 Daglig rapport: saknade formulär/samtycken
- [x] J-8.2 Journalutkast (human approval) — API + scheduler + godkänn/avvisa i Journal-fliken

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
> **Verify 2026-05-25:** J-8.1 **live** (CC-09) + STAFF UI care panel. J-7 **live** — påminnelser-flik i `cco-care-panel.js`. J-8.2 **live** — global utkast-lista i care panel + `review-draft-proposal` i `patient-master-ui.js`. AI sweep: SummarizeThread (`thread-ai-summary.js`), RefineReplyDraft/PrepareResponseDrafts/RecordDraftFeedback i `app.js`. Full autonom agent (U6A) kvar.

### Fas J-9 — Compliance ☑ (Paket A)

- [x] J-9.0 PDL juridiskt signerat + Render EU (grund)
- [x] J-9.1 Retention 10 år i config + policy — Paket A ☑
- [x] J-9.2 GDPR export-endpoint — `GET /cco-patient-master/patient/gdpr-export` + knapp i kundkort
- [x] J-9.3 GDPR spärr/radering + audit — journalspärr per patient ☑; anonymize via capability
- [x] J-9.4 Art. 30 + PUB uppdaterade — Paket A ☑

> **Verify 2026-05-25 (Paket A):** `journalRetentionYears=10` i config. Policy + Art.30/PUB avbockade i fasplan. GDPR export/spärr i patientmaster live.

---

## DEL 3 — Utrullning go-live ([ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md))

> **Verify 2026-05-25:** Prod restart + `verify:migration-prod` **PASS**. Index **56554/57558** `driveFileId` (98,3%). `push:migration-state-prod --index-only` **fixad** — använd **endast** `--index-only` (rör ej `cco-journal.json`). Pilot **5/5 PASS** efter `run-pilot-e2e-prod.sh` (återställd efter oavsiktlig full state-push). Orchestration: `npm run resolve:open-track`, `npm run sync:notion-master-todo`.

### Utrullning 1 — Mobil pilot GO ☑

- [x] U1.1 Kod prod: `/staff`, journal-API, HEIC, PWA, deep link
- [x] U1.2 Mobil UX sweep #1–16
- [x] U1.3 5 pilotkunder + deep links
- [x] U1.4 Prod-automation grön (full kundbas 7217+ efter duplicate-cleanup)
- [x] U1.5 Login krävs (`OPEN_ACCESS=false`)
- [~] U1.6 Manuell enhetspilot 5.5–5.6 — uppskjuten

> **Verify:** Statisk smoke **PASS** (PWA, bundle, journal-UI, 401-gates). UX sweep unit **PASS**. Kundbas **7217** på prod (CL-01 mål ≥7000). Auth-beroende Playwright-smoke kräver fälttest (U1.6).

### Utrullning 2 — Auth / MFA ~ (open access av · MFA väntar)

- [x] U2.1 `ARCANA_STAFF_JOURNAL_OPEN_ACCESS=false`
- [~] U2.2 OWNER MFA enforced prod — **väntar explicit go-live** (`ARCANA_AUTH_OWNER_MFA_REQUIRED=false` prod 2026-05-25)
- [x] U2.3 STAFF-konton (generiskt + 4 sjuksköterskor)
- [ ] U2.4 STAFF login verifierad i fält (iPhone/Android)
- [x] U2.5 Rollback-plan + underhållsfönster **dokumenterat** — [auth-go-live-rollback-runbook.md](../ops/runbooks/auth-go-live-rollback-runbook.md) (2026-05-25)
- [x] U2.5b Underhållsfönster **i produkt** (P2) — ☑ (`GET /ops/maintenance-window` + STAFF-banner)
- [x] U2.6 Backup journal-photos schemalagd (`journal_photos_backup` i scheduler)

> **Verify 2026-05-25:** Open access **av**. U2.5b CC-02 PASS. U2.2 **ej enforced** — kör `apply:auth-go-live-prod` vid go-live. U2.4 fältlogin kvar.

### Utrullning 3 — Drive-PDF + bred drift ☑

- [x] U3.1 **Drive-PDF på prod** — Google Drive API (ej 86 GB zip på 2 GB disk)
- [x] U3.2 Drive-filer visningsbara i Filer-fliken prod — enrich + `push:migration-state-prod --index-only` (sweep 2026-05-25)
- [~] U3.3 Personal utbildad + journalför i MA — externt
- [x] U3.4 Notion: verify prod efter duplicate-cleanup (2026-05-25 — readyz, blueprint in_sync, verify:migration-prod PASS, needsReview 0)

> **Verify 2026-05-25 (sweep):** Index **56988/57558** `driveFileId` (**99,0%**; 570 zip-rader utan Drive-match). `migration:enrich-drive-ids` + `push:migration-state-prod --index-only` + Render restart. `verify:migration-prod` **PASS**.

### Utrullning 4 — Post-op Fas 1 ☑

- [x] U4.1 Backend: capability + store + routes (kod)
- [x] U4.2 `/uppfoljning/[token]` + CCO-knapp (kod)
- [x] U4.3 Unit tests + runbook
- [x] U4.4 Graph send live (`verify:post-op-graph-prod`)
- [x] U4.5 4 beslut (patientkanal, avsändare, retention, UI) — [u4-post-op-decisions.md](./u4-post-op-decisions.md)
- [x] U4.6 Playwright smoke `/uppfoljning/[token]` prod (`verify:post-op-uppfoljning-prod`)

> **Verify 2026-05-25:** `verify:post-op-graph-prod` **PASS** (Graph sendEnabled, mail från kons@). `verify:post-op-uppfoljning-prod` **PASS** (POU-01–07). Beslut låsta i `u4-post-op-decisions.md`.

### Utrullning 5 — Bookingmotor ☑ / påminnelser →

- [x] U5A.1 Plan A webb → Arcana API
- [x] U5A.2 Operatör confirm prod
- [x] U5A.3 Plan A automated sign-off
- [x] U5A.4 Bekräftelsemail patient (Resend) — Paket B ☑ (`RESEND_API_KEY` Render · domän verified · transactional-probe live)
- [x] U5A.5 Bokning → tillfälle → journal ( = J-6.3)
- [x] U5B.1 Påminnelse före besök (= J-7.1)
- [x] U5B.2 Eftervård / formulär / återbesök triggers (= J-7.2)
- [ ] U5B.3 Post-op auto-trigger (Q4)

> **Verify 2026-05-25:** Publik catalog **503** (policy av). Plan A staff **3/3** publika tjänster. **U5A.4 Resend live** — `resend.configured=true`, OWNER mail-probe `provider:resend`. U5B.1–2 **PASS** (`verify:cco-care-sweep-prod` CC-11). U5B.3 medvetet Q4.

### Utrullning 6 — Agenter + CMO + patientkanal ☐

- [~] U6A CCO-agent ( = J-8) — J-8.1–8.2 ☑; full autonom agent kvar
- [ ] U6B CMO live connectors (fixture → live) — [cmo-v3-rollout-plan.md](./cmo-v3-rollout-plan.md)
- [ ] U6C CAO admin-operator — [cao-arcana-admin-operator-implementation-plan.md](./cao-arcana-admin-operator-implementation-plan.md)
- [ ] U6D Patientkanal (canon: sist)

> **Verify:** U6A = J-8 — **prod-agent ej byggd**; underlag (Fas 8, ROLLOUT 6A, gateway-contract) + byggblock finns. CMO/CAO/patientkanal separata planer.

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

### Tidslinje C — Alla journaltyper per tillfälle ☑

- [x] TL-C.1 Hälsodekl + friskförsäkran under rätt tillfälle
- [x] TL-C.2 TP / PRP / uppföljning / ögonlocksjournal under rätt tillfälle
- [x] TL-C.3 Bokning öppnar rätt segment automatiskt
- [x] TL-C.4 Signering låser tillfälle (encounter metadata)

> **Verify:** `syncJournalEntryToEncounter` på PUT entry · `lockEncounterOnJournalSign` på sign · tidslinje grupperar via `treatmentEncounterId` · auto-scroll vid bokningsplan.

### Tidslinje D — Enhetlig mobil tidslinje ~ (Tidslinje-flik live)

- [x] TL-D.1 Vy: Profil (identitet) + **Tidslinje** + Filer (mobil + desktop Tidslinje-flik)
- [x] TL-D.2 Drive-import som “Arkiv”-segment — Paket A ☑ (filter Arkiv + timelineLabel)
- [x] TL-D.3 Filter: Konsultation / Behandling / Uppföljning / Arkiv

> **Verify 2026-05-25 (Paket A):** Tidslinje-flik + filter **Arkiv**. Filer: `timelineLabel` inkl. **Arkiv YYYY** från migration.

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

- [x] BL.1 Mobil månadskalender (#17 UX sweep) — månadsvy + daglista i kalender-sheet
- [x] BL.2 cco-next-release parity (#18) — `/cco-next` → `/major-arcana-preview` redirect (canonical UI)
- [ ] BL.3 Android enhetstest (valfritt)
- [ ] BL.4 Executive OS expand — PR #6 delvis (6 agents); full masterplan-expand kvar
- [~] BL.5 Adaptive layout (Arcana/CCO web) — spec ☑ [cco-adaptive-layout-rules.md](./cco-adaptive-layout-rules.md); Fas 1–4 implementation ☐

> **Verify BL.1:** `booking-mobile-calendar-day.js` — månadsvy (nav, Idag, 7×6 grid, badge lediga/bokade), daglista under. `ArcanaBookingMobileCalendar.getViewMonth()`. Unit sweep PASS 2026-05-25.
> **Verify BL.2:** Prod **302** `/cco-next` → `/major-arcana-preview/` (`X-Arcana-Cco-Next-Redirect`). `resolveCcoNextPreviewRedirect.js` + `smoke:public` PASS 2026-05-25.
> **Verify BL.3:** Ingen Android Playwright/CI — endast manuell checklista (`cco-mobile-staff-pilot-checklist.md`).
> **Verify BL.4:** PR #6 gav 6 agents + capabilities; full Executive OS-expand enligt masterplan **ej påbörjad**.
> **J-8 underlag:** se Fas J-8 ovan — spec + gateway + byggblock finns; prod-agent saknas.

---

## Snabb verify (kör vid tvivel)

```bash
npm run verify:staff-ui-prod
npm run verify:cco-mobile-pilot-prod
npm run verify:cco-care-sweep-prod
npm run verify:customer-list-prod
npm run verify:auth-go-live-prod
npm run verify:booking-plan-a-prod
curl -fsS https://arcana.hairtpclinic.se/readyz
curl -fsS "https://arcana.hairtpclinic.se/api/public/booking-engine/catalog?host=hairtpclinic.com" | head -c 120
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
