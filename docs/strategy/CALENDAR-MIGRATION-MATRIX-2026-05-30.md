# Calendar Migration Matrix: kalender.html → /major-arcana-preview customers-view calendar-shell

*Genererad: 2026-05-30 · Status: AUDIT — väntar på owner-approval innan implementation*

> Owner-direktiv: aktivera existing `.calendar-shell` i `/major-arcana-preview customers-view`, flytta
> Sprint 1-2-funktioner dit, deprecate `kalender.html`. Bygg inte dubbla UI:n.

---

## Audit-fynd

### Finns redan i `/major-arcana-preview customers-view` (rad 3327–3645)

| Komponent | Var |
|---|---|
| `.calendar-shell` (`hidden`) | L3328 |
| `.calendar-surface` + radial-gradient-bg | L113-114 |
| `.calendar-toolbar` med kicker + h2 + actions | L3331-3370 |
| 4 segment-tabs (morgon/vecka/dag/resurs) | L3362-3365 |
| `.calendar-status-bar` (week-pill + status-pills) | L3373 |
| `.morgon-story` med 4 story-cards (Idag/Risker/Möjligheter/Klart) | L3384 |
| `.greet` med animerad sol-disk | L3388 |
| Density-toggle (vanlig/stressig/maraton) | L3346 |
| `#micBtn` (voice booking) | L3347 |
| `#calmToggle` (lugnt-läge) | L3352 |
| `#avatarToggle` (Linear/Notion-mode) | L3353 |
| `#tmSlider` (timemachine) | L3358 |
| JS `setMode('vecka')` boot-call | L4081 |
| JS handlers för mic/calm/avatar/density | L4150+ |

### Aktiveras hur

Rad 3328: `<section class="calendar-shell" hidden>` — `hidden` attribut tas bort + JS `setMode('dag')` istället för `'vecka'` (per owner-beslut Sprint 1: default = dagvy).

Mode-switcher finns redan — `data-mode` CSS-selector på `.calendar-content`.

---

## Migration Matrix — 14 funktioner

| # | Funktion i kalender.html | Finns redan i /major-arcana-preview customers-view? | Ska flyttas? | Ska ersättas? | Ska tas bort? | Risk om tappas | Testkrav |
|--:|---|---|---|---|---|---|---|
| 1 | **Dagvy** (time-grid 07-19, booking-cards per resurs) | 🟡 PARTIAL — `data-mode="dag"` CSS finns men rendering är statisk hardcoded mock | ✅ **flyttas** rendering-logik (`renderDayGrid` → `cco-kalender.js`) | Ersätt static mock med wire mot `/api/v1/calendar/day` | Nej | **HÖG** — kalendern visar fel data | Smoke: 7 resurser laddade, slots på rätt tid |
| 2 | **Veckovy** (7-kolumn) | 🟡 PARTIAL — `data-mode="vecka"` CSS-selector finns, men 7-kol-grid saknas | ✅ **flyttas** `renderWeekGrid` + `loadWeek` | Lägg till 7-kol-grid + wire mot `/api/v1/calendar/week` | Nej | **HÖG** — vecka tom | Smoke: 7 dagar renderade, today highlight |
| 3 | **Booking-create-modal** | ❌ NEJ — finns inte | ✅ **flyttas** `openCreateBookingModal` + CSS | Helt ny i /major-arcana-preview customers-view | Nej | **HÖG** — kan inte boka | Smoke: 5 quick-picks, submit → POST 200 |
| 4 | **Konflikt-check** (live, debounced) | ❌ NEJ | ✅ **flyttas** `doCheck` + `renderConflictArea` | Helt ny | Nej | **MEDEL** — risk för dubbelbokning | Smoke: 06:00 → warn, overlap → blocker |
| 5 | **Quick-picks (5 service-typer)** | ❌ NEJ — /major-arcana-preview customers-view har bara segment-tabs för modes | ✅ **flyttas** quick-pick-grid | Helt ny | Nej | **MEDEL** — staff väljer manuellt service-id | Smoke: 5 picks renderas, click → state-update |
| 6 | **Booking-drawer** (right + mobile bottom-sheet) | ❌ NEJ | ✅ **flyttas** `renderDrawer` + CSS | Helt ny i /major-arcana-preview customers-view (app-grid har 360px höger-kolumn — kan återanvändas) | Nej | **HÖG** — kan inte se booking-detalj | Smoke: klick på booking → drawer öppen med 6 actions |
| 7 | **Mobil bottom-sheet** | ❌ NEJ | ✅ **flyttas** CSS `@media max-width 720px` | Helt ny | Nej | **HÖG** — mobil ogenomförbar | Smoke: viewport <720, drawer renderas som bottom-sheet med drag-handle |
| 8 | **Status-pills** (journal/HD/FF/consent/agreement/ID-verify) | ❌ NEJ | ✅ **flyttas** `renderStatusSection` + `pillForStatus` | Helt ny | Nej | **HÖG** — staff ser inte readiness | Smoke: pills för 6 dokumenttyper renderas korrekt per status |
| 9 | **Ready-for-treatment-banner** | ❌ NEJ — status-pill med "klart för dagen" finns men inte per-booking | ✅ **flyttas** `renderReadyBanner` | Helt ny per-booking | Nej | **HÖG** — staff missar blocker | Smoke: blocker-banner med list av missing-docs |
| 10 | **Check-in action** | ❌ NEJ | ✅ **flyttas** `triggerAction('checkin')` | Helt ny | Nej | **HÖG** — ingen check-in | Smoke: klick → POST /checkin → audit |
| 11 | **No-show action** | ❌ NEJ | ✅ **flyttas** `triggerAction('no-show')` med reason-prompt | Helt ny | Nej | **HÖG** — ingen no-show-tracking | Smoke: klick → POST /no-show → audit med reason |
| 12 | **Follow-up action** | ❌ NEJ | ✅ **flyttas** `triggerAction('follow-up')` med interval-prompt | Helt ny | Nej | **MEDEL** — manuell follow-up-bokning | Smoke: klick → POST /follow-up → audit |
| 13 | **Starta journal action** | 🟡 PARTIAL — `/smart-anteckning.html` finns men ingen länk från kalender | ✅ **flyttas** open-i-ny-flik-handler | Helt ny från kalender | Nej | **HÖG** — friction för staff | Smoke: klick → öppnar smart-anteckning med patientId + encounterId |
| 14 | **Öppna patientkort action** | 🟡 PARTIAL — /major-arcana-preview customers-view ÄR patientkort-vyn men ingen deep-link från booking-card | ✅ **flyttas** scroll-till-kund-handler | Ny: tab-switch till kund-vyn med highlight | Nej | **MEDEL** — staff söker manuellt | Smoke: klick → switch till kunder-tab + visa kort för patientId |

### Komplement (existing features i /major-arcana-preview customers-view som BEHÅLLS)

| Komponent | Beslut |
|---|---|
| Morgon-story (4 story-cards) | **BEHÅLL** som default-vy (toggle via segment-tab "Morgon"). Dynamisk data wireras P2. |
| Greet med animerad sol | **BEHÅLL** — del av morgon-vyn |
| Density-toggle | **BEHÅLL** — wires till booking-card-storlek senare (P2) |
| Mic-btn (voice booking) | **BEHÅLL** — P2-feature, fungerar oavsett |
| Calm-toggle | **BEHÅLL** — påverkar opacity på calendar-surface |
| Avatar-toggle | **BEHÅLL** — affekterar booking-card-rendering (P2) |
| Timemachine-slider | **BEHÅLL** — wires till date-shift |
| Status-bar (week-pill + status-pills för day) | **BEHÅLL** — uppdateras live från `/calendar/day`-counters |
| 4 segment-tabs (morgon/vecka/dag/resurs) | **BEHÅLL** — utöka med wire för dag/vecka, resurs-vy = Sprint 4 |

---

## Implementation-plan (om matrix godkänd)

### Fas 1: Aktivera + wire dagvy (1 timme)

1. Ta bort `hidden` på `.calendar-shell` (L3328)
2. Ändra boot från `setMode('vecka')` → `setMode('dag')` (L4081)
3. Skapa `public/cco-kalender-shell.js` (NY) — innehåller `loadDayIntoShell()`, `loadWeekIntoShell()`, `openCreateInShell()`, etc.
4. Inkludera i `/major-arcana-preview customers-view` head: `<script src="/cco-kalender-shell.js" defer>`
5. Hook in setMode() → om mode==='dag' så kallar `loadDayIntoShell()` med mount-target `.calendar-content[data-mode="dag"]`

### Fas 2: Drawer + actions (1 timme)

6. Drawer renderas i /major-arcana-preview customers-view `.right-col` (befintlig 360px-kolumn i `.app-grid`) när booking klickas
7. Mobile: bottom-sheet wirein samma JS, CSS från `cco-kalender.css` flyttas till `cco-kalender-shell.css`

### Fas 3: Create-modal (30 min)

8. Modal mountar på `document.body` (samma som idag), trigger via NY knapp i `.calendar-toolbar-actions`

### Fas 4: Veckovy + konflikter (1 timme)

9. setMode('vecka') → `loadWeekIntoShell()` med 7-kol-grid
10. Conflict-check wire identisk

### Fas 5: Deprecate kalender.html (15 min)

11. Verifiera alla 14 funktioner överlever
12. Lägg in `<meta http-equiv="refresh" content="0; url=/major-arcana-preview/?view=customers&view=calendar">` i `kalender.html`
13. Eller: ta bort filen helt och redirecta i server.js
14. Behåll `cco-kalender.js` + `cco-kalender.css` (modulärt, mountar var som helst)

### Total tid

~3.5 timmar implementation. INGEN ny backend (alla Sprint 1-2-endpoints återanvänds).

---

## Säkerhetsregler som hålls

| Regel | Hur |
|---|---|
| Inga Drive-länkar | Alla asset-länkar via `/api/v1/cco/assets/:id/download` |
| Ingen extern AI | Konflikt-check är ren regelevaluering |
| Derived statusar | Status-pills aggregeras backend, UI visar bara |
| RBAC | Alla endpoints fortsätter ha `bookings.read/write` |
| Audit | `booking.created`, `booking.checked_in`, `booking.no_show`, `booking.followup_requested` |
| Mobile-first | Bottom-sheet på <720px för både drawer + create-modal |

---

## Testkrav per Fas

### Fas 1 (dagvy)
- [ ] `.calendar-shell` synlig på `/major-arcana-preview/?view=customers&view=calendar`
- [ ] `setMode('dag')` renderar booking-cards
- [ ] `/api/v1/calendar/day` returnerar 7 resources, 0 slots (anon data)
- [ ] Mode-switch dag↔vecka fungerar

### Fas 2 (drawer + actions)
- [ ] Klick på booking öppnar drawer med 6 actions
- [ ] Status-pills för 6 dokumenttyper visas
- [ ] Ready-banner: grön / röd med blockerlista
- [ ] POST /checkin returnerar 200, audit loggad
- [ ] Mobile viewport (<720px): drawer renderas som bottom-sheet

### Fas 3 (create-modal)
- [ ] "+ Ny"-knapp i toolbar öppnar modal
- [ ] 5 quick-picks renderade, click toggle aktiv
- [ ] Konflikt-check returnerar live vid input
- [ ] Submit utan blocker → 200, drawer reload
- [ ] Submit med blocker → confirm-dialog → force=true skickas

### Fas 4 (vecka)
- [ ] setMode('vecka') renderar 7-kol-grid
- [ ] Today-highlight på rätt dag
- [ ] Klick på booking öppnar samma drawer

### Fas 5 (deprecate kalender.html)
- [ ] Alla 14 funktioner verifierade i /major-arcana-preview customers-view
- [ ] kalender.html redirectar till /major-arcana-preview/?view=customers&view=calendar
- [ ] Inga gamla referenser kvar (top-nav uppdaterad)

---

## Risk-analys

| Risk | Sannolikhet | Mitigation |
|---|---|---|
| Brytning av existing /major-arcana-preview customers-view (291 KB fil) | MEDEL | Extra-kod i ny `cco-kalender-shell.js`, minimala in-file edits |
| Konflikt mellan existing JS-handlers (mic/calm/avatar) och nya | LÅG | Använda andra event-targets, scoped variabler |
| CSS-konflikt mellan `cco-kalender.css` och existing `/major-arcana-preview customers-view`-CSS | MEDEL | Prefix-rename `.cal-*` → `.cco-cal-*` om kollision |
| Veckovy 7-kol bryter mobile layout | LÅG | `@media (max-width: 720px) { display: none }` finns redan |
| Funktion tappas vid deprecate | LÅG | Test-checklist per Fas + smoke-test efter varje |

---

## Owner-beslut krävs innan implementation

1. **Godkänner matrix?** Alla 14 funktioner flyttas, inga tas bort.
2. **Deprecate-strategi?**
   - (a) Redirect `kalender.html → /major-arcana-preview/?view=customers&view=calendar` (mjuk)
   - (b) Ta bort `kalender.html` helt + uppdatera top-nav (hård)
   - Rekommendation: **(b) — Hård**, eftersom planen är "inga dubbla UI:n"
3. **Default-vy i /major-arcana-preview customers-view?**
   - Idag: `setMode('vecka')` på boot
   - Sprint 1-beslut: dagvy som default
   - Rekommendation: **`setMode('dag')`** för kalender-kontext, behåll Morgon som tillgänglig tab
4. **`cco-kalender.css` namnkollision?**
   - Risk: `.cal-*` kan kollidera med /major-arcana-preview customers-view-classes
   - Rekommendation: prefix-rename till `.cco-cal-*` om jag hittar kollisioner under implementation

---

## Sammanfattning

| Status | Värde |
|---|--:|
| Existing i /major-arcana-preview customers-view | 13 komponenter (calendar-shell + toolbar + status-bar + morgon-story + 4 segment-tabs + density + mic + calm + avatar + timemachine) |
| Nya från Sprint 1-2 | 14 funktioner att flytta |
| Backend återanvänds | 100% (5 endpoints + audit + RBAC bevarade) |
| Ny kod | ~600 rader JS-shell + 200 rader CSS-tillägg |
| In-place edits i /major-arcana-preview customers-view | ~5 rader (remove hidden + setMode + script-tag + 2 mount-points) |
| Total implementation-tid | ~3.5 timmar |
| Risk | LÅG — modulärt, alla 14 funktioner testbara |

**Inget byggs förrän owner godkänt matrix.**

---

*Refs:*
- */major-arcana-preview customers-view L112-630 (calendar CSS), L3327-3645 (calendar HTML), L4081 (boot)*
- *public/cco-kalender.{js,css} (Sprint 1-2 moduler)*
- *server.js L4650-4800 (calendar endpoints)*
- *docs/strategy/CALENDAR-COMPONENT-PLAN-2026-05-30.md (Sprint plan)*
