# ORD-25E · P0 referens facit (låst riktning)

**Updated:** 2026-06-17  
**Status:** P0 levererat i kod — prod browser-UAT = Fazli efter Cloud script-rapport

---

## Facit-beslut (ingen A/B)

| Beslut                | Värde                                                              |
| --------------------- | ------------------------------------------------------------------ |
| Prod-default kundkort | ORD-47 **referens** (`.kkref .doss`)                               |
| v11 rail              | Endast `window.__ARCANA_V11_KUNDKORT === true`                     |
| Journal / formulär    | **KKX** (`#kkx-ov`, `mountKkxJournalBig`) — inte staff-flikar      |
| Anteckning            | Scroll `data-sek="anteckningar"` eller KKX med `focusNotes`        |
| Aktivt besök          | Native sektion `data-sek="besok"` + `data-v11-active-visit-action` |
| Scroll                | `.v10-dossier-referens` (inte `.kkref .ds` som scrollport)         |

**Förbjudet i referens-läge:** `switchDetailTab('journal'|'anteckningar')` som enda CTA.

---

## P0 checklist — ägare & status

| #   | Punkt             | Ägare                 | Kod-status                                                                                                                     | Prod verify                 |
| --- | ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| 1   | Journal-CTA → KKX | Cursor                | **DONE** — `openReferensJournalWorkspace({ forceKkx, fromActiveVisit })`, `resolveActiveVisitJournalHints` (encounter/booking) | Cloud + browser             |
| 2   | Anteckning-CTA    | Cursor                | **DONE** — `openReferensNotesSection` → anteckningar `.openb` eller KKX `focusNotes`                                           | Cloud + browser             |
| 3   | Övriga knappar    | Cursor + Cloud        | **DONE** wiring — `bindIntelligentJourney` → `journeyHandlers` (photo/checkin/followup/notes/journal)                          | Cloud smoke                 |
| 4   | Prod UAT scripts  | Cloud → Fazli browser | Se gates nedan                                                                                                                 | Obligatorisk före mobiltest |
| 5   | Handover          | Cursor                | **Denna fil** + `.cursor/rules/kundkort-referens-ux.mdc`                                                                       | —                           |

---

## Wiring (var i koden)

```
renderV9MockupDetailShell (v10Facit && !v11Cutover)
  → .v10-dossier-referens[data-v9-dossier-scroll]
  → __renderReferensKundkort
  → renderReferensActiveVisit (parity) → data-sek="besok"

bindV9MockupDossierHandlers
  → journeyHandlers.openJournal / openNotes / checkInVisit
  → bindIntelligentJourney → [data-v11-active-visit-action]

openReferensJournalWorkspace
  → scroll data-sek=journal
  → CcoKundkortKkx.openBig → mountKkxJournalBig
```

---

## Prod UAT URL (facit)

```
https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&demoOpDay=1&demoSkipSteg7=1&patientId=9ff9f7ff-ef2a-4dec-bdf9-43914506547c
```

### Cloud kör (P0 #4a)

```bash
node scripts/verify-v11-paritet.js
npm run verify:ord47-prod-sticks
npm run verify:kkx-journal-workspace-prod
curl -sS https://arcana.hairtpclinic.com/readyz
```

### Fazli browser (P0 #4b)

- [ ] `.kkref` synlig, `data-v11-cutover` saknas / false
- [ ] `data-sek="besok"` när demo aktivt besök
- [ ] Kortet scrollar (`.v10-dossier-referens`)
- [ ] **Starta/Fortsätt journal** → KKX synlig utan manuell scroll
- [ ] **Anteckning** → anteckningsyta synlig (sektion eller KKX)
- [ ] **Ta bild** → kamera/upload
- [ ] **Check-in** → state/timeline uppdateras
- [ ] Screenshot bifogad

---

## Verify lokalt (Cursor)

```bash
node --check public/major-arcana-preview/app/patient-master-ui.js
node scripts/verify-v11-paritet.js
```

Känd pre-existing FAIL: `#bb4779` (studio-accent i referens-CSS) — blockerar inte P0 wiring.

---

## Nästa (P1, inte P0)

- Encounter-kopplad journal auto-utkast (#6)
- State-driven UI alla tre states (#7)
- Cliento riktig bokning idag (#8)
