# E6 — Legal diff-mall (Word ↔ bundle ↔ demo)

**Skapad:** 2026-06-25  
**Scope batch 1:** offert A4–A9 + samtycken A10–A11  
**Kör:** `npm run diff:patient-doc-e6-offert-samtycke`

## Triad

| Källa      | Roll                                                                            |
| ---------- | ------------------------------------------------------------------------------- |
| **Word**   | Nordbro avtal + offert `.docx` (MS-LOKAL)                                       |
| **Bundle** | `hairtp-document-content-bundle.json` (`agreementText` / `letterText` / blocks) |
| **Demo**   | `steg5/7-offert-*` eller `steg6-betanketid-samtycke-final-demo.html`            |

## Statusvärden

| Status                | Betydelse                                          | BOOKOFF T |
| --------------------- | -------------------------------------------------- | --------- |
| `E6_OK`               | demo↔bundle ≥85 % ankare **och** word↔bundle ≥70 % | `[x]`     |
| `DEMO_BUNDLE_OK`      | demo↔bundle OK, word under tröskel                 | `[~]`     |
| `VERSION_CONFLICT_OK` | känd MQ/registry-konflikt men demo↔bundle OK       | `[~]`     |
| `NEEDS_REVIEW`        | demo saknar bundle-ankare                          | `[ ]`     |

## Ankare (exempel)

- **Avtal/offert:** Giltighetstid, Betalningsvillkor, Av- och ombokning, Ångerrätt, Distansavtalslagen, Information & samtycke, Göteborgs tingsrätt
- **Samtycke bokning:** distansavtalslagen, ångerrätt, contact@hairtpclinic.com, 20 %
- **Samtycke ångerrätt:** distansavtal, 14 dagar, ångerfristen, Hair TP Clinic AB

## Rapporter

- `docs/implementation/patient-documents-live/diffs/E6-OFFERT-SAMTYCKE-YYYY-MM-DD.{json,md}`
- Ingår i `npm run diff:patient-doc-t-column`

## Nästa batch (ej i scope)

- HD/FC Word legal (T redan PARITY_OK via MQ)
- Journal T B16–B21 (MQ-fältparitet)

---

## Batch 2 (2026-06-25)

**Scope:** `ordination_tp` (B24) + `auto_instruktion_formular` (C31)  
**Kör:** `npm run diff:patient-doc-e6-batch2`

| registryId                  | Triad                                | Word-källa                                 | Anteckning                                                                      |
| --------------------------- | ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------- |
| `ordination_tp`             | stub demo↔bundle + klinisk Word↔demo | `ordination-lokalbedovning-tp.docx`        | Carbocain (demo) vs Xylocain (Word) — drift noterad, E6_OK på gemensamma ankare |
| `auto_instruktion_formular` | demo↔bundle                          | Underbilaga 1 lokalt = **DPA** (fel scope) | HD/FC-instruktion = `ccoPatientOutreach` / bundle                               |

**Rapporter:** `diffs/E6-BATCH2-YYYY-MM-DD.{json,md}`

## A10 owner-beslut (2026-06-25)

Se [`A10-OWNER-DECISION-2026-06-25.md`](./A10-OWNER-DECISION-2026-06-25.md). Samtycke A10 följer Meridiq **14 dagar**; `registryId` `_2d` behålls. E6 använder Meridiq-text som word-facit för samtycken.

---

## Batch 3 — foto / ORD-24 facit (2026-06-25)

**Scope:** `foto_samtycke` (A15)  
**Kör:** `npm run diff:patient-doc-e6-batch3`

| registryId      | Triad                   | Facit-källa                                                                              | Anteckning                                                                                       |
| --------------- | ----------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `foto_samtycke` | demo ↔ bundle ↔ journey | [`ORD-24-FOTO-SAMTYCKE-FACIT-2026-06-25.md`](./ORD-24-FOTO-SAMTYCKE-FACIT-2026-06-25.md) | Scope steg 9 — **ej** full Nordbro publish-body. ORD-24 **backend** fortfarande separat PENDING. |

**Rapporter:** `diffs/E6-BATCH3-YYYY-MM-DD.{json,md}`
