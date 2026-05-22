# Risk Precision Assets

Detta bibliotek innehåller benchmark-data för riskprecision i Arcana.

## Gold set
- Fil: `gold-set-v1.json`
- Storlek: 150 cases
  - 50 `safe`
  - 50 `borderline`
  - 50 `critical`

## Körning
- Generera/uppdatera dataset:
  - `npm run risk:goldset:generate`
- Skapa confusion-matrix rapport:
  - `npm run risk:goldset:report`
- Läs rapport via API:
  - `GET /api/v1/risk/precision/report`
  - valfria query-parametrar:
    - `modifier` (override av tenant risk modifier)
    - `thresholdVersion` (override av threshold-version för reproducerbar jämförelse)

## Versionsspårning i evalueringar
- Varje riskevaluering innehåller nu versionsmetadata:
  - `ruleSetVersion`
  - `thresholdVersion`
  - `semanticModelVersion`
  - `fusionVersion`
  - `buildVersion`
