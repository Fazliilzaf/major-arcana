# ORD-145 · Rapport — fält som normaliserarna kastar i dag

**2026-08-29 · `src/ops/ccoNormalizerDropLoud.js`**

## Svaret på frågan

> *Var `signatureProof` ensamt, eller ett av flera?*

**Det var i praktiken ensamt.** Över de åtta storens record-nivå-normaliserare
är det enda fält som tyst kastades — och som faktiskt var ett bugg — `signatureProof`
i `normalizeCommercialCase` + `normalizeAgreement`. Båda är rättade (whitelisten
utökades) i samma pass som beviset infördes.

De enda övriga "bortfallen" är två medvetna alias/transienter som *konsumeras*
(transformeras) men aldrig sparas som egen nyckel — de är inte dataförluster:

| Fält | Store | Skäl |
| --- | --- | --- |
| `name` | `ccoPatientMasterStore` | legacy alias → härleder `displayName`/`firstName`/`lastName` |
| `actor` | `ccoPhotoAnnotationStore` | transient → härleder `createdBy`/`updatedBy` |

Båda står nu i `INTENTIONAL_DROPS` med skäl — de ska inte larma.

## Mekanismen

- **En** hjälpare: `src/ops/ccoNormalizerDropLoud.js` (`reportDroppedKeys`).
- No-op i produktion (`NODE_ENV === 'production'`). I dev/test loggar den
  `[normalizer-drop] store.normalizer kastar fält: "x"`.
- Instrumenterad vid upsert-gränsen i de två storen som bar beviset:
  `ccoTreatmentAgreementStore.upsertAgreement` + `ccoCommercialStore.upsertCase`.
- Tester: `tests/ops/ccoNormalizerDropLoud.test.js` (no-op i prod, känt fält ger
  utslag, undantagslistan har skäl per rad, mutationstest).

## Per store

| Store | Record-normaliserare | Fält som kastas i dag | Åtgärd |
| --- | --- | --- | --- |
| `ccoCommercialStore` | `normalizeCommercialCase` | `signatureProof` | **rättad** (whitelist) |
| `ccoTreatmentAgreementStore` | `normalizeAgreement` | `signatureProof` | **rättad** (whitelist) |
| `ccoJournalStore` | `normalizeJournalEntry` | — (komplett whitelist; `fields`/`importMeta` mergeas, ej kastade) | ingen |
| `ccoPatientMasterStore` | `normalizePatientRecord` | `name` (alias, konsumeras) | undantag |
| `ccoConsultationStore` | `normalizeConsultationCase` | — (komplett whitelist) | ingen |
| `ccoPhotoAnnotationStore` | `normalizeAnnotation` | `actor` (transient, konsumeras) | undantag |
| `ccoBookingEngineStore` | *(ingen record-whitelist — bygger objekt inline)* | — | ingen |
| `ccoAftercareSchedulerStore` | *(ingen normalize — bygger jobb inline)* | — | ingen |

## Byte-identisk

`reportDroppedKeys` skriver **inget** — den observerar bara. Inget fält har
börjat bevaras av denna order; de två `signatureProof`-rad i whitelisten kom från
bevis-ordern (BankID-kopplingen), inte härifrån. Sparad data före/efter är
oförändrad.

## Vad som inte är avgjort (per ordern)

- Vad som ska göras med `name`/`actor` på sikt (de fungerar som alias i dag).
- Om hjälparen ska köras i CI — den larmar nu på inget (tyst), så den är redo att
  tändas om vi vill ha en permanent vakt.
