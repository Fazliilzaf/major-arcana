# V12 Customer Workspace — Post-cutover smoke

> **Typ:** Verifiering efter cutover (docs-only). **Ingen ny kod, ingen design/polish, ingen dependency-fix.**
> **Datum:** 2026-06-23 · **main @ `8ae48f9`** (cutover #164 mergad) · **Flagga:** `?v12workspace` **default ON** (opt-out `?v12workspace=off`).
> **Föregående:** modulbygge (Block 1–13), slutpass-audit #162, GAP-1-fix #163, cutover #164.
> Verifiering på kod-/render-/logik-nivå (browserlös) mot de riktiga komponenterna. Pixel-/browser-
> console på riktiga viewports via workflow `v12-workspace-screenshots.yml` (kördes på cutover-grenen
> `claude/v12-workspace-**`).

---

## Resultat: ✅ PASS (inga blockerare)

| #   | Smoke-kontroll                            | Status                                      | Bevis                                                                                                                                                                             |
| --- | ----------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Default ON                                | ✅ PASS                                     | Ny användare (ingen localStorage-nyckel) → `data-v12-workspace="on"`, `isEnabled() === true`                                                                                      |
| 2   | `?v12workspace=off` kill-switch / opt-out | ✅ PASS                                     | localStorage `'0'` → `data-v12-workspace="off"`, `isEnabled() === false`                                                                                                          |
| 3   | 13/13 sektioner i canon-ordning           | ✅ PASS                                     | Full render: 13 `data-v12-module` i ordning 1→13, render kastar inget fel                                                                                                         |
| 4   | Deep-links V11 → V12-sektioner            | ✅ PASS                                     | Riktiga `scrollDossierSection`: journal→journal, upcoming/historik→bookings, ekonomi→economy, kontakt→current-state, compliance→warnings, filer→documents (alla `scrollIntoView`) |
| 5   | Sticky arbetsbar 390/820/1440             | ✅ PASS (kod) · ⏳ pixel via CI             | `position:sticky; z-index:6` <1280, `position:static` ≥1280; sticky-modul renderas                                                                                                |
| 6   | Inga console errors                       | ✅ PASS (server-render) · ⏳ browser via CI | Try/catch-skyddade adapter-anrop; render utan undantag                                                                                                                            |
| 7   | V11/legacy-vägen med opt-out              | ✅ PASS                                     | `usesV12Workspace()` läser `data-v12-workspace==='on'`; vid opt-out → false → `usesV11Rail()`/legacy oförändrat                                                                   |
| 8   | Namespace-isolering                       | ✅ PASS                                     | 100 % `.v12-workspace__` i Zon 2-render                                                                                                                                           |

---

## Detaljer

### 1–2. Flagg-beteende (default ON + kill-switch)

`cco-v12-workspace-flag.js` (cutover #164): `enabled = localStorage.getItem(KEY) !== '0'`.

- **Ingen nyckel (ny användare):** `enabled = true` → `data-v12-workspace="on"`. **PASS**
- **`?v12workspace=off`** sätter localStorage `'0'` (sticky) → `enabled = false` → `data-v12-workspace="off"`. **PASS** (kill-switch)
- **`?v12workspace=on`** sätter `'1'` → ON. **PASS**
- Private mode (localStorage kastar) → catch → `enabled = true` (default ON). **PASS**

### 3. 13/13 sektioner i canon-ordning

Full `CcoV12Workspace.render(ctx)` med riktig testdata: **render kastar inget fel**; 13/13
`data-v12-module` närvarande i stigande canon-ordning:
`current-state → active-visit → warnings → health → journey → journal → photos → bookings →
documents → communication → economy → insights → sticky`. **PASS**

### 4. Deep-links V11 → V12 (GAP-1 verifierad live på main)

Mot den **riktiga** exporterade `CcoV9CustomersParity.scrollDossierSection` (DOM-mock): samtliga
legacy-id resolvar till rätt `[data-v12-module]` och anropar `scrollIntoView`; okänd sektion i
icke-V12-DOM → `false` (graceful). **PASS.** Browser-klick-bevis (riktig rail-deep-link → rätt V12-
modul, 390/820/1440) i CI-artefakt `v12-workspace-deeplink-screenshots`.

### 5. Sticky arbetsbar

`.v12-workspace__sticky`: `position:sticky; bottom:0; z-index:6` på mobil/tablet (samexisterar med
V11-railens footer z-index 5 i två-zon-läge), `position:static` på `≥1280`. Sticky-modulen (sektion 13) renderas. **PASS (kod).** Pixel-bevis i CI-artefakt `v12-workspace-sticky-screenshots`.

### 6. Console errors

Server-render kastar inget undantag; alla adapter-anrop i `render()` är try/catch-skyddade →
trasig adapter degraderar till empty-state, aldrig krasch. **PASS (server-render).** Browser-console
på 390/820/1440 via CI-screenshots (headless chromium laddar de riktiga komponenterna).

### 7. V11/legacy-vägen med opt-out

`usesV12Workspace()` returnerar `true` endast när `data-v12-workspace==='on'`. Vid opt-out
(`?v12workspace=off`) → `false` → mount-switchen faller till `usesV11Rail()` och därefter legacy,
exakt som före cutover. Kill-switchen återställer alltså V11/legacy-vägen per klient. **PASS**

---

## Blockerare

**Inga.** Inga FAIL. GAP-2 (pixel/browser-console läses från CI-artefakter) kvarstår som accepterad
låg punkt per slutpass-auditen — inte en blockerare.

## Backout (oförändrad)

- **Per klient:** `?v12workspace=off` (sticky kill-switch).
- **Globalt:** revert av cutover #164 (default tillbaka till OFF).

## Stopp

Post-cutover smoke **PASS**. Docs-only. Inga åtgärder krävs.
