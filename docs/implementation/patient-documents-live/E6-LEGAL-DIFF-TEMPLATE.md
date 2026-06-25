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
- ordination, underbilaga, foto ORD-24
