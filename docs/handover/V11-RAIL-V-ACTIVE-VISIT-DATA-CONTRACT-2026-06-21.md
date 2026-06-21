# V11-RAIL · V Active Visit — Data Contract (förslag att låsa)

**Status:** LÅST 2026-06-21 (owner-svar). Block 4-kod kan börja.
**Datum:** 2026-06-21
**Sektion:** V · Active Visit (canon §6 V — "facit: new hero with timeline and journal CTA").
**Syfte:** Låsa exakt datakontrakt + CTA-wiring innan `.v11-rail__active-visit` byggs, så att journal-/check-in-flödet inte tappas under riktigt besök (inventory-blocker #1).

---

## 1. Bakgrund — kontraktet finns redan i kod

Inventory Fas 2 angav "V har 0 motsvarande kod". Det stämmer **inte**: det finns
en komplett, levererad active-visit-modell i
`public/major-arcana-preview/app/cco-v9-customers-parity.js`:

- `resolveActiveVisitPayload(dossierBundle)` — datakälla + synlighetsgrind
- `resolveActiveVisitPresentation(visit, prefix)` — state-maskin → kicker/status/CTA
- `renderActiveVisitHtml(...)` / `renderReferensActiveVisit(...)` — render (prefix `v11-active-visit`)
- click-handler (rad ~3857) som wire:ar CTA-actions till live-flöden

**Detta kontrakt = återanvänd den befintliga modellen** för v11-rail-sektionen,
ingen ny datamodell uppfinns. Det eliminerar journal-CTA-risken (den är redan löst).

---

## 2. Datakälla

```
dossierBundle.activeVisit   // samma bundle som matas in i mount-switchen
```

Synlighetsgrind (oförändrad): rendera V **endast** när
`activeVisit.visible === true`. Annars → ingen V-sektion (ej empty-state-kort,
besök saknas helt är ett normalt tillstånd). Adapter:
`resolveActiveVisitPayload(dossierBundle)` returnerar `null` när dold.

## 3. visit-objektets fält (riktiga, från befintlig modell)

| Fält                    | Typ              | Användning                                                                                                           |
| ----------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `visible`               | bool             | grind — rendera bara när `true`                                                                                      |
| `state`                 | enum             | `scheduled_today` \| `checked_in` \| `in_progress` \| `completed_today` (annars normaliseras till `scheduled_today`) |
| `startsAt`              | ISO              | planerad starttid (`Kl HH:MM`)                                                                                       |
| `checkedInAt`           | ISO              | incheckningstid + "N min sedan check-in"                                                                             |
| `startedAt`             | ISO              | faktisk start (timeline "pågår")                                                                                     |
| `completedAt`           | ISO              | avslutstid (timeline "klart")                                                                                        |
| `serviceLabel`          | string           | titel + journal-detalj                                                                                               |
| `practitionerLabel`     | string           | personal i meta-rad                                                                                                  |
| `journalStarted`        | bool             | "Starta journal" vs "Fortsätt journal"                                                                               |
| `blockers`              | `{code,label}[]` | preflight "Innan besöket"                                                                                            |
| `photoCaptureAvailable` | bool             | aktivera/disabla "Ta bild"                                                                                           |
| `notesAvailable`        | bool             | aktivera/disabla "Anteckning"                                                                                        |

Alla fält är valfria utom `visible` + `state`; saknade tider → motsvarande
timeline-/meta-rad utelämnas (ingen fejk).

## 4. State-maskin → presentation (oförändrad)

| state             | kicker               | primär CTA                              | sekundär CTA               |
| ----------------- | -------------------- | --------------------------------------- | -------------------------- |
| `scheduled_today` | Nytt besök · idag    | **Checka in** (`checkin`)               | Starta journal (`journal`) |
| `checked_in`      | Incheckad            | **Starta/Fortsätt journal** (`journal`) | —                          |
| `in_progress`     | Pågår                | **Starta/Fortsätt journal** (`journal`) | Avsluta besök (`complete`) |
| `completed_today` | Besök avslutat HH:MM | **Boka uppföljning** (`followup`)       | Visa journal (`journal`)   |

Timeline visas för alla states utom `scheduled_today`. Dessutom alltid:
"Ta bild" (`photo`) och "Anteckning" (`notes`), disablade enligt fälten ovan.

## 5. CTA-wiring (KRITISK — låses här)

CTA-knappar bär `data-v11-active-visit-action="<action>"`. Befintlig handler
(`cco-v9-customers-parity.js` ~3857) wire:ar exakt:

| action     | Live-flöde (befintligt)                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `journal`  | `liveHandlers.openJournal()` — startar/återupptar journal (samma flöde som `[data-sek="journal"] .openb`) |
| `checkin`  | `liveHandlers.checkInVisit()`                                                                             |
| `complete` | `liveHandlers.completeVisit()`                                                                            |
| `followup` | `liveHandlers.openBook()`                                                                                 |
| `notes`    | `liveHandlers.openNotes()`                                                                                |
| `photo`    | klick på `.v9-camera-bridge [data-patient-photo-camera]`                                                  |

**Kontraktskrav för v11-rail V:** behåll exakt dessa `data-v11-active-visit-action`-
värden så att den befintliga handlern fortsätter fungera utan ändring. v11-rail
bidrar enbart med presentation (`.v11-rail__active-visit*`-namespace), inte ny
handler-logik. Detta är den enda legacy-kontaktpunkten utöver mount-switchen.

## 6. Adapter + renderer (Block 4, EFTER lås)

- `buildActiveVisitFromBundle(dossierBundle)` i `cco-v11-rail-adapters.js`
  = **self-contained**: läser `dossierBundle.activeVisit` (grind `visible===true`)
  och speglar det dokumenterade state→presentation-kontraktet i §4 **utan**
  beroende på `CcoV9CustomersParity`-interna funktioner (`resolveActiveVisitPresentation`
  är inte exporterad; v11-rail ska vara oberoende per canon §5). Returnerar ren
  data, inga klasser.
- `renderActiveVisit(data)` i `cco-v11-rail.js` → `.v11-rail__active-visit` med
  egen `esc`, men **samma `data-v11-active-visit-action`-kontrakt**.
- `render()`-ordning: V placeras enligt canon (hero) — föreslås **efter A Profile,
  före B Smart information**. (Bekräftas vid lås.)
- Saknad/dold activeVisit → V utelämnas (ingen sektion), A/B/C oförändrade.

## 7. Responsivt (canon §4)

`.v11-rail__active-visit` får egna 320/768/1024-regler; CTA-knappar ≥44px touch
på mobil/tablet; timeline klipper ej horisontellt.

## 8. Låsta beslut (owner 2026-06-21)

1. **Placering:** `A → V → B → C` — V som hero direkt efter A Profile när aktivt besök finns.
2. **CTA-handler:** v11-rail behåller `data-v11-active-visit-action` och **återanvänder befintlig handler** (`cco-v9-customers-parity.js` → `liveHandlers`). Ingen ny rail-handler. Befintliga journal/checkin/complete-flöden bevaras.
3. **Hero-innehåll:** visa både `practitionerLabel` och `serviceLabel`.
4. **Blockers/preflight:** visa **alltid**; tom lista → "Inga blockerare för dagens besök."

---

**Kontraktet är LÅST. Block 4-kod (adapter + renderer + CSS + screenshots) byggs på denna gren och stoppar sedan för Codex-granskning.**
