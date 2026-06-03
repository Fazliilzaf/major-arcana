# CCO Kunder — Segment Readiness (2026-06-03)

**Uppdaterad efter P0.5** (mobil kunder). Kod: `cco-kunder-real.js`, `cco-kunder-mobil-real.js`, `ccoKunderEnrichment.js`, `ccoKunderBookingEnrichment.js`. Mobil: `CCO-MOBIL-KUNDER-READINESS-2026-06-03.md`. Kalender: `CCO-KALENDER-KUNDER-INTEGRATION-READINESS-2026-06-03.md`.

**Scope:** Prod `/kunder.html` vs design `CCO-Kunder-Mockup-v9-DESKTOP.html`, mobil v10, `CCO-filter-och-smarta-funktioner.md`, `CCO-SYSTEM-SCOPE.md`.

**Arkitektur:** Lista/stats/segment via **`GET /api/v1/cco/staff/customers-shell`** (`buildKunderReadout` + `segmentStats` från patient-master + asset-index). Dossier: **`patientId`**, **`CcoJournalFeed.mount`**, assets **`/api/v1/cco/patients/:patientId/assets`**. Ingen `server.js`-ändring (asset store lazy-load i staff-route).

---

## P0.4 — leverans (2026-06-03)

| Område                    | P0.3 (~91%)         | P0.4 (~94%)                                         |
| ------------------------- | ------------------- | --------------------------------------------------- |
| Idag / vecka / väntelista | disabled            | **REAL** counts + filter (`booking-engine` + cases) |
| Behandling FUE/DHI/PRP/…  | disabled            | **REAL** via `serviceId` / encounter                |
| Kundrad                   | Assets + journal    | **+ nästa bokning, senast besök, encounter-gap**    |
| Dossier                   | Journal/assets/komm | **+ bokningsblock, öppna kalender**                 |
| Boka/omboka               | —                   | **disabled** "Kopplas i Kalender P1"                |
| API                       | `segmentStats`      | **+ `bookingCoverage`, booking fields på patient**  |

**Nya booking-fält:** `hasUpcomingBooking`, `nextBookingAt`, `nextBookingType`, `lastVisitAt`, `lastEncounterAt`, `treatmentTypes`, `bookingCaseId`, `encounterId`, `waitingListStatus`, `todayVisit`, `thisWeekVisit`, `missingEncounterForBooking`, `readyForVisit`.

## P0.5 — leverans (2026-06-03)

| Område         | P0.4 (~94%)      | P0.5 (~96% mobil)                    |
| -------------- | ---------------- | ------------------------------------ |
| Route          | `/kunder.html`   | **`/m-kunder.html`**                 |
| Data           | customers-shell  | **Samma API** — ingen mock           |
| Lista          | Desktop grid     | **Mobil rader** + badges             |
| Segment        | Side-nav + chips | **Horisontella chips** (13+ segment) |
| Sök            | `q=` global      | **`q=` global**                      |
| Dossier        | Panel            | **Full-screen sheet**                |
| Journal/assets | patientId        | **patientId** (samma mounts)         |
| Gate           | verify-kunder    | **+ verify-mobile-kunder**           |

**P0.5 klar:** Mobil Kunder som riktig CCO-arbetsyta. Se `CCO-MOBIL-KUNDER-READINESS-2026-06-03.md`.

## P0.3 — leverans (2026-06-03)

| Område                                      | P0.2 (~82%)               | P0.3 (~90%+)                                                                                                        |
| ------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Segment aggregates                          | 6–10 flag + rest disabled | **20+ real** (VIP, Aktiva, Nya, Dormant, saknar journal/form, GetAccept, halso@, bild-review, Drive journal/doc, …) |
| Side-nav                                    | — / disabled kalender     | **Real counts** från `segmentStats` eller disabled “Kalender P0.4”                                                  |
| Kundrad                                     | Bas + regler nästa steg   | **Enriched** (maskad kontakt, badges, journal/form/avtal/review)                                                    |
| Högerpanel                                  | 4 stats                   | **8 riktiga KPI** (journal/form/review/photo) — ingen LTV/intäkt/AI                                                 |
| Cmd+K                                       | `q=` global               | Oförändrat + **patientId** i träfflista                                                                             |
| API                                         | `buildPatientCardReadout` | **`buildKunderReadout`** + `segmentStats`                                                                           |
| Kalender (idag/vecka/väntelista/behandling) | disabled                  | **disabled** (P0.4)                                                                                                 |
| Mina                                        | disabled                  | **disabled** (ägare P1)                                                                                             |

**Readiness:** ~82% → **~91%** verksam arbetsyta.

**P0.4-förslag:** Koppla kalender/bokning till side-nav (idag, vecka, väntelista, behandling), `lastVisitAt` / `hasUpcomingBooking`, encounter från treatment store (ej bara asset-flag).

**Maskinläsbar:** `data/reports/cco-kunder-segment-readiness.json`

---

## P0.2 — leverans (2026-06-03)

| Område          | P0.1                | P0.2                                         |
| --------------- | ------------------- | -------------------------------------------- |
| Paginering      | 60 rader            | **Ladda fler** + “X av Y”                    |
| Cmd+K / sök     | Sida                | **Hela registret** (`q=` på customers-shell) |
| Side-nav mock   | Statiska tal i HTML | **—** eller disabled + real flag counts      |
| Segment         | 6 day1              | **10+ real** (flags API) + resten disabled   |
| Hidden kalender | I HTML              | **Borttagen** (~600 rader)                   |
| Gate            | verify-kunder       | **+ `cco:real-cco-gate`**                    |

## P0.1 — leverans (2026-06-03)

| Område                    | Före                            | Efter                                 |
| ------------------------- | ------------------------------- | ------------------------------------- |
| Lista                     | `CUSTOMER_ROWS` (13 mock)       | `customers-shell` paginering 60       |
| Toolbar/side/chips counts | 1 247, 234 VIP, …               | `stats` + flag-queries / **—**        |
| Höger KPI                 | 49 MSEK, 485 200 kr, 6 AI-rader | `stats` eller **"Data saknas"**       |
| Dossier-nyckel            | `displayName` → `DOSSIER_DATA`  | `patientId`                           |
| Journal                   | script inkluderad, ej mountad   | `CcoJournalFeed.mount`                |
| Assets                    | namn i URL                      | `patientId`                           |
| Drive                     | interim-sektion                 | borttagen ur runtime                  |
| Bulk / AI / mass          | mock-toasts                     | **disabled**                          |
| Gate                      | —                               | `verify-kunder-real-data.js` **PASS** |

**Manuell test:** `localStorage.ARCANA_ADMIN_TOKEN` (samma som staff preview) → `/kunder.html`.

---

## Executive summary

| Mått                                    | Före P0.1    | Efter P0.1                                           |
| --------------------------------------- | ------------ | ---------------------------------------------------- |
| **Kunder readiness (100% verksam)**     | **~34%**     | **~94%** desktop / **~96%** mobil (P0.5)             |
| UX/layout vs v9 mockup                  | ~88%         | ~88%                                                 |
| Data/API vs acceptance                  | ~18%         | **~62%**                                             |
| Mock/statiska fält (aktiva i listflöde) | ~52          | **~8** (dold kalender-shell, behandling-side HTML)   |
| API-kopplingar (list + dossier)         | 2 (1 broken) | **5** (shell, journal-feed, assets, komm, identitet) |
| Riktig kundlista på `/kunder.html`      | ❌           | **✅** (auth krävs)                                  |

**Slutsats:** `/kunder.html` visar **riktigt register** när staff är inloggad. Kvarvarande P0: paginering “ladda mer”, fler segment (VIP, Dormant, Mina, formulär/bild-aggregate), kalender-side mock i dold HTML, mobil v10.

---

## 1. Vad finns i riktiga `/kunder.html` efter P0.1?

| Yta                              | Finns      | Datakälla                                              | Status                                              |
| -------------------------------- | ---------- | ------------------------------------------------------ | --------------------------------------------------- |
| **Topnav**                       | ✅         | HTML statisk                                           | Oförändrad                                          |
| **Cmd+K / global sök**           | ✅         | Laddad sida + `patients?q=` debounce                   | **REAL** (inom aktuell sida; full DB = P1)          |
| **Vänster segment/filter**       | ✅         | `cco-kunder-real.js` → `flags` / disabled              | **REAL / PARTIAL**                                  |
| **Toolbar**                      | ✅         | `stats.total` + titel "Kunder"                         | **REAL**                                            |
| **Status-pills**                 | ✅         | Beräknat från `stats` + flag counts                    | **REAL / —**                                        |
| **AI/insikt-kort (4)**           | ❌ runtime | Borttagna ur höger render                              | **REMOVED**                                         |
| **Filter chips**                 | ✅         | Segment → API `flags` eller clientFilter               | **REAL / PARTIAL**                                  |
| **Kundlista**                    | ✅         | `customers-shell`                                      | **REAL**                                            |
| **Kundrad**                      | ✅         | `patientId`, namn, kontakt, flags, nästa-steg (regler) | **REAL**; LTV = **—**                               |
| **Höger panel**                  | ✅         | `renderRightPanel(stats)`                              | **REAL / "Data saknas"**                            |
| **Kundkort/dossiér**             | ✅         | `openDossier(card)` + `patientId`                      | **REAL**                                            |
| **Journal-feed**                 | ✅         | `CcoJournalFeed.mount`                                 | **REAL**                                            |
| **Timeline**                     | ✅         | Via journal-feed-modul                                 | **REAL** (samma API som demo)                       |
| **Formulär**                     | ⚠️         | Journal-feed / ej separat lista                        | **PARTIAL**                                         |
| **Bilder/assets**                | ✅         | `/api/v1/cco/patients/:patientId/assets`               | **REAL** (badges: imported, needsReview, …)         |
| **Historik/bokning**             | ⚠️         | Ej i P0.1 dossier-body                                 | **MISSING**                                         |
| **Avtal/ekonomi**                | ⚠️         | Disabled / data saknas                                 | **DISABLED**                                        |
| **Kommunikation**                | ✅         | `CcoKommPanel.mount(customerId)`                       | **REAL**                                            |
| **Drive (interim)**              | ❌         | Borttagen                                              | **REMOVED**                                         |
| **Kamera → journal**             | ⚠️         | UI kvar, spara disabled                                | **DISABLED**                                        |
| **Bulk actions**                 | ✅         | Disabled + tooltip                                     | **DISABLED**                                        |
| **Identitet merge/split/import** | ✅         | `/api/v1/cco-customer-identity/*`                      | **REAL**                                            |
| **Dold kalender-shell**          | ✅         | `hidden`                                               | **MOCK kvar** (Anna Karlsson i HTML — ej listflöde) |
| **Watch/voice**                  | ❌         | Dold i kunder-init                                     | **HIDDEN**                                          |

**Ny modul:** `public/cco-kunder-real.js` (defer efter inline shell).

---

## 2. Mock / statiskt — före vs efter P0.1

### Borttaget ur aktivt Kunder-flöde (P0.1)

| Element                                               | Status                      |
| ----------------------------------------------------- | --------------------------- |
| `CUSTOMER_ROWS`, `CUSTOMERS`, `DOSSIER_DATA`          | **Borttaget** (verify gate) |
| 1 247, 49 MSEK, 485 200 kr, 24 800 kr LTV i lista/KPI | **Borttaget**               |
| 4× agg-insight + 6× agg-ai-row                        | **Borttaget ur render**     |
| `renderDriveSection`, Drive URL                       | **Borttaget**               |
| AI/bulk mock-toasts                                   | **Disabled**                |
| Assets via `data-name` / namn-URL                     | **Ersatt med patientId**    |

### Kvar (ej listflöde eller P1)

| Element                                                            | Status                                       |
| ------------------------------------------------------------------ | -------------------------------------------- |
| Dold kalender: Anna Karlsson, bokningsdemo                         | **MOCK** i `hidden` HTML                     |
| Side behandling (DHI 142, PRP 389, …)                              | **MOCK counts** i statisk HTML — ej kopplade |
| Idag 12 / Vecka 47 / Väntelista 23                                 | **MOCK** i side — ej kopplade                |
| VIP / Dormant / Mina / GetAccept / halso@ / bild-aggregate segment | **disabled** i JS                            |
| LTV per rad                                                        | **—** (data saknas)                          |
| Kamera spara journal                                               | **disabled**                                 |

### Historisk inventering (pre-P0.1)

Allt nedan var `MOCK_REMOVE` / `NEEDS_REAL_API` — de flesta list-/KPI-punkter är nu lösta.

### Globala tal (var MOCK_REMOVE)

| Plats                                                            | Värde          | Tag            |
| ---------------------------------------------------------------- | -------------- | -------------- |
| Toolbar h2, side "Alla", chip "Alla", search kicker, agg Totalt  | **1 247**      | MOCK_REMOVE    |
| Status bar LTV                                                   | **24 800 kr**  | NEEDS_REAL_API |
| Agg höger Snitt LTV                                              | **24,8k**      | NEEDS_REAL_API |
| Agg chart                                                        | **485 200 kr** | MOCK_REMOVE    |
| Side: Mina 186, Idag 12, Vecka 47, Väntelista 23                 | alla           | NEEDS_REAL_API |
| Side behandling: DHI 142, PRP 389, Microneedling 98, Konsult 618 | alla           | NEEDS_REAL_API |
| Side status: VIP 234, Risk 12, Nya 89, Dormant 456               | alla           | NEEDS_REAL_API |
| Chips: Aktiva 87, Saknar formulär 28, …                          | alla           | NEEDS_REAL_API |
| Pills: 87 aktiva i maj, +89/30d trender                          | alla           | NEEDS_REAL_API |

### AI / insikter (MOCK_REMOVE)

| Element                                                            | Tag            |
| ------------------------------------------------------------------ | -------------- |
| 4× `agg-insight` (Anna friskförs., 5 VIP 60d, +8% Q2, 28 formulär) | MOCK_REMOVE    |
| 6× `agg-ai-row` högerpanel                                         | MOCK_REMOVE    |
| `cr-ai` per rad (13 fiktiva nästa-steg)                            | NEEDS_REAL_API |
| Klick → toast "AI-åtgärd startad"                                  | MOCK_REMOVE    |

### Kundpopulation (MOCK_REMOVE)

| Element                                    | Tag            |
| ------------------------------------------ | -------------- |
| `CUSTOMERS` (12) Cmd+K                     | MOCK_REMOVE    |
| `CUSTOMER_ROWS` (13) lista                 | MOCK_REMOVE    |
| `DOSSIER_DATA` + `getDossier()` fallback   | MOCK_REMOVE    |
| Alla **Anna Karlsson** / Karl / Eva … namn | MOCK_REMOVE    |
| Per-rad `revenue` / LTV (t.ex. 38 400 kr)  | NEEDS_REAL_API |
| `lastVisit` / `lastSub` text               | NEEDS_REAL_API |

### Dossier-innehåll (NEEDS_REAL_API)

| Sektion                                    | Tag                                                     |
| ------------------------------------------ | ------------------------------------------------------- |
| Kommande/historik bokningar                | NEEDS_REAL_API (`ccoBookingStore` / encounters)         |
| Filer (emoji-lista)                        | NEEDS_REAL_API → journal-feed eller assets              |
| Anteckningar "Begränsad info i mockup…"    | MOCK_REMOVE                                             |
| Dubbel kommunikation (mock + CCO host)     | MOCK_REMOVE en                                          |
| Ekonomi mock                               | NEEDS_REAL_API (`ccoPaymentStatusAdapter` / CF partial) |
| AI-insikter i dossier                      | MOCK_REMOVE                                             |
| Quick actions "Boka PRP", "Bekräfta tider" | DISABLE tills API                                       |

### Drive / compliance (MOCK_REMOVE)

| Element                                      | Tag         |
| -------------------------------------------- | ----------- |
| `<details>Drive (interim)`                   | MOCK_REMOVE |
| `renderDriveSection`, `dossier-drive-link`   | MOCK_REMOVE |
| Provenance-text "Originalfiler kvar i Drive" | MOCK_REMOVE |

### Beteende kommenterat i kod

- `// Filter-chips (mock filtrering — bara visuell selection)` → **MOCK**
- `// kunder.html använder namn som customer-key` → **BLOCKED_DATA**
- `body[data-stage="live"]` → **misleading** (ej live data)

**Antal unika mock/statiska datapunkter:** **~52** (räknat i JSON).

---

## 3. Segment — counts efter P0.1

| Segment                               | Count-källa                  | Filter       | Status                      |
| ------------------------------------- | ---------------------------- | ------------ | --------------------------- |
| Alla kunder                           | `stats.total`                | ingen flag   | **REAL**                    |
| Mina kunder                           | —                            | —            | **DISABLED** (ägare saknas) |
| Aktiva                                | client + `hasJournalHistory` | clientFilter | **REAL** (sida)             |
| VIP                                   | —                            | —            | **DISABLED**                |
| Risk / Needs review                   | `flags=needs_review`         | API          | **REAL**                    |
| Nya                                   | client `new` / unmatched     | clientFilter | **REAL** (sida)             |
| Dormant                               | —                            | —            | **DISABLED**                |
| Saknar formulär                       | —                            | —            | **DISABLED** (P1 aggregate) |
| Saknar journal                        | client `no_journal`          | clientFilter | **REAL**                    |
| Har Drive journal                     | `flags=has_drive_files`      | API          | **REAL**                    |
| GetAccept / halso@ / bild needsReview | —                            | —            | **DISABLED**                |
| Idag / vecka / väntelista (side)      | statisk HTML                 | —            | **MOCK** (ej kopplad)       |
| Behandling (DHI, PRP, …)              | statisk HTML                 | —            | **MOCK** (ej kopplad)       |

### A. Kundgrupper

| Segment        | P0.1          |
| -------------- | ------------- |
| Alla kunder    | ✅            |
| Mina kunder    | disabled      |
| Idag / besöker | P1 (kalender) |
| Denna vecka    | P1            |
| Väntelista     | P1            |

### B. Status — `flags` + clientFilter

`needs_review`, `has_drive_files`, `missing_email`, `missing_phone`, `cliento_only`, `drive_only` via **customers-shell**. VIP/Dormant kräver affärsregel eller ny flagga.

### C. Behandling — **MOCK**; källa: encounter/journey/booking

FUE, DHI, PRP, Microneedling, Konsultation, Uppföljning, Curatiio → filtrera på `plannedTreatment` / encounter-typ.

### D. Import/historik — **PARTIAL**

| Signal             | Store/API                          | I kunder.html           |
| ------------------ | ---------------------------------- | ----------------------- |
| halso@             | journal/forms                      | Ej i lista              |
| GetAccept          | `ccoLegacyAgreementStore` / offers | Ej i lista              |
| Drive journal/dok  | migration index                    | **Ej UI-länk** (mandat) |
| Bilder needsReview | `ccoPatientAssetStore`             | Assets API (fel nyckel) |
| Import review      | `cco-import-review-queue`          | Ej i lista (egen route) |

### E. Arbetskö — **MISSING** i `kunder.html`

Behöver journal, formulär, bildreview, encounter review, mail review, ekonomi, redo besök, uppföljning förfallen → worklist/flags från ops + patient card readout.

---

## 4. Datakällor — mappning (efter P0.1)

| Store / källa                       | Används i kunder.html?   | Koppla till                  |
| ----------------------------------- | ------------------------ | ---------------------------- |
| `ccoPatientMasterStore`             | ✅ via `customers-shell` | Lista, stats, segment counts |
| `ccoCustomerStore`                  | ✅                       | `patientId` → journal-feed   |
| `ccoJournalStore`                   | ✅                       | `CcoJournalFeed.mount`       |
| `ccoPatientAssetStore`              | ✅                       | `patientId` i assets         |
| `ccoLegacyAgreementStore` / offers  | ❌                       | Avtal-flik                   |
| `ccoTreatmentEncounterStore`        | ❌                       | Behandling filter, historik  |
| `ccoBookingStore` / booking cases   | ❌                       | Idag/vecka, nästa steg       |
| `ccoPaymentStatusAdapter` / finance | ❌                       | LTV/betalstatus (om finns)   |
| Mail/conversation                   | ❌                       | Komm-panel                   |
| `cco-import-review-queue`           | ❌                       | Segment "needs review"       |
| `ccoCustomerIdentity`               | ✅                       | Merge/split/import only      |

**Rätt list-API (prod-verifierat):**

- `GET /api/v1/cco-patient-master/stats`
- `GET /api/v1/cco-patient-master/patients?q=&flags=&limit=&offset=`
- `GET /api/v1/cco-patient-master/patient?patientId=`

**Rätt kundkort-API (ej kopplat):**

- `GET /api/v1/cco-customers/:id/journal-feed`
- `GET /api/v1/cco-customers/:id/journal-timeline`
- `GET /api/v1/cco-customers/:id/agreements`
- `GET /api/v1/cco-customers/:id/communication-feed`
- `GET /api/v1/cco/patients/:patientId/assets` (patientId, inte namn)

---

## 5. API readiness — `cco-kunder-real.js`

| Route                                              | Används | Auth                        | Bedömning                       |
| -------------------------------------------------- | ------- | --------------------------- | ------------------------------- |
| `GET /api/v1/cco/staff/customers-shell`            | ✅      | Bearer `ARCANA_ADMIN_TOKEN` | **OK** — lista + stats          |
| `GET /api/v1/cco/patients/:patientId/assets`       | ✅      | Bearer                      | **OK**                          |
| `GET /api/v1/cco-customers/:id/journal-feed`       | ✅      | via `CcoJournalFeed`        | **OK**                          |
| `GET /api/v1/cco-customers/:id/communication-feed` | ✅      | via `CcoKommPanel`          | **OK**                          |
| `GET /api/v1/cco-customer-identity/*`              | ✅      | operator (inline modal)     | **OK**                          |
| Direkt `cco-patient-master/*` från sidan           | ❌      | —                           | Shell är canonical (samma data) |

Utan token: auth-banner, tom lista — **ingen mock-fallback**.

---

## 6. Kundrad — efter P0.1

| Fält                            | Status                                                     |
| ------------------------------- | ---------------------------------------------------------- |
| `patientId` / `data-patient-id` | **REAL**                                                   |
| namn                            | **REAL** (`displayName`; tekniska filnamn → "Namn saknas") |
| kontakt                         | **REAL** / —                                               |
| status                          | **REAL** (match + flags → risk/ny/aktiv)                   |
| senast besök                    | **PARTIAL** (`lastActivityAt` om finns)                    |
| behandling                      | **MISSING**                                                |
| nästa steg                      | **REAL** (regelbaserad, ej generativ AI)                   |
| LTV / intäkt                    | **—** (disabled)                                           |
| importstatus                    | **REAL** (`matchLabel`)                                    |
| flaggor                         | **REAL** (needs_review, missing_email, …)                  |
| snabbkort                       | **REAL** (`openDossier`)                                   |

**Bulk checkbox:** disabled (P0).

---

## 7. Högerpanel / översikt

| KPI                                       | Efter P0.1                   |
| ----------------------------------------- | ---------------------------- |
| Totalt / needs_review / missing_email / … | **REAL** från `stats`        |
| Intäkt / LTV / veckodiagram               | **"Data saknas"** eller dolt |
| AI-insikter                               | **Borttaget**                |
| Mass-påminnelse / export                  | **DISABLED**                 |

---

## 8. Actions

| Action                                          | Efter P0.1                                     |
| ----------------------------------------------- | ---------------------------------------------- |
| Öppna kundkort                                  | **REAL** (`patientId`)                         |
| Öppna journal (full vy)                         | länk till `journal-feed-demo.html?customerId=` |
| Skapa journal / Boka / formulär / offert / bulk | **DISABLED**                                   |
| Ta bild                                         | UI **DISABLED** spara                          |
| Exportera                                       | **DISABLED**                                   |

---

## 9. Acceptanskriterier (10 punkter + mobil)

| #   | Kriterium                           | P0.1                                        |
| --- | ----------------------------------- | ------------------------------------------- |
| 1   | Alla siffror från riktig API        | ⚠️ (list/KPI ja; side behandling mock)      |
| 2   | Inga mock-tal i listflöde           | ✅                                          |
| 3   | Segment/filter korrekta kunder      | ⚠️ (day1-segment ja; VIP/Dormant disabled)  |
| 4   | Klick → riktigt kundkort            | ✅                                          |
| 5   | Journal/timeline/assets             | ✅ journal + assets; formulär/avtal partial |
| 6   | Personal ser vad som behöver göras  | ⚠️ (flags + nästa-steg regler)              |
| 7   | Osäkra importer i review            | ⚠️ (needs_review i lista + identity modal)  |
| 8   | Bulk disabled                       | ✅                                          |
| 9   | Inga Drive-länkar                   | ✅                                          |
| 10  | Inga tekniska filnamn som huvudnamn | ✅ (sanitize)                               |
| 11  | Mobil v10                           | ❌ (senare)                                 |

---

## 10. Readiness %

| Dimension                          | Före     | Efter P0.1 |
| ---------------------------------- | -------- | ---------- |
| v9 UX/layout                       | 88       | 88         |
| Segment/filter logik               | 5        | **48**     |
| List + rad data                    | 8        | **78**     |
| Dossier + journal                  | 22       | **72**     |
| Compliance (no Drive, no mock KPI) | 12       | **88**     |
| **Viktad 100% verksam**            | **~34%** | **~82%**   |

Gate: `npm run cco:verify-kunder-real-data` + **`npm run cco:real-cco-gate`** (canonical CCO). `cco:presentation-gate` kan fortfarande faila på legacy demo-routes — blockar inte Kunder-P0.

---

## 11. Prioriterad byggordning

### P0.1 — **klar**

Lista, patientId, dossier, journal, assets, mock KPI borta.

### P0.2 — **klar**

Paginering, global sök, flag-segment, side-nav disabled/real counts, calendar-shell bort, `cco:real-cco-gate`.

### P0.3 — kvar

1. **Segment aggregate:** VIP, Dormant, Mina, Aktiva, Nya, Saknar journal/formulär/encounter, GetAccept, halso@, bild-review.
2. **Kundrad:** behandling, avtalstatus, formulärstatus från journal-feed aggregate.
3. **Högerpanel:** worklist-insikter (ej generativ AI).
4. **Voice/watch overlays:** bort från HTML helt (delvis remove() i runtime).
5. **Mobil:** `m-kunder.html`.

### P1 — vardag

- Segment arbetskö (saknar journal/formulär/bild/mail/ekonomi).
- Behandling/FUE/DHI/… filter via encounter.
- Export GDPR från rad/dossier.
- Koppling kalender "Idag besöker".
- `m-kunder.html` från v10 eller redirect till responsiv `kunder.html`.

### P2 — polish

- Agg-insights från worklist (ej generativ AI).
- Nästa-steg från mail/booking rules (`CCO-filter-och-smarta-funktioner.md`).

### P3 — pausat

- Extern AI på journaltext, Aisia, auto mass-påminnelse, voice/watch i kunder-vyn.

---

## 12. Exakt nästa build-step

**P0.3:** Kundkort/dossier komplett — journal-historik, formulär/avtal-status på rad, segment från journal-feed aggregate. **P0.4:** Kalender/idag/vecka kopplat till booking API.

**Bygg INTE:** ny demo-sida, ny import, Photo Review auto, massapproval, Aisia, Fortnox-write, server.js/journalroute-ändring.

---

_Relaterat:_ `CCO-SOURCE-OF-TRUTH-LOCAL-SHEETS-2026-06-03.md`, `CCO-SYSTEM-SCOPE.md` §1 Kundmaster.
