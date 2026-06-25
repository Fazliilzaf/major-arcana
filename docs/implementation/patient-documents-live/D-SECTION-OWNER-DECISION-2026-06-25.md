# Sektion D — owner-beslut · utökade Meridiq-samtycken

**Datum:** 2026-06-25  
**Status:** GODKÄNT (agent-facit enligt pre-workshop rekommendationer)  
**Scope:** 6 grupper utanför 36-katalogen · [`patient-document-d-section-registry.json`](./patient-document-d-section-registry.json)

## TL;DR

| #   | Grupp                        | Val   | CCO-live nu? | Gate                                 |
| --- | ---------------------------- | ----- | ------------ | ------------------------------------ |
| 1   | Hyalase SWE                  | **B** | Nej          | bundle-only · post Hair TP           |
| 2   | Botulinum SWE/ENG            | **B** | Nej          | bundle-only · brand-gate vid promote |
| 3   | Fillers SWE/ENG              | **B** | Nej          | Meridiq-modal · Curatiio efter legal |
| 4   | Peeling / IPL / Plasma       | **A** | Nej          | DEFER · Meridiq-arkiv                |
| 5   | Ortoped PRP/PRF              | **B** | Nej          | paus tills Nordbro-PDF               |
| 6   | Avtal Botox/Fillers/Ögonlock | **C** | Nej          | legal review före registry           |

**Hair TP cutover:** **INTE blockerad** — inga nya rader i 36-katalogen krävs för steg 3–9.

## Beslut per grupp

### 1 · Hyalase — val **B**

Behåll Meridiq/bundle utan egen `hyalase_info` live-route. Aktivera registry + demo först om behandling blir aktivt erbjudande.

### 2 · Botulinum — val **B**

Behåll `botulinum_info` som supplementary bundle (152988/152981). Promote till katalog (IMPLEMENTATION A16) först vid aktiv Hair TP-estetik eller Curatiio brand-gate.

### 3 · Fillers — val **B**

Curatiio-only. Endast Meridiq-modal/read-only tills avtal 170950 har Nordbro-PDF facit. Ingen `fillers_info` / `offert_fillers` live förrän legal import.

### 4 · Peeling / IPL / Plasma — val **A**

DEFER — ej aktivt på Hair TP idag. Meridiq-arkiv behålls; ingen CCO-live eller ny registry.

### 5 · Ortoped PRP/PRF — val **B**

Paus Curatiio cutover för ortopedi tills Nordbro/Insatt-PDF importerad (tom letterText på info + avtal 170941–170943).

### 6 · Curatiio-estetik-avtal — val **C**

Legal review först. Ingen ny registryId (`offert_botox` / `offert_fillers` / `offert_bleph`) förrän signerade PDF-facit finns.

## Efter beslut (implementerat)

- `patient-document-d-section-registry.json` — alla 6 grupper `ownerDecision: APPROVED`
- `workshopStatus: SIGNED_OFF` · `pendingOwnerDecisions: 0`
- BOOKOFF sektion D — workshop-kolumn uppdaterad (U/T/D/L/V fortfarande `[ ]` — ingen CCO-live)

## Referenser

- [`D-SECTION-OWNER-WORKSHOP-AGENDA-2026-06-25.md`](./D-SECTION-OWNER-WORKSHOP-AGENDA-2026-06-25.md)
- [`D-SECTION-OWNER-WORKSHOP-RECORD-2026-06-25.md`](./D-SECTION-OWNER-WORKSHOP-RECORD-2026-06-25.md)
- `migration/meridiq/consent-catalog.json`

_source: new (owner-beslut sektion D)_
