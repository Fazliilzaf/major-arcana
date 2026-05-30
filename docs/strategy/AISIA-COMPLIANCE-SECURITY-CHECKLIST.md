# Aisia / Scalp Analysis — Compliance & Security Checklist

**Modul:** Hair TP Imaging & Scalp Analysis  
**Datum:** 2026-05-30  
**MVP status:** Implementerad kontroll där markerad ✅

---

## Data storage

| Krav                               | MVP | Notering                             |
| ---------------------------------- | --- | ------------------------------------ |
| Patientbilder i CCO secure storage | ✅  | `ccoSecureStorageProvider`           |
| Aisia PDF oförändrad               | ✅  | Checksum vid import                  |
| Ingen Drive-länk som slutlösning   | ✅  | `cco-no-drive-links-import-only.mdc` |
| Inga patientdata i GitHub          | ✅  | `data/` gitignored                   |
| 10-års retention (PDL)             | ✅  | Same as journal assets               |

## AI & kliniska beslut

| Krav                                              | MVP | Notering                         |
| ------------------------------------------------- | --- | -------------------------------- |
| Ingen extern AI på bilder/journal                 | ✅  | Ingen OpenAI-call i scalp module |
| Aisia AI = beslutsstöd, ej kliniskt beslut        | ✅  | Verify required                  |
| Ingen auto-diagnos i patientvy                    | ✅  | Disclaimer + SV summary only     |
| Regulatory review before clinical recommendations | ☐   | FAS 4 gate                       |

## Access control

| Krav                                        | MVP | Notering                  |
| ------------------------------------------- | --- | ------------------------- |
| RBAC scalp.read / write / verify            | ✅  | `ccoRbac.js`              |
| Audit all read/write/verify                 | ✅  | Store audit + ccoAuditLog |
| Spara operatorId, date, zone, magnification | ✅  | Session + image records   |
| IMY RBAC per arbetsuppgift                  | ✅  | Role-based permissions    |

## Verifiering

| Krav                             | MVP | Notering                   |
| -------------------------------- | --- | -------------------------- |
| Behandlare kan verifiera         | ✅  | POST verify                |
| Behandlare kan korrigera metrics | ✅  | Manual metrics + re-verify |
| Svensk översättning = CCO-lager  | ✅  | `aisiaTerminology.js`      |
| Originaldata bevaras             | ✅  | metrics.value unchanged    |

## Import safety

| Krav                            | MVP     | Notering                        |
| ------------------------------- | ------- | ------------------------------- |
| SHA-256 checksum                | ✅      | Via secure storage              |
| Idempotent re-import            | Partial | Same checksum → DUPLICATE asset |
| No auto-link uncertain patients | ✅      | patientId required on create    |

## FAS 2/3/4 gates (not in MVP)

| Item                          | Gate                   |
| ----------------------------- | ---------------------- |
| Export-folder auto-import     | Owner confirmation     |
| USB camera direct control     | Owner + license review |
| CCO native AI recommendations | Legal review           |

---

_Verifiering: `npm run smoke:scalp-analysis` + unit tests_
