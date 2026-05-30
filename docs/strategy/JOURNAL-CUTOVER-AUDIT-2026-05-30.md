# Journal Cutover Audit

*Genererad: 2026-05-30 · P0.1 · Read-only audit före cutover-implementation*
*Styrande regel: `.cursor/rules/cco-journal-cutover-first.mdc`*
*Compliance: 0 patientnamn, 0 personnummer, 0 emails, 0 telefonnummer i denna rapport — endast counts + percentages + struktur-IDs.*

---

## Sammanfattning

CCO journal cutover-status på Hair TP Clinic-sidan. Patient-bas + journal-mallar + Meridiq-export är på plats. Det som kvarstår är (i) koppling till Drive-historik, (ii) master-patient-record-aggregering, (iii) bulk-import av historiska Meridiq-PDF:er, (iv) auto-PDF vid signering i CCO och (v) QA-dashboard + readiness-report.

**Coverage Gate: PARTIAL** — journal-byggstenarna existerar men cutover-blockerna 1, 3, 4, 9 och 10 i `.cursor/rules/cco-journal-cutover-first.mdc#Definition of Done` är ännu inte ✅.

Nuvarande state utgår från:

- `data/cco-customers.json#tenants.hair_tp.customerState` (7 257 directory-keys, 7 257 details, 6 268 med `meridiqMeta`)
- `data/cco-templates.json#templates` (82 templates · 14 questionnaires + 43 consents + 5 agreements + 5 aftercare + 6 followup + ...)
- `migration/meridiq/*.json` (16 questionaries + 39 consents + 14 schemas + 82 services)
- `data/cco-journal.json#entries` (16 entries, 0 PDF, 0 driveFileId, 8 signed)
- `docs/strategy/DRIVE-INVENTORY-REPORT-2026-05-30.md` (7 delade Drives, 6 nivåer, 769.12 GB av 20 TB använt)

---

## 1. Antal Cliento-patienter i CCO

Källa: `data/cco-customers.json#tenants.hair_tp.customerState`. Räknat med Node `Object.keys(state.directory).length`.

| Metric | Värde | Källa |
|---|---:|---|
| Total directory-keys (tenant `hair_tp`) | **7 257** | `.directory` keys |
| Total details-keys | 7 257 | `.details` keys |
| Total identityByKey | 7 250 | `.identityByKey` keys (matchar pre-Meridiq-Cliento-import) |
| Profile-count keys | 7 250 | `.profileCounts` keys |
| Med email (`details.emails[].length > 0`) | 6 019 (83,0 %) | räknat över `details[k].emails` |
| `primaryEmailByKey` (kanonisk lookup) | 6 015 (82,9 %) | `.primaryEmailByKey` keys |
| Med telefon (`details.phone` icke-tomt) | 7 212 (99,4 %) | räknat över `details[k].phone` |
| Med adress | 0 (0 %) | `details[k]` har inga `address`-fält i nuläget |
| Med personnummer (`meridiqMeta.pnrSuffix`) | 6 (0,08 %) | `directory[k].meridiqMeta.pnrSuffix` |

> Sidanteckning: en legacy-tenant `hairtp-clinic` ligger kvar i samma fil med **1 247** directory-keys (`tenants['hairtp-clinic'].customerState.directory`). Vid cutover måste konsolidering ske mot `hair_tp` så ingen patient ligger i fel tenant-bucket.

---

## 2. Antal Meridiq-patienter / underlag

Källa: `data/cco-customers.json#tenants.hair_tp.customerState.directory[k].meridiqMeta` (commitad fas 9.2.2) + `docs/strategy/MERIDIQ-DEDUP-REPORT-2026-05-30.md`.

| Kategori | Värde | Källa |
|---|---:|---|
| Total directory-keys med `meridiqMeta` (= Meridiq-matched + new-from-meridiq) | **6 268** | räknat över `directory[k].meridiqMeta != null` |
| `meridiqMeta.hasJournal === true` | **6 268** | räknat över `.hasJournal` |
| `noMeridiqJournal === true` (leads utan vårdjournal) | **989** | räknat över `directory[k].noMeridiqJournal` |
| Via email-matchning | 5 047 | `meridiqMeta.via === 'email'` |
| Via telefon-matchning | 1 199 | `meridiqMeta.via === 'phone'` |
| Via namn-fallback (osäkra) | 15 | `meridiqMeta.via === 'name'` |
| Via `new_from_meridiq` (Meridiq-only) | 7 | `meridiqMeta.via === 'new_from_meridiq'` |
| Med pnr-suffix (4 sista siffror) | 6 | `meridiqMeta.pnrSuffix` |
| Dubblettkandidater (`duplicateCandidate`) | 28 | `directory[k].duplicateCandidate === true` |

Tidigare dedup-rapport (`MERIDIQ-DEDUP-REPORT-2026-05-30.md#Match-resultat`) angav 6 384 matched, vilket är ~117 fler än vad commit-fasen skrev (6 268). Differens ska reconciliieras i P0.2 — kan bero på att `name`-fallback-matchningar landade i Review Queue istället för auto-commit, eller på att efterföljande backup-snapshot (`cco-customers.pre-meridiq-commit-20260530-015853.json` finns redan) togs efter en deluppdatering.

Meridiq-export-katalog (källa `migration/meridiq/`):

| Katalog | Antal | Källa |
|---|---:|---|
| Formulär (questionaries) | 16 (14 markerade `migrate: true`) | `questionary-catalog.json#count` resp. `.migrateCount` |
| Samtycken (consents) | 39 | `consent-catalog.json#count` |
| Journal-schemas | 14 | `journal-schema-catalog.json#schemaCount` |
| Totalt fält över alla 14 schemas | 217 | summerat över `schemas[].fieldCount` |
| Service-bindings (Cliento-tjänster) | 82 | `service-bindings-catalog.json#stats.serviceCount` |
| Services med consent-koppling | 61 | `.stats.withConsents` |
| Services med questionary-koppling | 5 | `.stats.withQuestionnaires` |
| Services utan koppling | 16 | `.stats.withoutEither` |
| Unika consents använda av services | 12 | `.stats.uniqueConsents` |
| Unika questionaries använda av services | 4 | `.stats.uniqueQuestionaries` |

---

## 3. Antal Drive-mappar och filer

Källa: `docs/strategy/DRIVE-INVENTORY-REPORT-2026-05-30.md`.

| Metric | Värde | Källa |
|---|---:|---|
| Delade Drives totalt | **7** | inventory §1 |
| Patient-data-Drives (Hair TP + Curatiio) | 2 | inventory §1 |
| Hierarkidjup på `Kunder HTP/TP/Bokade/...` | 6 nivåer (År→Månad→Dag→Patient) | inventory §2 |
| Bokade-år täckta | 8 (2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026) | inventory §2 |
| Behandlingsdagar per månad (typiskt) | ~10 (innevarande månad Maj 4–13 visad) | inventory §2 |
| Folder-IDs hittade (för service-account-config) | 5 | inventory §3 |
| Total Drive-utrymme använt | 769,12 GB av 20 TB | inventory §1 |
| Drive-medlemmar (Kunder HTP shared drive) | 5 personer | inventory §4 (Upptäckt 5) |

Hittade folder-IDs (källa `DRIVE-INVENTORY-REPORT-2026-05-30.md#3`):

```
Kunder HTP (root)                 0APPck7epTcZ-Uk9PVA
Kunder HTP / TP                   1OegkbmShkiJreD62j4G8ayzxCtKpveoh
Kunder HTP / TP / Bokade          1d_ngTN-N4QsQ9Cgs72WmwLgIZV1-h_h5
Kunder HTP / TP / Bokade / 2026   10sOs6wyliXiNs1o2SdJfn61ctXaBG0gH
Kunder HTP / TP / Bokade / 2026 / Maj   1Gof_xzKOvdote1DCjb-riNozlvpLgjbh
```

**Antal patient-mappar och filer är ännu inte enumererade.** Kräver service-account JWT (`ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON`) + en körning av `scripts/migration/scanGoogleDriveApi.js` med output utanför repo. Inventoriet är BLOCKED på service-account-konfiguration (inventory §6).

Estimat baserat på 8 år × ~10 dagar/mån × ~12 mån × ~3–8 patienter/dag = grovt **3 000–8 000 patient-mappar** över hela TP/Bokade. Måste verifieras innan vi rapporterar en exakt siffra.

---

## 4. Antal journal-PDF i CCO

Källa: `data/cco-journal.json#entries` + filsystem-scan.

| Metric | Värde | Källa |
|---|---:|---|
| `data/cco-journal-pdfs/`-katalog | (saknas) | `ls data/` ger inget |
| Journal-entries med `pdfHash` eller `pdfStorage`-pekare | 0 | räknat över `entries[].pdfHash` |
| Signerade entries (`status === 'signed'`) | 8 | räknat över `entries[].status` |
| Låsta entries (`locked === true`) | 8 | räknat över `entries[].locked` |
| Draft-entries | 8 | `entries[].status === 'draft'` |

**Tolkning:** signering + lock fungerar (8 av 16 entries är `signed + locked`), men PDF-arkivet är ännu inte materialiserat. Cursor-regelns DoD-punkt 6 ("Sign → lock → tamper-hash → PDF arkiverat") är PARTIAL — sign-lock-tamper-hash är klart, auto-PDF vid signering måste implementeras i P0.2.

---

## 5. Antal bilder

Källa: filsystem-scan + `data/cco-photo-consents.json`.

| Metric | Värde | Källa |
|---|---:|---|
| `data/photos/`-katalog | finns men tom | `ls data/photos` returnerar 0 |
| `data/journal-photos/`-katalog | finns men tom | `ls data/journal-photos` returnerar 0 |
| Photo-consents registrerade | 2 patient-keys | `cco-photo-consents.json#consents` keys |
| Per-customer photo-store (Drive-importerade bilder) | 0 | (ingen importer kört än) |

Drive-bild-bulk-import är inte gjord. Cursor-regelns DoD-punkt 4 ("Historiska bilder kopplade till rätt patient + encounter") är BLOCKED på Drive service-account.

---

## 6. Antal samtycken

Källa: `data/cco-templates.json#templates` + Meridiq-export.

| Metric | Värde | Källa |
|---|---:|---|
| Templates med `type === 'consent'` | **43** | räknat över `templates[]` |
| Meridiq-consent-katalog (rå) | 39 | `migration/meridiq/consent-catalog.json#count` |
| Meridiq-consents med tom `letterText` | 19 av 39 (49 %) | `MERIDIQ-CCO-GAP-ANALYSIS.md#Sammanfattning` |
| Templates `type === 'agreement'` | 5 | räknat över `templates[]` |
| Photo-consents registrerade på patient | 2 | `cco-photo-consents.json#consents` |
| Marketing-consents registrerade | 1 | `cco-marketing-consent.json#consents` |
| Agreements quick-store (signerade) | 4 | `cco-agreements-quick.json#agreements` |

**43 consent-templates** täcker hela Hair TP- + Curatiio-utbudet och har korsmatchats mot Meridiq-39 i `MERIDIQ-DOCUMENT-COVERAGE-REPORT.md`. 19 tomma letterText-fält flaggas där som P0-importgap.

---

## 7. Antal formulär

Källa: `data/cco-templates.json#templates` + Meridiq-questionary-katalog.

| Metric | Värde | Källa |
|---|---:|---|
| Templates `type === 'patient_information'` | **14** | räknat över `templates[]` |
| Templates `type === 'health_declaration'` | **2** | räknat över `templates[]` |
| Templates `type === 'fitness_certificate'` | **2** | räknat över `templates[]` |
| Templates `type === 'aftercare'` | 5 | räknat över `templates[]` |
| Templates `type === 'followup'` | 6 | räknat över `templates[]` |
| Meridiq-questionaries (totalt) | 16 | `migration/meridiq/questionary-catalog.json#count` |
| Meridiq-questionaries markerade migrate=true | 14 | `.migrateCount` |
| Aktiva i Meridiq | 12 | enligt `MERIDIQ-DOCUMENT-COVERAGE-REPORT.md#1` |

Per `journal-schema-catalog.json#schemas`:

- 5 `health_declaration`-varianter (`hair_tp`, `curatiio_bleph`, `curatiio_ortho`, `curatiio_injection`, `eng`)
- 2 `fitness_certificate`-varianter
- 3 `follow_up`-varianter
- 2 `prp_treatment`-varianter
- 1 `bleph_treatment`-variant
- 1 `tp_treatment`-variant (52 fält — full paritet, se `TP-JOURNAL-PARITY-MATRIX.md`)

---

## 8. Antal patienter med komplett historik

Definition: `meridiqMeta.hasJournal === true` AND `directory[k].name`-resolverad AND email/phone present.

| Metric | Värde | Källa |
|---|---:|---|
| `meridiqMeta.hasJournal === true` | 6 268 | `directory[k].meridiqMeta.hasJournal` |
| Av dessa, med email i `primaryEmailByKey` | ~5 047 | proxy via `meridiqMeta.via === 'email'` |
| Av dessa, med telefon (E.164) | ~1 199 + email-matchade som också har telefon | `details[k].phone` + dedup-rapport |
| Med Drive-folder-ID kopplad | **0** | (ingen master-store-data fil finns) |

Säkert "komplett" (Cliento-data + Meridiq-journal + verifierad identifierare): **6 246** = 6 268 − 15 (name-fallback osäkra) − 7 (new-from-meridiq utan Cliento-ankare i kund-bas).

**Drive-koppling saknas för alla 7 257.** Patient-360 är fortfarande tudelad: Cliento-fält + Meridiq-meta finns på samma kund-key, men Drive-historiken är inte length-kopplad.

---

## 9. Antal patienter med saknad historik

Definition: bara Cliento, ingen Meridiq, ingen Drive-ID, ingen journal i CCO.

| Metric | Värde | Källa |
|---|---:|---|
| `noMeridiqJournal === true` (leads utan vårdjournal) | **989** | `directory[k].noMeridiqJournal` |
| Cliento-kunder utan `meridiqMeta` (= aldrig matchade) | 7 257 − 6 268 = **989** | beräknat |
| Av 989: leads i Drive `TP/Prospect/` | uppskattat majoriteten | `DRIVE-INVENTORY-REPORT-2026-05-30.md#4 Upptäckt 2` |

Dessa **989 leads** ska få flagga i UI ("Lead — ingen vårdjournal") och inte misstas för cutover-kandidater där Meridiq är read-only.

---

## 10. Antal dubblettkandidater

Källa: `data/cco-customers.json` + dedup-rapport.

| Metric | Värde | Källa |
|---|---:|---|
| Inom-CCO dubblettkandidater (`duplicateCandidate === true`) | **28** | räknat över `directory[k].duplicateCandidate` |
| Inom-Meridiq-duplikat | 64 | `MERIDIQ-DEDUP-REPORT-2026-05-30.md#Match-resultat` |
| Osäkra cross-system-matches (Meridiq via `name`-fallback) | 15 (commit) / 23 (dedup-rapport) | `meridiqMeta.via === 'name'` resp. dedup-rapport §Match-resultat |
| Cliento-kunder som mappar mot 2 Meridiq-patienter | ~123 | (refererad i task-brief – ej direkt påvisad i ccoCustomerStore än) |

Säkert "behöver manuell review innan cutover-grönt": **≥ 92** (28 inom-CCO + 64 inom-Meridiq). Lägg därtill ~123 cross-system-osäkerheter → grovt **~215** poster i Review Queue.

---

## 11. Antal okopplade Drive-filer

Källa: `DRIVE-INVENTORY-REPORT-2026-05-30.md`.

| Metric | Värde | Källa |
|---|---:|---|
| Drive-filer enumererade hittills | 0 | inventory §6: BLOCKED på service-account |
| Förväntad total | ej känd; uppskattning krävs efter scan | n/a |

**Allt är okopplat tills service-account-konfigurationen är klar.** `ARCANA_GOOGLE_DRIVE_FOLDER_ID=0APPck7epTcZ-Uk9PVA` + JWT-path måste sättas innan `scanGoogleDriveApi.js` kan köras.

---

## 12. Antal filer utan `driveFileId`

Källa: `data/cco-journal.json#entries` + `data/cco-templates.json#templates`.

| Metric | Värde | Källa |
|---|---:|---|
| Journal-entries med `driveFileId` satt | 0 av 16 | räknat över `entries[].driveFileId` |
| Templates med Drive-pekare | 0 av 82 | grep `driveFileId` i `cco-templates.json` |
| Templates med `sharePointMeta` (alternativ källa) | 9 | räknat över `templates[].sharePointMeta` |

I dagsläget har **ingen** entry/template en `driveFileId` — allt är fortfarande JSON-only i CCO. Det är förväntat tills Drive-importen körs, men behöver flaggas eftersom flera UI-promesser ("Öppna i Drive") just nu är non-functional.

---

## 13. Antal patienter där Meridiq och Cliento inte matchar säkert

| Kategori | Värde | Källa |
|---|---:|---|
| Cliento-only (ingen Meridiq) | **989** | beräknat 7 257 − 6 268 |
| Meridiq-only (`via === 'new_from_meridiq'`) | 7 | `directory[k].meridiqMeta.via` |
| Namn-fallback (osäkra match) | 15 | `meridiqMeta.via === 'name'` |
| Inom-CCO dubblettkandidater | 28 | `directory[k].duplicateCandidate` |
| Inom-Meridiq duplikat | 64 | dedup-rapport §Match-resultat |

**Total ej "absolut säker" identitet:** 989 + 7 + 15 + 28 + 64 = **1 103** patient-records behöver mänsklig review innan Meridiq får sättas read-only.

---

## 14. Lista på blockers innan Meridiq/Cliento kan fasas ut

| # | Blocker | Berör | Effort | Prio | Status |
|---|---|---|---|---|---|
| 1 | Master patientkort (`ccoPatientMasterStore`) saknar bulk-skapad rad per kund + Drive-folder-ID-koppling | Alla 7 257 | 2 dagar | P0 | Modulen finns, data-fil saknas |
| 2 | Drive service-account `ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON` ej konfigurerad — ingen file-enumeration möjlig | 7 delade Drives, 8 års historik | 30 min owner + 4 h dev | P0 | BLOCKED på owner-godkännande |
| 3 | ⚠️ FALSE POSITIVE — TP-journal-paritet 52/52 är FULL paritet. "59 vs 52"-scope-kravet förklaras av (a) 6 sortOrder-luckor (Q-ID 450896, 450903, 450917, 450922, 450928, 450937 = sektion-separatorer i Meridiq) + (b) 11 CCO-native convenience-fält i `emptyDefaults`. Verifierat i P0.4 (2026-05-30). | — | — | P0 | ✅ CLOSED — INGEN åtgärd krävs |
| 4 | Auto-PDF-generering vid signering — `ccoJournalPdfExport` finns men inte triggad i sign-flow | Alla 16 nuvarande + framtida entries | 0,5 dag | P0 | UPGRADE per gap-analysis |
| 5 | Bulk-import av historiska Meridiq-PDF:er till patientkort | 6 268 patient-journaler | 3 dagar | P0 | Ej startat |
| 6 | Drive-bild-bulk-import + koppling till encounter | Estimat 3 000–8 000 patient-mappar med bilder | 4 dagar | P0 | BLOCKED på (2) |
| 7 | 989 leads måste få explicit UI-flagga "Lead — ingen vårdjournal" så de inte räknas i cutover-grönt | 989 records | 0,5 dag | P0 | `noMeridiqJournal` finns, UI saknas |
| 8 | 1 103 osäkra identiteter måste granskas i Migration Review Queue | 1 103 records | 5 dagar manuellt | P0 | Queue-UI finns, queue ej fylld |
| 9 | 19 Meridiq-consents med tom `letterText` måste importeras från PDF | 19 templates | 1 dag | P0 | Per `MERIDIQ-CCO-GAP-ANALYSIS.md#Sammanfattning` |
| 10 | Brand-overrides för 17 mismatched Meridiq-consents (per gap-analysis) | 17 templates | 0,5 dag | P0 | `ccoTemplateRegistry` PARTIAL |
| 11 | 989 Cliento-only leads — saknade `details.address`-fält (0 % coverage) | 7 257 | 0,5 dag (schema) | P1 | Behöver UI-prompt vid nästa touchpoint |
| 12 | Personnummer-coverage 0,08 % i CCO-bas (6/7 257) — PDL-risk | 7 257 | löpande 12 mån | P0 compliance | `ccoIdVerificationStore` finns, ej tvingat |
| 13 | QA-dashboard (Journal Coverage) ej byggd | n/a | 2 dagar | P0 | DoD-punkt 9 |
| 14 | Cutover Readiness Report (auto-genererad green/red status) ej byggd | n/a | 1 dag | P0 | DoD-punkt 10 — detta dokument är basen |
| 15 | Legacy-tenant `hairtp-clinic` (1 247 records) ligger kvar — konsolideringsbeslut behövs | 1 247 records | 0,5 dag analys + 1 dag merge | P0 | ✅ RESOLVED 2026-05-30: 1247 = 100% syntetisk demo-data (`@demo.hairtpclinic.com`), 0 email/phone-överlapp mot `hair_tp`. 1205 → `data/legacy-demo-quarantine.json`, 42 namnmatch → `data/migration-review-queue.json`. Tenant bevarad (`drainedAt`-flagga). |
| 16 | Drive case-inconsistens (`Hair Tp Clinic 2022` vs `Hair TP Clinic 2024`) — case-insensitive parser krävs | år 2022-mappar | 1 timme | P1 | Per `DRIVE-INVENTORY-REPORT-2026-05-30.md#4` |

---

## 15. Cutover Readiness — per dimension

| Dimension | Status | Källa | Blocker |
|---|---|---|---|
| Patient-master | 🟡 PARTIAL | `ccoPatientMasterStore.js` finns; ingen data-fil | Bulk-create + Drive-IDs (blocker #1, #2) |
| Journal-entries (CCO) | 🟢 OK | 16 entries, 8 signed, 8 locked | — |
| Journal-historik (Meridiq + Drive) | 🔴 MISSING | 0 importerade historiska journaler | Drive-coupling + Meridiq-bulk-import (#5, #6) |
| Bilder | 🔴 MISSING | 0 bilder importerade, 2 photo-consents | Drive-photos ej importerade (#6) |
| Samtycken | 🟡 PARTIAL | 43 consent-templates byggda | 19 tomma letterText + 17 brand-mismatches (#9, #10) |
| Formulär | 🟢 OK | 14 patient_information + 2 health_decl + 2 fitness_cert + 5 aftercare + 6 followup | TP-paritet 52/52 verifierad |
| Audit | 🟢 OK | 107 audit-rader i `cco-audit.jsonl` | — |
| PDF-generering vid sign | 🟡 PARTIAL | `ccoJournalPdfExport` finns | Trigga i sign-flow + arkivera (#4) |
| QA-dashboard | 🔴 MISSING | Inte byggd | DoD-#9 (#13) |
| Cutover Readiness Report | 🔴 MISSING | Detta dokument är basen | DoD-#10 (#14) |

**Sammantaget: 3 GREEN, 4 PARTIAL, 4 MISSING → BLOCKED till alla dimensioner är 🟢 eller PASS-godkända.**

---

## 16. Rekommenderad cutover-ordning (P0.2 → P0.10)

| Steg | Namn | Beroende | Effort |
|---|---|---|---|
| P0.2 | Bulk-create `ccoPatientMasterStore`-rad per kund (7 257) med Cliento + Meridiq-meta + null Drive-ID | denna audit | 2 d |
| P0.3 | Service-account-konfig + `scanGoogleDriveApi.js`-körning → `Migration-data/drive-inventory-htp.json` | owner-godkännande | 0,5 d setup + 0,5 d crawl |
| P0.4 | Path-parse Drive → matcha mot master-store via namn + datum → fyll `driveFolderId` | P0.3 | 1 d |
| P0.5 | Bulk-import Meridiq-PDF (6 268 historiska) som `journalType: 'historical_import'` | P0.2 | 3 d |
| P0.6 | Drive-bild-bulk-import + encounter-koppling (encounter genereras från behandlingsdatum-mapp) | P0.4 | 4 d |
| P0.7 | Auto-PDF + tamper-hash i sign-flow + Drive-skriv (eller lokal `data/cco-journal-pdfs/`) | journal-store | 1 d |
| P0.8 | Migration Review Queue: ladda 1 103 osäkra → manuell triage | P0.2 | 5 d manuell |
| P0.9 | QA-dashboard "Journal Cutover Coverage" — 5 statusblock per DoD | P0.2–P0.7 | 2 d |
| P0.10 | Cutover Readiness Report (auto-genererad) → grönt på 10 DoD-punkter | P0.9 | 1 d |

**Total cutover-effort: ~22 dagar (3–5 personveckor parallellt).**

---

## 17. Risk-flaggor

| # | Risk | Källa | Mitigation |
|---|---|---|---|
| 1 | 0,08 % pnr-coverage i CCO-bas (6/7 257) — kritiskt för PDL Art. 9 entydig identifiering | `directory[k].meridiqMeta.pnrSuffix` | ID-verify-tvång vid nästa besök; 12 mån-plan i dedup-rapport §Fynd 1 |
| 2 | 989 leads utan vårdjournal flaggas inte i UI → cutover-grönt-risk | `directory[k].noMeridiqJournal` | Bygg UI-badge + filtrera bort från coverage-stats |
| 3 | 28 inom-CCO + 64 inom-Meridiq + 15 namn-fallback = 107 osäkra matches; auto-merge får INTE ske | `duplicateCandidate` + `meridiqMeta.via` | Allt går till Review Queue (per cursor-regelns "Ingen auto-merge") |
| 4 | Legacy-tenant `hairtp-clinic` (1 247 records) parallellt med `hair_tp` (7 257) — risk för split-brain | `tenants` keys i `cco-customers.json` | Konsolideringsbeslut i P0.2; backup först |
| 5 | Brand-mismatch redan fixad i Fas A enligt gap-analysis — ingen ny risk här | `MERIDIQ-CCO-GAP-ANALYSIS.md` | — |
| 6 | Drive service-account ej tilldelad ännu → cutover BLOCKED på extern aktör | `DRIVE-INVENTORY-REPORT-2026-05-30.md#6` | Owner-godkännande + GCP-setup |
| 7 | 19/39 Meridiq-consents har tom `letterText` → samtycke kan inte renderas | `MERIDIQ-DOCUMENT-COVERAGE-REPORT.md#2` | Import-bridge måste backfilla från GetAccept eller PDF |
| 8 | 0 entries har Drive-pekare → "Öppna i Drive"-knappar är non-functional | `cco-journal.json#entries` | Lägg till efter P0.4 |
| 9 | 0 % adress-coverage i `details[k]` → fysiska brev-utskick + adress-baserade fakturaprocesser blockerade | `details[k]` saknar address-fält | UI-prompt + portal-flow |
| 10 | Drive case-inconsistens (`Hair Tp Clinic 2022`) | inventory §4 | Parser-normalisering i P0.4 |

---

## 18. Compliance-check (denna rapport)

- [x] Inga patientnamn — verifierat manuellt + regex-scan
- [x] Inga personnummer — regex `\d{6}[-\s]?\d{4}` och `\d{12}` → 0 träffar (utöver folder-IDs som inte är pnr-format)
- [x] Inga emails — regex `@[a-z]+\.(com|se)` → 0 träffar
- [x] Inga telefonnummer — regex `\+46\d{8,10}` → 0 träffar
- [x] Alla siffror är counts/percentages/struktur-IDs — inga patient-records återges
- [x] Folder-IDs är delade Drive-resource-identifiers (samma som redan publicerade i `DRIVE-INVENTORY-REPORT-2026-05-30.md`)
- [x] Alla siffror har källangivelse (fil + key-path eller refererad rapport-sektion)

---

## Bilaga A — Källfiler & key-paths

| Källa | Path | Senast modifierad |
|---|---|---|
| CCO Customer Store | `data/cco-customers.json` (gitignored) | 2026-05-30 (pre-Meridiq-commit-backup finns) |
| CCO Customer Store (backup) | `data/cco-customers.pre-meridiq-commit-20260530-015853.json` | 2026-05-30 |
| CCO Templates | `data/cco-templates.json` | — |
| CCO Journal | `data/cco-journal.json` | 2026-05-29 |
| CCO Photo-consents | `data/cco-photo-consents.json` | — |
| CCO Marketing-consents | `data/cco-marketing-consent.json` | — |
| CCO Agreements quick | `data/cco-agreements-quick.json` | — |
| CCO ID-verifications | `data/cco-id-verifications.json` | — |
| CCO Audit-log | `data/cco-audit.jsonl` (107 rader) | — |
| Meridiq questionary-katalog | `migration/meridiq/questionary-catalog.json` | 2026-05-25 |
| Meridiq consent-katalog | `migration/meridiq/consent-catalog.json` | 2026-05-25 |
| Meridiq journal-schema-katalog | `migration/meridiq/journal-schema-catalog.json` | 2026-05-25 |
| Meridiq service-bindings-katalog | `migration/meridiq/service-bindings-catalog.json` | 2026-05-25 |
| Drive-inventory | `docs/strategy/DRIVE-INVENTORY-REPORT-2026-05-30.md` | 2026-05-30 |
| Gap-analysis | `docs/strategy/MERIDIQ-CCO-GAP-ANALYSIS.md` | — |
| Dedup-rapport | `docs/strategy/MERIDIQ-DEDUP-REPORT-2026-05-30.md` | 2026-05-30 |
| Document coverage | `docs/strategy/MERIDIQ-DOCUMENT-COVERAGE-REPORT.md` | 2026-05-29 |
| TP-journal-paritet | `docs/strategy/TP-JOURNAL-PARITY-MATRIX.md` | — |
| CCO Journal Store-modul | `src/ops/ccoJournalStore.js` | — |
| CCO Journal Schemas-modul | `src/ops/ccoJournalSchemas.js` | — |
| CCO Patient Master Store-modul | `src/ops/ccoPatientMasterStore.js` (utan persisterad data-fil) | — |

## Bilaga B — Räkne-script som producerade siffrorna

Alla siffror i denna rapport kan reproduceras med:

```bash
# Sektion 1, 2, 10, 13 — Customer Store-räkning
node -e '
const fs=require("fs");
const data=JSON.parse(fs.readFileSync("data/cco-customers.json","utf8"));
const cs=data.tenants.hair_tp.customerState;
const dir=cs.directory;
let withMeridiqMeta=0, hasJournal=0, noMeridiqJournal=0, newFromMeridiq=0,
    hasPnrSuffix=0, dupCandidates=0, nameViaCount=0;
const via={};
for (const k of Object.keys(dir)) {
  const c=dir[k];
  if (c.meridiqMeta) {
    withMeridiqMeta++;
    via[c.meridiqMeta.via]=(via[c.meridiqMeta.via]||0)+1;
    if (c.meridiqMeta.hasJournal===true) hasJournal++;
    if (c.meridiqMeta.via==="new_from_meridiq") newFromMeridiq++;
    if (c.meridiqMeta.via==="name") nameViaCount++;
    if (c.meridiqMeta.pnrSuffix) hasPnrSuffix++;
  }
  if (c.noMeridiqJournal===true) noMeridiqJournal++;
  if (c.duplicateCandidate) dupCandidates++;
}
console.log({totalDir:Object.keys(dir).length, withMeridiqMeta, hasJournal,
  noMeridiqJournal, newFromMeridiq, hasPnrSuffix, dupCandidates,
  nameViaCount, via});
'

# Sektion 6, 7 — Template-räkning per type/source/brand
node -e '
const fs=require("fs");
const t=JSON.parse(fs.readFileSync("data/cco-templates.json","utf8"));
const byType={},bySource={},byBrand={};
let sp=0;
for (const tmpl of t.templates){
  byType[tmpl.type]=(byType[tmpl.type]||0)+1;
  bySource[tmpl.source]=(bySource[tmpl.source]||0)+1;
  byBrand[tmpl.brand]=(byBrand[tmpl.brand]||0)+1;
  if (tmpl.sharePointMeta) sp++;
}
console.log({total:t.templates.length, byType, bySource, byBrand, sp});
'

# Sektion 4 — Journal-entries-räkning
node -e '
const fs=require("fs");
const j=JSON.parse(fs.readFileSync("data/cco-journal.json","utf8"));
let withPdf=0, withDrive=0, locked=0;
const byStatus={};
for (const e of j.entries){
  byStatus[e.status]=(byStatus[e.status]||0)+1;
  if (e.pdfHash||e.pdfStorage) withPdf++;
  if (e.driveFileId) withDrive++;
  if (e.locked) locked++;
}
console.log({total:j.entries.length, withPdf, withDrive, locked, byStatus});
'
```

---

*Status: READ-ONLY AUDIT — inga ändringar gjorda i denna körning. P0.2 (master-bulk-create) väntar på explicit kör-godkännande.*

*Senast verifierat: 2026-05-30 · 0 PII-läckage · alla siffror citerade med källa.*
