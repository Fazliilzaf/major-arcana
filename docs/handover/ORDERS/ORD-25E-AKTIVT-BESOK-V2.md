# ORD-25E — Aktivt besök / Nytt besök (Fas E v2)

**Skapad:** 2026-06-17  
**Prio:** P1  
**Status:** **Fas 0–2 CLOSED** · **Fas 3a CLOSED (lokal, ej prod)** · **Fas 3b UI-nivå 2 GO (Cursor)** · prod UAT B/C väntar testdata  
**Förälder:** [`ORD-25-kundkort-v11-port.md`](ORD-25-kundkort-v11-port.md) (Fas A–D **CLOSED** prod `a18b54e7`)

---

## Fas 2 closeout — låst (2026-06-17)

**CLOSED — ingen mer Fas 2-utveckling.**

| Leverans                            | Prod                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| Fas 1 `activeVisit`-adapter         | `4214a1a2` → `d62e819e`                                |
| Fas 2 delvis UI (`scheduled_today`) | `d62e819e`                                             |
| UAT A (self-hide)                   | **PASS**                                               |
| UAT B/C                             | **datablock**, ej kod-FAIL                             |
| D/E                                 | manuell när tillfälle finns — **blockerar inte Fas 3** |

**Regel:** UI bygger **inte** vidare på Fas 2 förrän Fas 3 payload finns (UI-nivå 2 efter backend GO).

---

## Prod UAT closeout (2026-06-17, Codex)

**Prod commit:** `d62e819e` · **Render:** `/readyz` OK · `/api/public/status` operational  
**Verify:** `node scripts/verify-v11-paritet.js` — **53/54 PASS** (rosa-accent `#bb4779`, ej ORD-25E-blocker)

| Punkt                                        | Resultat         | Bedömning                                                                                                                               |
| -------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **A** Patient utan dagens besök              | **PASS**         | Ingen `[data-v11-active-visit]` · hero → dokument → insikter oförändrat                                                                 |
| **B** Patient med dagens besök (visuellt)    | **BLOCKERAD**    | Prod: **0 patienter** med `todayVisit=true` idag — inget skarpt stickprov utan att fejka                                                |
| **C** API-shape (dossier-bundle)             | **PARTIAL PASS** | No-visit: `visible=false`, `state=null`, `bookingId=null`, `blockers=[]` ✓ · `scheduled_today` ej bekräftad i prod (saknar testpatient) |
| **D** 380px mobil                            | **EJ KÖRD**      | Browser-automation kunde inte tvinga viewport — kör manuellt i lokal/vanlig prod-flik                                                   |
| **E** Rollback `__ARCANA_V11_KUNDKORT=false` | **EJ KÖRD**      | Prod-flik: `window` non-extensible i automation-session — kör manuellt i devtools                                                       |

**Slutsats:** Implementationen ser **inte trasig** ut. Blockerare är **testdata i prod**, inte kod-FAIL för Fas 2.

### Nästa verifiering (manuell, när data finns)

1. Patient med dagens bokning → bekräfta segment + blockers + journal/bild/anteckning
2. dossier-bundle → `activeVisit.visible=true`, `state: "scheduled_today"`
3. 380px + rollback i vanlig browser-session

### Beslut efter UAT

| Spår                         | Status                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------- |
| **Fas 2 delvis UI**          | **GO** — ship accepterad för no-visit + API-shape                               |
| **Fas 2 visuellt med besök** | **VÄNTAR** prod-patient med `todayVisit` / dagens bokning                       |
| **Fas 3 encounter-states**   | **OPEN** — `checked_in`, `in_progress`, `completed_today` + persistent check-in |

---

## Fas 3a closeout — encounter-states (2026-06-17, Codex)

**CLOSED (lokal diff, ej prod än)** · **GO för Cursor UI-nivå 2** på payload-nivå.

### Implementation

| Del                         | Fil                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `activeVisit` state mapping | `src/ops/ccoActiveVisit.js` _(ny)_                                                 |
| Encounter-status utvidgad   | `src/ops/ccoTreatmentEncounterStore.js` — `checked_in`, `in_progress`, `completed` |
| Journal → encounter         | `src/ops/ccoJournalBookingBridge.js`                                               |
| dossier-bundle payload      | `src/routes/ccoPatientMaster.js` — `treatmentEncounterStore.listByPatient`         |
| Persistent watch check-in   | `src/routes/ccoStaff.js`                                                           |
| DI wiring                   | `server.js`                                                                        |

### State mapping (facit)

| `activeVisit.state` | Källa                                                               |
| ------------------- | ------------------------------------------------------------------- |
| `scheduled_today`   | Dagens bokning, ingen encounter-progress                            |
| `checked_in`        | Encounter `checked_in` eller `metadata.checkedInAt` (watch-checkin) |
| `in_progress`       | Encounter `in_progress` / journal start idag                        |
| `completed_today`   | Encounter `completed` / journal signerad idag                       |

### Payload-fält (utökad)

`checkedInAt`, `startedAt`, `completedAt`, `journalStarted` — från encounter + journal, inte UI-gissning.

### Tester (lokal)

```bash
node --test tests/ops/ccoActiveVisit.test.js
node --test tests/ops/ccoJournalEncounterLink.test.js
node --test tests/routes/ccoStaffWatchCheckin.test.js
```

**6/6 PASS**

### GO / NO-GO

| Spår                          | Beslut                                             |
| ----------------------------- | -------------------------------------------------- |
| **Cursor Fas 3b (UI nivå 2)** | **GO** — bygg mot riktiga states i payload         |
| **Fas 3 visuellt prod-UAT**   | **VÄNTAR** patient med dagens bokning efter deploy |

---

## Fas 3 — encounter-states + persistent check-in (3a done · 3b OPEN)

**Ägare först:** **Codex** (audit + backend) → **Cursor** (UI-nivå 2 efter GO)

**Mål:** Gör Aktivt besök-segmentet **sant på riktigt** för patienter med dagens bokning. Ingen fejkad UI-state — allt från payload.

### Behöver

1. **`activeVisit.state`** stöd för:
   - `scheduled_today` _(finns)_
   - `checked_in`
   - `in_progress`
   - `completed_today`

2. **Persistent check-in** i backend/payload:
   - `checkedInAt` (idag alltid `null`)
   - ev. `encounterId`, `startedAt`, `completedAt` om säkert tillgängligt

3. **dossier-bundle** returnerar `activeVisit` med riktig state:
   - `visible`, `state`, `bookingId`, `checkedInAt`, `blockers`, `serviceLabel`, `practitionerLabel`

4. **Minsta säkra källa för state** — kartlägg och välj en sanning:
   - booking enrichment (`ccoKunderBookingEnrichment.js`)
   - encounter store (`ccoTreatmentEncounterStore.js` — idag bara reserved/confirmed/cancelled)
   - journal bridge
   - `POST /cco/staff/watch-checkin` (idag transient timestamp only)
   - **Ingen state får hittas på genom UI-antaganden**

### Codex leverabel (Fas 3a)

- payload-shape + state mapping (tabell: event → state)
- gap-lista
- minimal backend-implementation / adapter
- verify/stickprov med patient som har dagens bokning
- **GO/NO-GO för Cursor UI-nivå 2**

### Cursor leverabel (Fas 3b, efter GO)

- UI för `checked_in`, `in_progress`, `completed_today`
- check-in / fortsätt / avsluta-beteende enligt locked mockup
- amber timeline **endast** när payload säger `in_progress`
- **NO-GO** tills Codex GO

### Codex brief (copy-paste)

```text
ORD-25E Fas 3 — encounter-states + persistent check-in

Mål:
Gör Aktivt besök-segmentet sant på riktigt för patienter med dagens bokning.
Ingen fejkad UI-state. Allt ska komma från payload.

Behöver:
1. activeVisit.state: scheduled_today | checked_in | in_progress | completed_today
2. persistent check-in: checkedInAt, ev. encounterId, startedAt/completedAt
3. dossier-bundle activeVisit med riktig state + blockers + labels
4. definiera minsta säkra källa (booking / encounter / watch-checkin / journal)

Leverera: payload-shape · state mapping · gap-lista · GO/NO-GO UI-nivå 2
Spec: docs/handover/ORDERS/ORD-25E-AKTIVT-BESOK-V2.md (Fas 3)
Baseline prod: d62e819e (Fas 2 låst)
```

### Cursor brief (copy-paste, efter Fas 3 GO)

```text
ORD-25E Fas 3b — UI-nivå 2 (Cursor) — ENDAST efter backend GO

Data: dossierBundle.activeVisit med riktiga encounter-states.

Bygg ovanpå Fas 2-segment (rör ej self-hide / scheduled_today-logik i onödan):
- checked_in / in_progress / completed_today enligt payload.state
- timeline + amber puls endast vid in_progress
- check-in / avsluta när backend exponerar actions/state
- ingen hårdkodad state

Mockup: AKTIVT-BESOK-LOCKED-2026-06-17.md (full, när data finns)
Filer: cco-v9-customers-parity.js, cco-v9-customers.css
```

### Byggordning

```
Fas 2 låst ✓
  → Fas 3a Codex: state mapping + persistent check-in + payload
  → Prod stickprov med dagens bokning
  → GO/NO-GO UI-nivå 2
  → Fas 3b Cursor: full segment states + timeline
  → Codex UAT B/C/D/E komplettering
```

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

| Steg                                | Ägare      | Leverabel                                |
| ----------------------------------- | ---------- | ---------------------------------------- |
| **0** Datamodell-audit              | **Codex**  | **CLOSED**                               |
| **1** `activeVisit`-adapter         | **Codex**  | **CLOSED** prod `d62e819e`               |
| **2** UI delvis (`scheduled_today`) | **Cursor** | **CLOSED** — **rör ej**                  |
| **3a** Encounter-states + check-in  | **Codex**  | **CLOSED** (lokal) · GO UI nivå 2        |
| **3b** UI-nivå 2 (full states)      | **Cursor** | **GO** — efter deploy valfritt stickprov |
| **UAT** B/C visuellt                | **Codex**  | när prod har dagens bokning              |

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
- [x] Minsta payload i dossier-bundle — **Fas 1 adapter** prod `d62e819e`
- [ ] Exempelpayload prod med `scheduled_today` — **datablockerad** (0 todayVisit idag)
- [x] GO/NO-GO — **PARTIAL GO Cursor · NO-GO full mockup**

### Cursor (Fas 2 — delvis)

- [ ] Segment synligt vid `activeVisit.visible=true` — **datablockerad** (ingen prod-patient)
- [ ] State `scheduled_today` visuellt — **datablockerad**
- [x] Pre-flight från `blockers[]` — implementerad (ej visuellt verifierad)
- [x] Actions wired — journal · bild · anteckning
- [x] Self-hide när `visible=false` — **UAT A PASS**
- [x] **Ej scope:** full timeline / check-in / avsluta — ej byggt
- [x] verify-v11 utökad — 53/54 PASS
- [ ] 380px mobil — **manuell kvar**

### Prod UAT (Codex, 2026-06-17)

- [ ] Patient **med** besök idag — **datablockerad**
- [x] Patient **utan** besök idag — **PASS (A)**
- [ ] Rollback `__ARCANA_V11_KUNDKORT=false` — **manuell kvar (E)**

---

## Måttstock

Personalen ska intuitivt förstå:

> “Kunden är här nu — här jobbar jag med dagens besök.”

Det ska kännas som den naturliga operativa mitten i kundkortet.

---

## Slack-pingar

**Team:**

```text
ORD-25E: Fas 3a backend klar (lokal). GO Cursor UI nivå 2.
States: scheduled_today | checked_in | in_progress | completed_today.
Nästa: commit/deploy 3a → Cursor 3b → prod UAT med dagens bokning.
```

**Manuell kvar (D/E + B visuellt):**

```text
- 380px i vanlig browser
- __ARCANA_V11_KUNDKORT=false i devtools
- öppna kund med dagens bokning när sådan finns
```

---

## Referens

- **Parent closeout:** `ORD-25-kundkort-v11-port.md`
- **Mockup locked:** `docs/handover/MOCKUPS/AKTIVT-BESOK-LOCKED-2026-06-17.md`
- **v11 baseline:** `docs/handover/MOCKUPS/KUNDKORT-V11-LOCKED-2026-06-05.md`
- **Backend-deps:** ORD-23a · ORD-41 · encounter/booking-spår
- **Prod baseline:** `d62e819e` (Fas 1 adapter + Fas 2 delvis UI)

---

_Skapad 2026-06-17 · Fas 3a closed (lokal) · Fas 3b GO Cursor · prod UAT pending_
