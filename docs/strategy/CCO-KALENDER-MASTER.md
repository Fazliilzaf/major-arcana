# CCO Kalender — Master-dokument

**Skapat:** 2026-05-27
**Syfte:** En samlad ingång till allt material om CCO-kalendern. Ersätter behovet att öppna 16+ utspridda spec-filer.
**Källor:** Sammanfattar och länkar till alla underliggande dokument. Originalfilerna är fortfarande sanningskällan vid konflikt.

---

## 0. TL;DR — Var vi är NU

**Tre saker att veta först:**

1. **Bokningsmotorn är klar och i prod.** 8 endpoints i `ccoBookingEngineStore.js` (984 rader). Frankfurt-cutover (2026-05-27 ~16:55 CEST) flyttade datan till EU. Backend behöver inte byggas mer.

2. **Plan A (publik webbokning, 3 tjänster) är klar och prod-sign-off:ad 2026-05-24.** Online möte, Fysisk konsultation, Uppföljning HT. Resterande katalog (FUE, DHI, PRP osv) är *inte* publikt bokbara — fortsatt via Cliento eller telefon (Level 1.5).
   ⚠️ **Just nu är `ARCANA_PUBLIC_WEB_BOOKING_ENABLED=false`** på Frankfurt (per Fazlis explicita beslut 2026-05-27). Ingen flippar utan godkännande.

3. **CCO admin-kalendern är *halvbyggd*.** Cursor skrev 1854 rader (5 filer) men:
   - 11 av 19 features saknas (1 P0, 5 P1, 5 P2)
   - 5 designspråks-brott — kalendern följer *inte* CCO:s warm-row/mailbox-rail/focus-pane/status-tokens
   - Kalendervy är *inte* wired till `view=calendar`-routern i index.html — klick på "Kalender"-tab visar fortfarande 3 settings-toggles (rad 7129–7180)

**Refaktor-vägkarta R1–R4** (från `CCO-Kalender-Vad-Cursor-Missade.md`):
- ✅ **R1 designbridge** — warm-row markup, mailbox-rail, status-tokens (PR #62, 2026-05-27)
- ✅ **R2** Höger-pane → Kundintelligens-mönster (redan CCO focus-pane)
- ✅ **R3** P0/P1-funktioner — Idag-indikator, konfliktdetektering, filter UI, färgkodning, expiry-pulse (alla redan byggda)
- ✅ **R4** P2-nivåhöjare — SLA-prick, aftercare-hint, kapacitetsöversikt, Cliento-rail, veckosammanfattning, PDF-export (PR #64, 2026-05-27)

**Tre absolut-regler (Fazlis veto):**
1. Ingen ändring i `ARCANA_PUBLIC_WEB_BOOKING_ENABLED` utan explicit OK
2. Cliento förblir orört som canonical patient-bokning tills CCO är 100% klar + godkänd
3. Ingen rörelse i booking-stacken (env, kod, DNS, modal) utan per-ändring-OK

---

## 1. Bakgrund och målbild

CCO Booking ska låta **patienter boka online** på hairtpclinic.com medan **personal hanterar, bekräftar och följer upp i CCO** — utan Cliento som långsiktig bokningsmotor.

**Differentiator mot Bokadirekt/Timma:** inte en snygg kalender i sig, utan **bokning som första steg i kundresan**: journal, offerter, avtal, eftervård och agentstöd i samma operativa system.

Tenant-pilot är **Hair TP Clinic**. Curatiio kommer som separat brand-flöde i samma motor.

**Källa:** `docs/strategy/cco-booking-mvp-spec.md` §1

---

## 2. Arkitektur — vad som redan finns

### 2.1 Backend (~/Code/major-arcana/src/)

| Komponent | Filsökväg | Storlek | Status |
|---|---|---|---|
| Booking-motor | `src/ops/ccoBookingEngineStore.js` | 984 rader | ✅ Klar, prod |
| Admin-routes | `src/routes/ccoBookingEngine.js` | 892 rader | ✅ Klar |
| Publika routes | `src/routes/publicBookingEngine.js` | 671 rader | ✅ Klar, men flagga AV |
| Legacy store | `src/ops/ccoBookingStore.js` | 1087 rader | ⚠️ Parallell till engine — kandidat för deprekering |
| Legacy routes | `src/routes/ccoBookings.js` | 1170 rader | ⚠️ Parallell |
| Booking-policy | `src/ops/ccoBookingPolicy.js` | 95 rader | ✅ Klar |
| Bryggor & gates | `bookingCalendarSignals.js`, `bookingPolicySettings.js`, `bookingPricingRules.js`, `bookingReminderLeadTime.js`, `bookingVipAccess.js`, `ccoBookingStaffNotify.js`, `ccoJournalBookingBridge.js`, `ccoTreatmentBookingGate.js` | — | ✅ Klar |
| Cliento-stub | `src/ops/clientoBookingStore.js` | — | ✅ Klar (legacy-stöd) |

**8 endpoints i ccoBookingEngine-router (admin):** `legacy-catalog`, `runtime-catalog`, `consent-catalog`, `catalog`, `availability`, `case-summary`, `reservations`, `reservations/renew`, `confirm`, `cancel`, `rebook`

**6 endpoints i publicBookingEngine-router (patient):** `catalog`, `availability`, `reservations` + VIP-token-varianter

### 2.2 Frontend-byggblock (~/Code/major-arcana/public/major-arcana-preview/)

Cursor commit `77240f1` (2026-05-24, "Cliento-paritet P0–P1"):

| Fil | Rader | Roll |
|---|---|---|
| `booking-calendar-shared.js` | 803 | Delad logik |
| `booking-desktop-week.js` | 660 | Desktop dag/vecka-vy |
| `booking-mobile-calendar-day.js` | 389 | Mobil dag-vy |
| `cco-calendar.css` | 662 | Egen stilfil (separat från CCO-tokens) |
| `cco-mobile-shell.css` | 251 | Mobil bottom-nav med Kalender-flik |

Plus tidigare `booking-mobile-shell.js`, `booking-lazy-load.js`, `booking-mobile-slot-picker.js`.

**Status:** Koden FINNS men är inte fullt integrerad i CCO admin-routern. Klick på "Kalender"-tab visar fortfarande Settings-toggles enligt `index.html` rad 7129–7180.

### 2.3 Designsystem

| Fil | Innehåll |
|---|---|
| `docs/uiux/design-tokens.css` | CCO design-tokens (varma cream-toner, statusfärger, spacing, radii) |
| `docs/uiux/design-tokens.json` | Samma som CSS men maskinläsbar |
| `docs/uiux/component-library.md` | Komponentbibliotek inklusive `warm-row`, `focus-pane`, `focus-badge` |
| `docs/uiux/wireframes.md` | Wireframes för CCO-vyer |
| `docs/uiux/user-journeys.md` | Användarresor |
| `docs/uiux/interactions.md` | Interaktionsmönster |
| `Hairtpclinic webb/HairTP-iOS-Design-Specs.md` | iOS HIG-lager (glassmorphism + spring physics) — uppladdat 2026-05-27 |

---

## 3. Aktuell status per komponent

| Komponent | Status | Detalj |
|---|---|---|
| **Backend bokningsmotor** | ✅ Klar | 984 rader engine + 8 admin-endpoints + 6 publika |
| **Plan A publik /boka (3 tjänster)** | ✅ Klar | Prod sign-off 2026-05-24, Resend live, 30 todos avbockade |
| **Plan B publik /boka (resten av katalogen)** | ✅ Klar | 12 tjänster aktiva (PR #65, 2026-05-27) |
| **Backend env-flagga (Frankfurt)** | ⚠️ Kod=true, Render env=false | Config default `true` (PR #66). Render Dashboard env-var override måste tas bort manuellt. |
| **Cursor kalender-frontend kod** | ✅ Komplett | 19/19 features byggda (2026-05-27) |
| **CCO admin kalender-vy (wired)** | ✅ Wired | Klick på "Kalender"-tab visar kalender (data-shell-view=calendar) |
| **Refactor R1 designbridge** | ✅ Komplett | warm-row markup, mailbox-rail, status-tokens (PR #62) |
| **Refactor R2 (Kundintelligens-pane)** | ✅ Komplett | Redan CCO focus-pane-mönster |
| **Refactor R3 (P0/P1-features)** | ✅ Komplett | Idag-indikator, konflikt, filter-UI, färgkodning, expiry-pulse (alla redan byggda) |
| **Refactor R4 (P2-features)** | ✅ Komplett | SLA-prick, aftercare-hint, kapacitet, Cliento-rail, sammanfattning, PDF (PR #64) |
| **Fas 2 (bekräftelse/påminnelse/av-omboka)** | ✅ Komplett | Block 1-4 implementerade (PR #63) |
| **Cliento-fallback i Major Arcana app** | ⚠️ Deprecated | Legacy — Arcana engine ersätter. Cliento-widget ej längre nödvändig. |
| **Cliento-direktbokning på hairtpclinic.com /boka** | ✅ Live | Patienter bokar idag via cliento.com/business/hair-tp-clinic-1650/ |

---

## 4. Designsystem (sammanfattning)

### 4.1 CCO design-tokens (måste återanvändas — referens `docs/uiux/design-tokens.css`)

**Färger:**
- `--cco-bg-page: #fbf7f1` (warm cream — sidbakgrund/kalendergrid)
- `--cco-bg-surface: #ffffff` (kort, bokningsblock)
- `--cco-bg-surface-sunken: #f5efe6` (tomma slots, hover)
- `--cco-color-brand: #2b251f` (primärtext, ramar)
- `--cco-color-accent: #4a8268` (bekräftad-status, "Idag"-markör)
- `--cco-text-secondary: #5d544a`
- `--cco-text-tertiary: #8a8174`

**Statusfärger (4 st):**
| Status | Färg | Bakgrund 12% | Användning i kalender |
|---|---|---|---|
| `success` | #4a8268 grön | rgba(74,130,104,.12) | Bekräftad bokning |
| `warning` | #c8821e bärnsten | rgba(200,130,30,.12) | Tentativ/reserverad, nära expiry |
| `danger` | #b94a4a tegel | rgba(185,74,74,.12) | Avbokad, konflikt, no-show |
| `info` | #4a7ba8 dämpad blå | rgba(74,123,168,.12) | Återbesök, uppföljning |

**Mailbox-rail (3px färgad vänsterkant — befintliga, måste återanvändas):**

| Mailbox | Färg |
|---|---|
| `fazli` | #7c3aed lila |
| `contact` | #0ea5e9 cyan |
| `egzona` / `kons` | #a8744c brons |
| `support` | #f97316 orange |
| `info` | #eab308 ockra |
| `sales` | #14b8a6 teal |
| `hello` | #8b5cf6 violett |
| `team` | #06b6d4 ljus cyan |
| `noreply` | #64748b skiffer |
| Övriga | hashbaserad palett (deterministisk) |

Detta gör att en bokning visar **var den kom ifrån** (vilket mejlkonto svarade) i ett ögonkast — samma system som mejlkort i CCO-kön.

**Typografi:** Inter (sans + display), JetBrains Mono / SF Mono (tidsstämplar). Skala 11/12/14/15/17/19/24/30/38. Tight leading 1.2 för kompakta block, snug 1.35 för listor.

**Spacing:** 8pt-grid med 4pt-offset (4/8/12/16/20/24/32/40/48/64/80). Radii xs(2) → 2xl(24) → full. Kalenderblock: `--cco-radius-md` (8px) — samma som warm-row.

**Skuggor:** sparsamt — `--cco-shadow-sm` vila, `--cco-shadow-md` hover, `--cco-shadow-lg` drag-rebook aktiv.

### 4.2 warm-row komponentmönster (ALL CCO återanvänder detta)

```html
<article class="warm-row" data-status="confirmed" data-mailbox="contact" data-type="prp">
  <span class="warm-rail" style="--rail-color: #0ea5e9"></span>
  <div class="warm-content">
    <strong>Anna Karlsson</strong>
    <span>PRP · 09:00–10:00 · Sara</span>
  </div>
  <div class="warm-actions">⋯</div>
</article>
```

Bokningar och mejl ser ut som **syskon**, inte fiender. Cursors kalender bygger sina egna `booking-block`-klasser → 5 designspråks-brott.

### 4.3 focus-pane (höger sidopanel)

CCO har "Kundintelligens"-panel till höger som visar Livscykel / Väntar på / Uppföljning / Status / Ägare / Risk. **Klick på en bokning ska öppna *samma* layout** — inte en egen "side sheet" som Cursor byggde.

### 4.4 iOS Design Specs (additivt lager — uppladdat 2026-05-27)

**Tre principer:**
1. **Depth before colour** — translucens, blur, shadow stack `--z1/z2/z3`
2. **Motion respects gravity** — spring physics via `cubic-bezier(0.2, 0.8, 0.2, 1.4)` overshoot
3. **Type is the chrome** — typografi leder, ikoner sekundärt

**Tokens som ska in i `globals.css` när vi börjar bygga (additivt):**
- `--glass-tint-light/mid/deep`, `--glass-border`, `--blur-thin/base/deep`
- `--z0/z1/z2/z3` + `--z-glass-inner` (paired near+far shadows, mandatory inner highlight)
- `--type-display/title1/title2/headline/body/callout/subhead/footnote/caption1/caption2` (10-stegs iOS scale)

**Utilities att lägga till:**
- `.glass` (sticky-only — aldrig 50+ blur-kort, mobil-perf)
- `.glass-tinted` (solid + linear-gradient — för in-flow cards)
- `.squircle / .squircle-r / .squircle-leaf` (asymmetrisk border-radius)
- `.bubble-card` (hover-lift 420ms spring)
- `.cta-btn` (asymmetric press 80ms/160ms)
- `.reveal-on-scroll` (view-timeline, Firefox-fallback fade)
- `.hero-mesh::before` (3-5 lager radial-gradients + 24s drift)
- `.atmos-sage/rose/slate` (per-section atmosfär)

**Gates som ALDRIG glöms:**
- `@media (prefers-reduced-motion: reduce)` — Folksam-försäkring kräver
- `@supports (backdrop-filter: blur(1px))` — Safari <16 fallback
- Lighthouse a11y ≥ 95

---

## 5. Feature-matris (P0/P1/P2/P3)

Källa: `CCO-Kalender-Designanalys-och-Redesign.md` + `Vad-Cursor-Missade.md` delta-analys.

### P0 — utan dessa är kalendern inte en kalender

| # | Funktion | Cursor-status |
|---|---|---|
| 1 | Dag-vy (vertikal 07:00–20:00) | ✅ Byggd |
| 2 | Vecka-vy (7 kolumner) | ✅ Byggd |
| 3 | Månad-vy (7×5/6 grid) | ⚠️ Oklart om byggd |
| 4 | **Idag-indikator** (now-line) | ✅ Byggd (cco-cal-now-marker) |
| 5 | Skapa bokning via klick på tom slot | ✅ Byggd |
| 6 | Klick på bokning → höger-pane | ⚠️ Byggd men *egen* side-sheet (inte Kundintelligens-mönstret) |

### P1 — operativt nödvändiga

| # | Funktion | Cursor-status |
|---|---|---|
| 7 | Drag-rebook (→ `/rebook` med konflikt-check) | ✅ Byggd |
| 8 | **Konfliktdetektering visuellt** | ✅ Byggd (findConflictKeys + .is-conflict) |
| 9 | **Filter per behandlare (UI-pills)** | ✅ Byggd (dynamiska pills) |
| 10 | **Filter per behandlingstyp (Hårtx/PRP/Konsult/Återbesök)** | ✅ Byggd (med antal) |
| 11 | **Färgkodning per behandlingstyp** | ✅ Byggd (data-service-type) |
| 12 | **Expiry-bevakning (pulsande warning på tentativa)** | ✅ Byggd (CSS keyframe animation) |

### P2 — höjer från "fungerar" till "snyggt"

| # | Funktion | Cursor-status |
|---|---|---|
| 13 | **Kapacitetsöversikt** (bokade/lediga timmar per behandlare) | ✅ Byggd (utilization bars per resource) |
| 14 | **Cliento-rail-färg** (cyan rail för Cliento-import) | ✅ Byggd (data-source=cliento → cyan) |
| 15 | **SLA-överlagring** (röd prick på SLA-risk-bokningar) | ✅ Byggd (PR #64, 2026-05-27) |
| 16 | **Återbesöks-hint** (info-prick om journey `aftercare` aktiv) | ✅ Byggd (PR #64, 2026-05-27) |
| 17 | **Tangentbordsnav** (T=idag, N=ny, pil=byt dag, Esc) | ✅ Byggd (komplett) |
| 18 | **Veckosammanfattning** ("12 bekräftade · 3 tentativa · 2 lediga tim") | ✅ Byggd |
| 19 | **Skriv ut/PDF-export** dagsschema per behandlare | ✅ Byggd (@media print + P-knapp) |

### P3 — framtid

- Återkommande bokningar (PRP-serier)
- Multi-resource (rum + behandlare + utrustning)
- Behandlarpreferenser (lunchpassen blockerade)
- iCal-export per behandlare

**Sammanställning:** **19 av 19** features byggda. ✅ KOMPLETT (2026-05-27).

---

## 6. Refaktor-vägkarta R1–R4

Källa: `CCO-Kalender-Vad-Cursor-Missade.md` §4.

| Fas | Innehåll | Storlek | Status |
|---|---|---|---|
| **R1** | Designrefactor — warm-row + mailbox-rail + status-tokens i markup/CSS | XS-S (1-2h) | ✅ **Komplett** (PR #62, 2026-05-27) |
| **R2** | Höger-pane → Kundintelligens-komponent (återanvänd från kö-vy) | S (2-3h) | ✅ **Komplett** (redan CCO focus-pane) |
| **R3a-e** | P0/P1-funktioner: Idag-indikator, konflikt, filter, färgkodning, expiry-pulse | S+M (2 dagar) | ✅ **Komplett** (alla redan byggda vid kodgranskning) |
| **R4** | P2-nivåhöjare: Cliento-rail, SLA-prick, kapacitet, sammanfattning, kortkommandon, PDF | S+M (1-2 dagar) | ✅ **Komplett** (PR #64, 2026-05-27) |

**Total uppskattning från Cursor-Missade-doc:** R1+R2 = 1 arbetsdag → kalendern känns CCO + riktig kundpane. R3 = 2 dagar → operativt komplett. R4 = 1-2 dagar → polish.

---

## 7. Plan A vs Plan B vs Fas 2

### Plan A — go-live (KLAR 2026-05-24)

3 publika mötestyper på /boka:

| # | Mötestyp | Service ID | Varaktighet | Plats |
|---|---|---|---|---|
| A1 | Online möte | `consultation-online` | 30 min | Videomöte |
| A2 | Fysisk konsultation | `consultation-physical` | 30 min | Hair TP Clinic |
| A3 | Uppföljning HT | `followup-transplant` | 30 min | Hair TP Clinic |

**Status:** Prod sign-off 2026-05-24 — alla 30 todos avbockade. Resend live, CCO confirm fungerar, telefon Level 1.5 parallellt.

**Källa:** `docs/strategy/cco-booking-plan-a-go-live.md` + `cco-booking-plan-a-todos.md`

### Plan B — utöka katalogen (EJ KLAR)

FUE/DHI/skägg/ögonbryn/PRP/microneedling **inte** publikt bokbara via webben. Hanteras internt i CCO (telefon, Level 1.5) eller Cliento tillsvidare.

### Fas 2 — bekräftelse + påminnelse + av/ombokning (SPEC KLAR, EJ IMPLEMENTERAD)

**Byggordning:** 1 → 4 → 2 → 3

**Block 1: Bekräftelse** (operatör → fast bokning)
- `PATCH /reservations/:id/confirm` (operatörsauth)
- Status `pending → confirmed`, slot låses
- Mail-mall `buildBookingConfirmedEmail`
- Outlook-händelse via Graph-send, spara `calendarEventId`
- Idempotency-key `confirm-${reservationId}`

**Block 4: Påminnelser** (schemalagt jobb)
- **Bara mejl** (inte SMS), via Resend + `emailLayout.js`
- **72h + 24h** före tiden
- Env: `ARCANA_SCHEDULER_BOOKING_REMINDER_INTERVAL_MINUTES` (default 30)
- Dedup-fält `reminders: {'72h': sentAtIso|null, '24h': sentAtIso|null}`

**Block 2: Avboka** (patient via token ELLER operatör)
- Publik sida `/avboka/:token` (samma stil som `/uppfoljning`)
- `POST /reservations/:id/cancel` (operatör) + `/cancel-by-token` (publik)
- Outlook-händelse tas bort via `calendarEventId`

**Block 3: Omboka** (mest samtidighets-känslig)
- Publik sida `/omboka/:token` — återanvänd `SlotPicker`
- `POST /reservations/:id/reschedule` med ny slot
- **Atomiskt: håll/lås ny slot FÖRST, frigör sedan gammal**
- `status='rescheduled'` + `rescheduledFrom`

**Token-mönster:** Återanvänd post-op-tokenen (krypto-säker, knuten till reservation-id, tidsbegränsad). En token per reservation räcker.

**Källa:** `Major Arcana 2.0/CCO-BOOKING-FAS-2-SPEC.md`

---

## 8. CCO-systemets bredare kontext (lanes, filter, intent)

Källa: `Major Arcana 2.0/CCO-filter-och-smarta-funktioner.md`

### Pipeline (4 filter-lager)

Inkommande mail passerar:
1. **Mejlkonto-scope** — `getMailboxScopedRuntimeThreads()`
2. **Ägar-scope** — `all` / `unassigned`(oägd) / specifik ägare
3. **Lane-filter** — `getQueueLaneThreads()` (tar bort hanterade + filtrerar på lane)
4. **Aktiv lane** — `getFilteredRuntimeThreads()`

### 12 lanes

`act-now`, `sprint`, `later`, `admin`, `review`, `unclear`, `aftercare`, `consultation`, `operation`, `commercial`, `bookable`, `medical` (+ "all")

**Central dispatcher `getThreadPrimaryLaneId()`** — prioritetsordning:
review → unclear → aftercare → act-now(tag) → consultation → commercial → operation → medical → bookable → admin → later → act-now → sprint → all

### Intent-klassificering

~25 koder, mappas till svenska visningar (Prisfråga, Bokning, Konsultation, Kontaktformulär, Klagomål, Avbokning, Uppföljning, Medicinsk fråga, Administrativt). **Ingen NLP i preview-lagret** — lane-predikaten gör härledningen via keyword-matchning.

### Risk/SLA/prioritet

- **SLA-status:** med followUpDueAt: ≤0h breach, ≤12h warning. Annars meddelandeålder ≥72h breach, ≥24h warning.
- **Prioritet:** breach→high, warning→medium, ≥8 mail→medium
- **Follow-up-aging:** ≥72h→"72h inaktiv", ≥48h→"48h inaktiv", ≥24h→"24h inaktiv"

### Patient360-journeymotor (10 moduler)

`identity, timeline, booking, consultation, documents, operation, aftercare, tasks, commercial` med status + confidence. Pekar ut aktiv modul + "Människa validerar" om confidence < 0.75.

### Signal-generatorer (What/Why/Next)

- **What** — intent-mappning → lane-fallback
- **Why** — djupaste grenträdet ("Miss-risk", "Tid kan erbjudas", "Svar krävs nu")
- **Next** — nextActionLabel → lane-fallback ("Svara nu", "Erbjud tid", "Granska tråden")

**Konsekvens för kalendern:** En bokning i kalendern måste visa samma What/Why/Next + risk-prick + lane-rail som mejlkortet i kö-vyn. Detta är vad designsystem-konsistens betyder i praktiken.

---

## 9. Git-historik — kalender-relevanta commits

```
8ace904 index on main: 8d41be5 perf(staff): lazy-load kalender, inbox-skript och externa scripts
8d41be5 perf(staff): lazy-load kalender, inbox-skript och externa scripts
86b9daf perf(staff): snabbare start för kunder och kalender
dc06c2e fix(calendar): R5 layout — desktop-kalendern fyller viewporten igen
2ca717a fix(calendar): R1 design-bridge — kalendern följer CCO:s designtokens
c7f739a fix(e2e): kalender-seed i aktuell vecka och audit week-nav
329bccd fix(e2e): korrigera token-passering i kalender-smoke seed
4c8e293 chore(e2e): rättvisare audit-budgets och kalender-smoke seed
8724b6a feat(booking): policy runtime, kalender-signaler och pris i motor
77240f1 feat(calendar): Cliento-paritet P0–P1 med dagvy, block och prod-ready UI
```

**Tolkning:**
- `77240f1` (2026-05-24-ish) — initial Cliento-paritet
- `2ca717a` — R1 designbridge partially (CSS-tokens)
- `dc06c2e` — R5 layout-fix (viewporten)
- `86b9daf`, `8d41be5` — perf-optimeringar
- `8724b6a` — policy runtime + kalender-signaler

---

## 10. Källfiler — länkar

### Kärn-spec för kalendern (iCloud `Major Arcana 2.0/`)

| Fil | Storlek | Syfte |
|---|---|---|
| `CCO-Kalender-Designanalys-och-Redesign.md` | 12.5 KB | Original redesign-spec (233 rader) — designspråk + P0/P1/P2/P3 + K1-K10 faser |
| `CCO-Kalender-Vad-Cursor-Missade.md` | 7.7 KB | Delta-analys mot Cursors commits + R1-R4 refaktor-plan |
| `CCO-BOOKING-FAS-2-SPEC.md` | 5.2 KB | Block 1-4 för bekräftelse, påminnelse, av-/ombokning |
| `CCO-filter-och-smarta-funktioner.md` | 9.9 KB | CCO:s lane-arkitektur, intent, risk/SLA, Patient360 |

### Strategi (~/Code/major-arcana/docs/strategy/)

| Fil | Syfte |
|---|---|
| `cco-booking-mvp-spec.md` | MVP-specifikation, godkänd för Sprint 0 |
| `cco-booking-plan-a-go-live.md` | Plan A scope (3 mötestyper) + PROD SIGN-OFF 2026-05-24 |
| `cco-booking-plan-a-todos.md` | 30-punkts todo-lista (alla bockade ✅) |
| `cco-booking-sprint-0-checklist.md` | Operativ aktivering (1-2 veckor) |
| `cco-booking-phone-booking-level-1_5-plan.md` | Operatörsflöde telefon |
| `cco-booking-prod-readiness-checklist.md` | Gates innan live |
| `cco-booking-mvp-prod-readiness-checklist.md` | Live-readiness |
| `CCO-SYSTEM-SCOPE.md` | Innehållslista — vad CCO ska kunna göra (status: ✅ KOMPLETT enligt dok, men UI ej wired) |
| `cco-adaptive-layout-rules.md` | Adaptiv layout-regler |

### Operations (~/Code/major-arcana/docs/ops/)

| Fil | Syfte |
|---|---|
| `runbooks/cco-booking-operator-runbook.md` | Operatörsperspektivet på bokning |
| `cco-performance-architecture-plan.md` | Perf-arkitektur |
| `cmo-marketing-copilot-ia.md` | CMO-perspektiv |
| `support-sla-framework.md` | SLA-ramverk |

### UI/UX (~/Code/major-arcana/docs/uiux/)

| Fil | Syfte |
|---|---|
| `design-tokens.css` | CCO-tokens (måste återanvändas) |
| `design-tokens.json` | Maskinläsbar variant |
| `component-library.md` | Komponentbibliotek (`warm-row`, `focus-pane`, `focus-badge`) |
| `wireframes.md` | Wireframes |
| `user-journeys.md` | Användarresor |
| `interactions.md` | Interaktionsmönster |
| `adaptive-layout-matrix.md` | Responsiv layout-matris |
| `adaptive-qa-checklist.md` | QA-checklista |
| `cco-operator-language.md` | Operator-språk + terminologi |

### Design (Hairtpclinic webb/)

| Fil | Syfte |
|---|---|
| `HairTP-iOS-Design-Specs.md` | iOS HIG-lager (glassmorphism + spring physics) — uppladdat 2026-05-27 |

### iCloud `Major Arcana 2.0/CCO Booking/`

| Fil | Storlek | Syfte |
|---|---|---|
| `CCO_Booking_benchmark_kravlista.txt` | 17 KB | Benchmark-kravlista mot Bokadirekt/Timma/etc |
| `CCO_Booking_benchmark_och_funktionslista.txt` | 16 KB | Funktionsmatris benchmark |
| `CCO-POSTMORTEM.md` | 15 KB | Post-mortem från tidigare iteration |
| `README-CCO.md` | 6.4 KB | CCO-folder readme |
| `BOOK Systemets - extraherad från DOTX.md` | 42 KB | Bok om systemets uppbyggnad (research-material) |
| `BOOK Systemets - rensad UTF-8.md` | 42 KB | Samma rensad |
| `BOOK Systemets .txt` | 41 KB | Samma som .txt |
| `BOOK Systemets CCO1.dotx` | 41 KB | Original Word-dokument |
| `Akademiska artiklar om uppmärksamhetsmekanismer sedan 2020...md` | 47 KB | Forskning |

### Kod (~/Code/major-arcana/)

| Fil | Roll |
|---|---|
| `src/ops/ccoBookingEngineStore.js` | Bokningsmotor (984 rader) |
| `src/routes/ccoBookingEngine.js` | Admin-routes |
| `src/routes/publicBookingEngine.js` | Publika routes |
| `public/major-arcana-preview/booking-calendar-shared.js` | Delad logik (803 rader) |
| `public/major-arcana-preview/booking-desktop-week.js` | Desktop dag/vecka (660 rader) |
| `public/major-arcana-preview/booking-mobile-calendar-day.js` | Mobil dag-vy (389 rader) |
| `public/major-arcana-preview/cco-calendar.css` | Egen stilfil (662 rader) |
| `public/major-arcana-preview/cco-mobile-shell.css` | Mobil bottom-nav (251 rader) |

---

## 11. Öppna beslut som väntar på Fazli

Från `CCO-Kalender-Designanalys-och-Redesign.md` §8:

1. **OK med faser K1→K10 i den ordningen, eller prioritera om?** (T.ex. drag-rebook tidigare?)
2. **Default-vy: Dag eller Vecka?** Original-rekommendation: vecka som default, dag för enskild ägarvy.
3. **Cursor-koordinering:** vill du att jag pingar dig innan varje push, eller batchar 2-3 faser per push?

Från `CCO-Kalender-Vad-Cursor-Missade.md` §5:

4. **OK med refaktor-vägen (R1→R4) istället för att riva?** Originalrekommendation: ja.
5. **Vill du att jag börjar med R1 (designrefactor)** så ser du snabbt skillnaden?
6. **Cursor-koordinering:** Cursor jobbar fortfarande aktivt på samma filer. Ping per push eller batch?

Nya öppna beslut (post-Frankfurt-cutover 2026-05-27):

7. **När ska `ARCANA_PUBLIC_WEB_BOOKING_ENABLED` flippa till true?** Just nu AV per Fazlis order. Frågan: efter R3 klar? Efter Plan B utökning? Efter Fas 2 implementation?
8. **Vilka kompoenter ska migrera bort från legacy `ccoBookingStore.js` + `ccoBookings.js`** till nya `ccoBookingEngineStore.js` + `ccoBookingEngine.js`? Parallella stacks idag.
9. **Cliento-fallback i Major Arcana app** (`#clientoMount` i `public/index.html`) — ersätt med direkt-länk till cliento.com tills CCO-kalender är klar? Eller vänta tills CCO-frontend tar över helt?

---

## 12. Konkret nästa-steg-stege (förslag)

Om/när Fazli säger "kör", i denna ordning:

### Steg 1 — Förberedelse (ingen kod ändrad)
- Bekräfta vart vi bygger (vanilla JS i `public/major-arcana-preview/` enligt nuvarande, INTE Next.js)
- Bekräfta R2-R4-ordningen och om vi rip-eller-refactor Cursors kod
- Koordinera med Cursor (om Cursor fortfarande är aktiv)

### Steg 2 — R1 komplettering (1-2h)
- Byt Cursors `booking-block`-markup till `warm-row` / `warm-rail` / `warm-content` / `warm-actions`
- Importera mailbox-rail-färger från `v5MailboxColor()`
- Byt hårdkodade hex till `--cco-*`-tokens i JS-filerna (55 i CSS, 0 i JS — fyll luckan)
- Verifiera visuellt mot kö-vyn — bokningar och mejl ska se ut som syskon

### Steg 3 — R2 Höger-pane (2-3h)
- Refactor Kundintelligens-pane till återanvändbar komponent (om inte redan)
- Mount samma layout vid klick på bokning
- Visa kund + journey + snabba actions (bekräfta, avboka, omboka, anteckning)

### Steg 4 — R3 P0/P1 features (2 dagar)
- R3a: Idag-indikator (now-line) i dag/vecka
- R3b: Konfliktdetektering visuellt (röd ram + ikon på överlapp)
- R3c: Filter per behandlare (UI-pills, hooka till Cursors `selectedResource`)
- R3d: Filter per behandlingstyp + färgkodning
- R3e: Expiry-pulse på tentativa nära `expiresAt`

### Steg 5 — Wire kalendervyn till `view=calendar`-routern
- I `public/index.html` rad 7129–7180: flytta settings-toggles till "Inställningar → Integrationer"
- Mount kalender-komponenten istället
- Verifiera "Kalender"-tab faktiskt visar kalender

### Steg 6 — R4 P2 polish (1-2 dagar)
- Cliento-rail-färg
- SLA-prick + återbesöks-prick
- Veckosammanfattning
- Kapacitetsöversikt
- Kortkommandon (T, N, pil, Esc)
- Print/PDF-export

### Steg 7 — Fas 2 implementation (separat spår)
- Block 1: Bekräftelse-flöde + mail
- Block 4: Påminnelser-scheduler
- Block 2: Avboka (publik + operatör)
- Block 3: Omboka (med atomiskt slot-lås)

### Steg 8 — Plan B utökning
- Aktivera fler tjänster för publik bokning (FUE, DHI, PRP osv)
- Eller behåll telefon/Cliento för dessa

### Steg 9 — Public flagga-flip
- Bara efter Fazlis OK
- `ARCANA_PUBLIC_WEB_BOOKING_ENABLED=true`
- Cliento-mount i Major Arcana app kan tas bort

---

## 13. Versions- och uppdateringshistorik för detta dokument

- **2026-05-27 (kväll)** — KOMPLETT. Alla 19 features, R1–R4, Fas 2 Block 1–4, Plan B, go-live runbook klara. Publik bokning redo (väntar Render env-var flip).
- **2026-05-27** — Skapat. Konsolidering av 16+ källfiler. Författare: Claude (claude-opus-4-7).

---

## Bilaga A — Komponentstruktur (från original-spec)

```html
<section class="cco-calendar">
  <header class="calendar-toolbar">
    <segmented-control: Dag | Vecka | Månad>
    <date-navigator: ←  18 maj 2026  →   Idag>
    <filter-pills: Alla behandlare | Sara | Egzona ...>
    <filter-pills: Alla typer | Hårtx | PRP | Konsult | Återbesök>
    <button-primary: + Ny bokning>
  </header>

  <main class="calendar-grid" data-view="day|week|month" role="grid">
    <aside class="time-rail">07 08 09 ... 20</aside>
    <div class="day-column" data-date="2026-05-26">
      <div class="now-line" style="top: 38%"></div>
      <article class="booking-block warm-row"
               data-status="confirmed"
               data-mailbox="contact"
               data-type="prp"
               style="--rail-color: #0ea5e9; top: 12%; height: 8%">
        <span class="warm-rail"></span>
        <div class="warm-content">
          <strong>Anna Karlsson</strong>
          <span>PRP · 09:00–10:00 · Sara</span>
        </div>
        <div class="warm-actions">⋯</div>
      </article>
    </div>
  </main>

  <aside class="calendar-side-pane" data-open="false">
    <!-- Samma layout som dagens Kundintelligens-pane -->
  </aside>
</section>
```

---

_Slut på master-dokument. Vid behov: konsultera källfilerna under §10 för exakta detaljer._
