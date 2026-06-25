# Nordbro/Insatt P1 — PRP facit diff · 2026-06-25

## Facit-set (owner)

- Canonical: **251203 PRP** (`251203-behandlingsavtal-prp.docx`)
- Meridiq bind: **170944** (PRP hud) + **170945** (PRP hår) — samma Nordbro-avtal
- Källa: `config/nordbro-insatt-facit-set.json`

## Nordbro-referens

- Mode: **sharepoint_import_fallback**
- Path: `data/cco-templates.json#meridiq_consent_behandlingsavtal_prp_hud_170944`
- Notering: Word saknas lokalt — jämför mot SharePoint-import (sharepoint_import_step3)

## Resultat

| Del               | Status                        | Text match | Ankare facit | Anteckning                      |
| ----------------- | ----------------------------- | ---------- | ------------ | ------------------------------- |
| PRP 170944/170945 | **E6_OK**                     | **JA**     | 9/9          | `agreement_hair_tp_prp_nordbro` |
| **Overall**       | **P1_PASS_WITH_BRAND_REVIEW** |            |              |                                 |

## Brand review

- **NEEDS_BRAND_REVIEW**: ångerrätt hänvisar contact@curatiio.com i Nordbro 251203 PRP — Hair TP avtal → legal_review_with_nordbro

## Metadata uppdaterad

- `migration/meridiq/prp-behandling-agreement-facit.json` — legalSource nordbro 251203
- `migration/meridiq/nordbro-p1-source-bindings.json` — 170944 + 170945
- `config/nordbro-insatt-facit-set.json` — p1Scope

## Nästa

- Ladda PRP Word lokalt: `npm run download:patient-doc-word-e4` (avtal_prp) eller symlink Juridik-GDPR
- Curatiio avtal — väntar Nordbro/Insatt PDF

---

`npm run diff:nordbro-p1`
