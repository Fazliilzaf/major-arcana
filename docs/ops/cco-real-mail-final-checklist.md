# CCO: slutkontroll for riktiga mejl

## Syfte

Detta ar slutkontrollen for Konversationer i `admin#cco`. Den verifierar den
lokalt lagrade CCO-vagen; en trad ska inte behova en live-hamtning fran Graph
nar den oppnas.

Anvand endast mejl som redan forekommer naturligt. Starta inte synk, Graph,
re-materialisering eller ett nytt testutskick som del av kontrollen. Om ett
relevant fall inte finns, markera det `EJ OBSERVERAD` i stallet for att anta
att det fungerar.

## Mailboxurval

Kor samma kontroll for varje aktiv CCO-mailbox:

- `kons@hairtpclinic.com`
- `info@hairtpclinic.com`
- `contact@hairtpclinic.com`
- `egzona@hairtpclinic.com`
- `fazli@hairtpclinic.com`
- `marknad@hairtpclinic.com`
- `kvitto@hairtpclinic.com`
- `halso@hairtpclinic.com`

Nar en mailbox valjs ska listan innehalla endast den mailboxens kundrader.
Den valda kundens trad far samtidigt visa hela den befintliga historiken over
flera mailboxar, med tydligt mailbox-spar per meddelande.

## Kontrollmatris

| Omrade | Kontroll | Godkant resultat |
| --- | --- | --- |
| Inkommande | Oppna senaste naturliga mejlet | Kund, datum, tid, avsandare och mailbox-spar stammer med den lokala CCO-posten. |
| Skickat | Oppna ett naturligt utgaende svar | Svaret visas i samma kundtrad med avsandande mailbox och korrekt riktning. |
| HTML-signatur | Oppna mejl med giltig signatur/logga | Inlinebilden syns inne i mejlets HTML, inte som en fristaende bilaga. |
| Historiskt CID-gap | Oppna ett aldre mejl utan aterhamtbar inlinebild | Ingen trasig ikon, ingen rak `cid:`-text och ingen `about:blank`; en tydlig svensk notis visas. |
| Vanlig bilaga | Oppna en PDF, bild eller Office-fil | Filen oppnas i CCO-popupen och inte i en ny flik. |
| Stor fil | Oppna en fil over preview-gransen | Tydligt storleksfel och fungerande nedladdningsval visas. |
| Manga bilagor | Oppna ett mejl med fler an 24 bilagor | Forsta 24 visas direkt och resten finns under `Visa resterande`; inga filer tappas. |
| Kundkoppling | Oppna en exakt unik e-postmatchning | Kunddossier oppnar korrekt V11/V12 via canonical `patientId`. |
| Kundgranskning | Oppna en dubbel e-postmatchning | Trad syns i `Granskning`, visar manuell kundgranskning och saknar automatisk dossierlank. |
| Browser | Kontrollera i Chrome och Safari, desktop och mobil | Inkorg, traddetalj, popup och lang trad ar klickbara och text/knappar overlappar inte. |

## Kodkontrakt

Automatiska skydd finns i:

- `tests/public/konversationerLiveInbox.test.js`
- `tests/public/konversationerAttachmentExperience.test.js`
- `tests/public/konversationerInlineSignatureAssets.test.js`
- `tests/public/konversationerHistoricalCidFallback.test.js`
- `tests/ops/ccoConversationPatientResolver.test.js`
- `tests/ops/ccoMailIngestionPhoneMatch.test.js`
- `tests/capabilities/ccoRuntimeWorklistShadow.test.js`

Slutrapporten ska bara innehalla mailbox, testfall, tidpunkt och `PASS`,
`FAIL` eller `EJ OBSERVERAD`. Den ska inte lagra kundnamn, mejlinnehall eller
personuppgifter.
