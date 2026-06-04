# ORD-15 · Claude audit — Preview-SPA → V9-design portering

**Datum:** 2026-06-04
**Författare:** Claude (parallellt med Cursors audit)
**Status:** AUDIT-ONLY · inga kod-ändringar
**Mål:** Förstå hur preview-SPA renderas så vi kan skriva ny render-kod som producerar v9-mockupens HTML-struktur

---

## 1. KOMPONENT-MAP

**Customer-list-view (huvudvyn):**

- Fil: `public/major-arcana-preview/app/patient-master-ui.js` (6 291 rader)
- Detta är KÄRNAN. Innehåller list-rendering + dossier-rendering + alla tabs.
- 18+ render-funktioner identifierade (se Render-arkitektur nedan)

**Patient list:**

- Renderas via `patient-master-ui.js` med `PAGE_SIZE = 60` (matchar SPA:s "60 visade av X kunder")
- Använder också `app/cco-patient-list-virtual.js` (virtual-scroll för stora listor)
- Klassiska render-funktioner: `renderModeChrome`, `renderMetricCards`, `renderPatientFlags`

**Dossier (höger panel / patient detail):**

- Renderas via `patient-master-ui.js` rad 1277+:
  - `renderPatientComplianceCard` (rad 1277)
  - `renderPatientDemographicsCard` (rad 1304)
  - `renderPatientIntegrationsCard` (rad 1408)
  - `renderPatientHeroChipRow` (rad 1528)
  - `renderPatientHeroActions` (rad 1535)
  - `renderPatientPrimaryTabs` (rad 1550) — TABS-struktur
- Stöd: `app/cco-care-panel.js` (427 rader) — care/komm-panel
- Stöd: `app/components/arcana-thread-card.js` — mail-trådar i dossier

**Mail/komm i dossier:**

- `app/components/thread-store.js` + `thread-store-bridge.js`
- `app/components/arcana-thread-card.js`
- `app/components/thread-to-card-props.js`

**Filter-chips / segment-meny:**

- Sannolikt i `patient-master-ui.js` (har "FLAG_LABELS" + "MATCH_LABELS" konstanter)

**Timeline (journal-feed):**

- `renderJournalTimelineFilters` (rad 1687)
- `renderJournalTimelineItem` (rad 1700)
- `renderJournalTimelineSegments` (rad 1715)
- `renderUnifiedTimelinePanel` (rad 1742) — combinerar journal + drive-files + occasions

**Modals (floating shells):**

- `app/render-components.js` (122 rader) — bara modal-visibility-management
- Hanterar: mailbox-admin, confirm, customer-merge, customer-settings, macro-editor, settings-profile, note-mode, more-menu

---

## 2. RENDER-ARKITEKTUR

**Stack:**

- **Vanilla JS + lit-html** (web components)
- Bevis: `app/components/lit-vendor.js`, `app/components/lit-switchover.js`
- Modal-shells använder `data-open`-attribut + CSS för visibility (idempotent DOM-mutation)
- Inga inline-styles, CSS sköter synlighet

**Boot-pattern:**

```javascript
if (window.__ARCANA_PATIENT_MASTER_UI_BOOTED__) return;
window.__ARCANA_PATIENT_MASTER_UI_BOOTED__ = true;
```

Global singleton-pattern. Varje modul self-initializes.

**Render-strategi:**

- Render-funktioner tar `state`-objekt som parameter
- Muterar DOM idempotent
- Re-render triggas via `scheduleRender`-mekanism (i `app.js`)
- Stora bundles (`app.bundle.*.min.js`) wraps allt detta

**Konsekvens för portering:**

- Vi kan skriva om EN funktion i taget (t.ex. `renderPatientPrimaryTabs`) utan att röra resten
- lit-html templates är lätta att modifiera (`html\`...\``-syntax)
- Idempotent mutation = säkrare än React diff:ing

---

## 3. DATA-FLÖDE

**Backend-endpoints (från patient-master-ui.js):**

- `/api/v1/cco-patient-master/*` (huvudet)
- Admin-token via `ADMIN_TOKEN_KEY = 'ARCANA_ADMIN_TOKEN'`

**Stores/services:**

- `thread-store.js` (mail-trådar)
- `thread-cache-idb.js` (IndexedDB-cache)
- `cco-request-cache.js` (generell request-cache)
- `cco-cache-policy.js` (cache-policy)
- `cco-fetch-instrumentation.js` (telemetri)

**Klick på kund-rad:**

- Triggar antagligen `renderPatientPrimaryTabs(detailTab, fileCount)` i höger-panel
- Tabs: `profil` (default), `scalpanalys` (feature flag), och fler vi inte sett ännu

**State-management:**

- Global state-objekt (sannolikt i app.js)
- Render-funktioner är read-only mot state
- Idempotent — säkert att kalla flera gånger

---

## 4. CSS-ARKITEKTUR

**Filer som styr customer-view (i `public/major-arcana-preview/`):**

- `adaptive-overrides.css` (8 983 bytes) — REDAN en skin-fil! Cursor använder detta mönster.
- `adaptive-tokens.css` (3 021 bytes) — CSS-variabler/tokens
- `adaptive-runtime.js` (4 021 bytes) — runtime-CSS-injection
- `cco-polish.css` — Polish + visibility-CSS för modals
- `cco-mobile-shell.css` — Mobil-shell
- `cco-tablet-shell.css` — Tablet-shell
- `cco-calendar.css` — Kalender-styling

**Adaptive-runtime existerar redan** = INFRASTRUKTUR för skin-byte finns. Den används troligen för temabyten.

**Mobil vs Desktop:**

- Separata filer (`cco-mobile-shell.*`, `cco-tablet-shell.*`)
- Möjligen separata komponenter (`booking-mobile-shell.js`, `cco-mobile-core.js`)

---

## 5. MOCKUP-DIFF (förväntade strukturella skillnader)

(Detta är teoretiskt — verifieras genom side-by-side jämförelse i runtime)

| #   | Element             | SPA idag                         | V9-mockup vill ha                                                     |
| --- | ------------------- | -------------------------------- | --------------------------------------------------------------------- |
| 1   | Top-nav             | "Arcana"-branded, sannolikt egen | "v9 · KUNDER" + CCO/Konversationer/Kunder/Kalender/Automatisering/Mer |
| 2   | Sidomeny            | SPA's egen filter-struktur       | SEGMENT (Kundgrupper) · BEHANDLING · STATUS                           |
| 3   | Kundlista-header    | "Kundregister"                   | "KUNDER · 7 217 kunder · ↓ Exportera · + Ny kund"                     |
| 4   | Filter-chips        | SPA:s FLAG_LABELS                | Alla / Aktiva / VIP / Risk / Nya / Dormant / Saknar HD                |
| 5   | Agg-cards           | Saknas i SPA                     | 4 cards: ★ IDAG · ✦ MÖJLIGHET · ➚ TREND · ⚠ RISK                      |
| 6   | Kund-rad            | Tät rad med data-table-look      | Rik rad: avatar + namn + badges + kontakt + status-pill               |
| 7   | Dossier             | Inom samma sida (tabs)           | Höger panel med Smart Nästa Steg + actions                            |
| 8   | Höger panel default | Tomt eller stats                 | Aggregat-vy: Översikt + Kundpopulation + AI-insikter                  |
| 9   | Watch-frame         | Saknas i SPA                     | "NÄSTA 14:30 Konsultation"                                            |
| 10  | Mobil-version       | `cco-mobile-shell`               | V9 mobile-mockup design                                               |

---

## 6. PORTERINGS-STRATEGI

### Princip

**Behåll all logik. Skriv om TEMPLATES.**

Varje render-funktion i `patient-master-ui.js` returnerar HTML. Vi byter ut HTML:n men låter datain-output vara samma.

### Föreslagen commit-ordning (10 steg)

**Steg 1 [P0]: V9 layout-shell**

- Skriv om SPA:s top-nav + sidomeny + footer till mockupens struktur
- Filer: app.js (main-render) + nya CSS-rules
- Resultat: kund-vyn ser ut som v9 i RAMEN (men listan är fortfarande gammal)

**Steg 2 [P0]: V9 customer-list-rad**

- Skriv om patient-list-rendering (i patient-master-ui.js)
- Nya HTML-struktur per rad: avatar + namn + badges + kontakt + status + pill
- Behåll data-fetch + virtual-scroll
- Resultat: kundlistan ser ut som v9 men dossier är fortfarande gammal

**Steg 3 [P0]: V9 filter-chips**

- Skriv om chip-meny + counts
- Mappa SPA:s filter-strategier till v9-chip-labels

**Steg 4 [P0]: V9 sidomeny**

- Skriv om SEGMENT / BEHANDLING / STATUS-grupper

**Steg 5 [P1]: V9 agg-cards (★ IDAG / ✦ MÖJLIGHET / ➚ TREND / ⚠ RISK)**

- Ny komponent (saknas helt i SPA)
- Beräkna från SPA:s store-data

**Steg 6 [P1]: V9 dossier - hero-rad**

- Skriv om `renderPatientHeroChipRow` + `renderPatientHeroActions`
- Avatar + namn + kicker + smart-next-step

**Steg 7 [P1]: V9 dossier - actions**

- Skriv om `renderPatientPrimaryTabs` så tabs är mockup-style
- Behåll: profil / scalpanalys / timeline / etc

**Steg 8 [P2]: V9 dossier - body**

- Skriv om compliance/demographics/integrations-cards
- Skriv om timeline-rendering

**Steg 9 [P2]: V9 högerpanel default (aggregat-vy)**

- När ingen kund vald: visa översikt + kundpopulation + AI-insikter
- Implementera om från /major-arcana-preview/?view=customers v9

**Steg 10 [P2]: V9 watch-frame + mobile-parity**

- Watch-frame komponent (helt ny)
- Mobile-shell uppdatering

### Risker

- **State-management:** Om en re-render-trigger missas blir UI inaktivt
- **Lit-templates:** kräver lit-html-syntax-kompetens
- **CSS-collisions:** SPA's befintliga CSS kan konflikta med ny v9-CSS — använd CSS-scoping eller BEM-prefix
- **Mobile:** SPA har separata mobile-komponenter — porteringen måste täcka båda
- **app.bundle.\*.min.js:** Den bundlade JS:n behöver byggas om för production — checka byggprocess (Webpack? esbuild?)

### Tid (uppskattning per steg)

- Steg 1-4 (layout + list + chips + sidomeny): 3-4 dagar
- Steg 5-7 (agg-cards + dossier hero + actions): 2-3 dagar
- Steg 8-10 (dossier body + aggregat-vy + watch + mobile): 3-5 dagar
- **Total: 8-12 arbetsdagar (≈ 2 veckor)**

---

## 7. ÖPPNA FRÅGOR FÖR OWNER

1. **Byggprocess?** Hur byggs `app.bundle.f46ea4abdb.min.js`? Källkod ligger i `app/` — behöver vi rebuild-step efter varje ändring?

2. **Branch-strategi?** Allt på `main` direkt, eller separat feature-branch (`feat/v9-port-spa`)?

3. **Iterativ deploy?** Steg-för-steg deploy till prod, eller batchad till slutdeploy?

4. **Mobile-priority?** Är mobile-versionen lika viktig som desktop, eller okej att desktop landar först?

5. **Backward-compat?** Ska gamla designen vara accesbar via feature-flag eller URL-param under övergång?

6. **/major-arcana-preview/?view=customers v9 framtid?** Radera, behåll som experiment, eller redirect?

---

## 8. NÄSTA STEG

1. ✅ Jämför denna audit med Cursors audit (väntar)
2. Owner-beslut på 6 öppna frågor ovan
3. Skriv ORD-16 med exakt commit-ordning + konkret första filändring
4. Cursor börjar steg 1 (layout-shell)
5. Claude UAT efter varje commit

---

_Auto-genererad av Claude · 2026-06-04 · parallellt med Cursors audit_
