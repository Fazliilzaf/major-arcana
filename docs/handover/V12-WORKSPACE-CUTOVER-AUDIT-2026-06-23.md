# V12 Customer Workspace — Slutpass / Cutover-audit

> **Typ:** Read-only helhetsgranskning (docs-only). **Ingen ny kod, ingen polish, ingen CI-fix, ingen default ON.**
> **Datum:** 2026-06-23 · **main @ `c2c92ac`** (Block 13 mergad) · **Flagga:** `?v12workspace=on` (default **OFF**).
> **Föregående:** canon `V12-CUSTOMER-WORKSPACE-CANON-2026-06-22.md`, inventory `V12-WORKSPACE-INVENTORY-2026-06-21.md`.
> **Syfte:** verifiera helheten inför ev. cutover-beslut — **inte** bygga fler moduler.
> Granskningen är kod-/render-nivå (browserlös server-render + statisk kodläsning). Pixel-/browser-
> console-verifiering på riktiga viewports sker via workflow `v12-workspace-screenshots.yml` (390/820/1440).

---

## 1. Sammanfattning

Alla **13 canon-sektioner** är byggda och mergade till `main`, additivt bakom `?v12workspace=on`
(default OFF). Helheten renderar utan fel, i exakt canon-ordning 1→13, i rent `.v12-workspace__`-
namespace, utan nya write-handlers. **En (1) känd funktionell gap** kvarstår: V11-rail-deep-links
scroll:ar inte till motsvarande V12-sektion (anchor-router saknas) — sedan tidigare dokumenterad
(#142 V2-begränsning / inventory cross-cutting). Inga blockerare för fortsatt opt-in-användning.

**Cutover-rekommendation:** redo för Codex/owner-granskning. Default ON bör **inte** aktiveras förrän
(a) anchor-router-gapet är åtgärdat eller uttryckligen accepterat, och (b) pixel-/console-verifiering
på riktiga viewports är granskad. Se §12.

---

## 2. Granskade punkter (status)

| #   | Granskning                            | Status                                      | Not                                                               |
| --- | ------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Render-ordning 1–13                   | ✅ PASS                                     | Exakt canon-ordning (§3)                                          |
| 2   | V11/legacy opåverkat när flaggan av   | ✅ PASS                                     | Guardad mount-switch (§4)                                         |
| 3   | `?v12workspace=on` på 390/820/1440    | ✅ PASS (kod) · ⏳ pixel via CI             | Responsiv modell verifierad i kod (§5)                            |
| 4   | Deep-links/anchors V11→V12            | ⚠️ PARTIAL                                  | Action-handlers wire:ade; anchor-scroll-router saknas (§6, GAP-1) |
| 5   | Sticky arbetsbar mobil/tablet/desktop | ✅ PASS                                     | sticky <1280, statisk ≥1280 (§7)                                  |
| 6   | Inga nya handlers/write-flöden        | ✅ PASS                                     | Inga `addEventListener`/nya write-handlers (§8)                   |
| 7   | Empty/unknown-states                  | ✅ PASS                                     | Per modul (§9)                                                    |
| 8   | Console errors                        | ✅ PASS (server-render) · ⏳ browser via CI | Ren server-render (§10)                                           |
| 9   | Namespace/CSS-isolering               | ✅ PASS                                     | 100 % `.v12-workspace__`, inga legacy-override (§11)              |

---

## 3. Render-ordning 1–13 (PASS)

`CcoV12Workspace.render(ctx)` (`cco-v12-workspace.js`) bygger inner-HTML i denna ordning, vilket
exakt matchar canon §2 (sektion 1→13):

| Canon # | Sektion                 | Renderare                      | Adapter-återbruk                                                                   |
| ------- | ----------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| 1       | Kundens nuläge          | `renderCurrentStateModule`     | `buildProfileFromBcard` + `buildStatsFromExtras`                                   |
| 2       | Aktivt besök            | `renderActiveVisitModule`      | `buildActiveVisitFromBundle`                                                       |
| 3       | Kritiska varningar      | `renderCriticalWarningsModule` | `buildCriticalWarnings`                                                            |
| 4       | Hälsa                   | `renderHealthModule`           | `buildHealthPreview`                                                               |
| 5       | Kundresa / steg         | `renderJourneyModule`          | `buildJourneyFromState`                                                            |
| 6       | Journal                 | `renderJournalModule`          | `CcoV12WorkspaceAdapters.buildJournalModule`                                       |
| 7       | Bilder / före–efter     | `renderPhotosModule`           | `buildPhotosFromDriveFiles`                                                        |
| 8       | Bokningar               | `renderBookingsModule`         | `buildBookingsFromExtras` + `buildHistoryFromExtras`                               |
| 9       | Dokument                | `renderDocumentsModule`        | `buildOffersFromPayload` + `buildAutoDocsFromPayload` + `buildFilesFromDriveFiles` |
| 10      | Kommunikation           | `renderCommunicationModule`    | `buildCommunicationFromState`                                                      |
| 11      | Ekonomi                 | `renderEconomyModule`          | `buildEconomyFromCard`                                                             |
| 12      | Insikter & nästa åtgärd | `renderInsightsModule`         | `buildSmartNextStep` + `buildInsightsFromSignals`                                  |
| 13      | Sticky arbetsbar        | `renderStickyBarModule`        | `buildStickyActions`                                                               |

**Verifierat:** full server-render med riktig testdata → 13/13 `data-v12-module`-sektioner närvarande,
i stigande ordning, render kastar inget fel.

---

## 4. V11/legacy-isolering när flaggan är av (PASS)

- **Flagga (`cco-v12-workspace-flag.js`):** `enabled = localStorage.getItem('arcana.v12workspace.enabled') === '1'`
  → **default false**. Sätter `data-v12-workspace="on"|"off"` på `documentElement`.
- **Mount-switch (`patient-master-ui.js` `renderV9MockupDetailShell`):**
  `if (usesV12Workspace()) return renderV12WorkspaceDetailShell(...)` ligger **först**, därefter
  `usesV11Rail()`, därefter legacy. När flaggan är av tas V12-grenen aldrig → V11/legacy-paths körs
  helt oförändrade. `usesV12Workspace()` läser enbart `data-v12-workspace === 'on'`.
- **Enda legacy-kontaktpunkt:** mount-switchen (Block 0). Samtliga 13 modul-PR:er rörde **inte**
  `patient-master-ui.js`, `cco-v11-rail.*`, `cco-v9-*` eller `cco-kunder-smart-next-step.js`
  (verifierat per PR-diff vid merge).

---

## 5. `?v12workspace=on` på 390 / 820 / 1440 (PASS i kod · pixel via CI)

Responsiv modell (canon D3) i `cco-v12-workspace.css`:

- **Mobil (<768):** `.v12-workspace__zone1` (V11-rail) döljs; V12 (Zon 2) äger ytan, en kolumn.
- **iPad (≥768):** `.v12-workspace__zones` blir flex; Zon 1 `flex 0 0 360px` bredvid Zon 2.
- **Webb (≥1280):** Zon 1 `400px` bredvid Zon 2.
- Modul-interna grids är responsiva: bilder 2→3 kol, ekonomi 2→4 kol (`@media (min-width:768px)`).

Pixel-/layout-verifiering på riktiga 390/820/1440 produceras av workflow
`v12-workspace-screenshots.yml` (ett generate+upload-steg per modul → PNG-artefakter). Browserlös
preview per modul finns i `docs/handover/MOCKUPS/v12-workspace-*/viewport-preview.html`.

---

## 6. Deep-links / anchors V11 → V12 (PARTIAL — GAP-1)

**Wire:at (fungerar):** V12-shellen binds via samma `bindV9MockupDossierHandlers(root, ctx)` som
V11/legacy (`patient-master-ui.js` ~9013/9030/9180). Det wire:ar de **befintliga** action-handlers
som V12-modulerna bär:

| Attribut (antal i V12)            | Handler                                 | Funktion                            |
| --------------------------------- | --------------------------------------- | ----------------------------------- |
| `data-v9-quick` (8)               | quick-actions (reply/confirm/journal …) | Svarstudio, bekräfta tider, journal |
| `data-v9-section-link` (5)        | `scrollDossierSection`                  | _se gap nedan_                      |
| `data-kk-jump` (4)                | jump-handler                            | Hälsoprofil + kort-djuplänk         |
| `data-kk-sig` (4)                 | signal-action                           | Smart-next-step CTA                 |
| `data-kk-med-form` (2)            | med-form                                | Hälsodeklaration/friskförsäkran     |
| `data-kk-ord48-open-calendar` (2) | ord48-kalender                          | "Boka nästa"                        |
| `data-photo` (2)                  | lightbox                                | Bild-öppning                        |
| `data-v11-doc-row` (1)            | dokument-preview                        | Offert/auto-dok-preview             |

**GAP-1 (anchor-scroll-router saknas):** `scrollDossierSection` (`cco-v9-customers-parity.js` ~4140)
söker måltavlan via `[data-kundkort-section="<id>"]` eller `[data-v9-section="<id>"]`. V12-modulerna
exponerar sina sektioner som `data-v12-module="<namn>"` och saknar `data-kundkort-section`/
`data-v9-section`. Följd: en V11-rail-deep-link (`data-v9-section-link="journal"` m.fl.) hittar ingen
måltavla i V12 Zon 2 → **ingen scroll till sektionen** (graceful no-op, inget fel kastas).

- **Påverkan:** navigationsbekvämlighet, inte datakorrekthet. Alla action-CTA:er (reply/confirm/
  preview/ord48/jump/sig) fungerar; endast "scrolla till sektion X i arbetsytan" uteblir.
- **Status:** tidigare känd och dokumenterad (canon §3 "#142:s kända V2-begränsning"; inventory
  cross-cutting "Ny lättviktig router krävs — bör låsas i Fas 3").
- **Föreslagen åtgärd (separat PR, ej i detta pass):** lägg `data-v9-section="<id>"` (eller mappa
  `data-v12-module` → sektion-id) på V12-modulernas `<section>` så befintliga `scrollDossierSection`
  träffar dem; alternativt en tunn `data-v12-module`-router. Litet, additivt, inga nya write-flöden.

---

## 7. Sticky arbetsbar mobil / tablet / desktop (PASS)

`renderStickyBarModule` + `.v12-workspace__sticky`:

- **Mobil/tablet (<1280):** `position: sticky; bottom: 0; z-index: 6` + `box-shadow` →
  följer skroll utan att permanent täcka innehåll; `z-index: 6` så V11-railens footer (z-index 5)
  inte överlappar i två-zon-läge (inventory cross-cutting krav).
- **Desktop (≥1280):** `position: static` (flödar i kolumnen, ingen skuggning).
- "Boka nästa" disabled tills `readyForTreatment === true` (+ hint); "Bekräfta kommande tider (N)"
  disabled när N = 0 — ingen påhittad siffra.

---

## 8. Inga nya handlers / write-flöden (PASS)

- `cco-v12-workspace.js` + `cco-v12-workspace-adapters.js`: **inga** `addEventListener`, `.onclick`,
  `bind(` eller egna write-anrop — enbart rena HTML-strängar.
- Samtliga interaktiva element bär **befintliga** attribut (tabell §6) som befintliga handlers
  konsumerar. Inga nya POST/PUT-vägar införda i något block (Block 1–13).
- Skriv-åtgärder (journal-signering, dokument-signering) ligger kvar i legacy/befintliga moduler —
  V12 lägger inga egna.

---

## 9. Empty / unknown-states (PASS)

Varje modul har explicit tom/okänd-state — aldrig fejkad data:

- Kundens nuläge: "Inga kontaktuppgifter registrerade"; status visas bara från `readyForTreatment`;
  personnummer utelämnas (saknas i källan).
- Aktivt besök / Varningar / Hälsa / Kundresa / Journal / Bilder / Bokningar / Dokument /
  Kommunikation / Ekonomi / Insikter: egna empty-states ("Inget aktivt besök", "Inga kritiska
  varningar", "Hälsodeklaration saknas"/"Saknas", "Kundresan har inte startat", "Inga journalposter",
  "Inga bilder ännu", "Inga kommande bokningar"/"Ingen historik", "Inga offerter/auto-dokument/filer
  ännu", "Ingen kommunikation", "Ingen ekonomidata", "Inga insikter just nu").
- **Uppskjutna fält** (markerade, ej fejkade): läkemedel/kontraindikationer (Hälsa); före/efter-
  etikett + jämförelsevy (Bilder); avsändare/utdrag/läst-status (Kommunikation); fakturor/betalstatus/
  skuld-breakdown/rabatter (Ekonomi). Alla med dämpad "visas när data finns"-not.

---

## 10. Console errors (PASS server-render · browser via CI)

- **Server-render:** full `render(ctx)` med riktig testdata kastar **inget** fel; alla 13 moduler
  produceras. Samtliga adapter-anrop är try/catch-skyddade i `render()` → en trasig adapter
  degraderar till empty-state, inte till krasch.
- **Browser-console:** verifieras via `v12-workspace-screenshots.yml` (headless chromium laddar de
  riktiga komponenterna på 390/820/1440). Denna audit körs i miljö utan browser; pixel-/console-
  resultat ska läsas från CI-artefakterna före cutover-beslut.

---

## 11. Namespace / CSS-isolering (PASS)

- Render-HTML: 100 % klasser under `.v12-workspace__*` (inga V9/V11/legacy-klasser i Zon 2-innehållet).
- `cco-v12-workspace.css` (1442 rader, 196 `.v12-workspace*`-regler): **inga** legacy-override-
  selektorer (`.patient-master*`, `.v11-rail*`, `.kkref*`, `.dossier*`, `.v9-*`). Tokens scoped till
  `.v12-workspace`.
- Laddning: `index.html` laddar `cco-v12-workspace-flag.js` + `cco-v12-workspace.css?v=v12workspace-economy-v1`;
  `bin/bundle-manifest.json` inkluderar `cco-v12-workspace-adapters.js` + `cco-v12-workspace.js`
  (content-hashad bundling).

---

## 12. Gap & blockerare

| ID        | Typ             | Beskrivning                                                                                                                                                | Allvar                      | Föreslagen hantering                                                                                                           |
| --------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **GAP-1** | Funktion        | V11-rail-deep-links scroll:ar inte till V12-sektion (anchor-router saknas; `data-v12-module` ≠ `data-kundkort-section`/`data-v9-section`). Graceful no-op. | Medel (navigation, ej data) | Separat liten additiv PR: lägg `data-v9-section` på V12-`<section>` eller tunn modul-router. Krävs/accepteras före default ON. |
| **GAP-2** | Verifiering     | Pixel-/browser-console-resultat på 390/820/1440 produceras av CI-workflow; inte verifierat i denna (browserlösa) miljö.                                    | Låg                         | Läs CI-artefakterna (`v12-workspace-*-screenshots`) före cutover.                                                              |
| **OBS-1** | Data (väntad)   | Uppskjutna fält (läkemedel, före/efter, avsändare/läst-status, fakturor/skuld/rabatter) saknas i datakällan — visas som "visas när data finns".            | Ingen (per Fas 3-spike)     | Backend/data-projekt vid behov; blockerar ej cutover.                                                                          |
| **OBS-2** | CI (befintligt) | `npm audit` rött (tmp/tar/pdfjs, endast brytande åtgärder) — pre-existing, ej introducerat av V12.                                                         | Ingen                       | Separat CI-hygien-spår.                                                                                                        |

**Blockerare för default ON:** GAP-1 (åtgärda eller uttryckligen acceptera) + GAP-2 (granska CI-pixlar).
Inga övriga blockerare. Inga nya write-flöden, ingen legacy-regression när flaggan är av.

---

## 13. Cutover-rekommendation

1. V12-modulbygget är **funktionellt komplett** och säkert som opt-in (default OFF) — kan användas/
   demas via `?v12workspace=on` redan nu.
2. **Default ON görs INTE** i detta pass. Beslut kräver Codex/owner-godkännande efter:
   - åtgärd eller uttrycklig acceptans av **GAP-1** (deep-link anchor-scroll), och
   - granskning av **GAP-2** (CI-pixel/console på 390/820/1440).
3. Eventuell cutover bör (per V11-mönstret) vara en **minimal separat PR**: endast flagg-default
   OFF→ON + nödvändig `index.html`-versionsbump — ingen render.yaml, ingen modulkod.

---

## 14. Stopp

Audit klar (docs-only). **Ingen default ON, ingen ny kod, ingen polish, ingen CI-fix.**
**Paus för Codex/owner-beslut** om (a) GAP-1-hantering och (b) cutover.
