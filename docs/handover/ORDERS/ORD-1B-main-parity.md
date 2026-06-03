# ORDER #1B · main parity: ORD-1 cherry-pick

**Created:** 2026-05-20
**Assignee:** cursor
**Priority:** P0
**Status:** done
**Blocks:** ORD-3 deploy until this is green

---

## Uppdrag

Cherry-pick `7bca8362` → `main` så auto-deploy (`render.yaml` branch `main`) matchar prod-policy (2d betänketid) och rollback-risk stängs.

## Utfört

| Steg                                           | Resultat                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Cherry-pick `7bca8362`                         | `3ee65355` på `main`                                                                              |
| Konflikter                                     | Kunder-yta filer **ej** återinförda på main (saknas där); kärna policy + config + verify behållen |
| `npm run cco:verify-kundresa-canonical-9-step` | **PASS**                                                                                          |
| Unit tests (cooling + offer)                   | **PASS**                                                                                          |

## Ej på main (medvetet)

- `public/kunder.html`, `cco-kunder-real.js`, `run-real-cco-gate.sh` — finns på `compliance/pipedrive-pii-purge`, inte på `main`

## Nästa

ORD-3 backend deploy efter push `main` + ORD-3 commit.

---

_Arcana Handover Protocol · 2026-05-20_
