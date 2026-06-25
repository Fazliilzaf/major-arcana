# Sektion D — Owner-workshop · registry-mapping

**Genererad:** 2026-06-25T15:18:04.628Z
**Scope:** Meridiq-samtycken utanför 36-katalogen · [`BOOKOFF-CHECKLIST.md`](./BOOKOFF-CHECKLIST.md) sektion D
**Blockerar Hair TP cutover:** **NEJ** — alla 6 grupper är `hairTpCutoverBlocking: false`

## TL;DR för owner

| #   | Grupp                                       | Rekommendation                                   | Owner-beslut |
| --- | ------------------------------------------- | ------------------------------------------------ | ------------ |
| 1   | Hyalase SWE                                 | NEW_REGISTRY → `hyalase_info`                    | **PENDING**  |
| 2   | Botulinumtoxin SWE/ENG                      | PROMOTE_BUNDLE_ID → `botulinum_info`             | **PENDING**  |
| 3   | Fillers SWE (+ ENG)                         | NEW_REGISTRY_CURATII → `fillers_info`            | **PENDING**  |
| 4   | Kemisk peeling / IPL / Plasma Pen           | DEFER_OR_GROUP → `esthetic_consent_library`      | **PENDING**  |
| 5   | Ortopedisk PRP/PRF (+ HA)                   | NEW_REGISTRY_CURATII → `ortoped_prp_info`        | **PENDING**  |
| 6   | Behandlingsavtal Botox / Fillers / Ögonlock | NEW_REGISTRY_CURATII → `offert_curatiio_estetik` | **PENDING**  |

## Hair TP cutover — vad kan vänta?

Följande krävs **inte** för Hair TP steg 3–9 cutover (36/36 D·L·V klart):

- Hyalase / Botox som supplementary bundle
- Curatiio-avtal (Botox, Fillers, Ögonlock, Ortopedi)
- Peeling / IPL / Plasma Pen (såvida inte aktivt erbjudande på Hair TP)

**Blockerar Curatiio-cutover:** tom `letterText` på 19 av 39 Meridiq-avtal — Nordbro/Insatt-PDF import.

---

## Workshop-frågor per grupp

### Hyalase SWE

- **Brand:** Hair TP Clinic
- **Meridiq:** 152991
- **Rekommenderad action:** `NEW_REGISTRY`
- **Föreslagen registryId:** `hyalase_info`
- **Fråga:** Ska Hyalase få egen rad i 36-katalogen (`hyalase_info`) eller ligga kvar som bundle-tillägg utan live-route?
- **Alternativ:**
  - A — Ny registryId `hyalase_info` i katalog + final-demo steg 3–4 (rekommenderat om behandling erbjuds)
  - B — Behåll bundle-only tills Curatiio/estetik-cutover
  - C — Mappa till befintlig `microneedling_info` (ej rekommenderat — annat scope)
- **Owner-beslut:** `PENDING` _(fyll i efter workshop)_

### Botulinumtoxin SWE/ENG

- **Brand:** Hair TP Clinic (+ Curatiio-kontext)
- **Meridiq:** 152988, 152981
- **Bundle idag:** `botulinum_info`
- **Rekommenderad action:** `PROMOTE_BUNDLE_ID`
- **Föreslagen registryId:** `botulinum_info`
- **Fråga:** Ska `botulinum_info` promoted till 36-katalogen? Gäller vid Hair TP-estetik — Curatiio-flöde kräver brand-gate.
- **Alternativ:**
  - A — Promote `botulinum_info` → rad #37 i katalog + D/L/V (IMPLEMENTATION A16)
  - B — Bundle-only tills Curatiio-cutover med separat brand-filter
  - C — Ny Curatiio-specifik registryId (brand-isolation)
- **Owner-beslut:** `PENDING` _(fyll i efter workshop)_

### Fillers SWE (+ ENG)

- **Brand:** Curatiio
- **Meridiq:** 152990, 152984, 170950
- **Rekommenderad action:** `NEW_REGISTRY_CURATII`
- **Föreslagen registryId:** `fillers_info`
- **Fråga:** Fillers — eget Curatiio-flöde med info + avtal (170950 tom letterText → Nordbro)?
- **Alternativ:**
  - A — Ny info `fillers_info` + avtal `offert_fillers` (Curatiio cutover)
  - B — Endast Meridiq-modal tills legal review klar
  - C — Ej erbjud — arkivera consent i CCO
- **Owner-beslut:** `PENDING` _(fyll i efter workshop)_

### Kemisk peeling / IPL / Plasma Pen

- **Brand:** Hair TP Clinic
- **Meridiq:** 152992, 152982, 152993, 152999, 153000, 153001
- **Rekommenderad action:** `DEFER_OR_GROUP`
- **Föreslagen registryId:** `esthetic_consent_library`
- **Fråga:** Erbjuds peeling/IPL/Plasma Pen på Hair TP idag? Om ja: en registry per behandling eller gemensamt bibliotek?
- **Alternativ:**
  - A — Ej aktivt på Hair TP → DEFER (behåll Meridiq-arkiv, ingen CCO-live)
  - B — Per behandling: `peeling_info`, `ipl_info`, `plasma_pen_info`
  - C — En samlad `esthetic_consent_library` med under-typer
- **Owner-beslut:** `PENDING` _(fyll i efter workshop)_

### Ortopedisk PRP/PRF (+ HA)

- **Brand:** Curatiio
- **Meridiq:** 153039, 153040, 170941, 170942, 170943
- **Rekommenderad action:** `NEW_REGISTRY_CURATII`
- **Föreslagen registryId:** `ortoped_prp_info`
- **Fråga:** Ortopediska samtycken har tom letterText — Nordbro/Insatt-PDF krävs före live.
- **Alternativ:**
  - A — Curatiio cutover: info + avtal-rader efter legal import
  - B — Paus tills Nordbro-PDF importerad (19/39 consents saknar letterText)
  - C — Behåll endast Meridiq read-only
- **Owner-beslut:** `PENDING` _(fyll i efter workshop)_

### Behandlingsavtal Botox / Fillers / Ögonlock

- **Brand:** Curatiio
- **Meridiq:** 170949, 170950, 170954
- **Rekommenderad action:** `NEW_REGISTRY_CURATII`
- **Föreslagen registryId:** `offert_curatiio_estetik`
- **Fråga:** Separata avtal per behandling (Botox 170949, Fillers 170950, Ögonlock 170954) eller en Curatiio-estetik-offert?
- **Alternativ:**
  - A — Tre registryId: `offert_botox`, `offert_fillers`, `offert_bleph`
  - B — En `offert_curatiio_estetik` med behandlingsväljare
  - C — Legal review först — ingen registry förrän PDF facit finns
- **Owner-beslut:** `PENDING` _(fyll i efter workshop)_

---

## Maskinläsbar facit

- JSON: `patient-document-d-section-registry.json`
- Verify: `npm run verify:patient-doc-d-section-registry`
- Rådata: `diffs/D-SECTION-REGISTRY-MAPPING-2026-06-25.json`

## Källor

- `migration/meridiq/consent-catalog.json` (39 samtycken)
- `src/ops/hairtp-document-types.catalog.json` (36 typer)
- `public/major-arcana-preview/data/hairtp-document-content-bundle.json`
- `docs/strategy/KUNDKORT-DOKUMENT-PLACERING-FACIT.md` § bundle v7 vs katalog

_source: new (owner-workshop registry-mapping)_
