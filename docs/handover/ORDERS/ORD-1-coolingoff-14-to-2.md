# ORDER #1 · P0 kod-fix: coolingOffDays 14 → 2

**Created:** 2026-06-03
**Assignee:** cursor
**Priority:** P0
**Status:** awaiting-fazli
**Notion:** https://app.notion.com/p/374060ccc15b816498e3f88ef36ba039

---

## Uppdrag

Klinik-policy: **2 dagars** betänketid. Centralisera i policy-modul; inga spridda `14` i aktiv offer/agreement-kod.

---

## Cursor-rapport (2026-06-03)

### Filer ändrade (kärna ORD-1)

| Fil                                               | Ändring                                                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/ops/ccoHairTpCoolingOffPolicy.js`            | **Ny** — `HAIR_TP_COOLING_OFF_DAYS = 2`, env `CCO_HAIR_TP_COOLING_OFF_DAYS` |
| `src/ops/ccoOfferTemplateStore.js`                | 14 mallar → `COOLING` (2)                                                   |
| `src/ops/ccoTreatmentAgreementStore.js`           | Importerar policy                                                           |
| `src/ops/ccoOfferEsign.js`                        | Importerar policy                                                           |
| `config/cco-treatment-document-requirements.json` | fue/dhi `coolingOffDays: 2`; FF `operation_day`                             |
| `scripts/verify-kundresa-canonical-9-step.js`     | **Ny** gate                                                                 |
| `package.json`                                    | `cco:verify-kundresa-canonical-9-step`                                      |
| `scripts/run-real-cco-gate.sh`                    | kör verify i gate                                                           |
| `tests/ops/ccoHairTpCoolingOffPolicy.test.js`     | **Ny**                                                                      |
| `tests/ops/ccoOfferEsign.test.js`                 | 2d-tester                                                                   |

Relaterat P0 (samma session): kundresa-9-steg docs, segment `missing_health_declaration`, `ccoKunderEnrichment` + Kunder UI-copy.

### 14→2-fynd (eliminerade i aktiv kod)

- `ccoOfferTemplateStore.js` — 14× `coolingOffDays: 14`
- `ccoTreatmentAgreementStore.js` — `DEFAULT_COOLING_OFF_DAYS = 14`
- `ccoOfferEsign.js` — `DEFAULT_COOLING_OFF_DAYS = 14`
- `config` fue/dhi — `coolingOffDays: 14`

### Central konstant

`src/ops/ccoHairTpCoolingOffPolicy.js` → `HAIR_TP_COOLING_OFF_DAYS` (default **2**)

### Legacy-policy

|                                        |                                                                  |
| -------------------------------------- | ---------------------------------------------------------------- |
| Nya offerter/avtal                     | 2d via policy                                                    |
| Signerade/arkiverade                   | Orörd                                                            |
| Poster med sparad `coolingOffDays: 14` | `resolveHairTpCoolingOffDays(14)` behåller 14 tills owner-review |

### Verify + gates

| Gate                                           | Resultat              |
| ---------------------------------------------- | --------------------- |
| `npm run cco:verify-kundresa-canonical-9-step` | **PASS**              |
| `npm run cco:verify-kunder-real-data`          | **PASS**              |
| `npm run cco:real-cco-gate`                    | **PASS** (pre-deploy) |
| Unit tests (cooling + offer)                   | **PASS**              |

### Nästa beslut (Fazli)

- [ ] **Deploy** till prod (commit på branch — push/deploy ej körd av Cursor om ej konfigurerat)
- [ ] Bekräfta Notion-status `done`
- [ ] Kör `cco:real-cco-gate` efter deploy

---

## Färdig när

- [x] 14d eliminerat från aktiv kod
- [x] Central konstant införd
- [x] Legacy-policy dokumenterad (`CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`)
- [x] Verify-script finns + grön
- [x] `cco:real-cco-gate` grön (pre-deploy)
- [ ] Deploy prod
- [ ] Notion `done`
