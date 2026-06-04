# Kalender — Component Plan (audit + design + 14-punkts spec)

*Genererad: 2026-05-30 · Status: design-/funktionsaudit · INGEN implementation*

> Owner-mandat: Bygg inte fristående kalender. Kalendern ska kännas som CCO.
> Koppla bokning → patientkort → journalstatus → formulärstatus → readiness → kundintelligens.
> Börja med audit + komponentplan.

---

## 1. Design-DNA — vad finns och ska återanvändas

### CSS-tokens (källa: `/major-arcana-preview customers-view` lines 7–67)

```
--cco-bg-page:           #faf6f2
--cco-color-brand:       #2b251f
--cco-text-secondary:    rgba(70, 60, 50, 0.62)
--cco-text-tertiary:     #8a8174

--cco-status-success:    #4a8268    (success-bg: rgba(74,130,104,.14))
--cco-status-warning:    #c8821e    (warning-bg: rgba(200,130,30,.14))
--cco-status-danger:     #b94a4a    (danger-bg: rgba(185,74,74,.14))
--cco-status-info:       #4a7ba8    (info-bg: rgba(74,123,168,.14))

--calendar-accent:       #c8821e   (samma som warning — ankarfärg för kalender)
--calendar-accent-soft:  rgba(200,130,30,.14)
--calendar-accent-glow:  rgba(200,130,30,.22)
--calendar-hour-h:       62px      (hour-row-height)
--calendar-hour-start:   7         (07:00)
--calendar-hour-end:     19        (19:00)

--rose-pill-top/bottom:  pink-gradient (för aktiva tabs)
--accent-studio:         #bb4779

--rail-fazli:    #7c3aed   (per-resurs rail-färger)
--rail-egzona:   #a37433
--rail-contact:  #2596a8
--rail-info:     #84756b

--gold:          #d4a847   (predictive)
--conflict-red:  #d8526b   (kollision)
```

### Komponenter (redan byggda)

| Komponent | Klass | Var |
|---|---|---|
| Calendar-shell | `.calendar-shell` + `.calendar-surface` (28px radius, blur 14px) | /major-arcana-preview customers-view L112-114 |
| Toolbar | `.calendar-toolbar` med kicker + h2 + actions | /major-arcana-preview customers-view L3331 |
| Segment-tabs | `.segment-group` (morgon/vecka/dag/resurs) | /major-arcana-preview customers-view L3361-3365 |
| Density-toggle | `.density-toggle` (vanlig/stressig/maraton) | /major-arcana-preview customers-view L3346 |
| Status-bar | `.calendar-status-bar` + `.week-pill` + `.status-pill--*` | /major-arcana-preview customers-view L3373 |
| Morgon-story | `.morgon-story` med 4 `.story-card` (Idag/Risker/Möjligheter/Klart) | /major-arcana-preview customers-view L3384 |
| Greet | `.greet` med animerad sol-disk | /major-arcana-preview customers-view L151 |
| Day-spark | `.day-spark` (mini-bar-chart över dagen) | /major-arcana-preview customers-view L3395 |
| Story-card | `.story-card` med kicker + headline + sub + list (18px radius) | /major-arcana-preview customers-view L177 |
| Nav-btn | `.nav-btn` + `.nav-btn--today` (kalender-accent) | /major-arcana-preview customers-view L143 |
| Mic + calm + avatar-toggles | speciella toolbar-knappar | /major-arcana-preview customers-view L3349-3353 |
| Timemachine | `.timemachine` med slider | /major-arcana-preview customers-view L3354 |

### Status-pill-DNA (återanvänd för bokning-status)

```html
<span class="status-pill status-pill--success">
  <span class="dot"></span>Bekräftad
</span>
```

Toner: `--success` / `--warning` / `--danger` / `--info` / `--conflict` / `--neutral` — finns redan.

### Kundintelligens-moduler (för högerkolumn på desktop)

| Fil | Storlek | Roll |
|---|--:|---|
| `cco-next-backbone.js` | 156 KB | Centrala data-modeller + view-models |
| `cco-next-customer-intelligence.js` | 11 KB | Per-kund AI-insights + risk-score + nästa steg |
| `cco-next-follow-up-engine.js` | 15 KB | Recall/uppföljning-logik |
| `cco-next-collaboration.js` | 7.7 KB | Presence + locks |

### Patientkort + journal-feed (för sidopanel)

| Resurs | Var |
|---|---|
| Journal-feed-modul | `cco-journal-feed.js` + `.css` (8 tabbar, alla statusar) |
| `/api/v1/cco-customers/:id/journal-feed` | unified sektioner |
| `/api/v1/cco-customers/:id/journal-timeline` | 7+ event-typer + thread-grupp |
| `/api/v1/cco-forms/patient/:id/missing` | ready-for-treatment blocker |

---

## 2. Backend — vad finns och vad saknas

### Stores

| Store | Storlek | Roll |
|---|--:|---|
| `ccoBookingStore.js` | 39 KB | Booking-cases (transitions, candidates, handoff) |
| `ccoBookingEngineStore.js` | **62 KB** | Slots, resources, services, availability — den tunga slot-motorn |
| `ccoTreatmentEncounterStore.js` | 7 KB | Booking → encounter-koppling |
| `recurringBookings.js` | (helper) | Serie-mallar |
| `icalExport.js` | (helper) | ICS per resurs |

### Endpoints (existing)

```
GET    /api/v1/cco-booking-cases                    (bookings.read)
GET    /api/v1/cco-booking-cases/:id                (bookings.read)
POST   /api/v1/cco-booking-cases                    (bookings.write)
POST   /api/v1/cco-booking-cases/:id/candidates     (bookings.write)
POST   /api/v1/cco-booking-cases/:id/transition     (bookings.case_decide)
POST   /api/v1/cco-booking-cases/:id/handoff        (bookings.handoff)

GET    /api/v1/calendar/day?date=YYYY-MM-DD         (no RBAC ⚠)
GET    /api/v1/calendar/week?startDate=YYYY-MM-DD   (no RBAC ⚠)
GET    /api/v1/calendar/ical/:resourceId.ics        (no RBAC ⚠)
GET    /api/v1/booking/series/templates
POST   /api/v1/booking/series
```

### Vad SAKNAS för komplett kalendervy

| Endpoint | Behov |
|---|---|
| `GET /api/v1/calendar/day` är **stubbad** (returnerar tomt view) | Wire mot `ccoBookingEngineStore` + `ccoTreatmentEncounterStore` |
| Per-bokning journal/formulär/readiness-status | **NY** `GET /api/v1/calendar/booking/:id/status-pills` |
| RBAC på calendar-routes | **lägg till** `attachRole + requirePermission('bookings.read')` |
| Snabbactions (ankommen, no-show, återbesök) | **NY** `POST /api/v1/cco-bookings/:id/{checkin,no-show,follow-up}` |
| Resurs-vy data | Wire mot `ccoBookingEngineStore.listResources()` |

---

## 3. Komponentplan per owner-krav (14 punkter)

### 1️⃣ Dagvy

| Aspect | Spec |
|---|---|
| Layout | Time-axel vertikal (07:00 → 19:00), 62px per timme. Multipla resurs-kolumner sida vid sida. |
| Komponent | `.calendar-day-grid` (ny) — grid: 60px tid-kolumn + N resurs-kolumner |
| Återanvänd | Calendar-surface · status-pill · color-rail-tokens (per resurs) |
| Bokning-block | `.booking-card` med patient-namn + service-label + status-pill-stack (journal/formulär/readiness) |
| Data | `/api/v1/calendar/day?date=&tenantId=&resourceId?=` |
| State | active-mode på `.calendar-content[data-mode="dag"]` |

### 2️⃣ Veckovy

| Aspect | Spec |
|---|---|
| Layout | 7 dag-kolumner mån-sön, time-axel vertikal |
| Komponent | `.calendar-week-grid` (ny) — grid: 60px tid-kolumn + 7 dagar |
| Återanvänd | Toolbar (week-pill med vecknummer + nav `‹ Idag ›`) |
| Densitet | density-toggle (vanlig=full label, stressig=initialer, maraton=färgblock) |
| Data | `/api/v1/calendar/week?startDate=&tenantId=` |

### 3️⃣ Behandlare/resurs-vy

| Aspect | Spec |
|---|---|
| Layout | Resurser i kolumner, time-axel vertikal — kraschar med dag-vy men över ALLA resurser samtidigt |
| Komponent | `.calendar-resource-grid` (ny) — grid: 60px tid + N resurs-kolumner med kolumn-header (initialer + namn) |
| Återanvänd | rail-fazli / rail-egzona / rail-contact / rail-info färger för per-resurs accent-line |
| Data | `/api/v1/calendar/day` med `groupBy=resource` |

### 4️⃣ Intern bokning (skapa)

| Aspect | Spec |
|---|---|
| Trigger | Klick på tom slot i kalendern, eller "+ Ny bokning"-knapp |
| Komponent | `.booking-create-modal` (ny) — patient-search + service-picker + tid-picker + resurs-picker |
| Återanvänd | Modal-DNA från `cco-journal-feed.css` (modal-backdrop, modal-body) + nav-btn |
| Data | `POST /api/v1/cco-booking-cases` (existing) |
| Validering | `/api/v1/cco-booking-engine/availability?resourceId=&serviceId=&startsAt=` (om finns) |

### 5️⃣ Koppling bokning → encounter

| Aspect | Spec |
|---|---|
| Existing | `ccoTreatmentEncounterStore` har encounter-records kopplade till bookingId |
| Visning | Booking-card visar `treatmentEncounterId` om finns; annars "Skapa encounter"-action |
| Wire | När staff markerar "ankommen" → auto-skapa encounter om saknas |

### 6️⃣ Kundkort i sidopanel

| Aspect | Spec |
|---|---|
| Layout | Klick på booking → right-side drawer eller iPad split (320px bredd) |
| Komponent | `.booking-detail-drawer` (ny) — header med patient-namn + ålder + tags · innehåll: 3 sektioner |
| Sektioner | (a) Bokning-info · (b) Patient-snapshot · (c) Journal-feed-preview (mini cco-journal-feed-mount) |
| Återanvänd | Story-card-DNA + Cco-journal-feed-modul |
| Data | `/api/v1/cco-customers/:id` + `/journal-feed?limit=5` |

### 7️⃣ Journalstatus på bokningen

| Aspect | Spec |
|---|---|
| Pill-design | `<span class="status-pill status-pill--success"><span class="dot"></span>Journal signerad</span>` |
| Pill-tonering | `success` = signerad · `warning` = draft finns · `danger` = saknas · `info` = väntar review |
| Data | NY endpoint `GET /api/v1/calendar/booking/:id/status-pills` — aggregerar från `ccoJournalStore` |

### 8️⃣ Hälsodeklaration / friskförsäkran-status

| Aspect | Spec |
|---|---|
| Pill | "Hälsodekl ✓" (success) · "Hälsodekl saknas" (danger) · "Friskförsäkran ✓ / saknas" |
| Data | Wire mot `/api/v1/cco-forms/patient/:id/missing?treatment=fue&encounterId=:eid` (befintlig!) |
| Logik | Per booking: hämta treatment + patientId + encounterId → resolva missing-array |

### 9️⃣ Samtycke / avtal-status

| Aspect | Spec |
|---|---|
| Pill | "Samtycke ✓ / saknas" · "Avtal signerat ✓ / sent / saknas" |
| Data | Wire mot `ccoAgreementQuickStore.listForCustomer(customerId)` + `ccoConsentStore` (om finns) |
| Logik | Per booking: patient → senaste relevanta agreement-state + consent-state |

### 🔟 Ready-for-treatment-status

| Aspect | Spec |
|---|---|
| Master-pill | Stor pill på booking-card: `🟢 Ready` · `🟡 Almost` · `🔴 Blocked` |
| Data | Wire mot `/api/v1/cco-forms/patient/:id/missing?treatment=` — om `readyForTreatment: true` → grön; om `blockingMissing > 0` → röd |
| UI | Hover/click → drawer med rad-för-rad checklist (healthDeclaration ✓ · fitnessCertificate ✓ · treatmentAgreement ✓ · idVerification ✗) |

### 1️⃣1️⃣ Snabbactions

Knappar i booking-detail-drawer (toolbar längst upp):

| Action | Endpoint | Audit-event |
|---|---|---|
| Öppna patientkort | navigera `/major-arcana-preview/?view=customers&id=` | n/a |
| Starta journal | `POST /api/v1/cco-journal-quick/entry` med tenantId+patientId+treatmentEncounterId | journal.entry.create |
| Skicka formulär | NY `POST /api/v1/cco-forms/invite` med formType+patientId+encounterId+method=email|sms | form.invited |
| Markera ankommen | NY `POST /api/v1/cco-bookings/:id/checkin` | booking.checked_in |
| Markera no-show | NY `POST /api/v1/cco-bookings/:id/no-show` med reason | booking.no_show |
| Boka återbesök | öppna mini-modal med follow-up-template + auto-slot-suggest | booking.followup_created |

### 1️⃣2️⃣ Mobilvy (<720px)

| Aspect | Spec |
|---|---|
| Default-vy | **Dag/listvy** (vertikal lista av bokningar för aktuell dag) |
| Veckovy | Dolda — för smal viewport. Visa istället dag-swiper (← idag · 28 maj → 29 maj →) |
| Booking-tap | Öppna **bottom-sheet** (slide-up från botten) med booking-detail — INGEN desktop-popup |
| Komponent | `.booking-bottom-sheet` (ny) — använd `.modal-backdrop` men positionera nedifrån, drag-handle på toppen |
| Snabbactions | Stack vertikalt i bottom-sheet (full-bredd knappar) |

### 1️⃣3️⃣ iPad (720–1180px)

| Aspect | Spec |
|---|---|
| Layout | **Split view** — kalender 60% vänster + booking-detail-drawer 40% höger (fast, ej overlay) |
| Komponent | `.calendar-page--ipad` med CSS-grid `1fr 380px` |
| Tabs | Toolbar-segment-tabs sticker — densitet/vecka/dag/resurs synliga |

### 1️⃣4️⃣ Desktop (>1180px)

| Aspect | Spec |
|---|---|
| Layout | **3-kolumn** — sidomeny 200px + kalender 1fr + högerkolumn 360px (kundintelligens) |
| Återanvänd | Samma som `/major-arcana-preview customers-view` `.app-grid` |
| Högerkolumn-innehåll | (a) Dagens AI-insikt · (b) Risker-card · (c) Patient-snapshot om bokning vald · (d) Recall-engine-suggestions |

---

## 4. Data-modell-tabell

### Booking-objekt — fält som behövs på kortet

| Fält | Källa | Visas på |
|---|---|---|
| `id` (bookingId) | ccoBookingStore | drawer-header |
| `customerId` | ccoBookingStore | sidopanel-data |
| `startsAt` / `endsAt` | ccoBookingEngineStore | tids-positionering |
| `resourceId` | ccoBookingEngineStore | kolumn / rail-färg |
| `serviceId` + `serviceLabel` | ccoBookingEngineStore | card-rubrik |
| `treatmentEncounterId` | ccoTreatmentEncounterStore | "Encounter ✓" |
| `bookingStatus` | ccoBookingStore | status-pill |
| `journalStatus` *(NY agg)* | derived | "Journal X" pill |
| `readinessStatus` *(NY agg)* | derived | master-pill |

### Aggregations-endpoint (NY)

```
GET /api/v1/calendar/booking/:id/status-pills?treatment=

→ Returns:
{
  bookingId, customerId, encounterId, treatment,
  pills: {
    journal: { status: 'signed'|'draft'|'missing', entryId, ts },
    healthDeclaration: { status: 'signed'|'missing', entryId },
    fitnessCertificate: { status: 'signed'|'missing', entryId },
    consent: { status: 'signed'|'missing' },
    agreement: { status: 'signed'|'sent'|'missing' },
    idVerification: { status: 'verified'|'missing' },
    readyForTreatment: true|false,
    blockingMissing: [docKey, docKey, ...]
  }
}
```

---

## 5. Komponentplan-sammanfattning

| # | Komponent | Type | Återanvänder | Nytt |
|--:|---|---|---|---|
| 1 | Day-grid | nytt | calendar-surface | grid-layout + booking-cards |
| 2 | Week-grid | nytt | calendar-surface, week-pill | 7-col grid |
| 3 | Resource-grid | nytt | rail-färger | kolumn-headers per resurs |
| 4 | Booking-create-modal | nytt | modal-backdrop | patient-search, service-picker |
| 5 | Booking-detail-drawer | nytt | story-card, journal-feed-mini | data-fetch + actions |
| 6 | Status-pill-stack | återanvänd | `.status-pill--*` | aggregator-call |
| 7 | Snabbactions-toolbar | nytt | nav-btn-DNA | 6 actions |
| 8 | Booking-bottom-sheet (mobil) | nytt | modal-backdrop | drag-handle, slide-up |
| 9 | iPad split | nytt | app-grid 60/40 | responsive break |
| 10 | Desktop 3-col | återanvänd | /major-arcana-preview customers-view app-grid | wire kundintelligens |

---

## 6. Backend-arbete som krävs

| Steg | Vad | Storlek |
|---|---|--:|
| B1 | Wire `/api/v1/calendar/day` mot riktiga stores (idag stub) | 1 dag |
| B2 | Wire `/api/v1/calendar/week` mot riktiga stores | 0.5 dag |
| B3 | NY `GET /api/v1/calendar/booking/:id/status-pills` (aggregator) | 1 dag |
| B4 | NY `POST /api/v1/cco-bookings/:id/{checkin,no-show,follow-up}` | 1 dag |
| B5 | RBAC på `/api/v1/calendar/*` (`bookings.read`) | 0.25 dag |
| B6 | NY `POST /api/v1/cco-forms/invite` (skicka formulär per booking) | 1 dag |
| | **Totalt backend** | **~5 dagar** |

---

## 7. Frontend-arbete som krävs

| Steg | Vad | Storlek |
|---|---|--:|
| F1 | Day-grid + booking-card + status-pill-stack | 2 dagar |
| F2 | Week-grid + densitet-toggle wire | 1 dag |
| F3 | Resource-grid med per-resurs-rail | 1 dag |
| F4 | Booking-detail-drawer + journal-feed-mini wire | 2 dagar |
| F5 | Booking-create-modal | 1.5 dag |
| F6 | Snabbactions med audit-feedback | 1 dag |
| F7 | Mobile bottom-sheet | 1 dag |
| F8 | iPad split breakpoint + desktop 3-col | 1 dag |
| F9 | Mic / calm / avatar / timemachine — verifiera befintliga | 0.5 dag |
| | **Totalt frontend** | **~11 dagar** |

---

## 8. Säkerhetsregler (orubbliga)

- **Ingen Drive-länk** i bokning, detail-drawer eller status-pills — om asset-status visas så går download via `/api/v1/cco/assets/:id/download`
- **Ingen extern AI på journalinnehåll** — kundintelligens-modulen får bara visa derived metrics (no-show-risk, recall-fönster) inte journal-prosa
- **Journal/formulär/readiness visas som STATUS-pills**, INTE som rå journaltext
- **RBAC per action:** ankommen/no-show kräver `bookings.write`; starta journal kräver `journal.write`; skicka formulär kräver `forms.send`
- **Audit-kedja** för varje action (booking.checked_in, booking.no_show, form.invited m.fl.)

---

## 9. Implementations-ordning (rekommenderad)

1. **B3 + B5** — aggregator + RBAC (möjliggör status-pills på frontend)
2. **F1 + F4** — day-grid + booking-detail-drawer (största visuella värdet)
3. **B1 + B2** — wire dag/vecka mot riktiga data
4. **F2 + F3** — week + resource-vyer
5. **B4 + F6** — snabbactions
6. **B6 + F5** — skicka formulär, bokning-create
7. **F7 + F8** — mobile + iPad

**Förslag: bryt ut i sprintar om 3–4 dagar vardera.** Inget bygge förrän plan godkänd.

---

## 10. Frågor till owner innan implementation

1. **Default-vy:** ska "Morgon-standup" fortsätta vara default när användaren kommer in? Eller direkt till dag-vy?
2. **Snabbactions ordning:** föredragen ordning i toolbar? (Förslag: Ankommen → Starta journal → Skicka formulär → No-show → Återbesök → Öppna patientkort)
3. **Resurs-färger:** ska vi auto-generera per ny behandlare eller manuellt tilldela från en palett?
4. **Booking-create:** behövs voice-input (`micBtn` finns) eller bara form-baserad?
5. **Kundintelligens-rail:** vad är de 4 viktigaste insikterna att visa i högerkolumn? (no-show-risk, recall-fönster, missing-docs, lifetime-value?)

---

*Inget byggs förrän owner godkänt planen. Refs: /major-arcana-preview customers-view L7-300 (CCO design-tokens), cco-journal-feed.{js,css} (modulär patientkort-vy), ccoBookingEngineStore.js (slot-motor).*
