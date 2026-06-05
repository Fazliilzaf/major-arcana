# ORD-27 — Kundkort godkänd design v2 (hela Kunder-vyn)

**Skapad:** 2026-06-05  
**Assignee:** Cursor (write — frontend)  
**Prio:** P1  
**Status:** done  
**Källa:** Arcana Order Inbox · godkänd design v2

---

## Uppdrag

Bygg **hela Kunder-vyn** mot referenserna `uploads/cco-kunder-v9-egen.html` + `uploads/cco-kundkort-REFERENS.html`:

1. **Kundlista** — svävande glossiga rad-kort (3D-avatarer, glossiga badges/pills, story-cards, filter, multi-select)
2. **Slide-over kundkort** — gloss-lift, kontakt, Hälsodeklaration (Meridiq 16414 → dossier-bundle), foto-miniatyrer, steg-stapel, mikro-effekter via `?v9polish=on`

### Hårda regler

- **Ingen ★ / AI-branding** i kundvy eller slide-over
- **Ingen extern AI** på medicinsk data
- **Segment-logik oförändrad** (filter, aggInsights, segmentStats)

---

## Referensfiler

| Fil                                         | Innehåll                                              |
| ------------------------------------------- | ----------------------------------------------------- |
| `uploads/cco-kunder-v9-egen.html`           | Lista: story-cards, filter, gloss-rader, multi-select |
| `uploads/cco-kundkort-REFERENS.html`        | Slide-over v2: lift-panel + accordion                 |
| `uploads/CCO-Kunder-Mockup-v9-DESKTOP.html` | Full desktop-mockup (arkiv)                           |

Lokal preview: `npm run cco:mockup-kunder-v9`

---

## Prod-implementation

| Område                | Filer                                                                  |
| --------------------- | ---------------------------------------------------------------------- |
| Flagga polish         | `app/cco-v9-flag.js` — `?v9polish=on\|off` → `data-v9-polish`          |
| Lista + slide-over    | `app/cco-v9-customers-parity.js`                                       |
| Rad-render            | `app/patient-master-ui.js` — `renderV9PatientRowHtml`, aggregate panel |
| CSS gloss/lift/polish | `cco-v9-customers.css`                                                 |
| Bulk multi-select     | `bindV9BulkSelection`                                                  |
| Hälsodekl             | `resolveHealthDeclarationFromBundle` — Meridiq **16414**               |
| Data                  | `GET .../dossier-bundle?includeJournal=0`                              |

### Slide-over v2 lift-panel

- Kontakt (tel/mail)
- Hälsodeklaration från bundle
- Foto-miniatyrer (driveFiles)
- Kundresa steg-stapel (`buildV11CustomerJourney`)

### Polish (`?v9polish=on`)

- Rad-hover gloss-lift
- Vald rad pulse
- Lift-panel skugga
- Story-card hover

---

## Ej rört

- Journal-flikar / feed / forms (backend + editor)
- Segment-API och filterQuery
- Extern AI på journalinnehåll

---

## Verifiering

```bash
npm run check:syntax
npm run lint:no-bypass
ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local
```

Prod-test: `/major-arcana-preview/?view=customers&v9polish=on`
