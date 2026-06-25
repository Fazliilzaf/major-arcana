# A10 owner-beslut — `samtycke_bokning_2d` (2 dagar vs 14 dagar)

**Datum:** 2026-06-25  
**Status:** GODKÄNT  
**registryId:** `samtycke_bokning_2d` (behålls — stabilt ID, refererar steg 6 / betänketidskontext)

## Konflikt

| Källa                                                | Benämning / innehåll                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Katalog (gammal)                                     | «Samtycke vid bokning inom **2 dagar**»                                  |
| Meridiq **154369**                                   | «Samtycke vid bokning inom **14 dagar**»                                 |
| CCO demo + bundle + `patientDocumentSignRegistry.js` | **14 dagar** (juridisk samtyckestext)                                    |
| Nordbro avtal / ORD-1                                | **2 dagars betänketid** (klinikpolicy, separat från samtyckesdokumentet) |

## Owner-beslut

1. **Samtyckesdokument A10** ska följa **Meridiq 154369** och befintlig CCO-text: **14 dagar** (bokning inom 14 dagar + avbokningsvillkor).
2. **`registryId` `_2d`** behålls oförändrat — det markerar att dokumentet hör till steg 6 / undantag betänketid, inte titelns siffror.
3. **2 dagars betänketid** (ORD-1, `ccoHairTpCoolingOffPolicy.js`, e-post `auto_betanketid`) är **separat** juridiskt/processuellt spår och ska inte blandas in i A10:s titel.
4. Word-underlag för A10: Nordbro **251203-behandlingsavtal-dhi-2dagar.docx** (avtalsblock) — inte titel-facit för samtycket.
5. `VERSION_CONFLICT`-blocker i bundle tas bort; E6/T ska rapportera **E6_OK** när demo ↔ bundle ↔ Meridiq-paritet är grön.

## Efter beslut (implementerat)

- `src/ops/hairtp-document-types.catalog.json` — `name`: «Samtycke vid bokning inom 14 dagar»
- `hairtp-document-content-bundle.json` — `label` uppdaterad, blocker borttagen
- E6: `samtycke_bokning_2d` → **E6_OK**

## Referenser

- `migration/meridiq/consent-catalog.json#154369`
- `docs/handover/ORDERS/ORD-1-coolingoff-14-to-2.md`
- `src/ops/patientDocumentSignRegistry.js` (consentApiId 154369)
