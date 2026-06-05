# ORD-28 — Kundkort blueprint (3-kolumn desktop)

**Skapad:** 2026-06-05  
**Assignee:** Cursor (write — frontend)  
**Prio:** P0  
**Status:** implemented  
**Källa:** iCloud `CCO-KUNDKORT-BLUEPRINT.md` + `cco-kundkort-blueprint.html`

Supersedes ORD-27 som **primär desktop-layout** (>1180 px). ORD-27 gloss-lista och slide-over (full dossier) behålls.

---

## Layout

| Kolumn  | Bredd   | Innehåll                                       |
| ------- | ------- | ---------------------------------------------- |
| Vänster | ~300 px | Segment + kundlista (befintlig v9)             |
| Mitten  | 1fr     | Arbetsyta: header, flikar, insikter, tidslinje |
| Höger   | ~384 px | Kundkort §3 (7 sektioner)                      |

Aktiveras: `data-v9-blueprint="on"` på `<html>` när kund vald + desktop ≥1180 px + ej mobile shell.

---

## Höger kundkort (ordning)

1. Allergi-banner (`card.allergies[]` / dossier-bundle)
2. Identitet
3. Kundresa · 9 steg (vertikal stepper, `buildV11CustomerJourney`)
4. Smart nästa steg (10 signaler, read-only, ORD-3)
5. Dokument-dossier (6 rader, status-chip)
6. Ekonomi mini (Fortnox-fält)
7. Quick actions: Öppna full dossier · Lägg i worklist (disabled)

---

## Filer

| Område         | Filer                                                        |
| -------------- | ------------------------------------------------------------ |
| Render + bind  | `app/cco-kundkort-blueprint.js`                              |
| CSS            | `cco-kundkort-blueprint.css`                                 |
| Grid tokens    | `cco-v9-tokens.css` — `--v9-layout-grid-cols-blueprint`      |
| Shell          | `index.html` — `data-customers-workspace`                    |
| Integration    | `app/patient-master-ui.js`                                   |
| Smart signaler | `app/cco-kunder-smart-next-step.js` (nu laddad i index)      |
| Journey export | `app/cco-v9-customers-parity.js` — `buildV11CustomerJourney` |

---

## Regler

- Ingen ★ / AI-branding
- Ingen extern AI på medicinsk data
- Segment-logik oförändrad
- Full dossier = befintlig ORD-26/27 slide-over i deep-panel

---

## Verifiering

```bash
npm run check:syntax
npm run lint:no-bypass
ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local
```

Desktop: `/major-arcana-preview/?view=customers&v9polish=on` — välj kund vid ≥1180 px bredd.
