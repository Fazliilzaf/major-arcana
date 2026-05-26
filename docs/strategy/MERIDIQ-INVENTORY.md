# Meridiq — Fullständig inventering (Hair TP Clinic + Curatiio)

**Status:** Legacy journalsystem / klinik-OS (referens + migreringskälla)  
**Senast uppdaterad:** 2026-05-25  
**Källa:** Live genomgång `https://app.meridiq.com/` + API `api.meridiq.com`  
**Tenant:** `hairTPClinicCuratiio_6975` · **6 455 patienter** · **82 aktiva tjänster**

**Relaterat:** [CLIENTO-INVENTORY.md](./CLIENTO-INVENTORY.md) · [CCO-UNIFIED-SYSTEM-PLAN.md](./CCO-UNIFIED-SYSTEM-PLAN.md) · [JOURNAL-DATAMODELL.md](./JOURNAL-DATAMODELL.md)

**Strategi:** Meridiq ägs **inte** framåt som journalsystem — innehållet migreras till Arcana/CCO.

> **ID-typer:** UI visar `#1100` — API använder andra ID (t.ex. API **7079** = Onlinekonsultation). Använd **API-id** för integration/migration.

---

## 0. Modulöversikt

| Modul          | Route                                     | Hair TP               | Curatiio            |
| -------------- | ----------------------------------------- | --------------------- | ------------------- |
| Hem            | `/`                                       | Dashboard             | Dashboard           |
| Patienter      | `/clients`                                | 6455 patienter        | Samma register      |
| Journalsystem  | `/questionnaires`, `/letters-of-consents` | TP-formulär           | Curatiio-formulär   |
| Bokningssystem | `/bookings/services`, `/calendar/*`       | 82 tjänster (blandat) | Curatiio-kategorier |
| Kassasystem    | `/point-of-sale/*`                        | POS                   | POS                 |
| Mallar         | `/templates/*`, `/sms/templates`          | Hair TP-mallar        | Curatiio-mallar     |
| Kommunikation  | `/communication/*`                        | Offerter, SMS         | Offerter, SMS       |
| Rapporter      | `/reports/*`                              | QA/journal            | QA/journal          |
| Appar          | `/app-store`                              | Integrationer         | Integrationer       |
| Inställningar  | `/settings/*`                             | Team, GDPR, credits   | Team, GDPR, credits |

---

## 1. Journalsystem — Anpassade formulär (16 mallar)

### 1.1 Hair TP Clinic

| API/Form ID | Titel                                    | Fylls av                  | Arcana `journalType`       |
| ----------- | ---------------------------------------- | ------------------------- | -------------------------- |
| **16414**   | Hälsodeklaration \| Hair TP Clinic       | Patient                   | `health_declaration`       |
| **16413**   | Friskförsäkran \| TP                     | Patient + personal        | `fitness_certificate`      |
| **16411**   | Journal \| TP Behandling (59 fält)       | Personal                  | `tp_treatment`             |
| **16412**   | Journal \| TP Efterbehandling (PRP)      | Personal                  | `prp_treatment`            |
| **16407**   | Journal \| TP Uppföljning 4 mån          | Personal                  | `follow_up`                |
| **16409**   | Journal \| TP Uppföljning 6 mån          | Personal                  | `follow_up`                |
| **16390**   | Journal \| TP Resultatuppföljning 12 mån | Personal                  | `follow_up`                |
| **14988**   | Journal \| PRP, PRF, Microneedling       | Personal                  | `prp_treatment`            |
| **14865**   | ENG \| Health Questionnaire              | Patient                   | `health_declaration` (eng) |
| —           | FÖRSLAG \| Journal TP                    | _(utkast — migrera ej)_   | —                          |
| —           | Copy - Hälsodeklaration                  | _(dubblett — migrera ej)_ | —                          |

### 1.2 Curatiio

| API/Form ID | Titel                                                  | Fylls av           | Arcana `journalType`              |
| ----------- | ------------------------------------------------------ | ------------------ | --------------------------------- |
| **16415**   | Hälsodeklaration \| Ögonlocksplastik                   | Patient            | `health_declaration`              |
| **14878**   | Hälsodeklaration \| Ortopediska injektionsbehandlingar | Patient            | `health_declaration`              |
| **16472**   | Hälsodeklaration \| Estetiska injektionsbehandlingar   | Patient            | `health_declaration`              |
| **16389**   | Friskförsäkran \| Ögonlocksplastik                     | Patient + personal | `fitness_certificate`             |
| **16388**   | Journal \| Ögonlocksplastik                            | Personal           | `bleph_treatment` _(ny i Arcana)_ |

### 1.3 Formulärbyggare — fälttyper

| Meridiq typ      | Exempel (TP Behandling)    | Antal |
| ---------------- | -------------------------- | ----- |
| `textbox`        | Sektionsrubriker, fri text | 30    |
| `yes_no`         | Ja/Nej kliniska kontroller | 24    |
| `yes_no_textbox` | Ja/Nej + villkorlig text   | 5     |

**Maskinläsbar export (2026-05-25):**

- [`migration/meridiq/questionary-catalog.json`](../../migration/meridiq/questionary-catalog.json) — **16 mallar**, **291 fält** (full `questions[]`)
- [`migration/meridiq/consent-catalog.json`](../../migration/meridiq/consent-catalog.json) — **39 samtycken** (full `letterText`)
- [`migration/meridiq/service-bindings-catalog.json`](../../migration/meridiq/service-bindings-catalog.json) — **82 tjänster** med kopplade samtycken + hälsodeklarationer
- [`migration/meridiq/journal-schema-catalog.json`](../../migration/meridiq/journal-schema-catalog.json) — **14 Arcana-scheman** (Meridiq → `journalType` + `formVariant` + fältnycklar)

**Export-API:** `GET /api/v2/questionary/{id}` → `questions[]` · `GET /api/v2/letter_of_consent`

---

## 2. Samtycken (39+ mallar)

### 2.1 Hair TP Clinic — compliance

| Samtycke                                                | Kopplad tjänst     |
| ------------------------------------------------------- | ------------------ |
| Behandlingsavtal \| TP                                  | FUE/DHI transplant |
| Behandlingsavtal \| PRP hår                             | PRP \| Hår         |
| Behandlingsavtal \| PRP hud                             | PRP \| Hud         |
| Behandlingsavtal \| Microneedling och PRP               | Microneedling      |
| Samtycke vid bokning inom 14 dagar                      | Distansbokning     |
| Begäran samtycke behandling under ångerfrist (14 dagar) | Distans            |

### 2.2 Curatiio

| Samtycke                                  | Behandling            |
| ----------------------------------------- | --------------------- |
| Behandlingsavtal \| Botox                 | Estetiska injektioner |
| Behandlingsavtal \| Fillers               | Estetiska injektioner |
| Behandlingsavtal \| Profilho              | Estetiska injektioner |
| Behandlingsavtal \| PRP/PRF hud           | PRP hud               |
| Behandlingsavtal \| Ögonlocksplastik      | Ögonlocksplastik      |
| Behandlingsavtal \| Ortopedisk HA/PRP/PRF | Ortopedi              |

### 2.3 Generiskt bibliotek (SWE + ENG)

Botox, Filler, PRP, Microneedling, Profhilo, Chemical Peeling, CO2-laser, Plasma Pen, Fat dissolving — _(ev. ej alla i bruk)_

**Export:** `GET /api/v2/letter_of_consent`  
**Signerade:** `GET /api/client/{id}/letter_of_consents`

### 2.4 Fullständig samtyckeslista (39 st)

| API-id     | Titel                                                                           | Varumärke      |
| ---------- | ------------------------------------------------------------------------------- | -------------- |
| **170949** | Behandlingsavtal · Botulinumtoxin (Botox)                                       | Curatiio       |
| **170950** | Behandlingsavtal · Fillers                                                      | Curatiio       |
| **170942** | Behandlingsavtal · Ortopedisk HA                                                | Curatiio       |
| **170943** | Behandlingsavtal · Ortopedisk HA och PRP/PRF                                    | Curatiio       |
| **170941** | Behandlingsavtal · Ortopedisk PRP/PRF                                           | Curatiio       |
| **170954** | Behandlingsavtal · Ögonlocksplastik                                             | Curatiio       |
| **152984** | Filler - ENG                                                                    | Curatiio       |
| **152990** | Fillers - SWE                                                                   | Curatiio       |
| **153039** | Ortopedisk PRP/PRF                                                              | Curatiio       |
| **153040** | Ortopedisk PRP/PRF med hyaluronsyra                                             | Curatiio       |
| **170955** | Begäran och samtycke till att behandling påbörjas under ångerfristen (14 dagar) | Hair TP Clinic |
| **170946** | Behandlingsavtal · Microneedling och PRP                                        | Hair TP Clinic |
| **170947** | Behandlingsavtal · PRF hud                                                      | Hair TP Clinic |
| **170952** | Behandlingsavtal · PRF hud · Curatiio                                           | Hair TP Clinic |
| **170944** | Behandlingsavtal · PRP hud                                                      | Hair TP Clinic |
| **170951** | Behandlingsavtal · PRP hud · Curatiio                                           | Hair TP Clinic |
| **170945** | Behandlingsavtal · PRP hår                                                      | Hair TP Clinic |
| **170953** | Behandlingsavtal · PRP och microneedling · Curatiio                             | Hair TP Clinic |
| **170948** | Behandlingsavtal · Profilho                                                     | Hair TP Clinic |
| **170917** | Behandlingsavtal · TP                                                           | Hair TP Clinic |
| **152981** | Botulinumtoxin - ENG                                                            | Hair TP Clinic |
| **152988** | Botulinumtoxin - SWE                                                            | Hair TP Clinic |
| **152983** | CO2-laser - ENG                                                                 | Hair TP Clinic |
| **152982** | Chemical Peeling - ENG                                                          | Hair TP Clinic |
| **152995** | Fat dissolving injection - ENG                                                  | Hair TP Clinic |
| **152996** | Fettuplösande injektioner - SWE                                                 | Hair TP Clinic |
| **152991** | Hyalase - SWE                                                                   | Hair TP Clinic |
| **152993** | IPL - SWE                                                                       | Hair TP Clinic |
| **152992** | Kemisk Peeling - SWE                                                            | Hair TP Clinic |
| **152997** | Microneedling - ENG                                                             | Hair TP Clinic |
| **152998** | Microneedling - SWE                                                             | Hair TP Clinic |
| **152994** | PRP hår – Platelet Rich Plasma - SWE                                            | Hair TP Clinic |
| **152987** | PRP – Platelet Rich Plasma - ENG                                                | Hair TP Clinic |
| **152999** | Plasma Pen - ENG                                                                | Hair TP Clinic |
| **153000** | Plasma Pen - SWE                                                                | Hair TP Clinic |
| **153001** | Plasma Pen - SWE                                                                | Hair TP Clinic |
| **153002** | Profhilo - ENG                                                                  | Hair TP Clinic |
| **153003** | Profhilo - SWE                                                                  | Hair TP Clinic |
| **154369** | Samtycke vid bokning inom 14 dagar                                              | Hair TP Clinic |

---

## 3. Bokningssystem — tjänstekatalog (82 aktiva)

API: `GET /api/v2/services?per_page=50&page=N&filter=is_active&filter_type=%3D&filter_value=1`

### 3.1 Hair TP Clinic

| Kategori                             | API-id (exempel)     | Tjänster                                                                                           | Prisindikation   |
| ------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------- | ---------------- |
| **Konsultationer \| Hair TP Clinic** | **7079**, **7078**   | Digitalt videosamtal \| Onlinekonsultation (0 kr, 30 min); Möte på kliniken \| Fysisk konsultation | 0 kr             |
| **FUE Hårtransplantation**           | 7092–7106            | 1000–4500 grafts                                                                                   | 39 000–67 000 kr |
| **DHI Hårtransplantation**           | 7093–7097            | 1000–3000 grafts; DHI Ärr; PRP-efterbehandling                                                     | 49 000–65 000 kr |
| **FUE/DHI Skäggtransplantation**     | 7127–7404            | 1000–3000 grafts + PRP                                                                             | Varierar         |
| **DHI Ögonbrynstransplantation**     | **7104**             | Ögonbryn + PRP                                                                                     | 25 000 kr        |
| **PRP \| Hår**                       | **7112**, 7113, 7114 | Mini / Standard / XL / Skägg / Underhåll TP                                                        | 2 500–4 800 kr   |
| **PRP \| Hud**                       | 7117–7120            | Ansikte, hals, dekolletage, händer                                                                 | 4 300 kr         |
| **Microneedling med Dermapen**       | **7121**             | Ansikte + PRP; tilläggsområden                                                                     | 5 800 kr         |
| **Uppföljning \| Hair TP Clinic**    | 7130–7137            | DHI/FUE hår/skägg/ögonbryn uppföljning                                                             | 0 kr             |

**Arcana-mapping (Plan A):**

| Arcana ID                           | Meridiq API | Cliento srvId           |
| ----------------------------------- | ----------- | ----------------------- |
| `consultation-online`               | 7079        | 44939                   |
| `consultation-physical`             | 7078        | 31779                   |
| `followup-transplant`               | 7130–7137   | 63017 (res 11458/10326) |
| `prp-hair`                          | 7112        | _(Cliento TBD)_         |
| `fue` / `dhi` / `beard` / `eyebrow` | 7092+       | _(Cliento TBD)_         |
| `microneedling`                     | 7121        | _(Cliento TBD)_         |

### 3.2 Curatiio

| Kategori                              | API-id (exempel)             | Tjänster                                                       | Prisindikation |
| ------------------------------------- | ---------------------------- | -------------------------------------------------------------- | -------------- |
| **Konsultationer \| Curatiio**        | 8694, **7080**, **7081**     | Estetiska injektioner; Ögonlocksplastik; Ortopedi konsultation | 0 kr           |
| **Ögonlocksplastik \| Curatiio**      | **7085**, **7082**, **7105** | Övre 24 000 kr; Nedre 28 000 kr; Kombinerad 44 000 kr          |                |
| **Estetiska injektioner \| Curatiio** | 7382–7385                    | Botox 1–3 områden; Fillers; Profhilo paket                     | Varierar       |
| **Ortopedi \| Curatiio**              | 7109–7413                    | PRP/PRF/HA kombinationer, seriebehandlingar                    | Varierar       |
| **Uppföljning \| Curatiio**           | 8952–8954, **7107**          | Botox/Filler/Profilho/Ögonlocksplastik; suturborttagning       | 0 kr           |

**Tjänstobjekt (API) innehåller:** `category`, `price`, `duration`, `description`, `product_code`, `tax_information`, `cancellation_policy_hours`, `letter_of_consents[]`, `company_service_questionnaires[]`, `confirmation_email_template_id`, `is_video_call`, `is_online_payment`.

### 3.3 Fullständig tjänstlista (82 aktiva, API-export 2026-05-25)

Maskinläsbar katalog: [`migration/meridiq-service-catalog.json`](../../migration/meridiq-service-catalog.json)

#### DHI Hårtransplantation (8 st · Hair TP Clinic)

| API-id   | Namn                                        | Tid           | Pris      |
| -------- | ------------------------------------------- | ------------- | --------- |
| **7093** | DHI Hårtransplantation: 3000 grafts         | 6 tim, 30 min | 65 000 kr |
| **7094** | DHI Hårtransplantation: 2500 grafts         | 6 tim         | 61 000 kr |
| **7095** | DHI Hårtransplantation: 2000 grafts         | 5 tim, 30 min | 57 000 kr |
| **7096** | DHI Hårtransplantation: 1500 grafts         | 5 tim         | 53 000 kr |
| **7097** | DHI Hårtransplantation: 1000 grafts         | 4 tim         | 49 000 kr |
| **7103** | DHI Hårtransplantation: PRP-efterbehandling | 30 min        | 0 kr      |
| **7414** | DHI Ärr                                     | 3 tim         | —         |
| **8727** | DHI Ärr: PRP-efterbehandling                | 30 min        | 0 kr      |

#### DHI Skäggtransplantation (6 st · Hair TP Clinic)

| API-id   | Namn                                          | Tid           | Pris      |
| -------- | --------------------------------------------- | ------------- | --------- |
| **7127** | DHI Skäggtransplantation: 1000 grafts         | 4 tim         | 49 000 kr |
| **7135** | DHI Skäggtransplantation: PRP-efterbehandling | 30 min        | 0 kr      |
| **7144** | DHI Skäggtransplantation: 1500 grafts         | 5 tim         | 53 000 kr |
| **7387** | DHI Skäggtransplantation: 2000 grafts         | 5 tim, 30 min | 57 000 kr |
| **7388** | DHI Skäggtransplantation: 2500 grafts         | 6 tim         | 61 000 kr |
| **7389** | DHI Skäggtransplantation 3000 grafts          | 6 tim, 30 min | 65 000 kr |

#### DHI Ögonbrynstransplantation (2 st · Hair TP Clinic)

| API-id   | Namn                                              | Tid    | Pris      |
| -------- | ------------------------------------------------- | ------ | --------- |
| **7104** | DHI Ögonbrynstransplantation                      | 4 tim  | 25 000 kr |
| **7132** | DHI Ögonbrynstransplantation: PRP-efterbehandling | 30 min | 0 kr      |

#### Estetiska injektioner · Curatiio (10 st · Curatiio)

| API-id   | Namn                         | Tid   | Pris     |
| -------- | ---------------------------- | ----- | -------- |
| **7376** | Fillers: Nasolabialveck 1 ml | 1 tim | 3 000 kr |
| **7377** | Fillers: Läppar 0.5 ml       | 1 tim | 2 500 kr |
| **7378** | Fillers: Läppar 1 ml         | 1 tim | 3 500 kr |
| **7379** | Profhilo: 1 behandling       | 1 tim | 3 000 kr |
| **7380** | Profhilo: 2 behandlingar     | 1 tim | 5 500 kr |
| **7381** | Profhilo: 3 behandlingar     | 1 tim | 8 000 kr |
| **7382** | Botox: 1 område              | 1 tim | 2 300 kr |
| **7383** | Botox: 2 områden             | 1 tim | 2 800 kr |
| **7384** | Botox: 3 områden             | 1 tim | 3 400 kr |
| **7385** | Botox Läpplyft (Lip Flip)    | 1 tim | 1 800 kr |

#### FUE Hårtransplantation (10 st · Hair TP Clinic)

| API-id   | Namn                                        | Tid           | Pris      |
| -------- | ------------------------------------------- | ------------- | --------- |
| **7086** | FUE Hårtransplantation: 4000 grafts         | 6 tim         | 63 000 kr |
| **7087** | FUE Hårtransplantation: 3500 grafts         | 5 tim, 30 min | 59 000 kr |
| **7088** | FUE Hårtransplantation: 3000 grafts         | 5 tim         | 55 000 kr |
| **7089** | FUE Hårtransplantation: 2500 grafts         | 4 tim, 30 min | 51 000 kr |
| **7090** | FUE Hårtransplantation: 2000 grafts         | 4 tim         | 47 000 kr |
| **7091** | FUE Hårtransplantation: 1500 grafts         | 3 tim, 30 min | 43 000 kr |
| **7092** | FUE Hårtransplantation: 1000 grafts         | 3 tim         | 39 000 kr |
| **7106** | FUE Hårtransplantation: 4500 grafts         | 7 tim         | 67 000 kr |
| **7128** | FUE Hårtransplantation: PRP-efterbehandling | 30 min        | 0 kr      |
| **7397** | FUE Skäggtransplantation: 1000 grafts       | 3 tim         | 39 000 kr |

#### FUE Skäggtransplantation (5 st · Hair TP Clinic)

| API-id   | Namn                                          | Tid           | Pris      |
| -------- | --------------------------------------------- | ------------- | --------- |
| **7398** | FUE Skäggtransplantation: 1500 grafts         | 3 tim, 30 min | 43 000 kr |
| **7399** | FUE Skäggtransplantation: 2000 grafts         | 4 tim         | 47 000 kr |
| **7400** | FUE Skäggtransplantation: 2500 grafts         | 4 tim, 30 min | 51 000 kr |
| **7401** | FUE Skäggtransplantation: 3000 grafts         | 5 tim         | 55 000 kr |
| **7404** | FUE Skäggtransplantation: PRP-efterbehandling | 30 min        | 0 kr      |

#### Konsultationer · Curatiio (3 st · Curatiio)

| API-id   | Namn                                              | Tid    | Pris |
| -------- | ------------------------------------------------- | ------ | ---- |
| **7080** | Ögonlocksplastik · Konsultation                   | 20 min | 0 kr |
| **7081** | Ortopediska injektionsbehandlingar · Konsultation | 20 min | 0 kr |
| **8694** | Estetiska injektioner · Konsultation              | 20 min | 0 kr |

#### Konsultationer · Hair TP Clinic (2 st · Hair TP Clinic)

| API-id   | Namn                                      | Tid    | Pris |
| -------- | ----------------------------------------- | ------ | ---- |
| **7078** | Möte på kliniken · Fysisk konsultation    | 30 min | 0 kr |
| **7079** | Digitalt videosamtal · Onlinekonsultation | 30 min | 0 kr |

#### Microneedling med Dermapen (5 st · Hair TP Clinic)

| API-id   | Namn                                  | Tid           | Pris     |
| -------- | ------------------------------------- | ------------- | -------- |
| **7121** | Microneedling med PRP: Ansikte        | 1 tim, 30 min | 5 800 kr |
| **7392** | Microneedling med PRP: Dekolletage    | 1 tim, 30 min | 5 800 kr |
| **7393** | Microneedling med PRP: Hals           | 1 tim, 30 min | 5 800 kr |
| **7394** | Microneedling med PRP: Händer         | 1 tim, 30 min | 5 800 kr |
| **7396** | Tilläggsområde: PRP och Microneedling | 30 min        | 1 500 kr |

#### Ortopedi · Curatiio (7 st · Curatiio)

| API-id   | Namn                            | Tid    | Pris     |
| -------- | ------------------------------- | ------ | -------- |
| **7109** | Ortopedisk PRP                  | 30 min | 3 900 kr |
| **7123** | Ortopedisk hyaluronsyra         | 1 tim  | 2 500 kr |
| **7124** | Ortopedisk PRP med hyaluronsyra | 30 min | 5 400 kr |
| **7406** | Ortopedisk PRF                  | 30 min | 3 900 kr |
| **7411** | Ortopedisk PRF med hyaluronsyra | 30 min | 5 400 kr |
| **7412** | Ortopedisk PRP: 3e behandlingen | 30 min | 3 500 kr |
| **7413** | Ortopedisk PRF: 3e behandlingen | 30 min | 3 500 kr |

#### PRP · Hud (5 st · Hair TP Clinic)

| API-id   | Namn                    | Tid    | Pris     |
| -------- | ----------------------- | ------ | -------- |
| **7117** | PRP: Ansikte            | 1 tim  | 4 300 kr |
| **7118** | PRP: Hals               | 1 tim  | 4 300 kr |
| **7119** | PRP: Dekolletage        | 1 tim  | 4 300 kr |
| **7120** | PRP: Händer             | 1 tim  | 4 300 kr |
| **7122** | Tilläggsområde: PRP Hud | 30 min | 1 500 kr |

#### PRP · Hår (6 st · Hair TP Clinic)

| API-id   | Namn                         | Tid    | Pris     |
| -------- | ---------------------------- | ------ | -------- |
| **7112** | PRP: Hår Standard            | 1 tim  | 4 300 kr |
| **7113** | PRP: Hår XL                  | 1 tim  | 4 800 kr |
| **7114** | PRP: Hår Mini                | 45 min | 2 500 kr |
| **7116** | PRP: Skägg                   | 1 tim  | 4 300 kr |
| **7133** | PRP: Underhållsbehandling TP | 45 min | 2 500 kr |
| **7395** | Tilläggsomårde: PRP Hår      | 30 min | 1 500 kr |

#### Uppföljning · Curatiio (5 st · Curatiio)

| API-id   | Namn                               | Tid    | Pris |
| -------- | ---------------------------------- | ------ | ---- |
| **7107** | Ögonlocksplastik: Suturborttagning | 30 min | 0 kr |
| **7410** | Uppföljning: Ögonlocksplastik      | 20 min | 0 kr |
| **8952** | Uppföljning: Botox                 | 20 min | 0 kr |
| **8953** | Uppföljning: Filler                | 20 min | 0 kr |
| **8954** | Uppföljning: Profilho              | 20 min | 0 kr |

#### Uppföljning · Hair TP Clinic (5 st · Hair TP Clinic)

| API-id   | Namn                                      | Tid    | Pris |
| -------- | ----------------------------------------- | ------ | ---- |
| **7130** | Uppföljning: Hårtransplantation DHI       | 30 min | 0 kr |
| **7131** | Uppföljning: Hårtransplantation FUE       | 30 min | 0 kr |
| **7134** | Uppföljning: Ögonbrynstransplantation DHI | 30 min | 0 kr |
| **7137** | Uppföljning: Skäggtransplantation DHI     | 30 min | 0 kr |
| **7405** | Uppföljning: Skäggtransplantation FUE     | 30 min | 0 kr |

#### Ögonlocksplastik · Curatiio (3 st · Curatiio)

| API-id   | Namn                            | Tid           | Pris      |
| -------- | ------------------------------- | ------------- | --------- |
| **7082** | Nedre ögonlocksplastik          | 2 tim, 30 min | 28 000 kr |
| **7085** | Övre ögonlocksplastik           | 2 tim, 30 min | 24 000 kr |
| **7105** | Övre och nedre ögonlocksplastik | 3 tim         | 44 000 kr |

### 3.4 Per-tjänst samtycken & hälsodeklarationer (2026-05-25)

Maskinläsbar export: [`migration/meridiq/service-bindings-catalog.json`](../../migration/meridiq/service-bindings-catalog.json)

**Källa:** `GET /api/v2/services` → `letter_of_consents[]`, `company_service_questionnaires[]` per tjänstobjekt.

| Stat                                | Antal |
| ----------------------------------- | ----: |
| Aktiva tjänster                     |    82 |
| Med behandlingsavtal (samtycke)     |    61 |
| Med hälsodeklaration (formulär)     |     5 |
| Utan varken samtycke eller formulär |    16 |
| Unika samtyckesmallar i bruk        |    12 |
| Unika hälsodeklarationer i bruk     |     4 |

#### Hälsodeklarationer kopplade till bokningstjänst (5 tjänster)

| Formulär API-id | Titel                                                 | Tjänst API-id      | Tjänstnamn                           |
| --------------- | ----------------------------------------------------- | ------------------ | ------------------------------------ |
| **16414**       | Hälsodeklaration · Hair TP Clinic                     | **7078**, **7079** | Fysisk + online konsultation         |
| **16415**       | Hälsodeklaration · Ögonlocksplastik                   | **7080**           | Ögonlocksplastik · Konsultation      |
| **14878**       | Hälsodeklaration · Ortopediska injektionsbehandlingar | **7081**           | Ortopedi · Konsultation              |
| **16472**       | Hälsodeklaration · Estetiska injektionsbehandlingar   | **8694**           | Estetiska injektioner · Konsultation |

Alla formulärkopplingar har `type: CUSTOM` (patient fyller i före/ vid bokning).

#### Behandlingsavtal kopplade till tjänst (12 mallar · 61 tjänster)

| Samtycke API-id | Titel                                        |                                                                      Tjänster |
| --------------- | -------------------------------------------- | ----------------------------------------------------------------------------: |
| **170917**      | Behandlingsavtal · TP                        |                                                25 (FUE/DHI/skägg/ögonbryn/är) |
| **170945**      | Behandlingsavtal · PRP hår                   |                                                                             5 |
| **170944**      | Behandlingsavtal · PRP hud                   |                                                                             5 |
| **170946**      | Behandlingsavtal · Microneedling och PRP     |                                                                             5 |
| **170949**      | Behandlingsavtal · Botulinumtoxin (Botox)    |                                                                             4 |
| **170950**      | Behandlingsavtal · Fillers                   |                                                                             3 |
| **170948**      | Behandlingsavtal · Profilho                  |                                                                             3 |
| **170954**      | Behandlingsavtal · Ögonlocksplastik          |                                                                             3 |
| **170943**      | Behandlingsavtal · Ortopedisk HA och PRP/PRF |                                                                             4 |
| **170941**      | Behandlingsavtal · Ortopedisk PRP/PRF        |                                                                             2 |
| **170942**      | Behandlingsavtal · Ortopedisk HA             |                                                                             1 |
| **152994**      | PRP hår – Platelet Rich Plasma - SWE ⚠️      | 1 (**7113** PRP Hår XL — legacy SWE-mall, övriga PRP hår använder **170945**) |

#### Tjänster utan kopplat samtycke eller formulär (16 st)

PRP-efterbehandlingar, uppföljningar (Hair TP + Curatiio), suturborttagning m.m. — se `services[]` där `consentCount=0` och `questionnaireCount=0` i JSON.

**Arcana-implication:** Konsultationer kräver hälsodeklaration; behandlingstjänster kräver behandlingsavtal före signering. Uppföljning/efterbehandling har medvetet inget nytt avtal i Meridiq idag.

---

## 4. Kassasystem (POS)

| Sida        | Funktion                                  | Hair TP | Curatiio |
| ----------- | ----------------------------------------- | ------- | -------- |
| Betalningar | `/point-of-sale/payment`                  | ✅      | ✅       |
| Produkter   | Produktbibliotek + kategorier             | ✅      | ✅       |
| Kvitto      | `/point-of-sale/receipt`                  | ✅      | ✅       |
| Fakturor    | `/point-of-sale/invoice`                  | ✅      | ✅       |
| Rapport     | `/point-of-sale/report`                   | ✅      | ✅       |
| Presentkort | `/point-of-sale/gift-card`                | ✅      | ✅       |
| Terminal    | `/point-of-sale/setting/terminal-setting` | ✅      | ✅       |

**Patientkort:** POS-ordrar tabell (ORDER-ID, produkt, datum, pris, antal, status).  
**API:** `GET /api/v3/point-of-sale/receipt_items?client_id=`

---

## 5. Mallar

### 5.1 Journal → Text (`/templates/text`)

| Mall                                     | Varumärke |
| ---------------------------------------- | --------- |
| Konsultationsmall \| Hair TP Clinic      | Hair TP   |
| Offert & Behandlingsplan \| TP           | Hair TP   |
| Ordinationsmall \| Hårtransplantation    | Hair TP   |
| Fyll i hälsodeklaration / friskförsäkran | Båda      |
| Med vänlig hälsning (signatur)           | Båda      |
| Curatiio-specifika konsultationsmallar   | Curatiio  |

### 5.2 Journal → Bild (`/templates/image`)

Före/efter-bildmallar — båda varumärken.

### 5.3 SMS (`/sms/templates`)

**Merge-fält:** `{{client_first_name}}`, `{{booking_date}}`, `{{booking_start_time}}`, `{{service_name}}`, `{{practitioner_name}}`, `{{clinic_name}}`, `{{client_email}}`

| Mall                      | Hair TP | Curatiio |
| ------------------------- | ------- | -------- |
| Bokningsbekräftelse       | ✅      | ✅       |
| Bokningspåminnelse        | ✅      | ✅       |
| Avbokningsbekräftelse     | ✅      | ✅       |
| Fyll i begärd information | ✅      | ✅       |
| INTERNT bokning/avbokning | ✅      | ✅       |
| ENG varianter             | ✅      | —        |

### 5.4 E-post (`/email/templates`)

- Offert & behandlingsplan (Botox, Fillers, Profilho, TP)
- Bokningsbekräftelse/avbokning
- Betänketid lag 2021:363, 14-dagars ånger
- Medical Finance betalningsinfo

---

## 6. Kommunikation

| Funktion                           | Route                  | Hair TP                                   | Curatiio                       |
| ---------------------------------- | ---------------------- | ----------------------------------------- | ------------------------------ |
| Skickade mejl + offerter           | `/communication/email` | Offert \| Hair TP Clinic                  | Individuell offert \| Curatiio |
| Offer-status                       | —                      | Skickad / Accepterad / Avvisad / Utgången | Samma                          |
| Marknads-SMS                       | `/communication/sms`   | Segmentering + credits                    | Segmentering                   |
| Skicka SMS/formulär/samtycke/filer | Patientkort            | ✅ audit log                              | ✅                             |

---

## 7. Patientkort — struktur

### 7.1 Gemensamt

| Fält / flik                                    | Innehåll                                          |
| ---------------------------------------------- | ------------------------------------------------- |
| Demografi                                      | Namn, ålder, e-post, telefon, personnummer        |
| Status                                         | Godkänd / Verifierad                              |
| Närmaste anhörig, Videosamtal, Viktig notering | Header                                            |
| **Före/efter**                                 | Bildbibliotek                                     |
| **Journaler**                                  | Ifyllda behandlingsjournaler                      |
| **Behandlingar**                               | Behandlingshistorik                               |
| **Anteckningar & Filer**                       | Filer + anteckningar                              |
| **Samtycken**                                  | Signerade avtal                                   |
| **Bokningar**                                  | Bokningshistorik                                  |
| **Ordinationer**                               | Recept/ordination                                 |
| **E-post**                                     | Skickade mejl                                     |
| **Formulär**                                   | Ifyllda formulär + PDF (S3)                       |
| **Betalning**                                  | Produkter, tjänster, presentkort, kvitto, faktura |

### 7.2 API-fält (`GET /api/v2/client/{id}`)

`first_name`, `last_name`, `personal_id`, `social_security_number`, `email`, `phone_number`, `is_personal_id_verified`, `addresses[]`, `verification{has_id, has_driving_license, has_passport}`, `important_note`, `fortnox_customer_id`, `cancel_marketing_at`

### 7.3 Patientlista

6455 patienter · sortering Senast tillagd · **Exportera**, **Sammanfoga** dubbletter · **Visa Fält**

---

## 8. Registreringsportal (Journalsystem → Konfigurering)

| Inställning                             | Hair TP     | Curatiio |
| --------------------------------------- | ----------- | -------- |
| Mejl till superuser vid ny registrering | ✅          | ✅       |
| Checkbox vid samtyckessignering         | ✅          | ✅       |
| Foto-publiceringssamtycke               | ✅          | ✅       |
| NRS-skala i journal                     | ✅ valfritt | ✅       |
| Obligatorisk BankID                     | ✅ valfritt | ✅       |
| Omdirigering efter bokning              | ✅          | ✅       |
| Flerspråk välkomsttext (SV/EN/ES)       | ✅          | ✅       |

---

## 9. Rapporter & QA

| Rapport | Route              | Innehåll                                                           |
| ------- | ------------------ | ------------------------------------------------------------------ |
| Journal | `/reports/record`  | Formulärcompletion, ordinationer (MAL vs egen), ålder, SMS, export |
| Bokning | `/reports/booking` | Bokningsstatistik                                                  |
| Kassa   | `/reports/pos`     | POS-statistik                                                      |

**API-typer:** `client_statistics`, `new_client_registrations`, `procedures_performed`, `top_questionnaires`, `prescriptions_signed`, `client_age`

---

## 10. Compliance & inställningar

| Funktion                 | Plats                              |
| ------------------------ | ---------------------------------- |
| PUB/DPA/Leverantörsavtal | `/settings/documents`              |
| Personuppgiftspolicy     | `/settings/personal-data-policy`   |
| Team / roller            | `/settings/team`                   |
| SMS/Video-krediter       | `/settings/credits`                |
| Import                   | `/settings/import`                 |
| Oföränderlig PDF-arkiv   | S3 signed URLs per ifyllt formulär |
| ID-verifiering           | Patientkort + API `verification`   |

---

## 11. API-referens (migration)

| Domän            | Endpoint                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Formulärmallar   | `GET /api/v2/questionary`, `GET /api/v2/questionary/{id}`                                                    |
| Ifyllda formulär | `GET /api/v2/client/{id}/questionaries`                                                                      |
| Samtycken        | `GET /api/v2/letter_of_consent`, `GET /api/client/{id}/letter_of_consents`                                   |
| Tjänster         | `GET /api/v2/services?per_page=50&page=N` — inkl. `letter_of_consents[]`, `company_service_questionnaires[]` |
| Patienter        | `GET /api/v2/client`, `GET /api/v2/client/{id}`                                                              |
| Bokningar        | `GET /api/v2/user/bookings?client_id=`                                                                       |
| POS              | `GET /api/v3/point-of-sale/receipt_items?client_id=`                                                         |
| Mejl/offert      | `GET /api/v3/company-emails`                                                                                 |

**Pagination:** `page`, `per_page` (max 50), `filter`, `filter_type`, `filter_value`

---

## 12. Hair TP vs Curatiio — vad Arcana måste ta över

| Område                | Hair TP Clinic                                          | Curatiio                                    | Arcana-prioritet |
| --------------------- | ------------------------------------------------------- | ------------------------------------------- | ---------------- |
| Formulär (8+2 aktiva) | Hälsodekl, friskförsäkran, TP-journal, PRP, uppföljning | Hälsodekl, friskförsäkran, ögonlock-journal | **P0** / **P1**  |
| Samtycken             | TP, PRP, microneedling, 14-dagars                       | Botox, filler, profilho, ögonlock, ortopedi | **P0** / **P1**  |
| Bokning (82 tjänster) | Konsult, FUE, DHI, PRP, uppföljning                     | Konsult, ögonlock, estetik, ortopedi        | **P0** / **P1**  |
| POS                   | Delad                                                   | Delad                                       | **P1**           |
| Offer accept/reject   | ✅                                                      | ✅                                          | **P1**           |
| Ordinationer          | ✅                                                      | ✅ _(ev. P2)_                               | **P2**           |
| QA-rapporter          | ✅                                                      | ✅                                          | **P2**           |
| Marknads-SMS          | ✅                                                      | ✅                                          | **P3** (CMO)     |

---

## 13. Komplettera denna inventering

1. ✅ **Tjänstekatalog** — 82/82 → [`migration/meridiq-service-catalog.json`](../../migration/meridiq-service-catalog.json)
2. ✅ **Formulär** — 16 mallar, 291 fält → [`migration/meridiq/questionary-catalog.json`](../../migration/meridiq/questionary-catalog.json)
3. ✅ **Samtycken** — 39 mallar → [`migration/meridiq/consent-catalog.json`](../../migration/meridiq/consent-catalog.json)
4. ✅ **Trippel-mapping** → [`migration/service-triple-map.json`](../../migration/service-triple-map.json)
5. ✅ Per-tjänst kopplade samtycken/questionaries → [`migration/meridiq/service-bindings-catalog.json`](../../migration/meridiq/service-bindings-catalog.json)
6. ✅ TP-journal UI: Meridiq **16411** — 52 datafält + 7 sektioner (`journal-tp-schemas.js`)
7. ✅ PRP-journal UI: **16412** (`tp_post_op`) + **14988** (`prp_skin`) — `journal-prp-schemas.js`
8. ✅ Uppföljning UI: **16407 / 16409 / 16390** — `journal-follow-up-schemas.js`
9. ✅ Ögonlocksjournal UI: **16388** (`bleph_treatment`) — `journal-bleph-schemas.js`
10. ✅ SMS/e-post/journal-malltexter (smsConnector mallar + bookingReminderEmail templates)

_Senast verifierad live: 2026-05-20._
