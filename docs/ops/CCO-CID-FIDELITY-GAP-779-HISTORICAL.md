# CCO CID fidelity — 779 historiska gap (orörda)

**Datum:** 2026-07-17  
**Status:** STÄNGD för bred åtgärd — **ingen** re-materialisering, sync, cache/blob-write  
**PR:** #1049 (read-only manifest + Graph-probe)  
**Prod-commit vid stickprov:** `534763c3` (innehåller #1049)

## Sammanfattning

Mailbox truth-lagret har lokala HTML-`cid:`-referenser utan matchande bilagemetadata. Ett litet read-only Graph-stickprov (Contact, Fazli, Egzona) visade att originalets inlinebilder **inte** går att återfå via Graph attachment-collection för de testade CID:erna.

**Beslut:** dokumentera som historisk lokal fidelity-brist och **lämna orörda**. Ingen bred körning över de 779 fallen.

## Scope (779 meddelanden med saknad CID-metadata)

Källa: `GET /api/v1/cco/runtime/history/fidelity` → `inventory.summary.fidelityGapCount`  
(= `messagesWithMissingCidMetadata` i CID-manifestet)

| Mailbox                    | Gap (meddelanden) |
| -------------------------- | ----------------: |
| `contact@hairtpclinic.com` |               111 |
| `fazli@hairtpclinic.com`   |               493 |
| `egzona@hairtpclinic.com`  |               175 |
| **Summa**                  |           **779** |

Ytterligare metric i manifest: antal enskilda CID-referenser utan metadata är högre än 779 (flera CID per meddelande). **779** är den kanoniska “meddelande-gap”-siffran för closeout.

## Stickprov (read-only) — resultat

- **9** representativa CID-prober (3 per mailbox): Graph `attachmentCollectionRead=true`, **`matchCount=0`**, inga inline-bytes.
- Ingen synk, ingen re-materialisering, ingen cache/blob-write.

## Sista matchningskontroll (uteslut ren normaliseringsmiss)

Probe + manifest använder samma normalisering: strip `<>` + lowercase (`normalizeCcoRuntimeContentId`).

Kontrollerat per stickprov:

| Variant                                                                       | Resultat                                                                                                                                |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Exakt HTML-/manifest-CID                                                      | `matchCount=0`, collection läst                                                                                                         |
| Bracket-form `<cid>`                                                          | samma (normaliseras till samma nyckel)                                                                                                  |
| VERSALER                                                                      | samma                                                                                                                                   |
| Outlook local-part före `@` (t.ex. `image001.png` från `image001.png@01dcc…`) | **404** — finns **inte** i lokala HTML (`cid:`-token är fulla `@`-formen). Inte en dold Graph-träffväg för den faktiska HTML-referensen |

**Slutsats matchning:** Det är **inte** ett falskt negativt p.g.a. `<>` / case. Den exakta HTML-CID:en har ingen Graph-bilaga med samma `contentId` efter normalisering.

### Känd probe-begränsning (dokumenterad, ej åtgärdad)

Probe matchar **endast** `attachment.contentId` (normaliserad). Embed-hjälpare (`normalizeInlineCidValue`) kan även prova `name` / `id`. Det ändrar inte beslutet: för den faktiska HTML-`cid:`-nyckeln fanns ingen Graph-`contentId`-träff i stickprovet, och local-part utanför HTML avvisas korrekt.

## Läge

**Definitivt för detta closeout:** **ej återställbart från Graph** via contentId-match på saknade HTML-CID:er i stickprovet → **ingen bred re-materialisering** av de 779.

Gapen lämnas som historisk lokal fidelity-brist i mailbox truth.

## Uppföljning 2026-07-17 — Graph-bilagelista vs HTML-CID (read-only)

Stickprov: **2 meddelanden per** Contact / Fazli / Egzona. För varje: lokal saknad HTML-CID, Graph message body (`cid:` i HTML), Graph `/attachments` (antal, `isInline`, `contentId`, `name`). Ingen sync/re-materialisering/cache-write/canary.

| Mailbox       | Exempel                                    | Graph body har samma `cid:`      | Graph-bilagor                       | Inline | Slutsats                                                 |
| ------------- | ------------------------------------------ | -------------------------------- | ----------------------------------- | ------ | -------------------------------------------------------- |
| Contact       | `icon.png` i oleverbart-mail               | ja                               | **0** (`hasAttachments=false`)      | 0      | **Saknade Graph-bilagor**                                |
| Fazli (sent)  | `image001.png@01dcc75f…`, `image002.jpg@…` | ja                               | **0**                               | 0      | **Saknade Graph-bilagor**                                |
| Fazli (inbox) | lokal `inline-data-…`                      | nej (Graph-HTML utan den CID:en) | 1 PDF, ej inline, annat `contentId` | 0      | lokal rewrite-artefakt — **inte** CID-mappning till bild |
| Egzona (sent) | många `ii_…` / hash-CID:er                 | ja                               | **0**                               | 0      | **Saknade Graph-bilagor**                                |

**Dominerande läge:** saknade Graph-bilagor (HTML refererar `cid:` men attachment-collection är tom). **Inte** en contentId↔filnamn-mappningsskillnad för inlinebilder i stickprovet.

## Referenser

- API: `/api/v1/cco/runtime/history/fidelity`, `…/fidelity/manifest`, `…/fidelity/probe`
- Kod: `src/ops/ccoMailboxTruthStore.js` (`getCidFidelityManifest`), `src/routes/capabilities.js` (probe), `src/infra/microsoftGraphReadConnector.js` (`probeMessageAttachments`)
