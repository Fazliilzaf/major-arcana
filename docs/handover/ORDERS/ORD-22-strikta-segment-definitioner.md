# ORD-22 — Stramare segment-definitioner (Aktiva/Risk/Nya/Dormant)

**Skapad:** 2026-06-04
**Owner-spår:** Cursor (write — backend logic i `src/ops/`)
**Claude-spår:** UAT efter deploy
**Prio:** P1
**Status:** IMPLEMENTED (2026-06-04) — fas 2–5: Cliento CSV-import, aktivitetsbaserad dormant, risk noShow, Pipedrive VIP (Vunnen)

---

## Bakgrund

ORD-21 (mockup-paritet i kund-vyn) är 100 % visuellt klar — pills, chips, story-cards och dossier matchar mockupen. Däremot är PILL-VÄRDENA fel:

| Pill             | Visar idag         | Förväntat (mockup)   | Problem                              |
| ---------------- | ------------------ | -------------------- | ------------------------------------ |
| `aktiva i maj`   | **7 217** (≈100 %) | ~87 av 1247 (≈7 %)   | Definition matchar för brett         |
| `risk`           | 0                  | ~12 av 1247 (≈1 %)   | Aliasar `needs_review`, fel semantik |
| `nya / 30 dagar` | 4                  | ~89 av 1247 (≈7 %)   | Endast `origin === 'new'` triggar    |
| `dormant`        | 0                  | ~456 av 1247 (≈37 %) | Kräver `!hasJournal` — för strikt    |

Mockupen designades runt realistiska segment-andelar (active≈7 %, risk≈1 %, new≈7 %, dormant≈37 %). Live visar 100 % aktiva eftersom backend-definitionen `matchSegment('active')` returnerar `true` för i princip alla kunder.

Detta är en backend-data-definition i `src/ops/ccoKunderEnrichment.js` — Cursor-territory.

---

## Nuvarande definitioner (line 266-318)

```js
case 'active':
  return hasJournal
    || (updatedDays != null && updatedDays <= ACTIVE_DAYS)  // ACTIVE_DAYS = 180
    || matchStatus === 'matched';
// → 7217 (alla matched + alla med journal + alla updated senaste 180d)

case 'risk':                                                 // ALIAS för needs_review
case 'needs_review':
case 'import_review':
  return matchStatus === 'needs_review' || flags.has('needs_review');
// → 0 (eftersom needs_review är data-import-status, inte business-risk)

case 'new':
  return origin === 'new'
    || matchStatus === 'unmatched'
    || matchStatus === 'web_booking';
// → 4 (origin-tagg endast satt på webbformulärs-skapade kunder)

case 'dormant':
  return updatedDays != null && updatedDays > DORMANT_DAYS && !hasJournal;
// → 0 (kombination för strikt — alla med Drive-journal exkluderas)
```

---

## Scope (strikt)

### Ändring i `src/ops/ccoKunderEnrichment.js`

#### 1. `case 'active'` — booking-driven, fallback till nuvarande

```js
case 'active': {
  // Primary: booking-aktivitet senaste 30 dagar ELLER kommande bokning
  if (bookingCoverage !== 'missing') {
    if (booking.hasUpcomingBooking) return true;
    if (booking.lastBookingAt) {
      const days = daysSinceIso(booking.lastBookingAt);
      if (days != null && days <= 30) return true;
    }
    return false;
  }
  // Fallback (booking saknas i indexering): senaste update inom 30d
  if (updatedDays != null && updatedDays <= 30) return true;
  return false;
}
```

#### 2. `case 'risk'` — separera från `needs_review`

```js
case 'risk': {
  // No-show senaste 90d, cooling-off-saknad inom 3d, eller bokning utan friskförsäkran
  if (booking.hasUpcomingBooking
      && isBookingWithinDays(booking.nextBookingAt, 3)
      && !sig.hasForm) return true;
  if (typeof patient.noShowCount === 'number' && patient.noShowCount >= 2) return true;
  if (sig.assetNeedsReview && booking.hasUpcomingBooking) return true;
  return false;
}
// Behåll separat:
case 'needs_review':
case 'import_review':
  return matchStatus === 'needs_review' || flags.has('needs_review');
```

#### 3. `case 'new'` — patient skapad senaste 30d

```js
case 'new': {
  const created = patient.createdAt || patient.createdTime;
  if (created) {
    const days = daysSinceIso(created);
    if (days != null && days <= 30) return true;
  }
  // Behåll origin-fallback för web-booking-flagged
  if (origin === 'new' || matchStatus === 'web_booking') return true;
  return false;
}
```

#### 4. `case 'dormant'` — booking-driven, fallback till updatedDays

```js
case 'dormant': {
  if (bookingCoverage !== 'missing') {
    if (booking.lastBookingAt) {
      const days = daysSinceIso(booking.lastBookingAt);
      return days != null && days > 180;
    }
    // Aldrig bokat = dormant om patient är gammal nog
    return updatedDays != null && updatedDays > 365;
  }
  // Fallback: gamla updatedDays-regeln men utan !hasJournal-exclusion
  return updatedDays != null && updatedDays > 365;
}
```

### Helper-funktion att lägga till

```js
function daysSinceIso(iso) {
  if (!iso) return null;
  const ms = parseBookingMs(iso);
  if (ms == null) return null;
  return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
}
```

### Konstanter (toppen av filen)

Förslag att lägga som named consts så det går att tweaka:

```js
const ACTIVE_BOOKING_DAYS = 30;
const DORMANT_BOOKING_DAYS = 180;
const NEW_PATIENT_DAYS = 30;
const RISK_BOOKING_WINDOW_DAYS = 3;
const RISK_NOSHOW_THRESHOLD = 2;
```

---

## OUT OF SCOPE

- **Ändra UI-pill-labels** — Claude har redan satt "X aktiva" (utan månads-claim). Behöver ej röras.
- **Ändra `case 'vip'`** — `isVipPatient()` är OK som den är (Pipedrive deal-stage + value-tröskel)
- **Ändra `case 'mine'`** — owner-koppling fungerar
- **Behandlingssegment** (`treatment_*`) — separat logik, orörd
- **Booking-pipeline-ingestion** — antag att `bookingCoverage` och `getBookingSignals()` levererar korrekt; vid `'missing'` använder vi fallbacks som är realistiska men inte exakt
- **UI-rendering** — Claude har redan wirat pills till `segCounts.active|vip|risk|new|dormant`. Ingen frontend-ändring krävs.

---

## Acceptance Criteria

- [ ] `node -e "console.log(require('./src/ops/ccoKunderEnrichment.js'))"` — kompilerar
- [ ] `npm test` — alla befintliga tester PASS
- [ ] Nya unit-tester i `tests/ops/ccoKunderEnrichment.test.js` täcker:
  - 'active' med + utan booking-data
  - 'risk' med no-show, missing-form, asset-review
  - 'new' med createdAt + origin-fallback
  - 'dormant' med booking-data + fallback
- [ ] Prod-deploy: pill-värden ändrar sig till realistiska andelar
  - Aktiva: 5-15 % (inte 100 %)
  - Risk: 0,5-5 % (i nuläget ~12 av 1247 ≈ 1 %)
  - Nya: 3-10 %
  - Dormant: 20-50 %
- [ ] Inga regressions i existerande segment-baserad filtrering (sidebar-länkar, agg-cards)

---

## Risker + Mitigation

| Risk                                                         | Mitigation                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Brytande change om `patient.createdAt` saknas                | Fallback till origin-check bevarad                                         |
| `booking.lastBookingAt` ej alltid satt                       | Fallback till `updatedDays`                                                |
| Befintliga callers förväntar sig att active=alla med journal | Run grep för `'active'`-referenser i `src/routes/`, `public/` innan deploy |
| Test-data saknar nya fält                                    | Lägg minimal mock-extension i `tests/fixtures/`                            |
| Dramatiska siffror i UI vid release                          | Annonsera i Slack innan deploy så personal förstår                         |

---

## När Cursor klar — Claude UAT

1. `node scripts/verify-ord16-progress.js` → 12/12 PASS oförändrad
2. Öppna prod `/major-arcana-preview/?view=customers&v9=on` → pills visar realistiska andelar
3. Klicka Aktiva-chip → kundlistan filtreras till realistisk delmängd (inte alla 7217)
4. Klicka Risk/Nya/Dormant → varje chip ger annan delmängd
5. Console-check inga errors
6. Lägg final-status i memory `[[project-v9-port-progress-2026-06]]`

---

_Skapad av Claude · 2026-06-04 · Backend-data-definition · Cursor write-track_
