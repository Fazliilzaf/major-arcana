# ORD-25E — Aktivt besök / Nytt besök (Fas E v2)

**Skapad:** 2026-06-17  
**Prio:** P1  
**Status:** **Fas 0 CLOSED** · **Fas 1 backend/adapter GO (Codex)** · **Cursor UI NO-GO** tills `activeVisit` finns  
**Förälder:** [`ORD-25-kundkort-v11-port.md`](ORD-25-kundkort-v11-port.md) (Fas A–D **CLOSED** prod `a18b54e7`)

---

## Fas 0 audit — facit (2026-06-17, Codex)

**GO:** Codex bygger **liten `activeVisit`-adapter** (Fas 1) — smalt, ärligt, i dossier-bundle/card readout.  
**NO-GO:** Cursor bygger **inte** full locked Fas E-UI mot dagens payload.

> Det som saknas är framför allt riktig “aktivt besök”-status, inte styling.

### Det som finns idag

| Källa                                             | Fält / signal                                                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/ccoPatientMaster.js` (dossier-bundle) | `bookings.upcoming`, `bookings.history`, `upcomingBookings`, `historyBookings`, `card`, `journalEntries`, `documents` — **inget `bookings.today[]`** |
| `src/ops/ccoKunderBookingEnrichment.js`           | `todayVisit`, `encounterId`, `missingEncounterForBooking`, `readyForVisit`, `readyForTreatment`                                                      |
| `src/routes/ccoStaff.js`                          | `POST /cco/staff/watch-checkin` — returnerar timestamp, **persisterar inte** besöksstate i payload                                                   |
| `src/ops/ccoPatientDocumentAggregator.js`         | Dokument-segment (offers, HD, journal, auto) — **live**                                                                                              |
| parity v11                                        | Hero, stat-row, briefing, dokument, insikter, sticky — **live**                                                                                      |

### Det som saknas för locked Fas E

| Gap                    | Detalj                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `bookings.today[]`     | Finns inte i dossier-bundle                                                                                                        |
| Encounter-states       | `ccoTreatmentEncounterStore.js`: bara `reserved \| confirmed \| cancelled` — saknar `checked_in`, `in_progress`, `completed_today` |
| Persistent check-in    | `watch-checkin` transient, matar inte tillbaka till kundkort-payload                                                               |
| `recentEvents`         | Finns **inte** i dossier-bundle-svar                                                                                               |
| Enhetlig `activeVisit` | Journal/bild/anteckning-actions finns i UI, men inte samlade bakom ett segment                                                     |

### Audit-tabell (live vs mockup)

| Sektion                                        | Status                                   |
| ---------------------------------------------- | ---------------------------------------- |
| Hero / stat-row / briefing                     | **live** i v11-path                      |
| Dokument-segment                               | **live** via dossier-bundle + aggregator |
| Insikter + sticky                              | **live** i parity/v11                    |
| Aktivt besök (Fas E)                           | **saknas som datamodell**                |
| Journey / bokningar / context ovanför dokument | **bortstädade** i A–D ✓                  |

### Prod stickprov (dossier-bundle, anonyma)

`GET /api/v1/cco-patient-master/patient/dossier-bundle` — 2 stickprov:

- Båda `200`
- `offers`, `healthForms/consents`, `journalStatus.expected`, `autoDocs` — **finns**
- `bookings`: bara `upcoming`, `history`, `coverage`, `sources` — **ingen `today`**
- `card.todayVisit`: bool, **`false`** i båda
- `recentEvents`: **saknas** i svar

### Minsta säkra payload (Fas 1 mål)

```js
activeVisit: {
  visible: boolean,
  bookingId: string | null,
  encounterId: string | null,
  state: 'scheduled_today' | 'checked_in' | 'in_progress' | 'completed_today' | null,
  startsAt: string | null,
  serviceLabel: string | null,
  practitionerLabel: string | null,
  roomLabel: string | null,
  checkedInAt: string | null,
  journalStarted: boolean,
  photoCaptureAvailable: boolean,
  notesAvailable: boolean,
  blockers: string[],
}
```

**Sanning bör bo i:** booking + encounter + dossier-bundle readout — inte parallell UI-state.

### Nästa steg (låst ordning)

```
Fas 0 audit ✓
  → Fas 1 Codex: activeVisit-adapter (smalt)
  → GO/NO-GO för Cursor UI (delvis eller full mockup)
  → Fas 2 Cursor: segment + states + wiring
  → Codex prod UAT med patient som har besök idag
```

---

## Bakgrund

ORD-25 Fas A–D är klar och live. v11-cutover är default när v9 är på.

Nästa steg är **inte** mer hero/dokument-polish, utan ett nytt **operativt segment** i kundkortet för när kunden faktiskt är här idag.

**Produktfråga (facit):**

> Vi måste ha ett tydligt segment för när kunden kommer för ett nytt besök med journalföringsmöjligheter.

Det är exakt detta ORD.

---

## Mål

Skapa ett tydligt, **konditionellt** segment i kundkortet:

**Aktivt besök / Nytt besök**

Personalens arbetsyta för dagens besök och journalföring — inte bara informationsvisning.

---

## Placering (live SPA)

```
Utan aktivt besök idag (nuvarande prod):
  [ Zon 1 Hero ] ─hairstrand─ [ Zon 2 Dokument ] ─hairstrand─ [ Zon 3 Insikter + sticky ]

Med aktivt besök idag (ORD-25E):
  [ Zon 1 Hero ] ─hairstrand─ [ Aktivt besök ] ─hairstrand─ [ Zon 2 Dokument ] ─hairstrand─ [ Zon 3 Insikter + sticky ]
```

- Under hero, före dokument
- **Self-hide** när inget relevant besök idag — tar ingen plats
- Samma v11 UX-familj (färger, skuggor, vellum, premium-lugn) — **ingen ny designfamilj**

**Designfacit:** `docs/handover/MOCKUPS/AKTIVT-BESOK-LOCKED-2026-06-17.md`

---

## Innehåll (minsta segment)

### 1. Statusrad

- Aktivt besök / Nytt besök
- dagens status, tid, ev. behandlings-/besökstyp

### 2. Besöksinfo

- dagens bokning, behandlingsnamn
- ev. behandlare / rum om data finns

### 3. Operativa actions

- Starta journal
- Ta bild
- Anteckning
- Avsluta besök

### 4. Pre-flight / kontroll

- blockerare relevanta för dagens besök (t.ex. saknad friskförsäkran)
- hjälpinformation — inte rörig dashboard

---

## UI-states (minst tre)

| State                           | Trigger (mål)                                | Känsla                             |
| ------------------------------- | -------------------------------------------- | ---------------------------------- |
| **A. Väntar / nytt besök idag** | dagens bokning finns, arbetsflöde ej startat | neutral, redo                      |
| **B. Pågående besök**           | checked_in / in_progress                     | tydlig aktiv amber-puls            |
| **C. Avslutat idag**            | completed_today                              | lugn slutstatus + ev. nästa action |
| **(dolt)**                      | inget relevant besök idag                    | zonen renderas inte                |

---

## Render-villkor

Visa blocket **endast** när tillräcklig dags-/besöksdata finns.

**Bygg inte fejkad logik i UI.** Om datamodellen inte räcker:

- markera exakt vilket fält som saknas
- bygg ytan så långt som är säkert
- lämna tydlig gap-lista för backend

---

## Fas 0 audit — kända gap (bekräftat Codex 2026-06-17)

Se **Fas 0 audit — facit** ovan. Sammanfattning:

| Behov                                          | Status                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `bookings.today[]`                             | **SAKNAS**                                                                                      |
| `checked_in \| in_progress \| completed_today` | **SAKNAS**                                                                                      |
| Persistent check-in → payload                  | **SAKNAS**                                                                                      |
| Delvis finns                                   | `todayVisit`, `encounterId`, `missingEncounterForBooking`, `readyForVisit`, `readyForTreatment` |

**Cursor UI:** NO-GO tills Fas 1 adapter levererar `activeVisit`.

---

## Cursor vs Codex

| Steg                               | Ägare      | Leverabel                                               |
| ---------------------------------- | ---------- | ------------------------------------------------------- |
| **0** Datamodell-audit             | **Codex**  | **CLOSED** — GO adapter / NO-GO full UI                 |
| **1** `activeVisit`-adapter        | **Codex**  | Litet diff i dossier-bundle, verify/stickprov           |
| **2** UI-segment + states + wiring | **Cursor** | **efter Fas 1 GO** — `renderV11ActiveVisit` i parity.js |
| **3** CSS (v11-tokens)             | **Cursor** | samma skal som locked mockup                            |
| **4** Verify                       | **Cursor** | utöka `verify-v11-paritet.js`                           |
| **5** Prod UAT                     | **Codex**  | patient **med** besök idag · 380px · journal-CTA        |

**Filer (Cursor, efter GO):**

- `public/major-arcana-preview/app/cco-v9-customers-parity.js` — render + mount mellan hero och dokument
- `public/major-arcana-preview/cco-v9-customers.css` — segment-stilar
- `patient-master-ui.js` — endast om routing/flag behövs (minimal)

**Ej scope:**

- stor ombyggnad av hela kundkortet
- ny designfamilj
- generell dokumentomläggning
- bred backend-refaktor utan tydligt behov

---

## Målpayload (Fas 1 — se audit ovan)

```js
activeVisit: {
  visible: boolean,
  bookingId: string | null,
  encounterId: string | null,
  state: 'scheduled_today' | 'checked_in' | 'in_progress' | 'completed_today' | null,
  startsAt: string | null,
  serviceLabel: string | null,
  practitionerLabel: string | null,
  roomLabel: string | null,
  checkedInAt: string | null,
  journalStarted: boolean,
  photoCaptureAvailable: boolean,
  notesAvailable: boolean,
  blockers: string[],
}
```

**Fas 1 Codex-filer (troliga):**

- `src/ops/ccoKunderBookingEnrichment.js` — normalisera dagens bokning
- `src/routes/ccoPatientMaster.js` — exponera `activeVisit` i dossier-bundle
- ev. `src/ops/ccoTreatmentEncounterStore.js` — endast om minimal state-utvidgning behövs

---

## Codex brief — Fas 1 adapter (copy-paste)

```text
ORD-25E Fas 1 — activeVisit adapter (Codex)

Fas 0 CLOSED: GO liten adapter · NO-GO full Cursor UI mot dagens payload.

Bygg minsta säkra activeVisit i dossier-bundle/card readout:
- visible + state (scheduled_today minimum; checked_in/in_progress/completed_today om möjligt)
- bookingId, encounterId, startsAt, serviceLabel
- checkedInAt om check-in kan kopplas
- blockers från befintliga readyForVisit/readyForTreatment-signaler
- journalStarted, photoCaptureAvailable, notesAvailable (bools, ärliga)

Undvik: fejkad encounter-state · parallell UI-only modell · stor refaktor.

Filer: ccoKunderBookingEnrichment.js · ccoPatientMaster.js · ev. encounter store (minimal)
Verify: stickprov mot dossier-bundle · patient med/utan todayVisit
Spec: docs/handover/ORDERS/ORD-25E-AKTIVT-BESOK-V2.md

Leverera: exempelpayload · GO/NO-GO för Cursor (hel eller delvis mockup)
```

---

## Cursor brief (copy-paste, efter Fas 1 GO)

```text
ORD-25E — Aktivt besök / Nytt besök (Cursor)

Bakgrund: ORD-25 A–D live. v11-cutover default. Codex GO på payload.

Mål: Konditionellt segment under hero, före dokument — operativ arbetsyta.

Måste stödja:
- dagens bokning/status
- states: scheduled_today / checked_in / in_progress / completed_today
- Starta journal · Ta bild · Anteckning · Avsluta besök
- pre-flight blockerare (hjälp, inte dashboard)

Design: AKTIVT-BESOK-LOCKED-2026-06-17.md — samma v11 tokens, ingen ny familj.
Self-hide när visible=false.

Scope: UI + wiring mot befintliga actions. Rapportera backend-gap separat, ingen fejk.

Filer: cco-v9-customers-parity.js, cco-v9-customers.css, patient-master-ui.js (minimal)
Verify: utöka verify-v11-paritet.js
```

---

## Acceptance

### Codex (Fas 0)

- [x] Audit: fält som finns / saknas dokumenterad
- [ ] Minsta payload exponerad i dossier-bundle eller card readout → **Fas 1**
- [ ] Exempelpayload för 1 patient med besök idag → **Fas 1**
- [x] GO/NO-GO för Cursor uttalat — **NO-GO full UI · GO Fas 1 adapter**

### Cursor (efter GO)

- [ ] Segment synligt endast vid relevant besök idag
- [ ] Tre states A/B/C enligt mockup
- [ ] Actions wired (eller tydlig disabled + varför)
- [ ] Self-hide verifierad (patient utan besök idag)
- [ ] 380px mobil
- [ ] verify-v11 utökad

### Prod UAT (Codex)

- [ ] Patient **med** besök idag → segment + pre-flight + journal-CTA
- [ ] Patient **utan** besök idag → ingen regression (tre zoner som idag)
- [ ] Rollback-check kvar: `__ARCANA_V11_KUNDKORT=false`

---

## Måttstock

Personalen ska intuitivt förstå:

> “Kunden är här nu — här jobbar jag med dagens besök.”

Det ska kännas som den naturliga operativa mitten i kundkortet.

---

## Slack-pingar

**Team (4 rader):**

```text
ORD-25E Fas 0: CLOSED. GO liten activeVisit-adapter (Codex Fas 1).
NO-GO: full locked Fas E-UI i Cursor ännu — saknar besöksstate, inte styling.
Nästa: Codex Fas 1 → sedan Cursor segment.
Mockup: AKTIVT-BESOK-LOCKED-2026-06-17
```

**Codex (Fas 1):**

```text
ORD-25E Fas 1: bygg activeVisit-adapter i dossier-bundle.
Minsta: visible + scheduled_today + blockers. Ärlig state, ingen fejk.
Spec: ORD-25E-AKTIVT-BESOK-V2.md · leverera exempelpayload + Cursor GO/NO-GO
```

**Cursor (kort, efter GO):**

```text
ORD-25E (Cursor): bygg Aktivt besök-segment i v11-skalet.
Placering: under hero, före dokument, self-hide.
Actions: journal · bild · anteckning · avsluta. Samma v11 UX. Ingen fejk-backend.
```

---

## Referens

- **Parent closeout:** `ORD-25-kundkort-v11-port.md`
- **Mockup locked:** `docs/handover/MOCKUPS/AKTIVT-BESOK-LOCKED-2026-06-17.md`
- **v11 baseline:** `docs/handover/MOCKUPS/KUNDKORT-V11-LOCKED-2026-06-05.md`
- **Backend-deps:** ORD-23a · ORD-41 · encounter/booking-spår
- **Prod baseline:** `a18b54e7`

---

_Skapad 2026-06-17 · Fas 0 audit closed · Fas 1 adapter GO (Codex)_
