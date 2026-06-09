# ORD-37 — Kundkortets bokningar från egen boknings-motor (Cliento → egen, fas 1)

**Skapad:** 2026-06-08 (Claude PM)
**Assignee:** Codex (backend — boknings-enrichment)
**Claude-spår:** frontend visar redan upcoming/"nästa"; UAT efter
**Prio:** P1 · tänder Kommande/Denna vecka/"vad som kommer näst" med egen data
**Relaterat:** journal "vad som kommer näst" (commit 53b92d48), Drive-sunset-mönstret

---

## Mål / bakgrund

Målet är **egen booking** (Arcana-kalendern) som sanningskälla, Cliento sunsetas. Kundkortets "Kommande bokningar", segmentet "Denna vecka", och journalsektionens **"vad som kommer näst"** (orange "Inför [datum]") läser idag från **Cliento** (`clientoBookingStore`) — som är tom → inget tänds.

Ni har redan en egen boknings-motor: `src/ops/ccoBookingStore.js` / `ccoBookingEngineStore.js` / route `ccoBookings.js` + `recurringBookings.js` + `clinicCalendarView.js`. Fas 1 = låt kundkortet läsa därifrån (+ Cliento legacy som brygga).

## Scope (Codex — backend)

1. **`src/ops/ccoKunderBookingEnrichment.js`** (kundkortets boknings-enrichment): lägg **`ccoBookingStore`** som boknings-källa **sammanslaget** med befintliga `clientoBookingStore` (legacy). Egna bokningar **prioriteras** vid dubbletter (matcha på patient + datum + tid/typ).
2. **Exponera per patient** i dossier-readout/bundle: `upcomingBookings: [{date/dateLabel, time, duration, title/serviceName, staff/resourceLabel, status}]` och `historyBookings` — samma form som kundkortet redan konsumerar (`resolveReferensBookingExtras` → `up`/`hist`). Driver även "Denna vecka"-segmentet (`upcomingBookings`-räknaren i `ccoKunderEnrichment.js` rad ~1014–1034).
3. **Ingen ny extern dataväg** — egna storen är intern. Cliento kvar som legacy-läsning (brygga), inte borttagen i denna order.
4. **Idempotent/dedupe:** en bokning som finns i båda källorna visas en gång (egen vinner).

## FÖRBJUDET

- Skriv inga bokningar (read-only enrichment).
- Ta INTE bort Cliento-läsningen än (det är fas 4 / egen order).
- Ingen mock-data. Inga patient-/Drive-/betalflöden rörs.

## Gates

- `npm run check:syntax` · `npm run lint:no-bypass` · `npm run test:unit`
- Test: patient med egen bokning → upcomingBookings innehåller den; dubblett egen+Cliento → en post (egen); tom → tom (ingen krasch).
- Commit refererar ORD-37.

## Rapport till Claude (UAT)

Commit + filer + bevis: (a) patient med egen Arcana-bokning → "Kommande bokningar" + journal "Inför [datum]" + "Denna vecka"-segment tänds, (b) merge egen+Cliento utan dubbletter, (c) tom-fall. Claude UAT:ar i /staff.

## Senare faser (ej denna order)

- Fas 3: engångs-import Cliento → egna storen (`clientoBookingCsvImport` finns).
- Fas 4: Cliento-sunset (kapa legacy-läsningen).

## Status

| Fas                                    | Status          |
| -------------------------------------- | --------------- |
| Order skapad (repo + Notion)           | KLAR 2026-06-08 |
| Codex: enrichment läser egen + Cliento | Väntar          |
| Claude UAT (/staff)                    | Väntar          |
