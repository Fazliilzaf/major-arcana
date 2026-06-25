# SharePoint Nordbro/Insatt re-sync · 2026-06-25

## Owner-bekräftelse

| Kontroll                                        | Resultat     |
| ----------------------------------------------- | ------------ |
| Facit-set = 97. Versioner från advokat + Insatt | **JA**       |
| Inga nyare juridiska versioner utanför          | **JA**       |
| Graph-läge                                      | `live_graph` |

**Regel:** 251203\_\* i 97. Versioner från advokat > Insatt TP Avtal (SKIP_OLD) > interna 2026/99. Kundresan avtal

### Superseded utanför facit (ej blockerare)

- `Behandlingsavtal - Hårtransplantationer.docx` — INTERN_2026_ARBETSKOPIA → agreement_hair_tp_dhi_2day_nordbro
- `Behandlingsavtal - FUE Nuvarande.docx` — SKIP_OLD → agreement_hair_tp_dhi_2day_nordbro
- `Avtal - Hårtransplantation med DHI-metoden 2.0.docx` — SKIP_OLD → agreement_hair_tp_dhi_2day_nordbro
- `3. FUE Avtal.pdf` — SKIP_OLD → agreement_hair_tp_dhi_2day_nordbro
- `TP Avtal.docx` — INSATT_SKIP_OLD → agreement_hair_tp_dhi_2day_nordbro
- `251030_KLARSPRÅK Patientinformation & Tjänstespecifikation – Hårtransplantation med DHI-tekniken, med kommentarer.docx` — NORDBRO_LEGACY_251030 → agreement_hair_tp_dhi_2day_nordbro

## Legal diff per mall (E6-mönster)

| templateId                           | source             | legalReviewStatus | sync                | legal status      |
| ------------------------------------ | ------------------ | ----------------- | ------------------- | ----------------- |
| `agreement_hair_tp_dhi_2day_nordbro` | sharepoint_nordbro | nordbro_approved  | local_existing      | **E6_OK**         |
| `agreement_hair_tp_dhi_7day_nordbro` | sharepoint_nordbro | nordbro_approved  | live_graph          | **DEPRECATED_OK** |
| `agreement_hair_tp_prp_nordbro`      | sharepoint_nordbro | nordbro_approved  | live_graph          | **E6_OK**         |
| `agreement_hair_tp_fue_insatt`       | sharepoint_insatt  | insatt_approved   | local_word_fallback | **SKIP_NO_FACIT** |

## Metadata

- `--apply-metadata`: **KÖRD**
- consent-catalog uppdaterade: 4
- facit JSON uppdaterade: 2
- facit-set docs uppdaterade: 4

**Overall:** **RESYNC_PASS**

---

`npm run resync:sharepoint-nordbro-facit` · mönster: SHAREPOINT-IMPORT-REPORT-2026-05-30 + E6-LEGAL-DIFF-TEMPLATE.md
