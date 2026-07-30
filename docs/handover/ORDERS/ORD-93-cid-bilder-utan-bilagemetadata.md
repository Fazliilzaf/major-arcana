# ORD-93 — 1 407 `cid:`-bilder som aldrig blir bilder

| | |
|---|---|
| **Bas-commit** | `main` efter #1270/#1271 (2026-07-30) |
| **Ägare** | Cursor (implementation) · Cowork (mätning, verifiering) |
| **GO** | väntar Fazli |
| **Allvarlighetsgrad** | **Visningsfel, inte leveransfel.** Kunden fick sitt mejl komplett — verifierat mot Mac Mail. Det är CCO:s läsyta som inte kan visa bilderna. |
| **Föregångare** | ORD-97 gjorde fidelity-instrumenten seende igen (#1269). Före det rapporterade manifestet noll — inte för att allt var rätt, utan för att det läste ett tomt fält. |

## Observation

Mätt 2026-07-30 mot prod med `deepScan=true`, efter att #1269 gjort instrumentet
läsbart.

| brevlåda | meddelanden | `cid:`-referenser utan bilagemetadata |
|---|---|---|
| `fazli@` | 495 | 938 |
| `egzona@` | 175 | 469 |
| `contact@` | 106 | — |
| `kvitto@` | 18 | — |
| **totalt** | **794** | **1 407** (fazli@ + egzona@) |

**Fördelning per mapp** — och det är den som är intressant:

```
fazli@    inbox 803 · sent 130 · drafts 5
egzona@   sent 266 · inbox 199 · drafts 4
```

**396 av referenserna sitter i vår egen utgående post.** `egzona@` har fler i
`sent` än i `inbox`.

## Mekanism

`rewriteMailCidImageSources` (`src/routes/ccoConversation.js`) skriver om
`src="cid:X"` till den lokala bilagevägen — men bara när kartan har något:

```js
const cidMap = buildInlineAttachmentUrlMap(attachments);
if (!cidMap.size) return safeHtml;          // ← bailar tyst
...
return url ? `${prefix}${quote}${url}${quote}` : match;   // ← behåller cid: om id saknas
```

Saknas bilagemetadatan överlever `cid:` in i webbläsaren. Webbläsaren kan inte
lösa ett `cid:`-schema, så operatören ser en **trasig bildikon** — utan
felmeddelande, utan logg, utan spår någonstans i systemet.

`toStoredBodyHtml` (`ccoMailboxTruthStore.js:46`) rör inte `cid:`. Den strippar
bara `data:`-bilder, och kommentaren där säger uttryckligen att CID-referenser
ska behållas och skrivas om vid rendering. Skrivvägen gör alltså rätt; det är
läsvägen som saknar sin halva när metadatan inte följde med.

## Kategori — och varför den var svår att hitta

Sex mejl samplades först utan en enda `cid:`. Alla var tjänsteutskick
(GetAccept, Adobe, foodora) som **länkar** sina bilder från egna servrar:

```
https://media.getaccept.com/logo/wn7rr93p.png
```

`cid:`-problemet sitter i **mänsklig korrespondens med signaturbilder**.
Verifierat mot Mac Mail 2026-07-30: Ali Selims mejl till `info@` bär fem
inbäddade bilder — porträttfoto, företagslogotyp och tre sociala ikoner — alla
bifogade i mejlet i stället för länkade.

Det är den vanligaste sortens riktig kundpost, och det förklarar både varför
tjänsteutskicken var rena och varför `sent`-andelen är stor: våra egna svar
skrivs i Svarstudion och bär v9-signaturen med bild.

## Varför det är ett lagringsfel

**Bevisat, inte antaget.** Samma korrespondens öppnad i Mac Mail visar alla fem
bilderna. Mejlet gick fram komplett. CCO deklarerar `hasAttachments` men saknar
metadatan, alltså tappades den vid materialiseringen till truth-lagret.

Det sänker allvarlighetsgraden — inget kundförtroendeproblem — men ändrar inte
att det ska åtgärdas: en operatör som läser en kundtråd ser trasiga bilder i den
post som betyder mest.

## Uppgift 1 — låt felet synas

Nuvarande beteende är tyst i båda ändar: `cidMap` tom ⇒ returnera oförändrat,
okänt cid ⇒ behåll `match`. Ingen räknare, ingen logg, inget i svaret.

Porta principen från `konversationer.html`: **aldrig en trasig `cid:` kvar,
alltid en synlig markering.** En bild som inte kan lösas ska ersättas med något
som säger varför, inte med en trasig ikon.

Räknaren finns redan — `summary.cidWithoutAttachmentMetadata` i
`ccoMailboxTruthStore.js:1202`. Ingen läser den. Efter ORD-93 ska den ha en
konsument.

## Uppgift 2 — avgör om metadatan går att återskapa

Öppen fråga, och den avgör om uppgift 1 är hela ordern eller halva:

- Ligger bilagorna kvar i Graph/IMAP och kan hämtas om?
- Eller tappades de vid materialiseringen och finns inte längre lokalt?

`/cco/runtime/history/fidelity/probe` finns för precis den frågan men kräver
`graphReadEnabled` och ett `cid`. **Mät innan något byggs.** Går de att hämta
om är rätt åtgärd en backfill; går de inte det är rätt åtgärd att markera dem
ärligt och sluta låtsas.

## Icke-mål

- **Rör inte `toStoredBodyHtml`.** Bildstrippningen löser #646 och det problemet
  finns kvar. `cid:` ska fortsätta lagras orört.
- **Sänk inte caparna.**
- **Bygg ingen ny bilagelagring** innan uppgift 2 är besvarad.

## Mätgrind

1. `cidWithoutAttachmentMetadata` ska kunna **sjunka** — den var noll i går för
   att instrumentet var blint, inte för att felet saknades. En nolla efter
   ORD-93 måste kunna skiljas från en nolla orsakad av blindhet. `bodySource`
   i svaret gör den skillnaden läsbar.
2. Öppna ett av de 794 i operatörsvyn före och efter. Före: trasig bildikon.
   Efter: bild eller synlig markering — inget tredje.
3. Kör om `deepScan`-svepet över alla nio brevlådor och jämför mot tabellen ovan.

## Kandidater att öppna

Från `info@`-provet 2026-07-30, alla riktig patientkorrespondens:

| datum | mapp | motpart | ämne |
|---|---|---|---|
| 2026-02-16 | inbox | Ali Selim | Uppföljning |
| 2026-02-28 | **sent** | ali.selim@jisek.se | RE: Uppföljning |
| 2025-12-29 | inbox | Jens Berg | Re: Boka tid för påfyllning |
| 2026-03-05 | deleted | Johan Lagerström | Avbokning PrP |

De två första är samma tråd — felet följde med genom hela utväxlingen.
