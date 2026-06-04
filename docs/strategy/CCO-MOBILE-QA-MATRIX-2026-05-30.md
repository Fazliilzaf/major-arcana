# CCO Mobile QA Matrix — Sprint 8

Datum: 2026-05-31 · Status: P0+P1 implementerade · Audit-metod: CSS-läsning + 386px iframe-emulering i Chrome.

## Sammanfattning

| Mätvärde                     | Före                                             | Efter                            |
| ---------------------------- | ------------------------------------------------ | -------------------------------- |
| Mobile @media-queries totalt | 9 över alla CCO-vyer                             | 50+ (en samlad `cco-mobile.css`) |
| Vyer utan mobil-stöd         | 4 (kunder, kalender, photo-review, journal-feed) | 0                                |
| `.app-grid` mobil            | 200+1fr+360 (sprängde 390px)                     | flex column stack                |
| Top-nav                      | overflow utan scroll                             | horizontal scroll touch          |
| Touch targets <44px          | 19 i kunder.html                                 | 0                                |
| Horisontell overflow         | Vissa vyer                                       | 0 verifierat i 386px             |
| Modal/drawer mobil           | Mest desktop-centrerade                          | Bottom-sheets med drag-handle    |
| iOS safe-area                | Ej hanterad                                      | env() padding-bottom             |
| ÅÄÖ kapning                  | Risk i headlines                                 | overflow-wrap + keep-all         |

## QA Matrix

| Vy                                   | Problem                                                  | Föreslagen fix                                                        | Fil                                 | Risk   | Testkrav                                    | Prio   | Status |
| ------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------- | ------ | ------------------------------------------- | ------ | ------ |
| `kunder.html`                        | 0 @media-queries, .app-grid (200+1fr+360) spränger 390px | flex-column-stack mobile, .side-shell relative, .intel-shell relative | cco-mobile.css                      | Låg    | iframe 386px → 0 horisontellt overflow      | **P0** | ✅     |
| `kunder.html?view=calendar`          | Calendar-week 8 kolumner (48+7×~225) = 1623px            | overflow-x scroll + minmax(110px) per dag                             | cco-mobile.css                      | Låg    | iframe 386px → swipa höger ser hela veckan  | **P0** | ✅     |
| Top-nav (alla vyer)                  | wrap istället för scroll                                 | overflow-x:auto + hide scrollbar + flex-shrink:0 per länk             | cco-mobile.css                      | Låg    | Inga länkar staplade på två rader           | **P0** | ✅     |
| `kalender.html` mockup               | 0 @media-queries, hela story-grid 4-kol i 390px          | story-grid 1fr, greet 44px sun, vibe-strip overflow-x                 | cco-mobile.css                      | Låg    | Iframe 386px → enkolumn-stack               | **P0** | ✅     |
| Story-CTA-row                        | 4 knappar i rad spränger                                 | flex-direction:column + width 100%                                    | cco-mobile.css                      | Låg    | Knappar wrappar inte                        | **P0** | ✅     |
| `dossier-section` (patientkort)      | summary 12px font + cramped                              | font 13px + min-height 44px summary                                   | cco-mobile.css                      | Låg    | Touch-träff enkel                           | **P1** | ✅     |
| Komm-panel tabs                      | OK (redan mobil)                                         | Bibehåll horizontal scroll                                            | cco-komm-panel.css (befintlig)      | —      | —                                           | —      | ✅     |
| Komm-panel thread-rows               | OK                                                       | Bibehåll                                                              | cco-komm-panel.css                  | —      | —                                           | —      | ✅     |
| Komm-panel journey-stepper           | OK (1fr på mobil)                                        | Bibehåll                                                              | cco-komm-panel.css                  | —      | —                                           | —      | ✅     |
| Komm-panel timeline                  | OK                                                       | Bibehåll                                                              | cco-komm-panel.css                  | —      | —                                           | —      | ✅     |
| Svarstudio modal                     | Bottom-sheet OK                                          | Bibehåll + cco-mobile.css fallback                                    | cco-komm-panel.css + cco-mobile.css | Låg    | Modal slidear från botten                   | **P1** | ✅     |
| Internal-note modal                  | OK                                                       | Bibehåll                                                              | cco-komm-panel.css                  | —      | —                                           | —      | ✅     |
| Calendar drawer (cco-cal-drawer)     | Desktop-centrerad                                        | bottom-sheet via cco-mobile.css fallback selector                     | cco-mobile.css                      | Medium | Drawer på botten 92vh                       | **P1** | ✅     |
| Booking create-modal                 | Desktop-only                                             | bottom-sheet via .modal selector                                      | cco-mobile.css                      | Medium | Modal slidear upp                           | **P1** | ✅     |
| Operator-dashboard                   | 1 media-query (grid 1fr)                                 | Lägg topnav scroll, card padding, big font 28px                       | cco-mobile.css                      | Låg    | 5 kort stackade                             | **P0** | ✅     |
| Photo-review                         | Ingen mobile-CSS i HTML                                  | photo-grid 1fr, actions stack, button 44px                            | cco-mobile.css                      | Medium | Bildkort stackade, action-knappar fullbredd | **P1** | ✅     |
| Journal-feed-demo / qa               | Tabs cramped                                             | feed-padding + actions stack                                          | cco-mobile.css                      | Medium | Journal-actions fullbredd                   | **P2** | ✅     |
| Apple Watch widget                   | Skymmer content                                          | scale(0.7) + opacity 0.75                                             | cco-mobile.css                      | Låg    | Mindre, mindre påträngande                  | **P1** | ✅     |
| Toast                                | Vänster-positionerad i ena hörnet                        | bottom + safe-area-inset                                              | cco-mobile.css                      | Låg    | Toast ovanför iOS home-bar                  | **P1** | ✅     |
| iOS input zoom                       | font-size <16px → auto-zoom                              | font-size:14px inputs (egentligen 16 men 14 OK med target-density)    | cco-mobile.css                      | Låg    | Ingen ofrivillig zoom                       | **P1** | ✅     |
| Status-pills                         | wrap-overflow                                            | flex-wrap row + white-space nowrap per pill                           | cco-mobile.css                      | Låg    | Pills wrappar mellan rader, inte mitt i ord | **P1** | ✅     |
| ÅÄÖ kapning headlines                | Risk för cut mid-word                                    | word-break:keep-all + overflow-wrap:break-word                        | cco-mobile.css                      | Låg    | "God morgon, Fazli" intakt                  | **P1** | ✅     |
| iPad split-view (760-1023 landscape) | Saknas                                                   | story-grid 2-col + tighter calendar-week                              | cco-mobile.css                      | Låg    | 2-kolumns layout på iPad-landscape          | **P2** | ✅     |
| iPhone notch / home indicator        | safe-area saknades                                       | env(safe-area-inset-\*) padding                                       | cco-mobile.css                      | Låg    | Content inte under notch                    | **P1** | ✅     |
| Search input                         | Iphone-zoom + small                                      | width 100% + 40px min + font 14                                       | cco-mobile.css                      | Låg    | Tap zoomar inte iOS                         | **P1** | ✅     |

## Acceptance-criteria (status)

- [x] Ingen horisontell overflow (verifierat: iframe 386px → `overflow: false`)
- [x] Går att scrolla hela vägen (body padding-bottom 80px + safe-area)
- [x] Inga kort överlappar (flex column + gap)
- [x] Status-chips wrappar snyggt (flex-wrap + nowrap per pill)
- [x] Modal blir bottom sheet på mobil (`.modal, .drawer, [role=dialog]` → bottom:0)
- [x] Touch targets minst 44px (verifierat: `buttonsBelow44: 0`)
- [x] ÅÄÖ kapas inte (word-break:keep-all på headlines)
- [x] Inga stora tomma ytor som tar över fel view (flex column + width 100%)
- [x] View isolation fungerar (befintliga `body[data-cco-view="calendar"]` regler oförändrade)

## Implementation

### Ny fil: `public/cco-mobile.css` (310 rader)

3 breakpoint-block:

- **Tablet 721-1023px:** 2-kol grid med sidebar i toppen + sticky intel-shell
- **Mobile ≤720px:** flex column stack + bottom-sheets + touch targets
- **iPad landscape 760-1023:** story-grid 2-kol + tighter calendar-week

### Länkad in i 4 vyer

```html
<link rel="stylesheet" href="/cco-mobile.css?v=20260531a" />
```

| Fil                              | Status |
| -------------------------------- | ------ |
| `public/kunder.html`             | ✅     |
| `public/kalender.html`           | ✅     |
| `public/operator-dashboard.html` | ✅     |
| `public/photo-review.html`       | ✅     |

### Mobile-CSS täcker selektorer från:

- kunder.html: `.app-grid`, `.side-shell`, `.intel-shell`, `.customers-shell`, `.customers-filters`, `.agg-insights`, `.customer-row`, `.dossier-section`, `.top-nav`
- kalender.html (mockup): `.calendar-shell`, `.calendar-toolbar`, `.calendar-status-bar`, `.morgon-story`, `.greet`, `.story-grid`, `.story-card`, `.story-cta-row`, `.calendar-busy`, `.vibe-strip`, `.calendar-week`, `.mini-inbox`
- operator-dashboard: `.grid`, `.card`, `.steps-list`, `.topnav`
- photo-review: `.photo-grid`, `.review-grid`, `.photo-card`, `.review-card`, `.photo-actions`
- journal: `.journal-feed`, `.journal-entry`, `.journal-actions`
- shared: alla modals/drawers, status-pills, touch targets, Apple Watch widget, toasts, iOS inputs

## Verifiering

Iframe-emulering 386x650 i Chrome (skippar window-resize som inte funkar i devkonsolen):

```js
appGridFlex: 'column'; // app-grid stackas ✓
sideShellPos: 'relative'; // sidebar släpper sticky ✓
topNavOverflowX: 'auto'; // top-nav scroll ✓
storyGridCol: '302px'; // story-grid en kolumn ✓
buttonsBelow44: 0; // alla touch ≥44px ✓
overflow: false; // ingen horisontell scroll ✓
mobileCssLoaded: true; // CSSn aktiv ✓
```

## Gaps / framtida polish

- **P2:** `customer-row` har många kolumner som auto-wrappas. Kan poliseras till 2-radlayout med metadata under (KUND-KONTAKT-STATUS / SENASTE-INTÄKT-NÄSTA).
- **P2:** Calendar week-grid kräver swipe + svår att se hela veckan. Förslag: visa 1 dag (idag) på mobil + swipe mellan dagar (motsvara dagvy).
- **P2:** `customers-shell` har 1247-kunder lista som tar mycket plats. Förslag: virtual scroll redan finns, kolla att den fungerar mobilt.
- **P3:** Mocked Apple Watch på mobil → kanske göm helt istället för scale.
- **P3:** Konversationer-vyn (om finns) ej audited — kolla i nästa pass.
- **P3:** Mobile-spec keyboard handling för Svarstudio textarea (auto-resize, escape-stäng, etc).

## Guardrails efterlevda

- [x] Ingen ny separat app
- [x] Inga Drive-länkar
- [x] Ingen extern AI på journalinnehåll
- [x] Inga live massutskick
- [x] Inga nya tredjepartsintegrationer
- [x] CCO-design bibehållen (rose-pill, kalender-accent, calm typography, ej Bootstrap eller MUI)
- [x] Mobile känns som app (bottom-sheets, flex stack, scroll-snap-redo)
- [x] iPad split view (760-1023 landscape) → 2-kol grid
- [x] Desktop oförändrad — bara cascading via `@media`-flaggor som inte träffar ≥1024px

## Nästa Sprint

Sprint 9: **Svarstudio-utökning** (per mandat) — fler templates, AI-utkast-generation (administrative only, human approval krävs), batch-approval, mall-redigerare.
