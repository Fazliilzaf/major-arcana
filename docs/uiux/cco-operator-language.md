# CCO Operator Language

Den här ordlistan låser vilka systemord operatören ska se i CCO-ytan. Målet är att gränssnittet ska kännas som en intern mail- och bokningsyta, inte som ett tekniskt runtime-verktyg.

## Principer

- Visa arbetsflöde före implementation.
- Använd svenska termer där operatören tar beslut.
- Behåll integrationsnamn bara när operatören faktiskt behöver veta källan.
- Låt tekniska namn finnas kvar i kod, API:er, auditfält och testnamn när de är kontrakt.
- Använd korta ord i chips, tabs och köetiketter.

## Godkända Operatörstermer

| Teknisk term              | Operatörsterm   | Användning                                                                        |
| ------------------------- | --------------- | --------------------------------------------------------------------------------- |
| Studio                    | Svarstudio      | Svarsyta, snabbåtgärd och utkastläge.                                             |
| Sprint                    | Fokuspass       | Aktivt arbetspass i toppbaren och köfilter.                                       |
| Mailbox                   | Mejlkonto       | Synlig konto-/avsändarväljare.                                                    |
| Mailbox scope             | Mejlurval       | När flera mejlkonton ingår i en arbetsvy.                                         |
| Truth Worklist            | Sanningsvy      | Intern jämförelse-/assistvy för arbetslistan.                                     |
| Mailbox truth             | Mejlsanning     | Proveniens och datakälla när det måste visas.                                     |
| Runtime                   | Körning         | Synlig status för aktiv datakörning.                                              |
| Live thread               | Aktiv tråd      | Vald eller inkommande konversation i arbetsytan.                                  |
| Live queue                | Aktiv kö        | Köstatus när systemet är anslutet eller pausat.                                   |
| Custom mailbox            | Eget mejlkonto  | Adminläge för lokalt tillagt mejlkonto.                                           |
| External booking provider | Extern kalender | Neutral bokningskälla när operatören inte behöver integrationsnamnet.             |
| Cliento                   | Extern kalender | Synligt i bokningsytan; behåll `Cliento` i backend, audit och integrationstester. |
| Handoff                   | Överlämning     | Status när ärendet lämnas vidare eller väntar på kund.                            |
| Slots                     | Tider           | Kandidattider och tillgängliga bokningsalternativ.                                |
| Audit                     | Logg            | Bokningsytans gransknings- och händelsevy.                                        |
| Write endpoint            | Skrivstöd       | Endast i tekniska/adminnära felmeddelanden.                                       |

## Ord Som Inte Ska Synas I Operatörsytan

Följande ord får finnas i kod, tester, API:er och tekniska loggar, men ska inte visas som vanlig UI-copy i `major-arcana-preview`:

- `Truth Worklist Assist View`
- `Öppna Studio`
- `Sprint 3`
- `Mailbox truth`
- `mailbox truth`
- `Mailboxscope`
- `live-tråd`
- `Live runtime`
- `Cliento` i bokningsreadout, svarsförslag och operatörschips
- `audit`, `handoff`, `slots` och `write` som synliga labels i bokningsytan

## Beslutsregel

När ett nytt UI-element behöver namn: välj först det ord operatören skulle använda i en arbetsdag. Om ordet beskriver implementationen snarare än beslutet, byt till en arbetsflödesterm.
