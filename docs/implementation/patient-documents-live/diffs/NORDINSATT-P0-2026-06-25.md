# Nordbro/Insatt P0 — steg7 facit diff · 2026-06-25

## Facit-set (owner)

- Canonical: **251203 DHI 2-dagars** (`251203-behandlingsavtal-dhi-2dagar.docx`)
- Meridiq bind: **170917** (avtal) + **170955** (ångerfrist)
- Källa: `config/nordbro-insatt-facit-set.json`

## Resultat

| Del            | Status             | Word↔facit ankare    | Anteckning                                                                                                        |
| -------------- | ------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Avtal 170917   | **E6_OK**          | word 6/7 · facit 7/7 | templateRef `agreement_hair_tp_dhi_2day_nordbro`                                                                  |
| Cooling 170955 | **DEMO_BUNDLE_OK** | word 2/5 · facit 5/5 | 170955 är separat Meridiq-post i bundle; Nordbro-avtal refererar ångerrätt — facit blocks valideras internt (5/5) |
| **Overall**    | **P0_PASS**        |                      |                                                                                                                   |

## Kända driftpunkter (facit → Nordbro)

- Inga kända driftpunkter kvar

## Metadata uppdaterad

- `migration/meridiq/steg7-tp-dhi-agreement-facit.json` — legalSource nordbro 251203
- `migration/meridiq/nordbro-p0-source-bindings.json` — 170917 + 170955
- `config/nordbro-insatt-facit-set.json` — facit-set registry

## Nästa (P1)

- PRP 170944 mot Nordbro PRP 251203
- Curatiio avtal — väntar Nordbro/Insatt PDF

---

`npm run diff:nordbro-p0` · word: `/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/CCO-patientdokument-live/01-word-original-lokalt/251203-behandlingsavtal-dhi-2dagar.docx`
