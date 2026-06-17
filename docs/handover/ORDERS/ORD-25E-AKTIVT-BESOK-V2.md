# ORD-25E — Aktivt besök / Nytt besök (Fas E v2)

**Skapad:** 2026-06-17  
**Prio:** P1  
**Status:** **Fas 0 CLOSED** · **Fas 1 adapter CLOSED (lokal diff)** · **Cursor UI PARTIAL GO** · **full locked mockup NO-GO**  
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
  → Fas 1 Codex: activeVisit-adapter ✓ (lokal diff, ej prod)
  → Cursor: delvis Aktivt besök-segment (PARTIAL GO)
  → Codex: prod deploy + stickprov med patient som har besök idag
  → Senare: encounter-states → full locked mockup
```

---

## Fas 1 adapter — facit (2026-06-17, Codex)

**CLOSED (lokal diff)** — smal `activeVisit`-adapter i `src/routes/ccoPatientMaster.js`.

### Implementation

| Del                         | Plats                       |
| --------------------------- | --------------------------- |
| `buildActiveVisitPayload()` | `ccoPatientMaster.js` ~L129 |
| Byggs i patient payload     | ~L655                       |
| Exponeras i dossier-bundle  | ~L859                       |

### Beteende (ärligt)

- `visible`: `card.todayVisit === true` **eller** bokning med `startsAt` idag i upcoming/history
- `state`: alltid `scheduled_today` när visible (ingen fejkad `in_progress`)
- `checkedInAt`: alltid `null` tills riktig check-in-sanning finns
- `blockers`: från card (`missingHealthDeclaration`, `missingAgreement`, etc.)
- `journalStarted`: journal-entry med dagens datum

### Exempelpayload (mål)

```js
activeVisit: {
  visible: true,
  state: 'scheduled_today',
  bookingId: '...',
  encounterId: '...',
  startsAt: '2026-06-17T14:30:00.000Z',
  serviceLabel: 'Konsultation',
  practitionerLabel: 'Erik Holm',
  checkedInAt: null,
  journalStarted: false,
  photoCaptureAvailable: true,
  notesAvailable: true,
  blockers: [
    { code: 'health_declaration', label: 'Hälsodeklaration saknas' },
    { code: 'agreement', label: 'Avtal och samtycke saknas' },
  ],
}
```

### GO / NO-GO efter Fas 1

| Spår                         | Beslut                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Cursor delvis mockup**     | **GO** — `visible`, `state`, `bookingId`, `startsAt`, `serviceLabel`, `blockers`, actions (disabled där data saknas) |
| **Cursor full locked Fas E** | **NO-GO** — saknar `checked_in / in_progress / completed_today`, timeline, check-in CTA                              |

### Lokal verify

Efter omstart av lokal server (`./start-cco-local.sh` — `server.js`-ändring kräver restart):

```bash
# 1. Token (prod eller lokal med auth)
TOKEN=$(node scripts/get-prod-auth-token.js --skip-if-open-access)
AUTH=()
[ -n "$TOKEN" ] && AUTH=(-H "Authorization: Bearer $TOKEN")

# 2. Proba dossier-bundle (byt PATIENT_ID)
curl -sS "http://localhost:3100/api/v1/cco-patient-master/patient/dossier-bundle?patientId=PATIENT_ID&includeJournal=1" \
  "${AUTH[@]}" | node -pe 'JSON.stringify(JSON.parse(fs.readFileSync(0,"utf8")).activeVisit,null,2)'
```

Förväntat: `activeVisit.visible` + `state: "scheduled_today"` för patient med dagens bokning; `visible: false` annars.

**Obs:** `activeVisit: null` på localhost = gammal process — starta om servern.

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

| Steg                         | Ägare      | Leverabel                                               |
| ---------------------------- | ---------- | ------------------------------------------------------- |
| **0** Datamodell-audit       | **Codex**  | **CLOSED**                                              |
| **1** `activeVisit`-adapter  | **Codex**  | **CLOSED** (lokal diff)                                 |
| **2** UI-segment delvis      | **Cursor** | **PARTIAL GO** — `scheduled_today` + blockers + actions |
| **2b** UI full locked mockup | **Cursor** | **NO-GO** tills encounter-states                        |
| **3** CSS (v11-tokens)       | **Cursor** | samma skal som locked mockup                            |
| **4** Verify                 | **Cursor** | utöka `verify-v11-paritet.js`                           |
| **5** Prod UAT               | **Codex**  | patient **med** besök idag · 380px · journal-CTA        |

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

## Cursor brief (copy-paste, PARTIAL GO)

```text
ORD-25E Fas 2 — Aktivt besök segment, delvis (Cursor) PARTIAL GO

Backend: activeVisit i dossier-bundle (Fas 1, lokal diff).
Använd: visible, state=scheduled_today, bookingId, startsAt, serviceLabel,
        practitionerLabel, blockers, journalStarted, photoCaptureAvailable, notesAvailable.

Bygg:
- Konditionellt segment under hero, före dokument (self-hide när visible=false)
- State A: Väntar / nytt besök idag (scheduled_today)
- Pre-flight från blockers[]
- Actions: Starta journal · Ta bild · Anteckning (wire befintliga hooks)
- INTE: amber puls timeline, checked_in/in_progress/completed_today, check-in CTA

Design: AKTIVT-BESOK-LOCKED-2026-06-17.md — samma v11 tokens, förenklad layout OK.
Filer: cco-v9-customers-parity.js, cco-v9-customers.css
Data: runtime.detail.dossierBundle.activeVisit
Verify: utöka verify-v11-paritet.js
```

---

## Acceptance

### Codex (Fas 0–1)

- [x] Audit: fält som finns / saknas dokumenterad
- [x] Minsta payload i dossier-bundle — **Fas 1 adapter**
- [ ] Exempelpayload prod stickprov (patient med besök idag) — **efter deploy**
- [x] GO/NO-GO — **PARTIAL GO Cursor · NO-GO full mockup**

### Cursor (PARTIAL GO)

- [ ] Segment synligt vid `activeVisit.visible=true`
- [ ] State `scheduled_today` (neutral, ingen fejk-puls)
- [ ] Pre-flight från `blockers[]`
- [ ] Actions wired (eller disabled + varför)
- [ ] Self-hide när `visible=false`
- [ ] **Ej scope:** full timeline / check-in / avsluta-besök states
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

**Team:**

```text
ORD-25E Fas 1: activeVisit-adapter klar (lokal). PARTIAL GO för Cursor UI.
Bygg scheduled_today-segment — inte full locked mockup ännu.
Nästa: commit/deploy Fas 1 → Cursor Fas 2 delvis segment.
```

**Cursor (PARTIAL GO):**

```text
ORD-25E Fas 2: delvis Aktivt besök-segment. activeVisit från dossier-bundle.
scheduled_today + blockers + actions. Self-hide. Ingen fejk in_progress.
Spec: ORD-25E-AKTIVT-BESOK-V2.md
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

_Skapad 2026-06-17 · Fas 0 audit closed · Fas 1 adapter closed · Cursor PARTIAL GO_
