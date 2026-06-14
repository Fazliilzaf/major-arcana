# Steg 7/8/9 — Content Source Matrix (Meridiq facit)

**Status:** Owner bekräftat 2026-06-14 — _allt underlag hämtat från Meridiq och stämmer._  
**Styrning:** `.cursor/rules/cco-steg789-content-lock.mdc`  
**Design:** `cco-step-modal-design.js` (fritt) · **Innehåll:** Meridiq JSON (låst)

---

## Facit — en källa

| Katalog        | Sökväg                                            | Innehåll                                           |
| -------------- | ------------------------------------------------- | -------------------------------------------------- |
| Samtycken      | `migration/meridiq/consent-catalog.json`          | 39 poster, apiId, title, version, letterText       |
| Formulär       | `migration/meridiq/questionary-catalog.json`      | 14 migrate-formulär inkl. friskförsäkran           |
| Tjänstbindning | `migration/meridiq/service-bindings-catalog.json` | consentApiId per behandling                        |
| Runtime        | `src/ops/meridiqConsentCatalogRuntime.js`         | `resolveTemplate()`, `loadMeridiqConsentCatalog()` |

Cloud ska **läsa dessa filer** — inte Word, inte Nordbro, inte ny AI-text.

---

## Steg 7 — Avtal + samtycke (bundle)

| Block               | Meridiq                         | apiId / fält                               | Implementation                               | Parity                        |
| ------------------- | ------------------------------- | ------------------------------------------ | -------------------------------------------- | ----------------------------- |
| Behandlingsavtal TP | `consent-catalog.json`          | **170917** · v2 · _Behandlingsavtal \| TP_ | `CONSENT_AGREEMENT` + `buildAgreementBody()` | ✅ Owner: stämmer mot Meridiq |
| Ångerfristsamtycke  | `consent-catalog.json`          | **170955** · v1                            | `CONSENT_COOLING` + `COOLING_BODY`           | ✅ Owner: stämmer mot Meridiq |
| Tjänstkoppling      | `service-bindings-catalog.json` | TP → `consentApiId: 170917`                | Bundle journal submit                        | ✅                            |
| Bundle-signering    | Meridiq bundle-logik            | 170917 + 170955 i samma transaktion        | `#ackBundle`                                 | ✅                            |

**Notering export:** Meridiq API-export har ofta **tom `letterText`** för avtalsposter (170917, 170955) — fulltext lever i Meridiq G4 / bundlad i CCO enligt owner. **Ändra inte text utan ny Meridiq-export.**

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
Meridiq är enda facit för steg 7/8/9-innehåll (owner bekräftat).

DESIGN ONLY: cco-step-modal-design.js

INNEHÅLL — läs innan ändring:
  migration/meridiq/consent-catalog.json
  migration/meridiq/questionary-catalog.json
  migration/meridiq/service-bindings-catalog.json

Steg 7 → apiId 170917 + 170955
Steg 8 → questionary apiId 16413 (frågor 450966–451845)
Steg 9 → Meridiq foto_samtycke + journey scope (hårlinje/krona)

Förbjudet: parafrasera, förkorta, Word/Nordbro/AI som primär källa.
Vid osäkerhet: STOP och jämför mot Meridiq JSON — skriv inte ny patienttext.
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
| Fylls i av kund (18)      | 10   | 7       | 0       |
| Fylls i av personal (12)  | 7    | 5       | 0       |
| Informationsdokument (10) | 6    | 3       | 1       |

**Källor (prioritet):** Meridiq-kataloger → `steg7-tp-dhi-agreement-facit.json` → `data/cco-templates.json` / `migration/cco-templates-document-facit.snapshot.json`.

**Kvar PARTIAL:** PRP hår, Microneedling, PRF, Profhilo-avtal, samtycke bokning 2d, foto-publicering (Nordbro-stub), ordination Word, intern SMS.
