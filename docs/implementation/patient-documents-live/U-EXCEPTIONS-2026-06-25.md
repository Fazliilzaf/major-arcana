# U-kolumn — medvetna undantag (36/36)

**Datum:** 2026-06-25  
**Status:** GODKÄNT — BOOKOFF U `[x]` för båda

## Undantag

| registryId             | U-status             | Motivering                                                                                   |
| ---------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `health_tp_eng`        | **MQ_FACIT**         | Ingen SharePoint ENG Word/PDF — Meridiq 14865 + bundle + `diff:patient-doc-hd-eng` PARITY_OK |
| `auto_medical_finance` | **EXTERNAL_WRAPPER** | Medical Finance har inget Arcana-API — extern finansiering, manuell process i patientkort    |

## Verify

- `health_tp_eng`: `npm run diff:patient-doc-hd-eng` · U-pass registry `uPassRequired: false`
- `auto_medical_finance`: bundle `mode: external_financing` · U-pass registry `uPassRequired: false`

**36-katalog U:** 34 U-pass verify + **2 medvetna undantag** = **36/36**

_source: new (U undantag facit)_
