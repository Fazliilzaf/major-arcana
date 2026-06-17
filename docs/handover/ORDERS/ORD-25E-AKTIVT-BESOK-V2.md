# ORD-25E — Aktivt besök / Nytt besök (Fas E v2)

**Skapad:** 2026-06-17  
**Prio:** P1  
**Status:** **OPEN** — väntar Codex datamodell-audit → GO/NO-GO för Cursor UI  
**Förälder:** [`ORD-25-kundkort-v11-port.md`](ORD-25-kundkort-v11-port.md) (Fas A–D **CLOSED** prod `a18b54e7`)

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

## Fas 0 audit — kända gap (från ORD-25)

| Behov                                                     | Status idag                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `bookings.today[]` i dossier-bundle                       | **SAKNAS**                                                                    |
| Encounter: `checked_in \| in_progress \| completed_today` | **SAKNAS** (har `reserved \| confirmed \| cancelled`)                         |
| Persistent check-in → kundkort                            | **SAKNAS** (`watch-checkin` = timestamp only)                                 |
| Delvis finns                                              | `upcomingBookings`, `todayVisit`, `encounterId`, `missingEncounterForBooking` |

**Codex måste bekräfta/uppdatera innan Cursor UI GO.**

---

## Cursor vs Codex

| Steg                                    | Ägare      | Leverabel                                        |
| --------------------------------------- | ---------- | ------------------------------------------------ |
| **0** Datamodell-audit + minsta payload | **Codex**  | GO/NO-GO + gap-lista + exempelpayload            |
| **1** Backend/adapter (om gap)          | **Codex**  | Litet diff, verify/stickprov                     |
| **2** UI-segment + states + wiring      | **Cursor** | `renderV11ActiveVisit` (namn TBD) i parity.js    |
| **3** CSS (v11-tokens)                  | **Cursor** | samma skal som locked mockup                     |
| **4** Verify                            | **Cursor** | utöka `verify-v11-paritet.js`                    |
| **5** Prod UAT                          | **Codex**  | patient **med** besök idag · 380px · journal-CTA |

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

## Målpayload (exempel — följ repo-mönster om bättre finns)

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
  journalStarted: boolean,
  photoCaptureAvailable: boolean,
  notesAvailable: boolean,
  blockers: string[],
}
```

**Sanning bör bo i:** booking + encounter + dossier-bundle readout — inte parallell UI-state.

---

## Codex brief (copy-paste)

```text
ORD-25E Fas E v2 — Aktivt besök / Nytt besök (Codex)

Bakgrund: ORD-25 A–D live (a18b54e7). Nästa = konditionellt segment under hero, före dokument.

Uppgift: Kartlägg och implementera minsta hållbara dataunderlag.

Undersök:
- patient-master payload / dossier-bundle
- booking enrichment
- encounter/treatment encounter store
- watch-checkin
- journal-start / journal bridge
- befintliga action-hooks i kundkortet

Svara:
1. Vilka fält finns redan för “dagens besök”?
2. Finns sann källa för booking today / checked_in / in_progress / completed_today?
3. Persistent eller transient state?
4. Var ska sanningen bo?

Om full lösning inte går: payload-shape + exakt gap-lista + GO/NO-GO för Cursor.

Leverabel: audit · ev. liten adapter · exempelpayload · verify/stickprov
Spec: docs/handover/ORDERS/ORD-25E-AKTIVT-BESOK-V2.md
Mockup: docs/handover/MOCKUPS/AKTIVT-BESOK-LOCKED-2026-06-17.md
```

---

## Cursor brief (copy-paste, efter Codex GO)

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

- [ ] Audit: fält som finns / saknas dokumenterad
- [ ] Minsta payload exponerad i dossier-bundle eller card readout
- [ ] Exempelpayload för 1 patient med besök idag
- [ ] GO/NO-GO för Cursor uttalat

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
ORD-25 A–D: CLOSED på prod (a18b54e7). v11 default live.
Nästa: ORD-25E Aktivt besök — eget segment under hero, före dokument.
Codex först: datamodell-audit. Cursor UI efter GO.
Mockup: AKTIVT-BESOK-LOCKED-2026-06-17
```

**Codex (kort):**

```text
ORD-25E (Codex): kartlägg minsta säkra datamodell för Aktivt besök.
Behöver: dagens bokning + encounter-states + journal/bild/anteckning/avsluta.
Audit först → payload + gap-lista → GO/NO-GO för Cursor.
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

_Skapad 2026-06-17 · Utbruten från ORD-25 Fas E efter A–D closeout_
