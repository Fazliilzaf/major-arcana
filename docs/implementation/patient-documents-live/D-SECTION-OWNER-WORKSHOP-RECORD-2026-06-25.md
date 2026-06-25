# Sektion D — Owner-workshop · beslutsprotokoll

**Workshop-datum:** ******\_\_\_******  
**Owner:** ******\_\_\_******  
**Status:** PENDING_SIGNOFF

## Beslut per grupp

| #   | Grupp                                       | Val (A/B/C) | Godkänd registryId (om ny) | Cutover-fas                   | Sign-off |
| --- | ------------------------------------------- | ----------- | -------------------------- | ----------------------------- | -------- |
| 1   | Hyalase SWE                                 |             |                            | post_hair_tp_optional         | [ ]      |
| 2   | Botulinumtoxin SWE/ENG                      |             |                            | post_hair_tp_optional         | [ ]      |
| 3   | Fillers SWE (+ ENG)                         |             |                            | curatiio_only                 | [ ]      |
| 4   | Kemisk peeling / IPL / Plasma Pen           |             |                            | post_hair_tp_optional / DEFER | [ ]      |
| 5   | Ortopedisk PRP/PRF (+ HA)                   |             |                            | curatiio_only                 | [ ]      |
| 6   | Behandlingsavtal Botox / Fillers / Ögonlock |             |                            | curatiio_only                 | [ ]      |

## Pre-workshop rekommendationer (CCO-agent)

| Grupp              | Rekommenderat | Motivering                        |
| ------------------ | ------------- | --------------------------------- |
| Hyalase            | **B**         | Bundle-only tills estetik-cutover |
| Botulinum          | **B**         | Bundle-only + brand-gate          |
| Fillers            | **B**         | Meridiq-modal tills legal PDF     |
| Peeling/IPL/Plasma | **A**         | DEFER — ej aktivt på Hair TP      |
| Ortopedi           | **B**         | Paus tills Nordbro-PDF            |
| Curatiio-avtal     | **C**         | Legal review före registry        |

## Efter sign-off

1. Sätt `ownerDecision: APPROVED` + `ownerSelectedOption` i `patient-document-d-section-registry.json` per grupp
2. `npm run build:patient-doc-d-section-registry`
3. Uppdatera BOOKOFF sektion D `[x]` endast för grupper som får CCO-live

## Referenser

- Mapping: [`D-SECTION-OWNER-WORKSHOP-REGISTRY-MAPPING-2026-06-25.md`](./D-SECTION-OWNER-WORKSHOP-REGISTRY-MAPPING-2026-06-25.md)
- Agenda: [`D-SECTION-OWNER-WORKSHOP-AGENDA-2026-06-25.md`](./D-SECTION-OWNER-WORKSHOP-AGENDA-2026-06-25.md)

_source: new (owner-workshop record template)_
