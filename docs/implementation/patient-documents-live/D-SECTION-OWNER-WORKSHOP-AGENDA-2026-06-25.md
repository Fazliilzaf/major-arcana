# Sektion D — Owner-workshop · agenda (45 min)

**Datum:** 2026-06-25  
**Deltagare:** Owner + ev. juridik (Curatiio-grupper)  
**Facit:** [`patient-document-d-section-registry.json`](./patient-document-d-section-registry.json)  
**Blockerar Hair TP cutover:** **NEJ**

## Syfte

Besluta registry-mapping för 6 Meridiq-samtycken utanför 36-katalogen. Alla beslut är **post Hair TP** eller **Curatiio-only** — inget stoppar steg 3–9 cutover idag.

## Förberedelse (5 min)

1. Öppna [`D-SECTION-OWNER-WORKSHOP-REGISTRY-MAPPING-2026-06-25.md`](./D-SECTION-OWNER-WORKSHOP-REGISTRY-MAPPING-2026-06-25.md)
2. Kör `npm run verify:patient-doc-d-section-registry` — ska vara PASS
3. Ha [`D-SECTION-OWNER-WORKSHOP-RECORD-2026-06-25.md`](./D-SECTION-OWNER-WORKSHOP-RECORD-2026-06-25.md) redo för sign-off

## Tidsplan

| Min | Grupp                            | Fråga                                          | Pre-rekommendation                |
| --- | -------------------------------- | ---------------------------------------------- | --------------------------------- |
| 5   | Hyalase SWE                      | Egen `hyalase_info` eller bundle-only?         | **B** — bundle-only               |
| 8   | Botulinum SWE/ENG                | Promote `botulinum_info` till katalog?         | **B** — bundle-only + brand-gate  |
| 8   | Fillers SWE/ENG                  | Curatiio-flöde + avtal 170950?                 | **B** — Meridiq-modal tills legal |
| 7   | Peeling / IPL / Plasma           | Aktivt på Hair TP? Per behandling eller DEFER? | **A** — DEFER                     |
| 8   | Ortoped PRP/PRF                  | Curatiio cutover eller paus?                   | **B** — paus tills Nordbro-PDF    |
| 9   | Avtal Botox / Fillers / Ögonlock | Separata registryId eller legal först?         | **C** — legal review först        |

## Beslutsregler

- **Hair TP cutover:** inget beslut här får kräva ny rad i 36-katalogen före owner explicit godkänner IMPLEMENTATION A16+
- **Curatiio:** brand-isolation — inga Hair TP-routes för Curatiio-only docs
- **Tom letterText (19/39 avtal):** inget LIVE i CCO förrän Nordbro/Insatt-PDF importerad
- **Efter workshop:** uppdatera `ownerDecision` i registry → `APPROVED` + valt alternativ (A/B/C)

## Sign-off

Fyll i [`D-SECTION-OWNER-WORKSHOP-RECORD-2026-06-25.md`](./D-SECTION-OWNER-WORKSHOP-RECORD-2026-06-25.md) och kör:

```bash
npm run build:patient-doc-d-section-registry
npm run verify:patient-doc-d-section-registry
```

_source: new (owner-workshop agenda)_
