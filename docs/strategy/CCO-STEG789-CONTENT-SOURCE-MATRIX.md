# Steg 7/8/9 — Content Source Matrix (Meridiq struktur · Nordbro juridik P0)

**Status:** Owner bekräftat 2026-06-14 (Meridiq struktur) · **P0 uppdaterat 2026-06-25** (Nordbro 251203 juridisk text för 170917/170955)  
**Styrning:** `.cursor/rules/cco-steg789-content-lock.mdc`  
**Design:** `cco-step-modal-design.js` (fritt) · **Innehåll:** Meridiq apiId + Nordbro facit (låst)

---

## Facit — två lager

| Lager                  | Sökväg                                                | Innehåll                                                             |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| **Juridisk text (P0)** | `config/nordbro-insatt-facit-set.json`                | Nordbro 251203 canonical · `251203-behandlingsavtal-dhi-2dagar.docx` |
| **Meridiq-koppling**   | `migration/meridiq/nordbro-p0-source-bindings.json`   | apiId 170917 + 170955 → Nordbro facit                                |
| **Steg7 blocks**       | `migration/meridiq/steg7-tp-dhi-agreement-facit.json` | Avtal + cooling blocks (legalSource nordbro)                         |
| Samtycken (metadata)   | `migration/meridiq/consent-catalog.json`              | 39 poster, apiId, title, version, letterText                         |
| Formulär               | `migration/meridiq/questionary-catalog.json`          | 14 migrate-formulär inkl. friskförsäkran                             |
| Tjänstbindning         | `migration/meridiq/service-bindings-catalog.json`     | consentApiId per behandling                                          |
| Runtime                | `src/ops/meridiqConsentCatalogRuntime.js`             | `resolveTemplate()`, `loadMeridiqConsentCatalog()`                   |

**Prioritet vid konflikt:** Nordbro/Insatt juridisk text > Meridiq `letterText`. Meridiq apiId behålls för koppling och bundle-logik.

**Verifiering P0:** `npm run diff:nordbro-p0` → `docs/implementation/patient-documents-live/diffs/NORDINSATT-P0-*.md`  
**Verifiering P1 (PRP):** `npm run diff:nordbro-p1` → `NORDINSATT-P1-*.md` · apiId **170944** + **170945**

---

## Steg 7 — Avtal + samtycke (bundle)

| Block               | Primär källa                       | apiId / fält                               | Implementation                               | Parity                       |
| ------------------- | ---------------------------------- | ------------------------------------------ | -------------------------------------------- | ---------------------------- |
| Behandlingsavtal TP | **Nordbro 251203** + facit JSON    | **170917** · v2 · _Behandlingsavtal \| TP_ | `CONSENT_AGREEMENT` + `buildAgreementBody()` | ✅ P0_PASS · E6_OK mot Word  |
| Ångerfristsamtycke  | **Nordbro bundle** + facit#cooling | **170955** · v1                            | `CONSENT_COOLING` + `COOLING_BODY`           | ✅ Facit 5/5 · bundlat i CCO |
| Tjänstkoppling      | `service-bindings-catalog.json`    | TP → `consentApiId: 170917`                | Bundle journal submit                        | ✅                           |
| Bundle-signering    | Meridiq bundle-logik               | 170917 + 170955 i samma transaktion        | `#ackBundle`                                 | ✅                           |

**Notering export:** Meridiq API-export har **tom `letterText`** för 170917/170955 — brödtext från `steg7-tp-dhi-agreement-facit.json` (Nordbro 251203). **Ändra inte text utan ny Nordbro-version + `npm run diff:nordbro-p0`.**

---

## Steg 8 — Friskförsäkran (operationsdagen)

| Meridiq | apiId **16413** · _Friskförsäkran \| TP_ · 13 frågor |
| ------- | ---------------------------------------------------- |

| Fråge-id      | Typ (catalog)           | I overlay |
| ------------- | ----------------------- | --------- |
| 450966        | select                  | ✅        |
| 450967        | input                   | ✅        |
| 450968        | checkbox                | ✅        |
| 450969–450975 | yes_no / yes_no_textbox | ✅        |
| 451843–451844 | yes_no                  | ✅        |
| 451845        | checkbox (9 intyg)      | ✅        |

**Parity:** 13/13 — labels verbatim från `questionary-catalog.json`.  
**Teknisk skuld (ej innehåll):** frågor hardkodade i JS → bör läsas från catalog runtime (drift-skydd).

---

## Steg 9 — Foto-samtycke

| Meridiq / registry                            | Källa                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| Dokument #15 _Samtycke till foto-publicering_ | `hairtp-document-types.catalog.json` → `foto_samtycke`, `formProvider: meridiq_g4` |
| Journey scope                                 | `CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md` — hårlinje/krona, **aldrig ansikte**   |

**Owner:** Meridiq-underlag stämmer. Overlay lägger journey-scope ovanpå Meridiq-facit.

---

## Cloud Agent — instruktion (copy/paste)

```
Meridiq apiId + Nordbro juridik för steg 7 (P0 bekräftat 2026-06-25).

DESIGN ONLY: cco-step-modal-design.js

INNEHÅLL — läs innan ändring:
  config/nordbro-insatt-facit-set.json
  migration/meridiq/nordbro-p0-source-bindings.json
  migration/meridiq/steg7-tp-dhi-agreement-facit.json
  migration/meridiq/consent-catalog.json
  migration/meridiq/questionary-catalog.json
  migration/meridiq/service-bindings-catalog.json

Steg 7 → apiId 170917 + 170955 (text: Nordbro 251203 facit, inte Meridiq letterText)
Steg 8 → questionary apiId 16413 (frågor 450966–451845)
Steg 9 → Meridiq foto_samtycke + journey scope (hårlinje/krona)

Förbjudet: parafrasera, förkorta, AI som primär källa.
Vid steg 7-text: jämför mot Nordbro Word + npm run diff:nordbro-p0.
Vid steg 8/9: Meridiq catalog verbatim.
```

---

## Kvarvarande engineering (inte innehålls-luckor)

| #   | Uppgift                                                                | Varför                         |
| --- | ---------------------------------------------------------------------- | ------------------------------ |
| 1   | Ladda steg 8-frågor från `questionary-catalog.json` runtime            | Drift-skydd                    |
| 2   | Ladda steg 7-texter via `meridiqConsentCatalogRuntime` + bundlad facit | En källa i kod                 |
| 3   | Koppla steg 9 till Meridiq `foto_samtycke` registry-id                 | Sluta duplicera text i overlay |

Innehåll behöver **inte** skrivas om enligt owner — bara **kopplas tydligare till Meridiq-exporten i kod**.

---

## Full Hair TP bundle (36+ dokument)

**Build:** `npm run build:hairtp-document-content`  
**Output:** `public/major-arcana-preview/data/hairtp-document-content-bundle.json`  
**Loader:** `CcoMeridiqContent.loadFullDocumentBundle()` · `findDocumentByRegistryId(id)`

| Sektion                   | FULL | PARTIAL | MISSING |
| ------------------------- | ---- | ------- | ------- |
| Fylls i av kund (18)      | 11   | 6       | 0       |
| Fylls i av personal (12)  | 7    | 5       | 0       |
| Informationsdokument (10) | 6    | 3       | 1       |

**Källor (prioritet):** Nordbro facit-set → `steg7-tp-dhi-agreement-facit.json` → Meridiq-kataloger → `data/cco-templates.json`.

**Kvar PARTIAL:** Microneedling, PRF, Profhilo-avtal, samtycke bokning 2d, foto-publicering (Nordbro-stub), ordination Word, intern SMS. **FULL:** ångerfrist-samtycke (170955) via `steg7-tp-dhi-agreement-facit.json` cooling.
