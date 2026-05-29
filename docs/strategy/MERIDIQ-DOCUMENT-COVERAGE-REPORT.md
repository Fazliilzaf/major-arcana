# Meridiq Document Coverage Report
*Genererad: 2026-05-29 · Källa: `migration/meridiq/*.json` + `data/cco-templates.json`*

> **Scope:** Steg 10.1 av 11-stegs CCO/Hair TP Clinic compliance-audit. Meridiq = facit för kundresan.  
> **Datasekretess:** Den här rapporten innehåller endast struktur, antal, hashar och ID:n. **INGA patientnamn, personnummer, e-postadresser, telefonnummer eller `letterText`-citat förekommer.**

## Sammanfattning

| Mätetal | Värde |
|---|---|
| Totalt dokument hittade | **228** (16 formulär + 39 samtycken + 14 journal-scheman + 82 service-bindings + 77 CCO-templates) |
| Lästa / parsbara | **228 / 228** = **100 %** |
| Olästa / korrupta JSON | **0** |
| Patient-data-flaggade träffar | **0** (alla datasets är mall- eller strukturobjekt — råexport från Meridiq API) |
| Template-revisioner i CCO-DB | 55 (i `cco-templates.json#revisions`) |
| **Coverage gate (≥ 95 %)** | **PASS** ✅ |

---

## Per-katalog inventering

### 1. `migration/meridiq/questionary-catalog.json`

Källa: `Meridiq API /api/v2/questionary/{id}` · Exporterat: `2026-05-25` · API-objekt: `16` · Markerade för migrering: `14`

| apiId | Titel | Brand | Antal frågor | arcanaJournalType | migrate | isActive |
|---|---|---|---:|---|:---:|:---:|
| 16472 | Hälsodeklaration \| Estetiska injektionsbehandlingar | Curatiio | 9 | health_declaration | ✅ | ❌ |
| 16415 | Hälsodeklaration \| Ögonlocksplastik | Curatiio | 12 | health_declaration | ✅ | ✅ |
| 16414 | Hälsodeklaration \| Hair TP Clinic | Hair TP Clinic | 14 | health_declaration | ✅ | ✅ |
| 16413 | Friskförsäkran \| TP | Hair TP Clinic | 13 | fitness_certificate | ✅ | ✅ |
| 16412 | Journal \| TP Efterbehandling (PRP) | Hair TP Clinic | 24 | prp_treatment | ✅ | ✅ |
| 16411 | Journal \| TP Behandling | Hair TP Clinic | 59 | tp_treatment | ✅ | ✅ |
| 16409 | Journal \| TP Uppföljning (6 månader) | Hair TP Clinic | 8 | follow_up | ✅ | ✅ |
| 16407 | Journal \| TP Uppföljning (4 månader) | Hair TP Clinic | 8 | follow_up | ✅ | ✅ |
| 16390 | Journal \| TP Resultatuppföljning (12 månader) | Hair TP Clinic | 1 | follow_up | ✅ | ✅ |
| 16389 | Friskförsäkran \| Ögonlocksplastik | Curatiio | 6 | fitness_certificate | ✅ | ✅ |
| 16388 | Journal \| Ögonlocksplastik | Curatiio | 15 | bleph_treatment | ✅ | ✅ |
| 15682 | FÖRSLAG \| Journal TP | Hair TP Clinic | 38 | — | ❌ | ❌ |
| 14988 | Journal \| PRP, PRF, Microneedling | Hair TP Clinic | 12 | prp_treatment | ✅ | ✅ |
| 14878 | Hälsodeklaration \| Ortopediska injektionsbehandlingar | Curatiio | 14 | health_declaration | ✅ | ✅ |
| 14866 | Copy - Hälsodeklaration | Hair TP Clinic | 29 | — | ❌ | ❌ |
| 14865 | ENG \| Health Questionnaire | Both | 29 | health_declaration | ✅ | ❌ |

**Subtotal:** 16 formulär · 12 aktiva · 14 markerade `migrate=true` · 2 arkiveras.

### 2. `migration/meridiq/consent-catalog.json`

Källa: `Meridiq API /api/v2/letter_of_consent` · Exporterat: `2026-05-25` · API-objekt: `39`  
**Säkerhet:** kolumnen *letterText-hash* visar `SHA-256[:8]` av brödtexten — **inget innehåll citeras**. `(empty)` = Meridiq returnerade tomt fält (avtal som hanteras via extern PDF/GetAccept).

| apiId | Titel | Brand | publishBeforeAfterPhotos | version | isActive | letterText-hash (SHA-256[:8]) |
|---|---|---|:---:|:---:|:---:|---|
| 152981 | Botulinumtoxin - ENG | Hair TP Clinic | True | 1 | True | `0e24ee43` (2294 tecken) |
| 152982 | Chemical Peeling - ENG | Hair TP Clinic | True | 1 | True | `ad40a207` (3274 tecken) |
| 152983 | CO2-laser - ENG | Hair TP Clinic | True | 1 | True | `20ed8e10` (6839 tecken) |
| 152984 | Filler - ENG | Curatiio | True | 1 | True | `f8f08aa8` (3000 tecken) |
| 152987 | PRP – Platelet Rich Plasma - ENG | Hair TP Clinic | True | 2 | True | `6264ad55` (7459 tecken) |
| 152988 | Botulinumtoxin - SWE | Hair TP Clinic | True | 1 | True | `9aa15480` (2745 tecken) |
| 152990 | Fillers - SWE | Curatiio | True | 1 | True | `c0da69cd` (3800 tecken) |
| 152991 | Hyalase - SWE | Hair TP Clinic | True | 1 | True | `a6154bda` (1803 tecken) |
| 152992 | Kemisk Peeling - SWE | Hair TP Clinic | True | 1 | True | `e6d8549c` (3838 tecken) |
| 152993 | IPL - SWE | Hair TP Clinic | True | 2 | True | `cfc97ea5` (4238 tecken) |
| 152994 | PRP hår – Platelet Rich Plasma - SWE | Hair TP Clinic | True | 3 | True | `85d49ad3` (1916 tecken) |
| 152995 | Fat dissolving injection - ENG | Hair TP Clinic | True | 1 | True | `418d6453` (2913 tecken) |
| 152996 | Fettuplösande injektioner - SWE | Hair TP Clinic | True | 1 | True | `ac4f8fd6` (2929 tecken) |
| 152997 | Microneedling - ENG | Hair TP Clinic | True | 1 | True | `e9fa6aeb` (3611 tecken) |
| 152998 | Microneedling - SWE | Hair TP Clinic | True | 1 | True | `ec263f13` (3627 tecken) |
| 152999 | Plasma Pen - ENG | Hair TP Clinic | True | 1 | True | `9cfb8bae` (3930 tecken) |
| 153000 | Plasma Pen - SWE | Hair TP Clinic | True | 1 | True | `b2e3b0ab` (3977 tecken) |
| 153001 | Plasma Pen - SWE | Hair TP Clinic | True | 1 | True | `b2e3b0ab` (3977 tecken) |
| 153002 | Profhilo - ENG | Hair TP Clinic | True | 3 | True | `454922a7` (2402 tecken) |
| 153003 | Profhilo - SWE | Hair TP Clinic | True | 2 | True | `75162da8` (1987 tecken) |
| 153039 | Ortopedisk PRP/PRF | Curatiio | True | 3 | True | `(empty)` (0 tecken) |
| 153040 | Ortopedisk PRP/PRF med hyaluronsyra | Curatiio | True | 3 | True | `(empty)` (0 tecken) |
| 154369 | Samtycke vid bokning inom 14 dagar | Hair TP Clinic | True | 4 | True | `(empty)` (0 tecken) |
| 170917 | Behandlingsavtal \| TP | Hair TP Clinic | True | 2 | True | `(empty)` (0 tecken) |
| 170941 | Behandlingsavtal \| Ortopedisk PRP/PRF | Curatiio | True | 1 | True | `(empty)` (0 tecken) |
| 170942 | Behandlingsavtal \| Ortopedisk HA | Curatiio | True | 1 | True | `(empty)` (0 tecken) |
| 170943 | Behandlingsavtal \| Ortopedisk HA och PRP/PRF | Curatiio | True | 0 | True | `(empty)` (0 tecken) |
| 170944 | Behandlingsavtal \| PRP hud | Hair TP Clinic | True | 1 | True | `(empty)` (0 tecken) |
| 170945 | Behandlingsavtal \| PRP hår | Hair TP Clinic | True | 1 | True | `(empty)` (0 tecken) |
| 170946 | Behandlingsavtal \| Microneedling och PRP | Hair TP Clinic | True | 0 | True | `(empty)` (0 tecken) |
| 170947 | Behandlingsavtal \| PRF hud | Hair TP Clinic | True | 0 | True | `(empty)` (0 tecken) |
| 170948 | Behandlingsavtal \| Profilho | Hair TP Clinic | True | 1 | True | `(empty)` (0 tecken) |
| 170949 | Behandlingsavtal \| Botulinumtoxin (Botox) | Curatiio | True | 0 | True | `(empty)` (0 tecken) |
| 170950 | Behandlingsavtal \| Fillers | Curatiio | True | 0 | True | `(empty)` (0 tecken) |
| 170951 | Behandlingsavtal \| PRP hud \| Curatiio | Hair TP Clinic | True | 0 | True | `(empty)` (0 tecken) |
| 170952 | Behandlingsavtal \| PRF hud \| Curatiio | Hair TP Clinic | True | 0 | True | `(empty)` (0 tecken) |
| 170953 | Behandlingsavtal \| PRP och microneedling \| Curatiio | Hair TP Clinic | True | 0 | True | `(empty)` (0 tecken) |
| 170954 | Behandlingsavtal \| Ögonlocksplastik | Curatiio | True | 1 | True | `(empty)` (0 tecken) |
| 170955 | Begäran och samtycke till att behandling påbörjas under ångerfristen (14 dagar) | Hair TP Clinic | True | 1 | True | `(empty)` (0 tecken) |

**Subtotal:** 39 samtycken/avtal · 20 med brödtext · 19 tomma (avtal som hanteras via separat PDF/Drive/GetAccept) · alla aktiva i Meridiq.

### 3. `migration/meridiq/journal-schema-catalog.json`

Källa: `scripts/migration/buildJournalSchemas.py` · Exporterat: `2026-05-25` · Antal scheman: `14`

**Stats:** `tpTreatmentMeridiqFields = 52` · `tpTreatmentMappedToStoreKeys = 52` (100 % mappat) · `healthDeclarationVariants = 5` · `serviceBindingHints = 5`

| Schema-ID | Typ | Variant | Brand | Antal fält | Mapped fields | Meridiq qId | Status |
|---|---|---|---|---:|---:|---:|:---:|
| `bleph_treatment:curatiio_bleph` | bleph_treatment | curatiio_bleph | Curatiio | 15 | 15 | 16388 | 100 % mappat |
| `fitness_certificate:curatiio_bleph` | fitness_certificate | curatiio_bleph | Curatiio | 6 | 6 | 16389 | 100 % mappat |
| `fitness_certificate:hair_tp` | fitness_certificate | hair_tp | Hair TP Clinic | 13 | 13 | 16413 | 100 % mappat |
| `follow_up:12_manader` | follow_up | 12_manader | Hair TP Clinic | 1 | 1 | 16390 | 100 % mappat |
| `follow_up:4_manader` | follow_up | 4_manader | Hair TP Clinic | 8 | 8 | 16407 | 100 % mappat |
| `follow_up:6_manader` | follow_up | 6_manader | Hair TP Clinic | 8 | 8 | 16409 | 100 % mappat |
| `health_declaration:curatiio_bleph` | health_declaration | curatiio_bleph | Curatiio | 12 | 12 | 16415 | 100 % mappat |
| `health_declaration:curatiio_injection` | health_declaration | curatiio_injection | Curatiio | 9 | 9 | 16472 | 100 % mappat |
| `health_declaration:curatiio_ortho` | health_declaration | curatiio_ortho | Curatiio | 14 | 14 | 14878 | 100 % mappat |
| `health_declaration:eng` | health_declaration | eng | Both | 29 | 29 | 14865 | 100 % mappat |
| `health_declaration:hair_tp` | health_declaration | hair_tp | Hair TP Clinic | 14 | 14 | 16414 | 100 % mappat |
| `prp_treatment:prp_skin` | prp_treatment | prp_skin | Hair TP Clinic | 12 | 12 | 14988 | 100 % mappat |
| `prp_treatment:tp_post_op` | prp_treatment | tp_post_op | Hair TP Clinic | 24 | 24 | 16412 | 100 % mappat |
| `tp_treatment:hair_tp` | tp_treatment | hair_tp | Hair TP Clinic | 52 | 52 | 16411 | 100 % mappat |

**Subtotal:** 14 scheman · 217 fält totalt · 217 mappade till storeKeys = **100 %** field-coverage.

### 4. `migration/meridiq/service-bindings-catalog.json`

Källa: `Meridiq API /api/v2/services (letter_of_consents[], company_service_questionnaires[])` · Exporterat: `2026-05-25`  
**Stats:** `serviceCount = 82` · `withConsents = 61` · `withQuestionnaires = 5` · `withoutEither = 16` · `uniqueConsents = 12` · `uniqueQuestionaries = 4`

Brand härleds från `category`-fältet (Meridiq exponerar inte `brand` per service).

**Service-kategori roll-up** (gruppstatistik per kategori; per-service raw export finns i JSON):

| Brand | Kategori | Services | Med consent | Med formulär | Σ consent-bindings | Σ form-bindings |
|---|---|---:|---:|---:|---:|---:|
| Curatiio | Estetiska injektioner \| Curatiio | 10 | 10 | 0 | 10 | 0 |
| Hair TP Clinic | FUE Hårtransplantation | 10 | 9 | 0 | 9 | 0 |
| Hair TP Clinic | DHI Hårtransplantation | 8 | 6 | 0 | 6 | 0 |
| Curatiio | Ortopedi \| Curatiio | 7 | 7 | 0 | 7 | 0 |
| Hair TP Clinic | DHI Skäggtransplantation | 6 | 5 | 0 | 5 | 0 |
| Hair TP Clinic | PRP \| Hår | 6 | 6 | 0 | 6 | 0 |
| Hair TP Clinic | FUE Skäggtransplantation | 5 | 4 | 0 | 4 | 0 |
| Hair TP Clinic | Microneedling med Dermapen | 5 | 5 | 0 | 5 | 0 |
| Hair TP Clinic | PRP \| Hud | 5 | 5 | 0 | 5 | 0 |
| Curatiio | Uppföljning \| Curatiio | 5 | 0 | 0 | 0 | 0 |
| Hair TP Clinic | Uppföljning \| Hair TP Clinic | 5 | 0 | 0 | 0 | 0 |
| Curatiio | Konsultationer \| Curatiio | 3 | 0 | 3 | 0 | 3 |
| Curatiio | Ögonlocksplastik \| Curatiio | 3 | 3 | 0 | 3 | 0 |
| Hair TP Clinic | DHI Ögonbrynstransplantation | 2 | 1 | 0 | 1 | 0 |
| Hair TP Clinic | Konsultationer \| Hair TP Clinic | 2 | 0 | 2 | 0 | 2 |

**`byConsent` (consent → antal services):**

| Consent apiId | Titel | Services |
|---|---|---:|
| 170917 | Behandlingsavtal \| TP | 25 |
| 170944 | Behandlingsavtal \| PRP hud | 5 |
| 170945 | Behandlingsavtal \| PRP hår | 5 |
| 170946 | Behandlingsavtal \| Microneedling och PRP | 5 |
| 170943 | Behandlingsavtal \| Ortopedisk HA och PRP/PRF | 4 |
| 170949 | Behandlingsavtal \| Botulinumtoxin (Botox) | 4 |
| 170948 | Behandlingsavtal \| Profilho | 3 |
| 170950 | Behandlingsavtal \| Fillers | 3 |
| 170954 | Behandlingsavtal \| Ögonlocksplastik | 3 |
| 170941 | Behandlingsavtal \| Ortopedisk PRP/PRF | 2 |
| 152994 | PRP hår – Platelet Rich Plasma - SWE | 1 |
| 170942 | Behandlingsavtal \| Ortopedisk HA | 1 |

**`byQuestionary` (formulär → antal services):**

| Questionary apiId | Typ | Titel | Services |
|---|---|---|---:|
| 16414 | CUSTOM | Hälsodeklaration \| Hair TP Clinic | 2 |
| 14878 | CUSTOM | Hälsodeklaration \| Ortopediska injektionsbehandlingar | 1 |
| 16415 | CUSTOM | Hälsodeklaration \| Ögonlocksplastik | 1 |
| 16472 | CUSTOM | Hälsodeklaration \| Estetiska injektionsbehandlingar | 1 |

### 5. `data/cco-templates.json` (post-Meridiq-import seed)

Total: **77** templates · **55** revisioner i historik · `updatedAt = 2026-05-29T17:49:11.575Z`

**Source × Type-matris** (antal templates):

| source \ type | health_declaration | fitness_certificate | consent | agreement | patient_information | aftercare | followup | transactional | **Σ** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `meridiq` | 2 | 2 | 39 | 0 | 7 | 0 | 0 | 0 | **50** |
| `nordbro` | 0 | 0 | 4 | 0 | 1 | 0 | 0 | 0 | **5** |
| `insatt+nordbro` | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | **2** |
| `nordbro+meridiq` | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | **4** |
| `meridiq+nordbro` | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 0 | **5** |
| `meridiq+cco_native` | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | **6** |
| `cco_native` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | **5** |
| **Σ** | **2** | **2** | **43** | **2** | **12** | **5** | **6** | **5** | **77** |

**Brand-fördelning:** hair_tp = 49 · curatiio = 20 · shared = 8

## Versionering

| Dokument-grupp (`source`) | Antal | Med version | Latest | Oldest |
|---|---:|---:|---|---|
| `meridiq` | 50 | 50 | 3.4.0 | 1.0.0 |
| `nordbro` | 5 | 5 | 2.0.0 | 1.0.0 |
| `insatt+nordbro` | 2 | 2 | 4.0.0 | 4.0.0 |
| `nordbro+meridiq` | 4 | 4 | 3.0.0 | 2.0.0 |
| `meridiq+nordbro` | 5 | 5 | 3.0.0 | 2.0.0 |
| `meridiq+cco_native` | 6 | 6 | 1.0.0 | 1.0.0 |
| `cco_native` | 5 | 5 | 1.0.0 | 1.0.0 |
| **Totalt** | **77** | **77** | **4.0.0** | **1.0.0** |

**Version-distribution:** `1.0.0`=59 · `2.0.0`=10 · `2.1.0`=2 · `3.0.0`=2 · `3.1.0`=1 · `3.4.0`=1 · `4.0.0`=2

## Legal review status

| Status | Antal | Notering |
|---|---:|---|
| `meridiq_clinical` | 54 | Klinisk text importerad från Meridiq — godkänd som källa, behöver verifieras mot rådata |
| `nordbro_approved` | 14 | Granskad och godkänd av Nordbro Advokat |
| `not_required` | 5 | Transaktionellt UX-meddelande, ej juridisk text |
| `insatt_approved` | 4 | Granskad och godkänd av Insatt |

**Templates som väntar på legal review (pending/missing):** 0

## Klassificering enligt user-spec

| Klassificering | Antal | Får i GitHub? | Får i CCO-DB? | Krav |
|---|---:|:---:|:---:|---|
| `clinical_template` | 4 | ✅ | ✅ | Versions-tracking + must-store-version |
| `consent_template` | 43 | ✅ | ✅ | Legal review + version-pinning per patient |
| `agreement_template` | 2 | ✅ | ✅ | Legal review + version-pinning per patient |
| `aftercare_template` | 5 | ✅ | ✅ | Klinisk text, ej legal review krävs |
| `communication_template` | 23 | ✅ | ✅ | Marketing/UX — kan iteras fritt |
| `workflow_rule` | 0 | ✅ | ✅ | EJ i denna katalog (separat seed: `cco-booking-engine.json`) |
| `patient_document` | 0 | ❌ | ✅ (säker lagring) | EJ i denna katalog — patientspecifika dokument lagras separat |
| `migration_record` | 0 | ✅ | ✅ (audit) | EJ i denna katalog — audit-trail i `cco-audit.jsonl` |
| `outdated_document` | 0 | ❌ | — | Arkivera — inga upptäckta (alla `isActive=true` på källan) |

**Totalt klassificerade templates i `data/cco-templates.json`:** **77 / 77** = **100 %**

## Gap mot user-spec (vad SAKNAS som rådata)

| Källa | Status | Anmärkning |
|---|:---:|---|
| Meridiq API export | ✅ HÄR | `migration/meridiq/{questionary,consent,journal-schema,service-bindings}-catalog.json` + `migration/meridiq-service-catalog.json` |
| Nordbro-PDF:er (rådata) | ❌ SAKNAS | Endast indirekta referenser via `legalReviewStatus=nordbro_approved` (14 st) — själva PDF:erna finns inte i repo |
| Insatt-PDF:er (rådata) | ❌ SAKNAS | Endast indirekta referenser via `legalReviewStatus=insatt_approved` (4 st) — själva PDF:erna finns inte i repo |
| `data/external-template-versions.json` | ❌ SAKNAS | Filen existerar inte → versions-cross-check mot externa källor kan inte genomföras automatiskt |
| Drive-export (mallar/PDFs för parity) | ❌ SAKNAS | Ingen Drive-export-mapp upptäckt i `migration/` eller `data/` |
| GetAccept-export (avtalsflöde) | ❌ SAKNAS | Ingen GetAccept-export upptäckt; 19 tomma `letterText` pekar troligen hit |

## Coverage Gate-beslut

**PASS** ✅

- Alla 228 dokument-objekt i de specade källorna är parsbara (0 korrupta JSON).
- Field-coverage på `tp_treatment` journal-schema: 52/52 = **100 %**.
- Field-coverage på samtliga 14 journal-scheman: 217/217 = **100 %**.
- Service-binding-coverage: 61/82 (74 %) har consent, 5/82 (6 %) har formulär; 16 (20 %) saknar bägge (huvudsakligen `Uppföljning`-services som inte kräver pre-treatment-flöde).
- Coverage-tröskel ≥ 95 % uppfylld för read/parse-paritet. **Legal source-binding för 19 tomma consent-objekt är en restpunkt** (se nedan) men blockerar inte gate — de är spårbara via `apiId` och kan källverifieras manuellt mot Nordbro/Insatt/GetAccept.

## Behöver legal review

Inga templates i `data/cco-templates.json` har status `pending_review` / `not_reviewed` / saknad status.

**Däremot — 19 av 39 consent-objekt i `consent-catalog.json` har tom `letterText` (Behandlingsavtal / Samtycke-flöden):**

| apiId | Brand | Titel | letterText |
|---|---|---|:---:|
| 153039 | Curatiio | Ortopedisk PRP/PRF | (empty) |
| 153040 | Curatiio | Ortopedisk PRP/PRF med hyaluronsyra | (empty) |
| 154369 | Hair TP Clinic | Samtycke vid bokning inom 14 dagar | (empty) |
| 170917 | Hair TP Clinic | Behandlingsavtal \| TP | (empty) |
| 170941 | Curatiio | Behandlingsavtal \| Ortopedisk PRP/PRF | (empty) |
| 170942 | Curatiio | Behandlingsavtal \| Ortopedisk HA | (empty) |
| 170943 | Curatiio | Behandlingsavtal \| Ortopedisk HA och PRP/PRF | (empty) |
| 170944 | Hair TP Clinic | Behandlingsavtal \| PRP hud | (empty) |
| 170945 | Hair TP Clinic | Behandlingsavtal \| PRP hår | (empty) |
| 170946 | Hair TP Clinic | Behandlingsavtal \| Microneedling och PRP | (empty) |
| 170947 | Hair TP Clinic | Behandlingsavtal \| PRF hud | (empty) |
| 170948 | Hair TP Clinic | Behandlingsavtal \| Profilho | (empty) |
| 170949 | Curatiio | Behandlingsavtal \| Botulinumtoxin (Botox) | (empty) |
| 170950 | Curatiio | Behandlingsavtal \| Fillers | (empty) |
| 170951 | Hair TP Clinic | Behandlingsavtal \| PRP hud \| Curatiio | (empty) |
| 170952 | Hair TP Clinic | Behandlingsavtal \| PRF hud \| Curatiio | (empty) |
| 170953 | Hair TP Clinic | Behandlingsavtal \| PRP och microneedling \| Curatiio | (empty) |
| 170954 | Curatiio | Behandlingsavtal \| Ögonlocksplastik | (empty) |
| 170955 | Hair TP Clinic | Begäran och samtycke till att behandling påbörjas under ångerfristen (14 dagar) | (empty) |

Dessa pekar troligen mot externa PDF:er (Nordbro/Insatt/GetAccept) — **kräver verifiering att signerad version finns i Drive/GetAccept** innan production-cutover.

## Versionskonflikter (preliminärt)

`data/external-template-versions.json` saknas → automatisk diff mot extern versions-källa kan inte genomföras nu.

**Heuristiska varningar:**

1. **Duplicate consent (Meridiq):** apiId `153000` och `153001` har identisk titel `Plasma Pen - SWE`, version `1`, samma letterText-hash (`b2e3b0ab`) — sannolikt en duplikat i Meridiq som bör konsolideras innan migrering.
2. **Brand-mismatch i consent-katalogen:** flera `Behandlingsavtal | … | Curatiio` (apiId 170951/170952/170953) är taggade `brand = Hair TP Clinic` men har Curatiio i titeln — kräver manuell brand-verifiering före DB-import.
3. **Version 0:** 8 consent-objekt har `version = 0` — alla är tomma `Behandlingsavtal`-mallar; sannolikt nya/ej-publicerade. Bör nollställas eller markeras som draft.

---

*Slut. Genererad utan PII-läckage — inga personnummer, +46-nummer eller e-postadresser ingår i den här rapporten.*