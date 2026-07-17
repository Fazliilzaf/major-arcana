# CCO CID Recovery Closeout

**Status:** Stangt 2026-07-17
**Scope:** Historiska inlinebilder i CCO-mail. Detta dokument beskriver en avslutad read-only undersokning; det auktoriserar inga writes.

## Beslut

Ingen canary, re-materialisering, Graph-synk eller blob/cache-andring ska goras for detta historiska gap. De berorda CID-referenserna markeras som ej aterstallbara med nuvarande kallmaterial.

## Underlag

Den lokala manifestinventeringen hittade:

| Matetal | Utfall |
| --- | ---: |
| Historiska meddelanden med CID-gap | 779 |
| Berorda CID-referenser | 1 657 |
| Mailboxar i read-only-stickprovet | Contact, Fazli, Egzona |
| Graph-bilagesamlingar som kunde lasas | 9 / 9 |
| Matchande Graph-inlinebilagor for provade CID | 0 / 9 |

Skillnaden mellan 779 och 1 657 ar viktig: 779 ar meddelandefallen, medan ett enskilt meddelande kan innehalla flera CID-referenser.

## Metod

1. Ett lokalt CID-manifest delade upp de historiska fallen per mailbox, mapp och meddelandetyp.
2. Ett litet, read-only Graph-stickprov valdes fran Contact, Fazli och Egzona.
3. For varje prov jamfordes den lokala HTML-referensen med Graph-bilagornas `contentId`, filnamn och `isInline`.
4. Ingen MIME-kropp, bilddata eller bilagebytes lastes tillbaka till CCO och inga writes utfortes.

Graph svarade pa samtliga nio lasningar, men de typiska aldre meddelandena saknade motsvarande inlinebilagor i Graph. Utfallet ar darfor inte en CID-normaliserings- eller mappningsskillnad.

## Avgransning

Closeout-garantin galler endast de historiska CID-gapen ovan. Den andrar inte:

- aktuell mailingestion eller lokal asset-hantering for nya meddelanden
- befintliga inlinebilder och bilagor som redan har lokal metadata/blob
- vanlig visning, oppning, svar eller Skickat-synk i CCO

## Spårbarhet

- [PR #1049](https://github.com/Fazliilzaf/major-arcana/pull/1049): lokalt CID-manifest och ursprunglig read-only Graph-probe
- [PR #1056](https://github.com/Fazliilzaf/major-arcana/pull/1056): explicit bilageinventering for den smala read-only-jamforelsen

Ett nytt recovery-spår far bara oppnas om en ny, verifierbar kallkopia av just de historiska inlinebilagorna finns tillganglig. Den ska da starta med ett separat read-only underlag och uttryckligt godkannande innan nagon skrivning.
