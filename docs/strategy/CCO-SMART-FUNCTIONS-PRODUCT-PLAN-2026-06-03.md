# CCO Smart Functions — Gemensam produkt-/UX-plan (2026-06-03)

> **Smart nästa steg v2:** [`CCO-SMART-NEXT-STEP-UX-SPEC-V2-9-STEG-2026-06-03.md`](./CCO-SMART-NEXT-STEP-UX-SPEC-V2-9-STEG-2026-06-03.md) (supersedes `missing_form`, T-48 FF, 14d betänketid). Registry: [`CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md`](./CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md). Kundresa: [`CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`](./CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md).

**Status:** Plan only — ingen UI-build i denna fas.  
**Master-dokument:** Denna fil (ChatGPT/Claude + Cursor i ett flöde).  
**Uppdelat:** [ChatGPT UX-brief](./CCO-SMART-FUNCTIONS-CHATGPT-UX-BRIEF-2026-06-03.md) · [Cursor UX-noteringar](./CCO-SMART-FUNCTIONS-CURSOR-UX-NOTES-2026-06-03.md)  
**Teknik:** [CCO-AUTOMATION-OS-ARCHITECTURE-2026-06-03.md](./CCO-AUTOMATION-OS-ARCHITECTURE-2026-06-03.md)

**Regler:** Bygg inte · ingen ny sida · ingen extern AI på journal · ingen journaldata till AI.

---

# DEL A — ChatGPT / Claude (UX-brief)

## A.1 Personal märker först

- Next step på kundrad
- Saknade formulär · avtal
- Redo för besök
- Bildreview väntar
- Mail behöver svar
- Journal / encounter saknas
- Uppföljning förfallen

## A.2 UI-ytor (brief)

| Yta           | Innehåll                    |
| ------------- | --------------------------- |
| Kunder row    | Primary What + risk         |
| Dossier       | Smart nästa steg            |
| Högerpanel    | KPI + dagens arbete         |
| Kalender      | form/avtal/encounter-ikoner |
| Ops Workbench | kö-hub                      |
| Timeline      | read-only kronologi         |
| Svarstudio    | needs_action                |

## A.3 What / Why / Next

| What              | Why                             | Next                 |
| ----------------- | ------------------------------- | -------------------- |
| Bildreview väntar | 3 bilder saknar fas/bodyArea    | Öppna Photo Review   |
| Saknar formulär   | Ingen signerad hälsodeklaration | Skicka formulär (GO) |
| Saknar avtal      | Ej bookable                     | Avtalsflöde (GO)     |

## A.4 Risknivåer

Info · Needs review · Blocker · Legal blocker · Ready

## A.5 Human approval (brief)

Journal · avtal · samtycke · photo · mail send · merge · import · finance export = **ja**

## A.6 AI (brief)

**Får:** metadata-summary · mailutkast (approve) · kö-prioritering · regelbaserad nextStep  
**Får inte:** journal→extern AI · diagnos · autoapprove foto · auto-merge · avtal utan legal review

## A.7 Roadmap (brief)

| Fas | Fokus                                                 |
| --- | ----------------------------------------------------- |
| P0  | Next step · saknar formulär/avtal · redo · bildreview |
| P1  | Mail · worklists · kalender flags                     |
| P2  | AI-förklaring · advanced scheduling                   |

## A.8 Första UI-step (brief)

Smart Next Step panel i dossier **eller** worklist chips Saknar formulär/Avtal/Journal.

---

# DEL B — Cursor (kod + P1.2)

## B.1 Redan i UI

| Element                         | Status      |
| ------------------------------- | ----------- |
| `nextStep` text i dossier       | PARTIAL     |
| segmentStats chips              | DONE        |
| Dossier action bar + legend     | DONE (P1.2) |
| Mina / owner                    | DONE (P1.2) |
| Photo `?focusPatientId=`        | PARTIAL     |
| Disabled + `data-kunder-status` | DONE        |

## B.2 Första UI-build (Cursor)

**Smart Next Step panel** i `openDossier()` — desktop + mobil.

- Placering: efter stats, före bokning
- Data: `automationSignals[]` från shell (`includeAutomation=1`)
- Sortering: legal_blocker → blocker → needs_review → ready → info
- `next` kopplar till `cco-kunder-actions` när real/partial

### Risk → CSS

| riskLevel     | Klass                     |
| ------------- | ------------------------- |
| legal_blocker | `dossier-signal--legal`   |
| blocker       | `dossier-signal--blocker` |
| needs_review  | `dossier-signal--review`  |
| ready         | `dossier-signal--ready`   |
| info          | `dossier-signal--info`    |

## B.3 Medvetet ej nu

- Ny `/worklists.html`
- AI-chatt i dossier
- Voice/watch (borttaget P0)

---

# DEL C — Gemensam produktvision

Personal ska se **vad · varför · nästa** på en skärm — Kunder som **vardagsarbetsyta**, med automation under huven (dry-run först).

## C.1 Utökade What/Why/Next-exempel (gemensam)

| What                   | Why                                 | Next                      |
| ---------------------- | ----------------------------------- | ------------------------- |
| Bokning utan encounter | Kommande bokning saknar encounterId | Granska bokning (GO)      |
| Redo för besök         | Form + bokning inom fönster         | Kalender `?patientId=`    |
| Mail obesvarat         | true_unanswered (mailbox truth)     | Svarstudio                |
| Granska identitet      | needs_review                        | Identitet-vyn             |
| Saknar avtal           | Behandlingsavtal ej bookable        | Avtal (disabled tills GO) |

## C.2 Framgångsmått (när UI byggs)

- Time-to-first-action < 10 s
- 0 false “ready”
- 0 disabled utan reason (gate P1.2)

## C.3 Enig första leverans

1. **Backend:** Registry + dry-run (se arkitektur)
2. **UI:** Smart panel i dossier
3. **Senare:** rad-badge + worklist chips (segmentStats finns)

---

## Referenser

- [CCO-SMART-FUNCTIONS-CHATGPT-UX-BRIEF-2026-06-03.md](./CCO-SMART-FUNCTIONS-CHATGPT-UX-BRIEF-2026-06-03.md)
- [CCO-SMART-FUNCTIONS-CURSOR-UX-NOTES-2026-06-03.md](./CCO-SMART-FUNCTIONS-CURSOR-UX-NOTES-2026-06-03.md)
- Mockups: CCO-Kunder v9/v10 · Kalender v6/v8 (design; inte mock counts i prod)

---

_2026-06-03 · Gemensam master + separata källfiler._
