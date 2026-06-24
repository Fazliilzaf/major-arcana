# V12 Workspace — Facit-gap + datakälle-kartläggning (Zon 2) · 2026-06-23

**Status:** Gissningsfri jämförelse. Facit läst i sin helhet, live + datakällor verifierade mot `origin/main` HEAD `02339306`.
**Facit:** `V12-WORKSPACE-CONTENT-CANON-2026-06-21.html` (iCloud / Major Arcana 2.0), Anna Karlsson steg 4, aktivt besök pågår.
**Live:** `cco-v12-workspace.js` (renderare), `cco-v11-rail-adapters.js` (adaptrar), `cco-v12-workspace.css`.
**Datakälla:** `/api/v1/cco-patient-master/patient/dossier-bundle` (`src/routes/ccoPatientMaster.js:801`).

---

## 0. Status-uppdatering 2026-06-24 (efter Fas-3-batchen)

**Detta dokument skrevs 2026-06-23 och är delvis inaktuellt.** Följande gap stängdes i Fas-3-batchen _efter_ att gap-analysen skrevs:

| Gap (per 06-23)                           | Status nu                 | Var                                                                                                 |
| ----------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| #4 Hälsa läkemedelskort (backend-gap)     | ✅ **Klart**              | Läkemedel ur hälsodeklarationen (PR #219)                                                           |
| #7 Bilder jämför-par + gap-varning        | ✅ **Klart**              | Före/efter-par + krona/hårlinje-gap (PR #212/#222)                                                  |
| #11 Ekonomi-fakturarader                  | ✅ **Klart**              | `buildEconomyInvoices` (denna gap-PR)                                                               |
| C · Aktivt besök 6-noders timeline        | ✅ **Klart + verifierat** | `renderActiveVisitModule` (6 noder) + adapter `showTimeline/journalStarted/checkedInAt/completedAt` |
| C · Kundresa per-steg-länkar              | ✅ **Klart + verifierat** | adapter `jump: journeyJumpSlug(label)` + renderare `data-kk-jump` + `JOURNEY_DEST_LABEL`            |
| C · Nuläge quick-knappar / Förbered besök | ✅ **Klart**              | `renderCurrentStateModule` (Ny bokning, Redigera, Förbered, Åtgärder)                               |
| (nytt) Dokument manuell PDF-upload        | ✅ **Klart**              | `POST /cco-journal-quick/document` + "+ Lägg till PDF" (PR #228)                                    |

**Verifiering 2026-06-24 (synthetic render mot serverad bundle):** Aktivt besök → 6 noder i alla states med korrekt klar/aktiv-progression (checked_in 2 klara, in_progress+journal 3 klara, completed_today 4 klara). Kundresa → 10 `data-kk-jump`-knappar + 9 "Öppna X →"-chips.

**Alla 13 moduler är nu innehållsmässigt kompletta mot CONTENT-CANON.** Kvar = endast **D · arkitektur** (canon-beslut, se §3 D + `V12-FAS4-JOURNEY-SPINE-PLAN.md`).

---

## 1. Arkitektur-sanning (verifierad)

- **`/admin#cco` ÄR live-appen.** Servern serverar `major-arcana-preview`-koden för `/admin` (`server.js:11504` → `sendAdminHtml`). Ingen separat extern mockup.
- **Mock-api är AV på prod.** `mock-worklist-api.js`: `isDemoMode()` = false om inte `?demo=1`/`?mockApi=1` eller localhost. Prod hittar riktiga endpoints.
- **V12-workspace är default ON på prod** (`cco-v12-workspace-flag.js`, opt-out).
- **Deploy regenererar bundle.** `render.yaml buildCommand: npm ci && npm run build:bundle && node ./bin/inject-bundle.js` → committad bundle-hash/index.html är irrelevant; byggs från källan vid deploy.

---

## 2. Datakälle-kartläggning — 10/13 moduler LIVE-wirade

dossier-bundle returnerar: `card`, `activeVisit`, `journalEntries`, `bookings`, `upcomingBookings`, `historyBookings`, `commercialCase`, `paymentStatus`, `quotedAmount`, `paymentHistory`, `driveFiles`, `documents`, `documentBundle`, `occasionTimeline`.

| # Modul          | Riktig data finns?                                   | Adapter läser den?                                                                            | Status                                           |
| ---------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1 Nuläge/profil  | `card` ✓                                             | `buildProfileFromBcard` ✓                                                                     | 🟢 LIVE                                          |
| 2 Aktivt besök   | `activeVisit` ✓                                      | `buildActiveVisitFromBundle` ✓                                                                | 🟢 LIVE (timeline 3-node, facit 6)               |
| 3 Varningar      | card/journal/bundle ✓                                | `buildCriticalWarnings` ✓                                                                     | 🟢 LIVE                                          |
| 4 Hälsa          | allergier ✓ · läkemedel ur hälsodeklaration ✓        | `buildHealthPreview` (allergier + medications)                                                | 🟢 LIVE (läkemedel klart, PR #219 — se §0)       |
| 5 Kundresa       | card/journal/bundle ✓                                | `buildJourneyFromState` ✓                                                                     | 🟢 LIVE (saknar per-steg-länkar)                 |
| 6 Journal        | `journalEntries` ✓                                   | `buildJournalModule` ✓                                                                        | 🟢 LIVE                                          |
| 7 Bilder         | `driveFiles` ✓                                       | `buildPhotosFromDriveFiles` ✓ (jämför-par + gap)                                              | 🟢 LIVE (jämför/gap klart, PR #212/#222 — se §0) |
| 8 Bokningar      | upcoming/history ✓                                   | ✓                                                                                             | 🟢 LIVE                                          |
| 9 Dokument       | `documents`/`documentBundle`/`commercialCase` ✓      | ✓                                                                                             | 🟢 LIVE                                          |
| 10 Kommunikation | `occasionTimeline` ✓                                 | ✓                                                                                             | 🟢 LIVE                                          |
| 11 Ekonomi       | nyckeltal ✓ · **`paymentHistory` (Fortnox/Swish) ✓** | `buildEconomyFromCard` (nyckeltal) + **`buildEconomyInvoices` (fakturor — fixad 2026-06-23)** | 🟢 LIVE efter denna fix                          |
| 12 Insikter      | card-signaler ✓                                      | ✓                                                                                             | 🟢 LIVE                                          |
| 13 Sticky        | bundle ✓                                             | ✓                                                                                             | 🟢 LIVE                                          |

---

## 3. Gap-klassificering

### A · Frontend wiring-gap (säker fix, ingen backend)

- **Ekonomi-fakturarader** — `paymentHistory` fanns i bundlen men `buildEconomyFromCard` läste bara `card`-nyckeltal. **ÅTGÄRDAD 2026-06-23** via `buildEconomyInvoices(paymentHistory)` (denna PR).

### B · Backend/datamodell-beslut (owner krävs)

- ✅ **Hälsa läkemedel/kontraindikationer — LÖST (PR #219).** Hälsodeklarationen parsas nu för läkemedel (`ccoHalsoHealthDeclarationParser.pickMedications`) → `buildHealthPreview` läkemedelspiller. Ordinationslistor i SharePoint = separat cred-gatat spår (#221).

### C · Presentation/polish (data finns, bara rendering)

- ✅ Aktivt besök: 6-noders timeline — **klart + verifierat** (se §0)
- ✅ Kundresa: per-steg-länkar (dok/foto/journal) — **klart + verifierat** (se §0)
- ✅ Bilder: jämför-par-bar + gap-varning — **klart** (PR #212/#222)
- ✅ Nuläge: quick-knappar + "Förbered besök"-CTA — **klart**
- Dokument: 2-kol-grid vs 3-subsektion (canon-fråga — kvar)
- Insikter: grön "Möjlighet"-kort-styling (kvar — kosmetisk)

### D · Layout/arkitektur (canon-beslut)

- Companion-rail: facit = minimal 320px jump-rail; live = full V11-rail som ingång
- Layout: facit = full-sida; live = overlay från rail-klick

---

## 4. Palett — VIKTIGT

V12 Zon 2 = **LOUD** palett (`--amber-bg .16`). AMBER-DEMPAD gällde ENBART Zon 1-railen. **Zon 2 ska INTE dämpas.**

---

## 5. Ekonomi-fix (denna PR) — detaljer

**Vad:** `buildEconomyInvoices(paymentHistory)` i `cco-v11-rail-adapters.js` mappar Fortnox/Swish-rader → `{date, title, amount, status, statusLabel}`. V12 `render()` läser `ctx.dossierBundle.paymentHistory`; `renderEconomyModule` renderar "Fakturor & betalningar"-block.

**Regler följda:**

- Ingen fejkdata — tom/saknad lista → `count:0` → dämpad not (verifierat)
- Empty/unknown-state — `econInvoiceStatusLabel` → "Okänd" vid okänd status
- Inga write-handlers — display-only
- Ingen designombyggnad — återanvänder econ/doc-mönster + tokens
- Kantfall — ogiltigt datum→'—', tomt belopp→'—', tom ref→"Faktura"

**Verifierat:** adapter-enhetstest (tom→0, 3 testrader korrekta), full render-kedja (HTML innehåller faktura-block + status-färger), visuell screenshot (Betald grön / Väntar amber / Makulerad röd).

---

_Genererad från facit-läsning + källkods-verifiering. Inga gissningar._
