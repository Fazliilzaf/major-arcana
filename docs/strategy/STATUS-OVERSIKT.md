# Status & Backlog — Översikt

Senast strukturerad: 2026-06-24

> **Syfte:** *en* karta över var status, backlog och planer finns — så ingen letar
> i 180+ filer. Den här filen **äger inget innehåll**; den pekar till de
> kanoniska källorna och säger vilken som gäller.
>
> Framdörr för hela repot: [`ORGANISATION.md`](../../ORGANISATION.md)

---

## 1. Kanoniska drivrutiner (följ dagligen)

Detta är sanningen. Allt annat är detaljer eller historik.

| Prioritet | Fil | Vad | Senast |
|-----------|-----|-----|--------|
| 1 | [`PROJECT-CHECKLIST.md`](./PROJECT-CHECKLIST.md) | Samlad checklista att bocka av | 2026-05-24 |
| 2 | [`MASTER-TODO.md`](./MASTER-TODO.md) | Samlad faslista, alla punkter i ordning | 2026-05-28 |
| 3 | [`ROLLOUT-PLAN.md`](./ROLLOUT-PLAN.md) | Utrullning i 6 faser | — |
| — | [Notion — Master TODO](https://www.notion.so/6d5ae9dabf314678959270ba86a6cbf6) | Spegel av MASTER-TODO | extern |

> **Precedens:** `PROJECT-CHECKLIST` → `MASTER-TODO` → `ROLLOUT-PLAN`. Säger de
> emot varandra gäller den högre i listan, och avvikelsen ska rättas.

> ⚠️ **Att verifiera:** `MASTER-TODO` anger prod som `arcana.hairtpclinic.com`
> (med .se→.com 301), medan `PROJECT-CHECKLIST` anger `arcana.hairtpclinic.se`.
> Bekräfta vilken domän som är kanonisk och synka båda.

---

## 2. Live driftstatus (genererade, ej handredigerade)

JSON som skripten skriver — visar drift­läge just nu. **Redigera inte för hand**;
de skrivs om av respektive skript (`generatedAt`-stämpel finns i varje).

| Fil (`public/`) | Spårar |
|-----------------|--------|
| `cco-day1-operations-status.json` | Dag 1-drift: journalpilot, mounts, demo-länkar, E2E |
| `cco-mail-review-operator-status.json` | Mail-review-operatör: kö-läge, sid-/API-status |
| `cco-import-review-queue-status.json` | Import-review-kö |
| `cco-journalpilot-shift-status.json` | Journalpilot-skift |
| `cco-photo-review-operator-status.json` | Foto-review-operatör |
| `cco-operator-canary-status.json` | Operatör-canary (på/av + limits) |
| `cco-presentation-ops-status.json` | Presentations-drift |
| `mail-ambiguous-operational-status.json` | Tvetydig mail-enrichment |

Skript som producerar/verifierar dessa: `scripts/check-closure-status.js`,
`scripts/report-closure-status.js`, `scripts/run-journal-pilot-shift-status.js`,
`scripts/photo-review-batch-status.js`, `scripts/verify-graph-send-status-prod.js`,
`scripts/sync-notion-master-todo.mjs`.

---

## 3. Aktiva backlogs

| Fil | Område |
|-----|--------|
| [`handover/V12-FACIT-PARITY-BACKLOG-2026-06-23.md`](../handover/V12-FACIT-PARITY-BACKLOG-2026-06-23.md) | V12-workspace facit-parity (mest aktuell) |
| [`strategy/wiring-backlog.md`](./wiring-backlog.md) | Wiring/koppling kvar |
| [`strategy/ORD-16-COSMETIC-POLISH-BACKLOG-2026-06-04.md`](./ORD-16-COSMETIC-POLISH-BACKLOG-2026-06-04.md) | Kosmetisk polish |
| [`AUDIT-REMAINING-PLAN.md`](../AUDIT-REMAINING-PLAN.md) | Kvarvarande audit-punkter |

---

## 4. Index & ingångar (befintliga)

| Fil | Vad |
|-----|-----|
| [`major-arcana-index.md`](../major-arcana-index.md) | Hela dokument-indexet / läsordning |
| [`cco-active-index.md`](../cco-active-index.md) | Aktiva CCO-planeringsdokument |
| [`handover/CCO-CEO-VISION-FILES-2026-06-24.md`](../handover/CCO-CEO-VISION-FILES-2026-06-24.md) | CCO CEO Vision-inventering |
| [`CCO-STATUS.md`](../../CCO-STATUS.md) | CCO handover-status (rot) |

---

## 5. Historik & daterade ögonblicksbilder (läs, redigera ej)

`docs/strategy/` innehåller **183 filer** och `docs/ops/` flera daterade
status-snapshots (`status-2026-05-12.md`, `status-web-2026-05-*.md`,
`master-checklist-status-2026-02-26.md` m.fl.). De flesta är **daterade
ögonblicksbilder** — värdefulla som historik men **inte** sanningskälla.

**Regel:** vid behov av nuläge → §1. Daterade filer läses som historik, inte som
arbetslistor. Fryst material ligger i `docs/archives/`.

---

## Underhåll

- Ny status/backlog? Lägg den under rätt rubrik här så den inte försvinner.
- Den här filen ska bara växa med **pekare**, inte kopierat innehåll.
