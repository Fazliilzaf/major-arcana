# Aktivt besök · LOCKED · 2026-06-17

**Status:** Owner-approval 2026-06-17 ("gillade denna design super mycket") — locked som canonical design för den konditionella besökszonen i v11.
**Position:** ORD-25 Fas E (redan inskriven i `docs/handover/ORDERS/ORD-25-kundkort-v11-port.md` sammanslagen 2026-06-17).
**Komplement till:** `KUNDKORT-V11-LOCKED-2026-06-05.md` (huvudkort) — Aktivt besök är fjärde lagret, inte ersättning.

---

## Placering i v11

```
Utan aktivt besök idag:
  [ Zon 1 Hero ] → [ stat-row ] → [ Zon 2 Dokument ] → [ Zon 3 Insikter + sticky ]

Med aktivt besök idag (Fas E):
  [ Zon 1 Hero ] ─hairstrand─ [ Aktivt besök ] ─hairstrand─ [ stat-row ]
  ─hairstrand─ [ Zon 2 Dokument ] ─hairstrand─ [ Zon 3 Insikter + sticky ]
```

Zonen är **konditionell** — kollapsar helt när inget besök är aktivt. Bryter aldrig v11-baseline.

---

## Komposition (4 segment, fast ordning)

### 1. Kicker · status-puls (rad 1)

- Pulsande amber-dot (`#c4881e` + dubbla halo-ringar `rgba(200,130,30,.18)` + `.08`)
- "AKTIVT BESÖK · PÅGÅR" i 10px amber-text uppercase
- Höger: tid-stämpel ("14:42 · 12 min sedan check-in") i 11px tabular-nums

### 2. Visit-kontext (rad 2)

- Behandling i 22px hero-rubrik ("PRP behandling 2/3")
- Underrad 13px ink-soft ("scalp · 45 min planerat")
- Höger: behandlare + rum ("Erik Holm · behandlare · Rum 2")

### 3. Pre-flight checklist · 3-kol grid

- **OK-kort** (2 av 3 i normalfall): grön gradient-checkmark + "Hälsodekl signerad" / "Allergier granskade" med datum eller värden i grön-text
- **Varnings-kort** (när blocker): amber-stripe vänster (3px) + amber-vellum bg + amber `!`-badge + "Krävs idag" + inline `[Öppna]`-knapp

### 4. Encounter-timeline · horisontell tråd

- Tre noder: incheckad (grön) → pågår (amber puls med halo) → klart (dashed)
- Linjer mellan noder: `linear-gradient(90deg, gron→amber→neutral)` matchar progress
- Format: `14:30 incheckad — 14:42 pågår — ~15:15 klart`

### 5. Journal-actions · 1 hjälte + 3 quick

- **Primary** (flex:1): gold-gradient knapp "Starta journal · PRP-protokoll 2/3" med dokument-ikon, `--shadow-lift` + amber-glow
- **Secondary 1**: vellum "Ta bild" + kamera-ikon
- **Secondary 2**: vellum "Anteckning" + penna-ikon
- **Tertiary**: grön-pill "Avsluta" + check-ikon

---

## 3 states (zonen self-hides när ingen aktiv)

| State                   | Trigger                                   | Kicker                                    | Pre-flight                   | Timeline                | Primary CTA                      |
| ----------------------- | ----------------------------------------- | ----------------------------------------- | ---------------------------- | ----------------------- | -------------------------------- |
| **Väntar incheckning**  | `bookings.today[]` finns, ingen check-in  | Neutral dot · "Väntar incheckning"        | Visas                        | Inga noder aktiva       | "Checka in"                      |
| **Pågår** _(visad här)_ | `encounter.status = in_progress`          | Amber puls · "PÅGÅR" + min sedan check-in | Visas                        | Amber puls på pågår-nod | "Starta journal · {journalType}" |
| **Avslutat idag**       | `encounter.status = completed` + same-day | Grön check · "Besök avslutat 15:08"       | Komprimerad till klar-stripe | Alla noder gröna        | "Boka uppföljning"               |
| **(inget besök)**       | `bookings.today[]` tom                    | —                                         | —                            | —                       | Zonen renderas inte              |

---

## Designsystem (samma tokens som v11)

Återanvänder fullt ut v11-tokens från `KUNDKORT-V11-LOCKED-2026-06-05.md`:

- `--v11-amber-wash` + `--v11-amber-border` + `--v11-amber-grad` för zon-card
- `--v11-shadow-lift` på zon-card (samma elevation som hero)
- `--v11-gron-grad` på OK-checkmarks
- Typografi-skala 10/11/13/16/22 (samma 5 sizes)
- Rytm 6/14/24 (samma)
- Hairsträng som zon-skarv ovanför och under

**Ny tillgång (för pulsen):**

```css
--v11-pulse-amber:
  0 0 0 4px rgba(200, 130, 30, 0.18), 0 0 0 8px rgba(200, 130, 30, 0.08);
```

**Inga nya färger** — håller palett-disciplin lila/grön/amber.

---

## Render-villkor (för Cursor)

```js
const showActiveVisit =
  bookings.today.length > 0 &&
  ['checked_in', 'in_progress', 'completed_today'].includes(
    bookings.today[0].encounterStatus
  );
```

Datakällor:

- `bookings.today[]` — från dossier-bundle (existerande)
- `encounter.status` + tider — från `ccoEncounterStore` (existerande)
- Pre-flight härlett från `dossier-bundle.documents` (HD/friskförs status) + `card.allergies` (ORD-23a när klart)
- Journal-CTA → öppnar `ccoJournalStore.createEntry()` med rätt `journalType` baserat på flow + journeyStep

---

## Frusna designval (får inte ändras utan owner-OK)

- **Konditionell** — INTE alltid synlig
- **Mellan hero och stat-row** — INTE överst, INTE i sticky
- **EN primär CTA** — "Starta journal" är hjälten, övriga 3 är assistenter
- **Pulsande amber-dot** — visuellt löfte att zonen är "live"
- **Pre-flight som 3-kol grid** — INTE som lista, INTE som checklist-modal
- **Encounter-timeline horisontellt** — INTE vertikalt, INTE som progress-bar
- **Journal per besök (encounter)** — INTE lös text i kortet

---

## Beroenden

| Vad                                      | Status                            | Var                         |
| ---------------------------------------- | --------------------------------- | --------------------------- |
| `bookings.today[]` i dossier-bundle      | Behöver verifieras                | ORD-23/24 backend           |
| `encounter.status` state-machine         | Finns                             | `ccoEncounterStore`         |
| Pre-flight signal (HD/allergi/friskförs) | Delvis (HD finns, friskförs kvar) | ORD-23a                     |
| Journal-CTA → journalType-resolver       | Finns för standard-flow           | Befintlig `ccoJournalStore` |
| Allergier-strukturerat                   | Behövs                            | ORD-23a slice               |

---

## Nästa steg

1. **Codex Fas 0 audit** verifierar `bookings.today[]` + encounter-state finns för stickprov-patient
2. **Cursor Fas E** bygger `renderV11ActiveVisit()` i `cco-v9-customers-parity.js` mellan hero och stat-row
3. **UAT 3 patienter:** utan besök / pågående besök / avslutat besök
4. Mobile-port (`m-kunder.html`) i senare ORD när desktop är stabil

---

_Locked 2026-06-17 efter owner-approval av visuell mockup `v11_active_visit_zone_with_journal_cta`. Snapshot bevaras i visualize-historik._
