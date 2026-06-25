# V11 Rail Inventory · Fas 2 · 2026-06-21

**Status:** Draft för Codex-granskning innan Fas 3 startar.
**Bakgrund:** Canon C · Hybrid valt i [V11-RAIL-CANON-DECISION-2026-06-21.md](V11-RAIL-CANON-DECISION-2026-06-21.md). Denna inventory mappar varje canon-sektion till faktisk kod + datakälla + risk + Fas 3-filer.
**Disciplin:** Read-only. Ingen UI byggd. Ingen kod ändrad i Fas 2. Stash av `claude/ord-25h-rail-cover` lokalt; ord25g är merged till main per PR #119.
**Worktree:** `claude/v11-rail-fas2-inventory` från `origin/main` HEAD `734fa202` (efter ORD-25G #119 + automatiska Render-hooks).
**Korrigering 2026-06-21 v2:** Tidigare push av PR #120 bar dubblerade ord25g-commits pga felaktig cut från `b78e2c0`. Branchen är nu re-rooted från `origin/main` så endast canon + inventory + (befintlig) ord25h-doc kvarstår per disciplin.

---

## 1. Översikt

Av canon-matrisens 20 sektioner (A-S + V):

| Beslut                                                       | Antal | Sektioner                    |
| ------------------------------------------------------------ | ----- | ---------------------------- |
| **REWRITE** (`v11-rail__*` ren komponent från noll)          | 5     | A, B, C, V, D                |
| **MOVE/MERGE** (ny presentation, befintlig workflow bevarad) | 4     | E, F, G, S                   |
| **KEEP** (workflow oförändrad, V11 shell-paritet räcker)     | 10    | H, I, J, K, L, M, N, O, P, Q |
| **LATER** (skickas inte i första cutover)                    | 1     | R                            |

**Kritiska blockers för Fas 3 start:**

1. **V Active Visit har 0 motsvarande kod idag** — ny adapter krävs för pågående besök + protokoll-state + journal-CTA-flöde
2. **Mobile-shell har 0 `.kkref`-scopad regel** — responsive contract måste byggas från grunden i `.v11-rail__*`
3. **Smart next step datakälla** är spridd mellan `cco-kunder-smart-next-step.js` och `gateSignals.primary` — adapter måste konsolideras
4. **Dossier-section `data-sek` selectors används i 8 olika moduler** (mount/jump/scroll) — gränssnitt mot ny rail krävs

**Estimat för Fas 3 effektivt utförande:** 5-7 arbetsdagar för 20 sektioner förutsatt att blockers ovan löses först (≈ 1 dag).

---

## 2. Cross-cutting setup (måste klar innan Fas 3 sektioner)

| Item                       | Status idag                                                                                                          | Fas 3 åtgärd                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Feature flag `?v11rail=on` | Saknas                                                                                                               | Lägg i `cco-v9-flag.js` läs URL-param → `document.documentElement.dataset.v11Rail = 'on'` |
| Mount-/switch-point        | `patient-master-ui.js:5251-5276` renderar 3 olika `.patient-master-card`-varianter beroende på v10-facit/v11-cutover | Ny gren: när `data-v11-rail="on"` → mount `cco-v11-rail.js` istället för kkref            |
| Ny renderer-fil            | `public/major-arcana-preview/app/cco-v11-rail.js` (inte skapad)                                                      | Skapas i Fas 3                                                                            |
| Ny CSS-fil                 | `public/major-arcana-preview/cco-v11-rail.css` (inte skapad)                                                         | Skapas i Fas 3, namespace `.v11-rail__*`, inga `.kkref`/`.av`/`.k`-klasser                |
| Index.html `<link>`        | Saknas                                                                                                               | Lägg link efter `cco-v11-polish.css`                                                      |
| Bundle                     | Auto-inkluderas via `bin/build-bundle.js` när filen finns i `app/`                                                   | Kör `npm run build:bundle && node bin/inject-bundle.js`                                   |
| Data-adapter-modul         | Saknas, data hämtas idag direkt i kkref-render via `extras`, `bcard`, `gateSignals`                                  | Ny `cco-v11-rail-adapters.js` som enkel input/output-kontrakt per sektion                 |
| Empty-state-konvention     | Inkonsekvent (`empty('Inga aktiva gates...')`, `'0 offertbilder'`, etc.)                                             | En empty-state-helper `v11RailEmpty(section, hint?)` med konsekvent ton                   |
| Responsive bryt-CSS        | 0 `@media`-rader i `cco-kundkort-referens.css` matchar 767/1023/1024-bryt                                            | Fas 3 sektioner får responsive layout per komponent, inga global media-queries            |

---

## 3. Per-sektion-matris

Varje rad: canon-beslut → live-implementation → datakälla → Fas 3-filer → responsive-status → risker.

### A · Profilhuvud — **REWRITE**

| Aspekt          | Detalj                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Canon form      | facit: amber kicker, profile identity, 4 operational pills, edit-profile-action                                                    |
| Live-kod        | `cco-kundkort-referens.js:4559-4586` `<div class="dhead"><div class="ring"><div class="av">…</div></div>…</div>`                   |
| Datakälla idag  | `name`, `initials(name)`, `bcard.email`, `bcard.phone`. Tags-pills (`VIP/PRP-hår/Botox/Nya marknad`) saknas helt                   |
| Saknat          | Pipedrive person/org-tag-adapter, edit-profile-länk                                                                                |
| Mobile/iPad/Web | Ingen specifik media-query — hänvisas till parent `.customers-rail` width                                                          |
| Risker          | Pink VIP-identitet (`#bb4779`) får inte tappas i v11 — palett-disciplin                                                            |
| Fas 3 filer     | `cco-v11-rail.js` (renderProfile), `cco-v11-rail.css` (`.v11-rail__profile`), `cco-v11-rail-adapters.js` (`buildProfileFromBcard`) |

### B · Smart information — **REWRITE**

| Aspekt          | Detalj                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canon form      | facit: separate vellum smart-info card                                                                                                                |
| Live-kod        | `cco-kundkort-referens.js:4653-4658` `<div class="summ kkx-summ"><span class="sk">SMART SAMMANFATTNING</span>…`                                       |
| Datakälla idag  | Statisk `'SMART SAMMANFATTNING'`-text + dynamisk ctx via `summ.__kkDefault` (rad 7780-7790). `gateSignals.primary` används separat i Smart nästa steg |
| Saknat          | Sammankoppling till `gateSignals.primary` + customer summary-adapter (per canon §6 B)                                                                 |
| Mobile/iPad/Web | Använder `.summ`-klass utan responsive-bryt                                                                                                           |
| Risker          | Idag är "Smart sammanfattning" en sticky-toggle ovanför flikraden — facit har det som inline-card. Ny placering måste inte bryta toggle-läget.        |
| Fas 3 filer     | `cco-v11-rail.js` (renderSmartInfo), `.css` (`.v11-rail__smart-info`), `adapters.js` (`buildSmartInfoFromSignals`)                                    |

### C · Stats (Nyckeltal) — **REWRITE**

| Aspekt          | Detalj                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Canon form      | facit: 3 stat cells för `BESÖK`, `VÄRDE TOT`, `SKULD`                                                                |
| Live-kod        | `cco-kundkort-referens.js:4670-4690` `<div class="s3">` med 3 `<div class="k">`-celler (idag: Besök/Intäkt/No-shows) |
| Datakälla idag  | `visits`, `revenueKr` + `ltvLabel`, `noshow`. **`SKULD` finns inte** — kräver `Q Economy`-koppling (öppna fakturor)  |
| Saknat          | Skuld-adapter (debt-signal från ekonomi-store), `VÄRDE TOT` vs `Intäkt`-semantik måste bestämmas av owner            |
| Mobile/iPad/Web | Idag `.s3` är CSS-grid `repeat(3, 1fr)` — kan kollapsa stack om text inte ryms; ingen explicit bryt                  |
| Risker          | No-shows är operativt viktigt; om vi tar bort den behövs explicit owner-beslut                                       |
| Fas 3 filer     | `cco-v11-rail.js` (renderStats), `.css` (`.v11-rail__stats`), `adapters.js` (`buildStatsFromExtras`)                 |

### V · Active Visit — **REWRITE (HÖGSTA PRIO)**

| Aspekt          | Detalj                                                                                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canon form      | facit: ny hero med timeline + journal-CTA + protokoll-state                                                                                                                                                     |
| Live-kod        | **0 motsvarande kod** — grep efter `aktiv-besok`, `active-visit`, `av-card` returnerar 0 träffar i `cco-kundkort-*.js`                                                                                          |
| Datakälla idag  | Saknas helt. Närmaste: `bcard.kundresa.current` (steg-status) + bookings idag                                                                                                                                   |
| Saknat          | Active encounter-state, protokoll-progress (2/3 etc), check-in-tid, timeline (planerad-start, faktisk-start, planerad-slut), `Starta journal · PRP-protokoll N/M`-CTA-flöde                                     |
| Mobile/iPad/Web | N/A — bygg responsive från första render                                                                                                                                                                        |
| Risker          | **HÖGSTA RISK**: journal-CTA måste hooka i existing journal-start/resume-flöde (`patient-master-ui.js:1817-1820` använder `[data-sek="journal"] .openb`). Felmappad CTA = funktionsförlust under riktigt besök. |
| Fas 3 filer     | `cco-v11-rail.js` (renderActiveVisit), `.css` (`.v11-rail__active-visit`), `adapters.js` (`buildActiveVisitFromBookings`), eventuellt ny `cco-active-visit-store.js`                                            |
| Blocker         | **JA** — adapter-kontrakt måste bestämmas av owner före kod                                                                                                                                                     |

### D · Critical Warnings — **REWRITE**

| Aspekt          | Detalj                                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canon form      | facit: red vellum top-banner cards                                                                                                                       |
| Live-kod        | Ingen dedicerad sektion. Warnings visas idag inom `KUNDRESA` ("Inte redo för operation"-banner i `.jcard`) + i REDO-card (EJ REDO-pillsen)               |
| Datakälla idag  | `gateSignals.critical` finns men konsumeras inte separat — den ingår i `gateSignals`-arrayen för Smart nästa steg                                        |
| Saknat          | Filter `gateSignals.critical`-subset, top-banner-placering, persistent visibility                                                                        |
| Mobile/iPad/Web | N/A                                                                                                                                                      |
| Risker          | Dubbelvisning: om både `D` och nuvarande banner-i-kundresa renderas → visuell repetition. Lösning: byt ut nuvarande banner-i-kundresa när `?v11rail=on`. |
| Fas 3 filer     | `cco-v11-rail.js` (renderCriticalWarnings), `.css` (`.v11-rail__warnings`), `adapters.js` (`splitGateSignalsCritical`)                                   |

### E · Health Declaration — **MERGE**

| Aspekt          | Detalj                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canon form      | merge: top expandable preview + full HÄLSA workflow inside Zon 2                                                                                                                    |
| Live-kod        | `kk-card-halsa` doc-card (`cco-kundkort-referens.js:1050`), full workflow finns i `kk-card-halsa` `details`-sektion. Ingen top-preview                                              |
| Datakälla idag  | HD-store via `extras.healthDeclaration` (signed status, contraindication flags)                                                                                                     |
| Saknat          | Top-preview-renderer som summerar HD-status; deep-link till HÄLSA-tab                                                                                                               |
| Mobile/iPad/Web | Doc-card är `.kk-doc-card.dossier-section` — har egen toggle-mekanism men ingen responsive-bryt                                                                                     |
| Risker          | Workflow får INTE duplicera — top-preview ska bara summera + scrolla/öppna `kk-card-halsa`. Test: signering ska fungera identiskt efter rebuild.                                    |
| Fas 3 filer     | `cco-v11-rail.js` (renderHealthPreview), `.css` (`.v11-rail__health-preview`), `adapters.js` (`summarizeHealthDeclaration`), DEEP-link via `[data-sek="kk-card-halsa"]` (befintlig) |

### F · Customer Journey — **MERGE**

| Aspekt          | Detalj                                                                                                                                                                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- | ------ |
| Canon form      | merge: V11 visual stepper, preserve 9-steg kanonisk logik                                                                                                                                                                                                                                       |
| Live-kod        | `cco-kundkort-referens.js:4801-4853` `groupedSteps.map → <div class="step kkx-step ...">` + `data-v11-step-state` (Pass 3 från ORD-25G) + `data-v11-journey-active`                                                                                                                             |
| Datakälla idag  | `customer journey state` via `groupedSteps` + `cur`/`total`/`pct`/`nextLabel`. Stegen genereras från `s.state` (`done                                                                                                                                                                           | active | neutral | todo`) |
| Saknat          | 9-steg-meningen är kanonisk men `.step.act`-mapping till `data-v11-journey-active="true"` händer redan. För v11-rail måste vi mappa till `.v11-rail__journey-step`                                                                                                                              |
| Mobile/iPad/Web | Stepper-rad fungerar i alla vidd, men `.s` (note-text) kan stacka i smal vy                                                                                                                                                                                                                     |
| Risker          | Kanonisk 9-steg-mening får inte ändras (Bokning konsultation, Bokningsbekräftelse-mail, Hälsodeklaration, Konsultation, Offert+Behandlingsplan, Betänketid 2 dagar, Avtal+behandlingssamtycke, Friskförsäkran, Foto-samtycke). Test: `stepJumpSlug()` och `stepMedFormSlug()`-mapping kvarstår. |
| Fas 3 filer     | `cco-v11-rail.js` (renderJourney), `.css` (`.v11-rail__journey`), `adapters.js` (`buildJourneyFromState`)                                                                                                                                                                                       |

### G · Smart Next Step — **MERGE**

| Aspekt          | Detalj                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canon form      | merge: focused recommendation card med one primary CTA                                                                                                              |
| Live-kod        | `cco-kundkort-referens.js:4896-4898` `sec('Smart nästa steg', ...)` + dedicated module `cco-kunder-smart-next-step.js`                                              |
| Datakälla idag  | `gateSignals` (array), CTAs i `gateRowsHtml` med "Granska utkast" + "Skicka för signering"                                                                          |
| Saknat          | Single-CTA-fokusering — facit visar bara EN primary action, idag visas 2 ("Granska utkast" + "Skicka för signering")                                                |
| Mobile/iPad/Web | `.gate-row` är flex-baserad men ingen responsive-bryt                                                                                                               |
| Risker          | "Granska utkast" är operativt viktigt för granskningsflödet — om vi tar bort den, måste den fortfarande nås via deep-link                                           |
| Fas 3 filer     | `cco-v11-rail.js` (renderSmartNextStep), `.css` (`.v11-rail__next-step`), `adapters.js` (`pickPrimaryGate`), behåll `cco-kunder-smart-next-step.js` som logik-lager |

### H · Bookings — **KEEP (V11 shell)**

| Aspekt          | Detalj                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| Canon form      | LOCKED workflow med V11 shell                                                                                   |
| Live-kod        | `cco-kundkort-referens.js:4923` `sec('Kommande bokningar', ...)`                                                |
| Datakälla idag  | `up` (upcoming-array från `bcard.bookings`)                                                                     |
| Saknat          | Inget — workflow är komplett                                                                                    |
| Mobile/iPad/Web | List-rader behöver kompakt-mode på mobil (rad-höjd, datum-format)                                               |
| Risker          | Cancel/reschedule-knappar måste fungera identiskt                                                               |
| Fas 3 filer     | `cco-v11-rail.js` (wrapWithV11Shell), `.css` (`.v11-rail__section`, generic shell) — inre HTML kan återanvändas |

### I · History — **KEEP**

| Aspekt          | Detalj                                                  |
| --------------- | ------------------------------------------------------- |
| Canon form      | LOCKED workflow med V11 shell                           |
| Live-kod        | `cco-kundkort-referens.js:4956` `sec('Historik', ...)`  |
| Datakälla idag  | `hist` (history-array)                                  |
| Saknat          | Inget                                                   |
| Mobile/iPad/Web | Timeline-vy måste klippa horisontellt overflow på mobil |
| Risker          | Auditability — händelser får inte filtreras bort        |
| Fas 3 filer     | `cco-v11-rail.js`, `.css`                               |

### J · Journals — **KEEP**

| Aspekt          | Detalj                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Canon form      | LOCKED workflow med V11 shell                                                                  |
| Live-kod        | `data-sek="journal"`-sektion + `[data-sek="journal"] .openb`-CTA (`patient-master-ui.js:1817`) |
| Datakälla idag  | Journal-store                                                                                  |
| Saknat          | Inget                                                                                          |
| Mobile/iPad/Web | Journal-resume-CTA måste vara tappbar (44px)                                                   |
| Risker          | Start/resume/view-states måste fungera — V Active Visit-CTA kopplar hit                        |
| Fas 3 filer     | `cco-v11-rail.js`, `.css`                                                                      |

### K · Offers — **KEEP**

| Aspekt          | Detalj                                                          |
| --------------- | --------------------------------------------------------------- |
| Canon form      | LOCKED workflow med V11 shell                                   |
| Live-kod        | `cco-kundkort-referens.js:5210` `sec('Offerter · commit', ...)` |
| Datakälla idag  | Offerter-array via `bcard.offers` eller `extras`                |
| Saknat          | Inget — workflow är komplett                                    |
| Mobile/iPad/Web | Commercial-actions måste klicka-bara, ej bara summary-badges    |
| Risker          | Acceptera/avvisa-knappar måste finnas, inte bara badge          |
| Fas 3 filer     | `cco-v11-rail.js`, `.css`                                       |

### L · Auto-documents — **KEEP**

| Aspekt          | Detalj                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Canon form      | LOCKED workflow med V11 shell                                                                                  |
| Live-kod        | `data-sek="dokument-registry"` + `data-sek="dokument"` + `.kk-mallbibliotek` (`cco-kundkort-referens.js:1321`) |
| Datakälla idag  | Document generator, templates, signing-status                                                                  |
| Saknat          | Inget                                                                                                          |
| Mobile/iPad/Web | Mallbibliotek-grid behöver kompakt-mode på mobil                                                               |
| Risker          | Signing/document-status får inte tappas                                                                        |
| Fas 3 filer     | `cco-v11-rail.js`, `.css`                                                                                      |

### M · Photos — **KEEP**

| Aspekt          | Detalj                                                                            |
| --------------- | --------------------------------------------------------------------------------- |
| Canon form      | LOCKED workflow med V11 shell                                                     |
| Live-kod        | `cco-kundkort-referens.js:5319-5328` `sec('Foto', ...)` + `kk-card-foto` doc-card |
| Datakälla idag  | Photo library, treatment zones, review-status                                     |
| Saknat          | Inget                                                                             |
| Mobile/iPad/Web | **Mobile gallery måste undvika horisontellt overflow** — explicit krav i canon §4 |
| Risker          | Photo-actions (review, annotate) får inte gömmas bakom collapsed UI               |
| Fas 3 filer     | `cco-v11-rail.js`, `.css` (med media-query för mobile gallery-grid)               |

### N · Files — **KEEP**

| Aspekt          | Detalj                                             |
| --------------- | -------------------------------------------------- |
| Canon form      | LOCKED workflow med V11 shell                      |
| Live-kod        | `data-sek="dokument"` ("Filer 6"-räkning)          |
| Datakälla idag  | Uploaded files-array                               |
| Saknat          | Inget                                              |
| Mobile/iPad/Web | File-list ska inte ha data loss bakom collapsed UI |
| Risker          | Status-flags måste vara synliga                    |
| Fas 3 filer     | `cco-v11-rail.js`, `.css`                          |

### O · Notes — **KEEP**

| Aspekt          | Detalj                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------- |
| Canon form      | LOCKED workflow med V11 shell                                                                |
| Live-kod        | `cco-kundkort-referens.js:5795` `sec('Anteckningar', ...)` + `kk-card-anteckningar`-doc-card |
| Datakälla idag  | `notes` (staff notes-array)                                                                  |
| Saknat          | Inget                                                                                        |
| Mobile/iPad/Web | Note-editor måste fungera utan hover                                                         |
| Risker          | Permissions-baserad edit-knapp måste fungera                                                 |
| Fas 3 filer     | `cco-v11-rail.js`, `.css`                                                                    |

### P · Communication — **KEEP**

| Aspekt          | Detalj                                    |
| --------------- | ----------------------------------------- |
| Canon form      | LOCKED workflow med V11 shell             |
| Live-kod        | `data-sek="kommunikation"`                |
| Datakälla idag  | SMS/email/call-log, consent-flags         |
| Saknat          | Inget                                     |
| Mobile/iPad/Web | Contact-actions måste vara tappbar (44px) |
| Risker          | Consent-visibility får inte tappas        |
| Fas 3 filer     | `cco-v11-rail.js`, `.css`                 |

### Q · Economy — **KEEP**

| Aspekt          | Detalj                                                                            |
| --------------- | --------------------------------------------------------------------------------- |
| Canon form      | LOCKED workflow med V11 shell, role-gated where needed                            |
| Live-kod        | `kk-card-ekonomi` doc-card + "Betalning"-kicker (`cco-kundkort-referens.js:5490`) |
| Datakälla idag  | Invoices, payments, debt, refunds/credits                                         |
| Saknat          | Skuld-adapter måste exporteras för C Stats (`SKULD`-cell) och D Warnings          |
| Mobile/iPad/Web | Role-gating måste fungera i alla bredd                                            |
| Risker          | Debt-signal är cross-cutting — feeder för C + D                                   |
| Fas 3 filer     | `cco-v11-rail.js`, `.css`, `cco-v11-rail-adapters.js` (`debtSignal()`)            |

### R · Insights — **LATER**

| Aspekt          | Detalj                                                         |
| --------------- | -------------------------------------------------------------- |
| Canon form      | LATER unless data-backed                                       |
| Live-kod        | `data-sek="insikter"` finns (placeholder)                      |
| Datakälla idag  | Saknas — analytics-adapter ej kopplad                          |
| Saknat          | Risk/retention-signal-adapter                                  |
| Mobile/iPad/Web | N/A — skickas inte                                             |
| Risker          | Decorative insight-cards utan data är FÖRBJUDET per canon §6 R |
| Fas 3 filer     | Ingen rendering i Fas 3. Empty-state om sektionen visas alls.  |

### S · Sticky Footer — **MERGE**

| Aspekt          | Detalj                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Canon form      | facit/merge: mobile-safe persistent action-area                                                                            |
| Live-kod        | `cco-kundkort-referens.js:5910/5924` `.acts`-zon med Ta bild/Boka nästa/Anteckna/Svarstudio/Bekräfta                       |
| Datakälla idag  | `up.length` (för "Bekräfta kommande tider (N)"-räknare), `ord48ReadySt.ready` (för Boka nästa-disabled-läge)               |
| Saknat          | `position: sticky; bottom: 0; backdrop-filter` är inte applicerat — facit kräver det                                       |
| Mobile/iPad/Web | **Får aldrig täcka CTAs eller document-actions** (canon §4 + §6 S)                                                         |
| Risker          | Boka nästa har konditionell render i 2 versioner (rad 5907 + 5923) baserat på `ord48ReadySt.ready` — must preservas        |
| Fas 3 filer     | `cco-v11-rail.js` (renderStickyActions), `.css` (`.v11-rail__sticky`, med `@media (min-width:1024px)` för rail-local-läge) |

---

## 4. Datakälla-summering

Inventarier idag (kommer in via `extras`, `bcard`, `gateSignals`-parametrar):

| Källa                              | Används av              | Saknat                                    |
| ---------------------------------- | ----------------------- | ----------------------------------------- |
| `bcard` (Pipedrive person-dossier) | A, B, C-räkning, H, K   | Tags-fält (för A pills)                   |
| `extras` (sammansatt context)      | C, E, L, M, N, P, Q     | Active visit-state, skuld-signal          |
| `gateSignals`                      | B, D, G                 | Kritisk-subset isolerad                   |
| `notes`                            | O                       | Inget                                     |
| `hist`                             | I                       | Inget                                     |
| `up` (upcoming bookings)           | H, S (Bekräfta-räknare) | Inget                                     |
| `groupedSteps`                     | F                       | Inget                                     |
| Active visit-store                 | V                       | **Hela adaptern saknas**                  |
| Debt/skuld-adapter                 | C, D, Q                 | **Adapter saknas**                        |
| Analytics/insights-adapter         | R                       | **Adapter saknas (men sektion är LATER)** |

---

## 5. Mobile / iPad / Web — gap-analys

Canon §4 kräver responsive från första komponent. Status idag:

| Krav                                         | Status                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Mobile (320-767px) safe `100vw` med marginal | Saknas — `.kkref` har fast 392-424px width via `.customers-rail--dominant`                                |
| iPad (768-1023px) horizontal-scroll tabs     | Flikraden (`Kundresa 9 / Smart nästa steg ...`) använder horisontal scroll men ingen explicit media-query |
| Web (1024+) persistent rail bredvid lista    | Funkar via `.customers-layout`-grid (200px lista + flex mitt + 424px rail).                               |
| Touch targets ≥ 44px                         | Sticky `.acts` knappar är 41-42px — under gränsen                                                         |
| Wrap email/phone utan letter-stacking        | Idag `.dc`-rad är `flex` med wrap men kollapsar inte bra under 320px                                      |
| Sticky-actions täcker inte CTAs              | Inte sticky idag, men risk vid mobile-shell `.cco-mobile-shell`                                           |
| `kkref`-specifika `@media`-regler            | 0 träffar i `cco-kundkort-referens.css`                                                                   |

**Slutsats:** V11-rail behöver `@media`-regler per komponent i `cco-v11-rail.css`. Ingen global media-query.

---

## 6. Föreslagen ordning för Fas 3

Givet blockers + datakällor:

1. **Block 0 (1 dag)** — Setup
   - Feature flag i `cco-v9-flag.js`
   - Skapa tomma `cco-v11-rail.js` + `cco-v11-rail.css` + `cco-v11-rail-adapters.js`
   - Mount-switch i `patient-master-ui.js`
   - Index.html `<link>`
   - Owner-godkända Active Visit-data-kontrakt (V-blockern)

2. **Block 1 (2 dagar)** — REWRITE-block i topp-ordning
   - A Profile
   - B Smart info
   - C Stats (med skuld-adapter)
   - **V Active Visit** (kritisk operational)
   - D Critical Warnings

3. **Block 2 (1.5 dagar)** — MERGE-block
   - E Health Declaration (top-preview, deep-link kvar)
   - F Customer Journey (visual stepper, kanonisk 9-steg-mening preserverad)
   - G Smart Next Step
   - S Sticky Footer (med responsive bryt)

4. **Block 3 (1.5 dagar)** — KEEP-block + V11 shell-paritet
   - H, I, J, K, L, M, N, O, P, Q wrappas i `.v11-rail__section`-shell
   - Mobile-specifika `@media`-regler per sektion

5. **Block 4 (1 dag)** — UAT + cutover
   - Acceptance test 3×3 (3 viewports × 3 patient-states) per canon §7
   - Screenshot-suite
   - Owner-godkännande

**Total:** 7 arbetsdagar netto.

---

## 7. Risker som Codex bör verifiera

1. **`stepJumpSlug()` + `stepMedFormSlug()`-mappningen** måste bevaras för Pass 3 F-sektionen. Granska att `data-kk-jump`-mål i `.v11-rail__journey-step` matchar `data-sek`-mål i KEEP-sektionerna.

2. **`patient-master-ui.js:1817-1820` använder `[data-sek="journal"] .openb:not([disabled])`** som journal-start-CTA. V Active Visit's `Starta journal`-CTA måste deep-linka via samma selektor.

3. **Pink VIP-identitet `#bb4779`** används både på `.dn` (kund-namn) i live OCH på A profile pills i facit. Palett-disciplin: vi måste explicit dokumentera om VIP-rosa är inkluderad i v11-rail eller ej.

4. **Mount-switchen i `patient-master-ui.js:5251-5276`** har 3 olika v9/v10/v11-grenar. Lägga till en 4:e gren för v11-rail kan introducera regressions i v9/v10-paths. Förslag: enkapsulera i ny `chooseRailRenderer()`-helper.

5. **Bundle-tag `app.bundle.*.min.js`** byggs av `bin/build-bundle.js` som auto-upptäcker `app/*.js`-filer. Ny `cco-v11-rail.js` inkluderas automatiskt, men måste verifieras inte trasiga lazy-load i `cco-v9-flag.js`.

6. **`stash` på `claude/ord-25h-rail-cover`** innehåller 3 fixar (avatar 52px, stat-cells vellum, steg-info vellum) — dessa är inte landade i prod. Beslut: skall stashen rivas, parkas som ord25h-PR mot prod, eller inkluderas i v11-rail som DNA-referens?

---

## 8. Öppna frågor till Codex

1. **V Active Visit-datakontraktet** — vilka fält (planerad-start, faktisk-start, protokoll-progress, rum, personal) ska adapter exponera? Kräver owner-svar innan Block 1 startar.

2. **`VÄRDE TOT` vs `Intäkt`** — semantik-skillnad (är "Intäkt" detsamma som "Värde tot"? LTV vs totalt fakturerat?). Owner-beslut behövs.

3. **R Insights** — om sektionen helt utelämnas i Fas 3, ska placeholder-sektionen tas bort från DOM (`data-sek="insikter"`) eller behållas dold tills adaptern finns?

4. **Sticky footer rail-local desktop-läge** — på desktop ska `.v11-rail__sticky` vara inom rail eller spänna hela bredden? Canon §6 S säger "desktop can be rail-local" — bekräfta.

5. **VIP-pill-rosa-disciplin** — ingår VIP-identitet i `.v11-rail__profile`-pills eller endast i kund-namn?

6. **ord25h-stash** — riva/park/inkludera?

---

## 9. Stop-state

Inventoryn klar. **Inget UI byggt. Inget legacy-kkref editat.** Branch `claude/v11-rail-fas2-inventory` har bara denna fil + ingen kod-edit.

Rapport skickas till Codex för granskning innan Fas 3 startar.
