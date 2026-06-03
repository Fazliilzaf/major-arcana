# ORDER #2 · Status-update efter ORD-1 deploy

**Created:** 2026-06-03
**Assignee:** claude (repo: Cursor 2026-06-03)
**Priority:** P1
**Status:** awaiting-fazli
**Blocked by:** ~~ORD-1~~ ✅ done (`7bca8362`, `dep-d8g88geq1p3s739aojvg`)
**Notion:** https://app.notion.com/p/374060ccc15b81698073e38868195ace

---

## Uppdrag

Efter ORD-1: uppdatera docs så inget längre listar 14→2 som aktiv P0.

---

## Cursor-rapport (repo, 2026-06-03)

### ORD-1 förkrav ✅

| Krav                                   | Status                          |
| -------------------------------------- | ------------------------------- |
| Deploy                                 | `dep-d8g88geq1p3s739aojvg` live |
| Commit                                 | `7bca8362`                      |
| `cco:verify-kundresa-canonical-9-step` | PASS                            |
| `cco:real-cco-gate`                    | PASS (post-deploy)              |

### Verifierat mot prod-kod (`7bca8362`)

| Check                                                 | Resultat                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `HAIR_TP_COOLING_OFF_DAYS = 2`                        | ✅ `ccoHairTpCoolingOffPolicy.js`                                                  |
| Inga aktiva `coolingOffDays: 14` i `src/`             | ✅                                                                                 |
| `missing_health_declaration` (segment + readout-fält) | ✅ `ccoKunderEnrichment` + Kunder UI                                               |
| `ready_for_treatment` i readout/API                   | ⏳ **nej** — readout har fortfarande `readyForVisit` (registry-namn endast i docs) |

### Docs ändrade (denna körning)

- `docs/strategy/CCO-SMART-NEXT-STEP-UX-SPEC-V2-9-STEG-2026-06-03.md` — Bilaga C tillagd
- `docs/strategy/CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md` — 2d live, ej gap
- Denna ORD-2-fil i `docs/handover/ORDERS/`

### Stale P0 borttaget / uppdaterat

- UX-spec: “Kräver Cursor-kodfix” — 2d/betänketid **flyttad till DONE** (ORD-1)
- Registry readiness: cooling_off rad — **2d i prod**, inte “14d gap”

### UX-spec V2 matchar prod-kod

**Ja** för betänketid 2d, 9-stegs copy, `missing_health_declaration`, förbjuden copy-lista.  
**Delvis** för `ready_for_treatment` (namn i spec/registry, inte i `buildKunderReadout` än).

### Remaining (oförändrat P1+)

- `legal_review` i agreement store
- Bundle-sign avtal + behandlingssamtycke
- Ops-dags friskförsäkran-gate i runner/UI
- Foto-samtycke hårlinje/krona vid capture
- `cooling_off_passed` / `cooling_off_active` i readout (kräver agreement i evaluate)
- Automation Registry dry-run (väntar GO)
- Rename `readyForVisit` → `ready_for_treatment` i readout (egen order)

### Ej gjort (Claude / Notion — utanför Cursor)

- `memory: project_hairtp_kundresa_korrigerad_2026_06.md`
- Notion: Gemensam v2 · Kundresa · ChatGPT · Claude vision

---

## Färdig när

- [x] Repo-docs matchar prod för ORD-1-scope
- [x] Stale P0 (14→2-fix) borttagen i strategy-docs
- [x] Remaining-lista i Bilaga C
- [ ] Notion-pages (Claude/Fazli)
- [ ] Notion status `done`

---

_Arcana Handover Protocol · ORD-2_
