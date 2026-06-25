# ORD-24 / A15 — Foto-samtycke facit (patient-documents-live)

**Datum:** 2026-06-25  
**Status:** GODKÄNT för BOOKOFF U+T (steg 9 scope-samtycke)  
**registryId:** `foto_samtycke`  
**UX-steg:** 9

## Avgränsning

| Spår                                                      | Scope                                           | Status                                              |
| --------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| **Patient-doc BOOKOFF** (denna leverans)                  | Kanonisk **scope-text** demo ↔ bundle ↔ journey | **U+T `[x]`** via E6 batch 3                        |
| **ORD-24 backend** (`ORD-24-dokument-segment-backend.md`) | Document instances, dossier-segment, API        | **PENDING** — separat cutover                       |
| **Nordbro `consent_photo_publish`**                       | Frivillig **publicering** (showcase)            | Placeholder i `cco-templates` — **ej** steg-9 scope |

## Owner-beslut (text)

1. **Steg 9** i Hair TP-kundresan använder **scope-samtycke** (hårlinje/krona, aldrig ansikte, intern journal — inte marknadsföring utan separat samtycke).
2. Detta följer [`CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`](../../strategy/CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md) och [`build-hairtp-document-content-bundle.js`](../../../scripts/build-hairtp-document-content-bundle.js) (owner 2026-06-15).
3. **Ingen Word-fil** krävs för U-kolumn — facit = journey + bundle `content.scope` + demo `steg9-foto-samtycke-final-demo.html`.
4. Nordbro-mallarna `consent_photo_internal` / `consent_photo_publish` (v2.0.0) gäller **kompletterande** kanaler; kroppen är placeholder tills juridik fyller full Nordbro-text — **blockerar inte** steg-9 scope.
5. Meridiq G4 har **inget** separat apiId för detta scope — CCO-native registry enligt inventory #15.

## Kanonisk scope-text

**Summary:** Hårlinje och krona för journalföring och behandlingsuppföljning. Aldrig ansikte.

**Bullets:**

- Före/efter-bilder av hårlinje och krona får tas och sparas i patientjournalen.
- Bilder får användas internt för uppföljning — inte för marknadsföring utan separat samtycke.

**Ack:** Jag godkänner att Hair TP Clinic tar och sparar före/efter-bilder enligt scope ovan (hårlinje/krona — aldrig ansikte).

## Källor (U)

- `docs/strategy/CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`
- `public/major-arcana-preview/data/hairtp-document-content-bundle.json#foto_samtycke`
- `migration/cco-templates-document-facit.snapshot.json#consent_photo_internal` (metadata only)
- `public/major-arcana-preview/steg9-foto-samtycke-final-demo.html`

## E6

Kör `npm run diff:patient-doc-e6-batch3` — demo ↔ bundle scope-ankare → **E6_OK**.
