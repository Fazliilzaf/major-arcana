# QA — När owner säger APPLY AISIA TO CCO

**Trigger:** Owner uttryckligen säger **`APPLY AISIA TO CCO`**  
**Ej samma som:** `START AISIA FAS 2` (export/API/kamera)  
**Före denna QA:** Rumstest (Fas A) ska vara genomfört enligt [`AISIA-ROOM-TEST-FLOW`](./AISIA-ROOM-TEST-FLOW-2026-05-30.md)

---

## Syfte

Aktivera **FAS 1 MVP** i målmiljö (dev/staging först, prod endast efter owner) och bevisa att modulen fungerar — utan FAS 2+ och utan extern AI.

---

## Steg 0 — Aktivering (IT/owner)

```bash
# .env / Render
ENABLE_AISIA_SCALP_ANALYSIS=true
```

1. Starta om CCO-server
2. Bekräfta logg: `[cco-scalp-analysis] monterad: ... (ENABLE_AISIA_SCALP_ANALYSIS=true)`
3. Bekräfta preview inject: `window.__ARCANA_ENABLE_AISIA_SCALP_ANALYSIS__ === true`

**Rollback:** sätt till `false` + omstart → API 404, flik dold.

---

## Steg 1 — Automatisk verify (obligatorisk)

```bash
npm run check:syntax
node --test tests/ops/aisiaTerminology.test.js \
             tests/ops/ccoScalpAnalysisStore.test.js \
             tests/routes/ccoScalpAnalysis.test.js
npm run verify:aisia-cco-integration
```

| Test               | Förväntat           |
| ------------------ | ------------------- |
| Syntax             | PASS                |
| Unit (7)           | 7/7 PASS            |
| Integration verify | `overallPass: true` |

---

## Steg 2 — API-spärr sanity (flag on)

| Anrop                                                                 | Förväntat |
| --------------------------------------------------------------------- | --------- |
| `GET /api/v1/cco/scalp-analysis/meta/enums` + `x-cco-role: operator`  | 200       |
| `GET /api/v1/cco/scalp-analysis/patient/test` + `x-cco-role: revisor` | 403       |

---

## Steg 3 — UI QA (staging/dev, testpatient)

Använd **anonymiserad testdata** eller sandbox-patient — **inte** riktiga patientbilder i GitHub.

| #   | Kontroll                                             | PASS |
| --- | ---------------------------------------------------- | :--: |
| 1   | Flik **Hår-/scalpanalys** syns (desktop)             |  ☐   |
| 2   | Flik **Scalpanalys** syns (mobil ≤1023px)            |  ☐   |
| 3   | Skapa session (`consultation`)                       |  ☐   |
| 4   | Importera anonym PDF → `aisia_report`                |  ☐   |
| 5   | Importera anonym bild → `photo_before`               |  ☐   |
| 6   | Lägg till metric `total_hair_count` → svensk etikett |  ☐   |
| 7   | **Verifiera** session (behandlare-roll)              |  ☐   |
| 8   | Patientvy visar disclaimer                           |  ☐   |
| 9   | Pre-op callout laddar `protocol-status`              |  ☐   |
| 10  | Tidslinje: alla 5 scalp-event-typer                  |  ☐   |
| 11  | Journal/Filer/Övriga flikar opåverkade               |  ☐   |
| 12  | Ingen Drive-länk som fildestination                  |  ☐   |

**Operativ guide:** [`AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md`](./AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md)

---

## Steg 4 — Behandlarverifiering QA

Behandlare ska bekräfta:

| Punkt                                            | PASS |
| ------------------------------------------------ | :--: |
| PDF i storage matchar uppladdad fil (oförändrad) |  ☐   |
| Bilder kopplade till rätt patientId              |  ☐   |
| Metrics stämmer mot Aisia-rapport (manuellt)     |  ☐   |
| Ingen auto-diagnos i UI                          |  ☐   |
| Verify-knapp kräver `scalp.verify`               |  ☐   |
| Personal-roll kan **inte** verify (403)          |  ☐   |

---

## Steg 5 — Compliance QA

| Regel                                 | PASS |
| ------------------------------------- | :--: |
| Ingen extern AI-anrop på scalp-data   |  ☐   |
| Audit utan rå binärdata               |  ☐   |
| Inga patientfiler committade till git |  ☐   |
| Original-PDF bytes oförändrade        |  ☐   |
| Svensk vy = CCO-lager ovanpå original |  ☐   |

---

## Steg 6 — Prod (endast efter staging PASS + owner)

1. Sätt `ENABLE_AISIA_SCALP_ANALYSIS=true` på Render **endast** efter steg 1–5 gröna på staging
2. Kör `npm run verify:aisia-cco-integration` mot prod URL om script stödjer det
3. Pilot enligt runbook med **utvalda** behandlare
4. Övervaka: inga 500 på `/scalp-analysis/*`, inga fel i audit

**Prod-verify:** rapportera PASS/FAIL innan bred klinikanvändning (se `.cursor/rules/prod-verify-before-user.mdc`).

---

## Steg 7 — Sign-off

| Roll               | Godkänner APPLY QA | Datum |
| ------------------ | ------------------ | ----- |
| Owner              | ☐                  |       |
| Behandlare (pilot) | ☐                  |       |
| IT                 | ☐                  |       |

---

## Explicit INTE i denna QA

- Exportfolder / `aisiausa.umersoft.com:8864`
- USB/SDK/kamera direkt till CCO
- Egen klinisk AI
- Auto-OCR från PDF
- Bred prod-cutover utan staging

**För det:** owner säger **`START AISIA FAS 2`**

---

## Referenser

| Dokument                                                                                                 |                          |
| -------------------------------------------------------------------------------------------------------- | ------------------------ |
| [`AISIA-CCO-INTEGRATION-VERIFICATION-2026-05-30.md`](./AISIA-CCO-INTEGRATION-VERIFICATION-2026-05-30.md) | Senaste integration PASS |
| [`AISIA-MVP-HANDOFF-2026-05-30.md`](./AISIA-MVP-HANDOFF-2026-05-30.md)                                   | Flag, endpoints, filer   |
| [`AISIA-COMPLIANCE-SECURITY-CHECKLIST.md`](./AISIA-COMPLIANCE-SECURITY-CHECKLIST.md)                     | Compliance               |

---

_source: AISIA-CCO-INTEGRATION-VERIFICATION (befintlig) · new — APPLY QA-checklista_
