# CCO Staff UI Design Alignment · 4 juni 2026

> P0 Design Alignment Sprint. Mål: alla staff-/journalpilot-sidor ska kännas som riktiga CCO/Kunder — samma nav, samma kort, samma formspråk, samma trygghet. Inga "demoportal"-vibbar.

---

## Designkälla

| Källa | URL | Vad återanvänds |
|---|---|---|
| Kunder / Patientkort | `/kunder.html` | CCO topnav · CCO-tokens · rose-pill active-state · vellum bg · glass cards · pill-stil · badge-stil · button-stil |

---

## Vad ändrades

### 1. Gemensam CSS skapad
**`public/cco-staff-shell.css`** — central styleguide som återanvänder Kunders DNA:

- **Tokens** (exakta värden från kunder.html):
  - `--cco-bg-page: #faf6f2`
  - `--cco-bg-surface: #ffffff`
  - `--cco-bg-surface-sunken: #f5efe6`
  - `--cco-color-brand: #2b251f`
  - `--cco-text-secondary: rgba(70, 60, 50, 0.62)`
  - `--cco-text-tertiary: #8a8174`
  - 4 status-färger (success/warning/danger/info)
  - `--accent-studio: #bb4779` (rose/pink active-state)
  - `--rose-pill-top/bottom` för active-pill
- **Page-locala token-overrides** — `--bg`, `--paper`, `--accent`, `--ink` mappas till CCO-värden så befintliga staff-sidor automatiskt ärver CCO-känsla utan att deras lokala CSS behöver röras
- **Vellum bg** — radial-gradient i hörnen + base color (samma som kunder.html)
- **`.cco-top-nav`** — exakt samma styling som kunder.html (rose-pill active, brand-text, hover)
- **`.cco-card`** — vellum/glass-card med 0.96/0.92-gradient + 24px-blur-skugga + inset highlight
- **`.cco-badge`** + variants (success/warning/danger/info/accent) — samma som Patientkort
- **`.cco-btn`** + variants (primary/success) — samma som Patientkort

### 2. CCO topnav injiceras på alla staff-sidor
**`public/cco-staff-shell.js`** — vanilla JS som:

- Lägger `.cco-shell` klass på `<body>` (triggers vellum bg override)
- Injicerar `<div class="cco-top-nav">` överst på body:
  ```
  CCO | Konversationer | Kunder | Kalender | Journalpilot
  ```
- Markerar **"Journalpilot" aktiv** med rose-pill om man är på en staff-sida
- Markerar "Kunder" aktiv om man är på kunder.html

### 3. Inject-tag på alla 17 staff-sidor
I `<head>`:
```html
<link rel="stylesheet" href="/cco-staff-shell.css" />
<script defer src="/cco-staff-shell.js"></script>
```

---

## Sidor harmoniserade (17 st)

| # | URL | Status |
|---|---|---|
| 1 | `/cco-personal-start.html` | ✅ shell injected |
| 2 | `/cco-presenter-mode.html` | ✅ shell injected |
| 3 | `/cco-4june-command-center.html` | ✅ shell injected |
| 4 | `/journal-pilot-guide.html` | ✅ shell injected |
| 5 | `/journal-pilot-print-pack.html` | ✅ shell injected |
| 6 | `/cco-staff-training-mode.html` | ✅ shell injected |
| 7 | `/cco-journalpilot-faq.html` | ✅ shell injected |
| 8 | `/cco-journalpilot-go-live.html` | ✅ shell injected |
| 9 | `/cco-staff-go-live-control.html` | ✅ shell injected |
| 10 | `/cco-journal-safety-helper.html` | ✅ shell injected |
| 11 | `/cco-review-material-warning.html` | ✅ shell injected |
| 12 | `/cco-pre-signering-check.html` | ✅ shell injected |
| 13 | `/cco-after-meeting-start.html` | ✅ shell injected |
| 14 | `/cco-morning-checklist.html` | ✅ shell injected |
| 15 | `/cco-staff-day1-checklist.html` | ✅ shell injected |
| 16 | `/journal-pilot-signoff-sheet.html` | ✅ shell injected |
| 17 | `/cco-staff-training-completion.html` | ✅ shell injected |

**Inte rörd:** `/cco-ops-workbench.html` (Cursors område — riskar konflikt med pågående canary-arbete).

---

## CSS-komponenter återanvända från Kunder/Patientkort

| Komponent | Klass | Funktion |
|---|---|---|
| Top-nav | `.cco-top-nav` + `.cco-brand` + `.cco-top-nav a.active` | Samma nav som kunder.html — CCO + Konversationer + Kunder + Kalender + Journalpilot |
| Title-block | `.cco-title-block` + `.cco-title-kicker` | Patientkort-style hero med 3px gradient-stripe top |
| Card | `.cco-card` + `.cco-card-kicker` | Vellum/glass-card med 24px-blur-skugga |
| Badge | `.cco-badge` + 5 variants | Patientkort-style små pills |
| Button | `.cco-btn` + 2 variants | Samma som "Öppna kundkort"-knappar |
| Brand-mark | `.cco-title-kicker .mark` | 22×22 rose-pill med "CC"-text |
| Footer | `.cco-staff-footer` | Tunn divider med tertiary text |

---

## Språkbyten ("demoportal" → CCO-konsekvent)

Automatiskt körda regex-byten på alla 17 sidor:

| Före | Efter |
|---|---|
| `demoportal` (case-insensitive) | `personalstart` |
| `microsite` | `personalsida` |
| `Patientkort-demo` | `Kundkort` |
| `demo-stöd` | `pilot-stöd` |

**Behållna:** Tekniska URL:er som `/journal-feed-demo.html` (Cursor-ägd route) — rörs inte.

---

## Visuella konflikter borttagna

Genom CSS-token-override i `cco-staff-shell.css`:

- Pages som hade pink/rose-paletter (`#bb4779`) — ärver nu samma värde från CCO-token → konsekvent
- Pages som hade parchment-paletter (`#b08b3f`) — `--accent` overrides till `#bb4779` (CCO active-color) men `--paper` behåller vit för att inte bryta layout
- Vellum bg appliceras via `body.cco-shell` (JS lägger till klassen)
- Gamla custom gradients ärver fortfarande från sin lokala CSS — `cco-staff-shell.css` påverkar primärt topnav + body bg + tokens
- Page-shell-overrides är **non-destructive** — lokala layouts (timer, progress, checklist) fortsätter fungera

---

## Funktioner bevarade

✅ Alla länkar fortsätter fungera — preflight PASS bekräftar
✅ Pilotkund 1/2/3 (cco-pilot-20260602-a/b · readiness-smoke-c) — feed=200, timeline=200, forms=200
✅ Journal Pilot Guide — sektion 0 "Vad gör jag nu?" intakt
✅ Print Pack — print-CSS intakt
✅ Training Mode / FAQ / Go-Live / Sign-off / Pre-Sign / Safety Helper — interaktivitet bevarad
✅ Inga journalroutes rörda — `/api/v1/cco-customers/:id/journal-feed`, `/journal-timeline`, `/cco-forms/*` orörda
✅ Server.js orörd

---

## Gate-resultat

| Test | Resultat |
|---|---|
| Preflight `verify-personal-demo-links` | **ALL PASS** ✅ |
| E2E `run-personal-demo-readiness` | **PASS** ✅ |
| Pilot 1/2/3 feed/timeline/forms | **200/200/200** ✅ |
| Alla 17 staff-sidor 200 | **PASS** ✅ |

---

## Vad CCO-känslan ger personalen

| Före | Efter |
|---|---|
| 13+ separata demo-/microsite-sidor med olika färgsystem | 17 sidor med **samma CCO topnav · samma kort · samma formspråk** |
| Pink personal-start / parchment presenter-mode / pink kalender — visuell fragmentering | Konsekvent CCO-DNA — användaren känner sig hemma direkt |
| Olika typography och spacing per sida | Samma `-apple-system, SF Pro Display, Inter` + `max-width: 1200px` |
| "Patientkort-demo"-rubriker, "demoportal"-vibbar | "Personalstart · Journalpilot · kontrollerad pilot" |

---

## Filer skapade / ändrade

- ✅ **`public/cco-staff-shell.css`** (NY) — 280 rader, central CCO-token-styleguide
- ✅ **`public/cco-staff-shell.js`** (NY) — vanilla JS topnav-inject, ~50 rader
- ✅ **17 staff-HTML-sidor** — `<link>` + `<script>` tillagd i `<head>` + språkbyten via regex

---

_Hair TP Clinic · 4 juni 2026 · Cycle 18 P0 Design Alignment Sprint_
_Bygg inga fler sidor. Bygg inga nya features. Samma CCO-känsla överallt._
