# Major Arcana — samlad faslista (en sida)

Senast uppdaterad: **2026-05-25** (DEL 6 paritet + Notion-sync 169 punkter)  
Prod: **https://arcana.hairtpclinic.se** · Repo: `~/Code/major-arcana`

**Du är här:** Se **DEL 6** (full paritet Cliento + Meridiq) · öppna punkter i DEL 1–5 enligt ☐ nedan.

**Notion (bockbar kopia):** [Major Arcana — Master TODO](https://www.notion.so/6d5ae9dabf314678959270ba86a6cbf6) — synkad 2026-05-25 DEL 6 (169 P6-rader + referens, se `NOTION-SYNC-MANIFEST.md`)

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

> Nästa kod-svep: **DEL 6 runtime catalog wiring** · **U2.4 fälttest** · **BL.4 full expand**. MFA (D) sist.

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
- [x] U5B.3 Post-op auto-trigger — scheduler `post_op_auto_trigger` + `postOpAutoTrigger.js`

> **Verify 2026-05-25:** Publik catalog **503** (policy av). Plan A staff **3/3** publika tjänster. **U5A.4 Resend live**. U5B.1–2 **PASS** (`verify:cco-care-sweep-prod` CC-11). U5B.3 **PASS** (scheduler `post_op_auto_trigger`).

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
- [x] BL.3 Android enhetstest (valfritt) — Playwright Pixel 5 @ prod (`verify:android-staff-prod`)
- [~] BL.4 Executive OS expand — executive-feed API + SLO/governance hints; full masterplan-expand kvar
- [x] BL.5 Adaptive layout (Arcana/CCO web) — spec ☑ · Fas 0–5 ☑ · FormStep ☑ · desktop week ☑

> **Verify BL.1:** `booking-mobile-calendar-day.js` — månadsvy (nav, Idag, 7×6 grid, badge lediga/bokade), daglista under. `ArcanaBookingMobileCalendar.getViewMonth()`. Unit sweep PASS 2026-05-25.
> **Verify BL.2:** Prod **302** `/cco-next` → `/major-arcana-preview/` (`X-Arcana-Cco-Next-Redirect`). `resolveCcoNextPreviewRedirect.js` + `smoke:public` PASS 2026-05-25.
> **Verify BL.3:** `scripts/lib/mobilePlaywrightDevices.js` (Pixel 5 + Galaxy S9+). `npm run verify:android-staff-prod` + `test:visual:mobile:android`. Fysisk enhet kvar i `cco-mobile-staff-pilot-checklist.md` (valfritt).
> **Verify BL.5:** Tablet split inkl. kalender sidopanel. FormStep stepper på mobil+tablet (≤1023px): TP, hälsodekl, PRP, uppföljning, ögonlock, behandlingsavtal. `npm run verify:adaptive-layout-prod` (320/390/768/1024/1440). CC-10 read-only preview PASS.
> **J-8 underlag:** se Fas J-8 ovan — spec + gateway + byggblock finns; prod-agent saknas.

---

## DEL 6 — Full paritet Cliento + Meridiq (alla punkter)

**Prioritering:** P0 · P1 · P2 · P3 — se [CCO-SYSTEM-SCOPE.md §15](./CCO-SYSTEM-SCOPE.md#15-prioriterad-leveransordning)  
**Inventering:** [CLIENTO-INVENTORY.md](./CLIENTO-INVENTORY.md) · [MERIDIQ-INVENTORY.md](./MERIDIQ-INVENTORY.md) · [CCO-UNIFIED-SYSTEM-PLAN.md](./CCO-UNIFIED-SYSTEM-PLAN.md)

### 6.1 Kundmaster — P0 ☑

- [x] P6.1.1 Unikt patientregister (personnummer, kontakt, flaggor)
- [x] P6.1.2 Cliento-import (~7 349) + Drive-filkoppling
- [x] P6.1.3 Kundlista: sök, filter, profil / journal / filer
- [x] P6.1.4 Sammanfoga dubbletter (Identitet: grupper, merge, ignorera)
- [x] P6.1.5 GDPR-utdrag (profil + journal + filindex)
- [x] P6.1.6 Journalspärr per patient (`journalBlocked`)
- [x] P6.1.7 Etiketter Importerad / Webbokning / Ny
- [~] P6.1.8 ID-verifiering (legitimation) på patientkort — UI + store ☑; Meridiq import kvar
- [~] P6.1.9 Närmaste anhörig, viktig notering, adresser — UI + store ☑; full Meridiq-demografi kvar
- [ ] P6.1.10 Fortnox-kundnummer kopplat till patient

### 6.2 Bokning — publik — P0 / P1

- [x] P6.2.1 Egen bokningsmotor Plan A (tjänster, resurser, slots)
- [x] P6.2.2 Online konsultation + fysisk konsultation (publikt)
- [x] P6.2.3 Webb → Arcana reservation (kontakt, slot, hälsodeklarationsflagga)
- [x] P6.2.4 Plan A intern katalog — 3 publika tjänster (`72f852a`)
- [~] P6.2.5 Full publik katalog — legacy-catalog API + migration JSON ☑; runtime promote + go-live kvar
- [ ] P6.2.6 Alla **55 Cliento-tjänster** i engine (`migration/cliento-service-catalog.json` → runtime)
- [ ] P6.2.7 Alla **82 Meridiq-tjänster** mappade (`migration/meridiq-service-catalog.json` + `service-triple-map.json`)
- [ ] P6.2.8 VIP-länk / token-bokning (t.ex. uppföljning srvId **63017**, resId **11458** / **10326**)
- [ ] P6.2.9 Curatiio separat bokningsflöde (egna tjänster, inget läckage Hair TP ↔ Curatiio)
- [ ] P6.2.10 Strikt varumärkesseparation — Curatiio syns inte på hairtpclinic.com
- [ ] P6.2.11 Curatiio widget på curatiio.se → Arcana (ej Cliento)
- [ ] P6.2.12 Publik webb-API go-live (`ARCANA_PUBLIC_WEB_BOOKING_ENABLED`) — policy av idag
- [ ] P6.2.13 Cliento widget avstängd permanent efter cutover
- [ ] P6.2.14 `/en/book` locale-paritet (om aktiv på webben)

### 6.3 Bokning — intern (personal) — P0 / P1

- [x] P6.3.1 Bokningsärende i CCO (kandidat-tider, validering, status)
- [x] P6.3.2 Koppling bokning → behandlingstillfälle (J-6.3 / TL-B)
- [x] P6.3.3 Virtuella bokningsbanor (online / fysisk) + läkare som resurser
- [x] P6.3.4 Operatörsbekräftelse Plan A prod
- [~] P6.3.5 Kalendervy per behandlare och resurs — desktop week grid ☑; full resource/day planner kvar
- [~] P6.3.6 Kalender-/dagvy i CCO arbetsyta — desktop week ☑; operatörs arbetsyta kvar
- [x] P6.3.7 Mobil månadskalender (BL.1)
- [ ] P6.3.8 Smart slots: min-notice (120 min online / 60 min fysisk)
- [ ] P6.3.9 Bokningsfönster max 180 dagar
- [ ] P6.3.10 Kväll/helg-prisregler per tjänst
- [ ] P6.3.11 Scheman per resurs och per tjänst (**16 Cliento-resurser**)
- [ ] P6.3.12 Avbokningspolicy per tjänst (timmar före)
- [ ] P6.3.13 Resurskatalog i runtime (`migration/cliento/resource-catalog.json`)
- [ ] P6.3.14 Tilläggstjänster (`migration/cliento/addon-catalog.json`)

### 6.4 Behandlingstillfälle (encounter) — P0 / P1

- [x] P6.4.1 Encounter-store kopplad till bokning
- [x] P6.4.2 Tidslinje TL-B: gruppering per encounter
- [x] P6.4.3 TL-C: hälsodekl + friskförsäkran + TP/PRP/uppföljning/ögonlock under encounter
- [x] P6.4.4 Signering låser encounter-metadata
- [x] P6.4.5 Bokning öppnar rätt tidslinjesegment
- [ ] P6.4.6 Avtal + betalning (POS) under samma encounter
- [ ] P6.4.7 Encounter-typer: konsultation, transplant, PRP, microneedling, uppföljning, ögonlocksplastik, Curatiio-estetik
- [ ] P6.4.8 Automatisk draft uppföljning 4/6/12 mån efter signerad transplant (scheduler)

### 6.5 Patientformulär — P0 / P1 / P2

- [x] P6.5.1 H1 — Hälsodeklaration Hair TP (Meridiq **16414**) — UI + gate (MA-D)
- [~] P6.5.2 H2 — Hälsodeklaration ögonlocksplastik — operator toolbar ☑
- [~] P6.5.3 H3 — Hälsodeklaration ortopedi — operator toolbar ☑
- [~] P6.5.4 H4 — Hälsodeklaration estetiska injektioner — operator toolbar ☑
- [~] P6.5.5 H5 — ENG Health Questionnaire — operator toolbar ☑
- [x] P6.5.6 F1 — Friskförsäkran TP (Meridiq **16413**) — UI (`/friskforsakran`)
- [~] P6.5.7 F2 — Friskförsäkran ögonlocksplastik (**16389**) — operator toolbar ☑
- [ ] P6.5.8 Patientportal / token-länk före besök (ersätter Meridiq registreringsportal)
- [ ] P6.5.9 Webb `/screen` → journal H1 (synkad, ej fristående)
- [ ] P6.5.10 Webb `/friskforsakran` → journal F1 (synkad, ej fristående)
- [ ] P6.5.11 Registreringsportal-inställningar (foto-samtycke, NRS, BankID, flerspråk SV/EN/ES)
- [ ] P6.5.12 Meridiq ifyllda formulär + PDF importerade som historik

### 6.6 Personalformulär / journal — P0 / P1

- [x] P6.6.1 J1 — TP behandlingsjournal (**16411**, 52/59 fält, `journal-tp-schemas.js`)
- [ ] P6.6.2 J1 gap — full paritet 59 Meridiq-fält
- [x] P6.6.3 J2 — TP efterbehandling PRP (**16412**, `journal-prp-schemas.js`)
- [x] P6.6.4 J3 — PRP/PRF/microneedling (**14988**, `journal-prp-schemas.js`)
- [x] P6.6.5 J4 — Ögonlocksplastik (**16388**, `journal-bleph-schemas.js`)
- [x] P6.6.6 U1/U2/U3 — Uppföljning 4/6/12 mån (**16407/16409/16390**)
- [x] P6.6.7 Behandlingsplan (`consultation_plan`) — bokning + foton
- [x] P6.6.8 Historisk import PDF (Drive/Meridiq)
- [ ] P6.6.9 Ordinationer / recept (Meridiq patientkort-flik)
- [ ] P6.6.10 J-8.2 godkänn journalutkast → skapa signerbar journalpost (ej bara UI)

### 6.7 Journalfunktioner — P0 / P1 / P2

- [x] P6.7.1 Signering, låsning, rättelse som ny post
- [x] P6.7.2 Auditlogg läsning + skrivning
- [x] P6.7.3 Foto (Ta bild, HEIC, mobil) kopplat till encounter
- [ ] P6.7.4 PDF genereras och arkiveras vid signering
- [ ] P6.7.5 Före/efter-bilder som egen sektion på patientkort
- [ ] P6.7.6 NRS-smärtskala (valfritt i behandlingsjournal)
- [ ] P6.7.7 Journaltextmallar (konsultation, ordination, signatur) — Meridiq `/templates/text`
- [ ] P6.7.8 Bildmallar före/efter — Meridiq `/templates/image`
- [ ] P6.7.9 SMS/e-post/journal-malltexter som separata filer i repo

### 6.8 Samtycken & behandlingsavtal — P0 / P1

- [x] P6.8.1 Behandlingsavtal från accepterad offert (distans + på plats)
- [x] P6.8.2 Betänketid / 14-dagars ånger vid distansbokning
- [x] P6.8.3 Publik signeringssida (token)
- [ ] P6.8.4 Behandlingsavtal per tjänst: TP, PRP hår, PRP hud, microneedling
- [ ] P6.8.5 Curatiio-avtal: Botox, fillers, Profhilo, ögonlocksplastik, ortopedi
- [ ] P6.8.6 Samtycke bokning inom 14 dagar + samtycke behandling under ångerfrist
- [ ] P6.8.7 Foto-publiceringssamtycke (före/efter)
- [ ] P6.8.8 Alla **31+ Meridiq-samtycken** i runtime (`migration/meridiq/consent-catalog.json`)
- [ ] P6.8.9 Per-tjänst samtycke/questionnaire-bindning (`service-bindings-catalog.json`)
- [ ] P6.8.10 Importerade signerade samtycken från Meridiq (historik)

### 6.9 Offerter & commercial — P1

- [x] P6.9.1 Offertmallar (14 Word) + offertflöde
- [x] P6.9.2 Offert accepterad → behandlingsavtal
- [ ] P6.9.3 Offert skickad → accepterad / avvisad / utgången (Meridiq-workflow)
- [ ] P6.9.4 Patientinformation bilaga 1 (PDF) loggad vid utskick
- [ ] P6.9.5 Medical Finance / betalningsinfo i offertmejl
- [ ] P6.9.6 Skickade mejl + offerter-flik på patientkort (`/communication/email`)

### 6.10 Kommunikation — P0 / P1 / P3

- [x] P6.10.1 Bokningsbekräftelse e-post Resend (U5A.4 live)
- [x] P6.10.2 Bokningsbekräftelse Graph (intern)
- [x] P6.10.3 Operatörs-digest påminnelser (J-7 — ej patient-SMS)
- [ ] P6.10.4 Bokningspåminnelse SMS (4 h online / 24 h fysisk — Cliento-standard)
- [ ] P6.10.5 Bokningspåminnelse e-post + ICS-kalenderinbjudan
- [ ] P6.10.6 Avbokningsbekräftelse SMS + e-post
- [ ] P6.10.7 "Fyll i begärd information" före besök
- [ ] P6.10.8 Skicka formulär / samtycke / fil till patient (en knapp + audit)
- [ ] P6.10.9 SMS-mallar Hair TP + Curatiio (merge-fält)
- [ ] P6.10.10 E-postmallar: offert, behandlingsplan, bokning, avbokning
- [ ] P6.10.11 Intern notis till personal vid bokning/avbokning
- [x] P6.10.12 Post-op auto-trigger patientkanal (U5B.3)
- [ ] P6.10.13 Marknads-SMS med segmentering (P3 — CMO-spår)

### 6.11 Kassa / POS — P1 / P2

- [ ] P6.11.1 Kassa vid/efter behandlingstillfälle
- [ ] P6.11.2 Betalning tjänst (pris, moms, kväll/helg)
- [ ] P6.11.3 Produktkatalog och lager
- [ ] P6.11.4 Kvitto (utskrift/e-post)
- [ ] P6.11.5 Fakturor
- [ ] P6.11.6 Presentkort (köp + inlösen)
- [ ] P6.11.7 P-liggare / utestående
- [ ] P6.11.8 POS-ordrar synliga på patientkort och tidslinje
- [ ] P6.11.9 Kassarapport (`/point-of-sale/report`)
- [ ] P6.11.10 POS-terminalinställningar
- [ ] P6.11.11 `ccoPosStore` — ej byggd

### 6.12 Personal & arbetsyta — P0 / P1 / P2

- [x] P6.12.1 CCO arbetsyta (kundkö, trådar, bokning, journal-readout)
- [x] P6.12.2 Mobil personalvy (kundlista, journal, foto, bottom sheets)
- [x] P6.12.3 Roller: owner, staff, patient
- [~] P6.12.4 MFA + session (U2.2 OWNER enforced — väntar go-live)
- [x] P6.12.5 STAFF-konton sjuksköterskor + instruktion
- [x] P6.12.6 J-8.1 daglig rapport saknade formulär/samtycken
- [x] P6.12.7 J-8.2 journalutkast human approval (API + UI)
- [ ] P6.12.8 U6A full autonom CCO-agent
- [ ] P6.12.9 U6B CMO live connectors (fixture → live)
- [ ] P6.12.10 U6C CAO admin-operator
- [ ] P6.12.11 U6D Patientkanal (canon: sist)
- [~] P6.12.12 BL.4 Executive OS expand — `/monitor/executive-feed` increment ☑
- [x] P6.12.13 BL.5 Adaptive layout Fas 1–5

### 6.13 Compliance & QA — P0 / P2

- [x] P6.13.1 Åtkomstlogg (audit events)
- [x] P6.13.2 EU-lagring (Render Frankfurt)
- [x] P6.13.3 Retention 10 år (J-9.1)
- [x] P6.13.4 GDPR export + journalspärr (J-9.2–9.3)
- [x] P6.13.5 Art. 30 + PUB (J-9.4)
- [x] P6.13.6 PDL juridiskt signerat
- [ ] P6.13.7 QA-dashboard: formulärcompletion, signeringar, export
- [ ] P6.13.8 Meridiq QA-rapporter ersatta (`/reports/record`, `/reports/booking`, `/reports/pos`)
- [ ] P6.13.9 Inget journalinnehåll till extern AI (policy enforced i kod)

### 6.14 Migration & historik — P0 / P1 / P2

- [x] P6.14.1 Cliento-kunder importerade
- [x] P6.14.2 Drive-filer indexerade + journal-PDF import
- [~] P6.14.3 Drive `driveFileId` komplett (56988/57558 — 570 kvar)
- [x] P6.14.4 Pipedrive export i repo (J-0.5)
- [ ] P6.14.5 Migration-kataloger committade + wired i runtime (`service-triple-map`, consent, bindings)
- [ ] P6.14.6 Meridiq historik: ifyllda formulär + PDF + samtycken importerade
- [ ] P6.14.7 Meridiq read-only efter cutover
- [ ] P6.14.8 Cliento Partner API av (`cliento_booking_disabled` — klart; permanent)

### 6.15 Varumärken Hair TP / Curatiio

- [ ] P6.15.1 Hair TP: full bokning + formulär + mallar + avtal
- [ ] P6.15.2 Curatiio: separat bokning + formulär + mallar + avtal
- [ ] P6.15.3 Verifiera Cliento Botox-tjänster (64399–64814) under Hair TP-grupp — avsikt?

### 6.16 Webb & integrationer

- [x] P6.16.1 hairtpclinic.com → Arcana bokning (Plan A bridge)
- [x] P6.16.2 Web events ingest (formulär, chat-intent, analyzer)
- [x] P6.16.3 CMO connectors (Meta, LinkedIn m.fl.)
- [ ] P6.16.4 Pipedrive djupare synk (leads)
- [ ] P6.16.5 Fortnox-kundnummer koppling

### 6.17 Definition of Done — enhetligt system

- [ ] P6.17.1 **Bokning:** alla Plan A-tjänster i Arcana; Cliento widget av
- [ ] P6.17.2 **Formulär:** alla 14 aktiva Meridiq-formulär i Arcana med signering + PDF
- [ ] P6.17.3 **Samtycken:** behandlingsavtal per tjänstegrupp; distans betänketid enforced
- [ ] P6.17.4 **Journal:** TP/PRP/uppföljning live personal mobil + desktop
- [ ] P6.17.5 **Kassa:** minst kvitto + tjänstebetalning på encounter
- [ ] P6.17.6 **Kommunikation:** boknings-SMS/mejl + offer workflow
- [ ] P6.17.7 **Migration:** Meridiq + Drive historik importerad; Meridiq read-only
- [ ] P6.17.8 **Compliance:** audit, 10 år retention, EU, inga AI-tredjeparter i journal

### 6.18 Öppna punkter från DEL 1–5 (ej paritet — drift)

- [~] P6.18.1 U2.2 OWNER MFA enforced prod
- [ ] P6.18.2 U2.4 STAFF login verifierad i fält (iPhone/Android)
- [~] P6.18.3 U1.6 / J-10.6–10.7 manuell enhetspilot
- [x] P6.18.4 U5B.3 Post-op auto-trigger
- [~] P6.18.5 U3.3 Personal utbildad — externt
- [~] P6.18.6 U6A–U6D utrullning 6

---

## Snabb verify (kör vid tvivel)

```bash
npm run verify:android-staff-prod
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
| **Denna lista** | **DEL 1–6, ~200 punkter** | **Allt i ordning** |
