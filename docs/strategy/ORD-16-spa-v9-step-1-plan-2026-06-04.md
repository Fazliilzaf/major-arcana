# ORD-16 · SPA v9-port — Steg 1 (exakt plan)

**Datum:** 2026-06-04  
**Förutsättning:** [ORD-15 audit](./ORD-15-spa-v9-port-audit-2026-06-04.md) + owner-beslut §8  
**Claude-audit:** `ORD-15-CLAUDE-AUDIT-SPA-V9-PORT-2026-06-04.md` — **ej incheckad än**; denna plan följer Cursor-audit tills merge.

---

## Steg 1 i ett stycke

Inför **v9 feature-flag** (`?v9=on` / `localStorage arcana.v9.enabled`, default off) och **scoped design tokens** under `html[data-v9-enabled="on"]` — utan synlig UI-förändring när flaggan är av. Detta låser backward-compat och ger en säker hook för alla kommande komponent-commits.

**Scope steg 1:** flag-boot + tokens + tom CSS-scaffold. **Inte:** layout, listrader, agg-cards, smart-next, watch-widget, segment-sidebar.

---

## Mål & acceptanskriterier

| Kriterium                            | PASS                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| Default (`/staff?view=customers`)    | Identisk UI som idag — inga nya paneler, inga CSS-regressioner                            |
| `?v9=on` (eller sparad localStorage) | `document.documentElement` har `data-v9-enabled="on"` före first paint av customers-shell |
| `?v9=off`                            | Rensar `arcana.v9.enabled`; attribut off                                                  |
| Mobil 390px + desktop 1440px         | Flag boot fungerar; inga layout-ändringar i steg 1                                        |
| Prod-säkerhet                        | Deploy med flag default off = noll användarimpact                                         |
| Validering                           | `check:syntax`, `lint:no-bypass`, `test:unit`, `smoke:local` gröna                        |

---

## Filer att skapa/ändra

| Fil                                                     | Åtgärd                                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `public/major-arcana-preview/app/cco-v9-flag.js`        | **NY** — läser URL + localStorage, sätter `data-v9-enabled`                                           |
| `public/major-arcana-preview/cco-v9-tokens.css`         | **NY** — v9 CSS-variabler (från mockup `:root`), endast under `[data-v9-enabled="on"]`                |
| `public/major-arcana-preview/cco-v9-customers.css`      | **NY** — tom scaffold + kommentarblock per komponent (ingen aktiv regel steg 1)                       |
| `public/major-arcana-preview/index.html`                | `<script>` för flag **synkront i `<head>` före CSS**; `<link>` till nya CSS efter `design-tokens.css` |
| `docs/strategy/ORD-16-spa-v9-step-1-plan-2026-06-04.md` | Denna fil                                                                                             |

**Ej i steg 1:** `app.js`, `patient-master-ui.js`, `cco-polish.css`, `/major-arcana-preview customers-view`, backend.

---

## Implementation — exakt

### 1. `app/cco-v9-flag.js`

```javascript
(function () {
  'use strict';
  var KEY = 'arcana.v9.enabled';
  var params;
  try {
    params = new URLSearchParams(window.location.search || '');
  } catch (e) {
    params = null;
  }
  var q = params
    ? String(params.get('v9') || '')
        .trim()
        .toLowerCase()
    : '';
  if (q === 'on') {
    try {
      localStorage.setItem(KEY, '1');
    } catch (e) {}
  } else if (q === 'off') {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {}
  }
  var on = false;
  try {
    on = localStorage.getItem(KEY) === '1';
  } catch (e) {}
  document.documentElement.setAttribute('data-v9-enabled', on ? 'on' : 'off');
  window.__ARCANA_V9_ENABLED__ = on;
})();
```

**Konvention:** All v9-markup/CSS/JS-gating använder `html[data-v9-enabled="on"]` eller `window.__ARCANA_V9_ENABLED__`.

### 2. `index.html` — placering

I `<head>`, **direkt efter** `<meta viewport>` och **före** första stylesheet:

```html
<script src="./app/cco-v9-flag.js?v=build-1ccb8f9"></script>
```

Efter `design-tokens.css`:

```html
<link rel="stylesheet" href="./cco-v9-tokens.css?v=build-1ccb8f9" />
<link rel="stylesheet" href="./cco-v9-customers.css?v=build-1ccb8f9" />
```

(Uppdatera `?v=` via `npm run sync-cache-busters` om repot kräver hash-sync vid commit.)

### 3. `cco-v9-tokens.css` — token-set (scoped)

Extrahera från `uploads/CCO-Kunder-Mockup-v9-DESKTOP.html` `:root` (rad ~8–63):

- `--cco-bg-page`, `--panel-shell-top/bottom`, `--panel-shell-shadow`
- Status: `--cco-status-success/warning/danger/info` + `-bg`
- Accent: `--accent-studio`, `--rose-pill-top/bottom`
- `--cco-color-brand`, `--cco-text-secondary`, `--cco-text-tertiary`

**Regel:** Wrappa i:

```css
html[data-v9-enabled='on'] {
  /* tokens här — överskriver inte globala tokens när off */
}
```

Steg 1 applicerar **inte** page background på `body` — det kommer steg 2 (toolbar/shell) för att undvika flash utan full v9-layout.

### 4. `cco-v9-customers.css` — scaffold

Endast fil-header + tomma sektioner:

```css
/* Steg 2+: .customers-register-header → v9 toolbar */
/* Steg 3+: .customers-filters → filter-chips */
/* Steg 4+: .customer-record → .customer-row */
/* Steg N: agg-insights, smart-next, watch-widget (från /major-arcana-preview customers-view) */
```

---

## Build & bundle

| Ändring                                              | `npm run build:bundle`?                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Nya filer: `cco-v9-flag.js`, CSS                     | **Nej** — laddas direkt från `index.html`, inte i `bin/bundle-manifest.json`            |
| Framtida ändring i `app.js` / manifest-listade filer | **Ja** — kör `build:bundle`; commit hashade `app.bundle.*.min.js` + `index.html` inject |

**Efter steg 1-commit:** kör `npm run sync-cache-busters` om CI checkar cache-buster-paritet.

---

## Branch, commit, deploy

```text
Branch:  main
Commit:  feat(cco): add v9 feature flag and scoped design tokens (ORD-16 step 1)
Deploy:  push main → Render auto-deploy
Verify:  curl readyz + ?view=customers (flag off) + ?view=customers&v9=on (attribut on)
```

**En commit — inget mer i samma PR/commit.**

---

## Testplan (Cursor kör före "klar")

### Automatiskt

```bash
npm run check:syntax
npm run lint:no-bypass
npm run test:unit
ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local
```

### Manuellt (lokal eller prod efter deploy)

| #   | URL / action                              | Förväntat                                                  |
| --- | ----------------------------------------- | ---------------------------------------------------------- |
| 1   | `/major-arcana-preview/?view=customers`   | `data-v9-enabled="off"`, UI oförändrad                     |
| 2   | `…&v9=on`                                 | `data-v9-enabled="on"`, UI fortfarande oförändrad (steg 1) |
| 3   | Reload utan query                         | Fortfarande `on` (localStorage)                            |
| 4   | `…&v9=off`                                | `off`, localStorage rensad                                 |
| 5   | iPhone viewport 390px                     | Samma som 1–4                                              |
| 6   | DevTools → `window.__ARCANA_V9_ENABLED__` | Matchar attribut                                           |

---

## Risker steg 1

| Risk                       | Mitigering                                           |
| -------------------------- | ---------------------------------------------------- |
| FOUC om flag-script sent   | Script **synkront** i head, ingen `defer`            |
| Token-leak påverkar inbox  | Alla v9-tokens scoped under `[data-v9-enabled="on"]` |
| localStorage i privat läge | try/catch — fallback `off`                           |

---

## Roadmap steg 2–10 (översikt — ej implementera nu)

| Steg   | Leverans                                                                    | Flag-gated |
| ------ | --------------------------------------------------------------------------- | ---------- |
| **2**  | Toolbar + status pills (v9 header, data från `renderMetricCards`)           | ja         |
| **3**  | Filter-chips (koppla `flagFilter` + ev. `segment`)                          | ja         |
| **4**  | Listrad v9 markup i `renderPatientRowHtml()`                                | ja         |
| **5**  | Tabell-header + kolumner + virtual-scroll QA                                | ja         |
| **6**  | Segment-sidebar (`SEGMENT_UI` från `cco-kunder-real.js`)                    | ja         |
| **7**  | Layout 3-kol (owner-beslut krävs) eller 2-kol v9-skin                       | ja         |
| **8**  | Dossier v9 skin (`renderDetailPanel`)                                       | ja         |
| **9**  | **Port 5 %:** agg-insights + `cco-kunder-smart-next-step.js` + watch-widget | ja         |
| **10** | Legacy guard + radera `public/major-arcana-preview/?view=customers` + relaterade scripts             | ja         |

**Parallellregel:** Varje steg = desktop CSS + motsvarande `@media (max-width: 767px)` / `cco-mobile-shell.css`-hooks.

---

## Referens — 5 % att porta (steg 9, inte steg 1)

| Feature          | Källa                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Agg-cards        | `/major-arcana-preview customers-view` → `[data-kunder-agg-insights]`, fylls av `cco-kunder-real.js`                            |
| Smart Nästa Steg | `public/cco-kunder-smart-next-step.js` — `automationSignals` via `customers-shell?includeAutomation=1` |
| Watch-widget     | `/major-arcana-preview customers-view` → `#watchWidget` / `.watch-widget` (draggable glance UI)                                 |

---

## Claude-merge checklist (när fil finns)

- [x] Claude bekräftar `patient-master-ui.js` som primär render-väg
- [x] Claude saknar dual-system — Cursor guard kvar i steg 2+
- [x] Avvikelse render-stack (lit-html vs template strings) — **Cursor korrigerar**
- [x] Claude steg 1 layout-shell → **owner ORD-16 steg 1 flag+tokens implementerat**
- [ ] Avvikelse layout 2 vs 3 kol — eskalera owner före steg 7

---

_ORD-16 steg 1 · redo för implementation · väntar inte på Claude för flag+tokens (låg risk, owner-beslut #5)._
