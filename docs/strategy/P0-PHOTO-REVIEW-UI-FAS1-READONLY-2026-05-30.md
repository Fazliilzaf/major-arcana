# P0 Photo Review UI — Fas 1 Read-only

_Genererad: 2026-05-30T22:07:08.361Z_

## Beslut

- **GO:** Photo Review Fas 1 — read-only UI ✓
- **GO:** P0.M6 High-Confidence Final (170/170, 1216 assets, 0 LINK_ONLY/FAILED/DUPLICATE) ✓
- **STOPP:** Fas 2 write (approve/reject/reassign) — väntar explicit GO
- **STOPP:** medium/low-import (849 mappings)
- **STOPP:** full prod-import

## Prod-migrering (referens)

| Metric                    |   Värde |
| ------------------------- | ------: |
| High-confidence patienter | 170/170 |
| Prod-assets               |    1216 |
| VISIBLE                   |     324 |
| NEEDS_REVIEW              |     886 |
| Foton i review            |     861 |
| Patienter med foto-review |     150 |

## Fas 1-regler (implementerade)

1. Read-only only
2. Ingen approve / reject / reassign / statusändring / mass-approval
3. Ingen bild blir VISIBLE via UI
4. Ingen ny import / medium-low / full prod-import
5. Ingen Drive-länk i UI — preview via CCO storage (`/api/v1/cco/assets/:id/download?inline=1`)
6. Fas 2 write routes gated: `ENABLE_PHOTO_REVIEW_WRITE=false` (default)

## Verifiering mot prod asset store

| Metric                                    |                                                                                                                                Värde |
| ----------------------------------------- | -----------------------------------------------------------------------------------------------------------------------------------: |
| Källa                                     | `/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cco-prod/cco-patient-assets.json` |
| Patienter i UI                            |                                                                                                                                  150 |
| Bilder listade (NEEDS_REVIEW photos)      |                                                                                                                                  861 |
| Preview tillgänglig (storageKey+checksum) |                                                                                                                                  861 |
| Bilder utan preview                       |                                                                                                                                    0 |
| Saknar storageKey                         |                                                                                                                                    0 |
| Saknar checksum                           |                                                                                                                                    0 |
| VISIBLE i review-kön (fel)                |                                                                                                                                    0 |
| VISIBLE photo totalt (prod)               |                                                                                                                                    0 |
| Drive-länkar i API-payload                |                                                                                                                                    0 |

### Confidence

| Nivå   | Antal |
| ------ | ----: |
| high   |     0 |
| medium |     0 |
| low    |   861 |

## UI-yta

- Sida: `/photo-review.html`
- JS: `public/cco-photo-review.js` (read-only, ingen POST)
- CSS: `public/cco-photo-review.css`

### Visar per bild

- Föreslagen kategori (photo_before / photo_during / photo_after)
- Confidence, reason, uncertaintyReason
- importRunId, batchLabel, patientId, assetId, currentStatus
- Varning: ej godkänd / syns inte på patientkort
- Thumbnail/preview via CCO storage när storageKey+checksum finns

### Visar per patient

- Antal bilder i review
- journalVisibleCount / formVisibleCount
- hasVisibleJournalOrForm
- Filter/sök på patientId och batch

## Performance (861 bilder)

- UI laddar **patientlista** (150 rader) + **detalj per vald patient** (medel ~6 bilder), inte alla 861 samtidigt.
- Uppskattad initial API+render: ~2489 ms (server-side analys; browser varierar med nätverk).
- Lazy-loading på `<img loading="lazy">` per patientvy.

## API live-check

Kör: `node scripts/live-check-photo-review-fas1.js`

Senaste körning (2026-05-30):

| Endpoint                   | Status |  ms | Resultat                                                    |
| -------------------------- | ------ | --: | ----------------------------------------------------------- |
| GET /summary               | 200    |  23 | 861 foton, 150 patienter, readOnly=true, writeEnabled=false |
| GET /patients?limit=200    | 200    |  10 | 150/150 returnerade                                         |
| GET /patients/:id (sample) | 200    |   5 | 8 bilder, previewAvailable=true                             |
| POST /decide (block test)  | 404    |   — | Write korrekt avstängt                                      |

Total API-tid (3 GET): **38 ms**

## Preview i browser (manuell check)

Kör server mot prod data och öppna `/photo-review.html`. `window.__ARCANA_PHOTO_REVIEW_PREVIEW_STATS__` rapporterar loaded/failed/unavailable per session.

## Bugs / blockers

Inga kända blockers i Fas 1 read-only scope.

## Nästa steg

- Fas 1 read-only: **klar** — eventuell browser-check i staging/prod
- Fas 2: **plan only** — se `docs/strategy/P0-PHOTO-REVIEW-FAS2-PLAN-2026-05-30.md` (ingen write före GO)
